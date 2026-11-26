// @vitest-environment node
// PWA-basis en pushproef (PR P0): manifest, pictogrammen, service worker, registratie, buildbewaking en het
// verzendscript. De sleutels in deze tests worden per testrun in het geheugen gemaakt en nergens bewaard; het zijn
// geen VAPID-sleutels van een omgeving.
import { createECDH, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { headersBestand, stagingBuildFouten } from '../scripts/staging-build';
import { magRegistreren, registreerServiceWorker } from '../src/pwa/registreer';
import { base64urlNaarBytes, publiekeVapidSleutel } from '../src/pwa/push';
// @ts-expect-error: los Node-script zonder typen
import * as stuur from '../scripts/pushproef-stuur.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lees = (p: string) => readFileSync(path.join(APP, p));
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
/** De private sleutel als 32 bytes: ECDH.getPrivateKey laat voorloopnullen weg (ongeveer 1 op 256 sleutels). */
const privaat32 = (e: { getPrivateKey(): Buffer }) => { const d = e.getPrivateKey(); return Buffer.concat([Buffer.alloc(32 - d.length), d]); };

/** De alfa van de pixel linksboven (8 bits; RGB zonder alfa is dekkend). Voor de eerste pixel geeft elk PNG-filter de ruwe waarde. */
function hoekAlfa(bestand: Buffer): number {
  expect(bestand[24]).toBe(8);
  if (bestand[25] === 2) return 255;
  expect(bestand[25]).toBe(6);
  const idat: Buffer[] = [];
  for (let i = 8; i < bestand.length;) {
    const lengte = bestand.readUInt32BE(i);
    if (bestand.subarray(i + 4, i + 8).toString() === 'IDAT') idat.push(bestand.subarray(i + 8, i + 8 + lengte));
    i += 12 + lengte;
  }
  return inflateSync(Buffer.concat(idat))[4];
}

/** Breedte en hoogte uit de IHDR van een PNG. */
function pngMaat(bestand: Buffer): [number, number] {
  expect(bestand.subarray(1, 4).toString()).toBe('PNG');
  return [bestand.readUInt32BE(16), bestand.readUInt32BE(20)];
}

describe('manifest en pictogrammen', () => {
  const manifest = JSON.parse(lees('public/manifest.webmanifest').toString());

  it('start en scope in de app zelf (relatief: werkt op staging en productie), standalone, Nederlands', () => {
    expect(manifest).toMatchObject({ start_url: './', scope: './', id: './', display: 'standalone', lang: 'nl', name: 'Thuisplanner' });
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it('192, 512 en maskable, en elk bestand heeft precies de opgegeven maat', () => {
    const soorten = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`);
    expect(soorten).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));
    for (const i of manifest.icons) {
      const [b, h] = pngMaat(lees(path.join('public', i.src)));
      expect(`${b}x${h}`).toBe(i.sizes);
    }
  });

  it('index.html: manifest met cookie (Cloudflare Access op staging), beginschermpictogram van 180 en de iOS-tags', () => {
    const html = lees('index.html').toString();
    expect(html).toMatch(/<link rel="manifest" href="manifest\.webmanifest" crossorigin="use-credentials" \/>/);
    expect(html).toContain('<link rel="apple-touch-icon" href="pictogrammen/apple-touch-icon.png" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Thuisplanner" />');
    expect(pngMaat(lees('public/pictogrammen/apple-touch-icon.png'))).toEqual([180, 180]);
  });

  it('het iOS-pictogram en de maskable variant hebben geen doorzichtige hoeken; het gewone pictogram wel', () => {
    expect(hoekAlfa(lees('public/pictogrammen/apple-touch-icon.png'))).toBe(255);
    expect(hoekAlfa(lees('public/pictogrammen/icon-maskable-512.png'))).toBe(255);
    expect(hoekAlfa(lees('public/pictogrammen/icon-512.png'))).toBe(0);
  });
});

/** Laadt public/sw.js in een nagebootste service-workeromgeving. */
function laadServiceWorker({ vensters = [] as Array<{ url: string; focus: () => Promise<unknown>; navigate?: (u: string) => Promise<unknown> }> } = {}) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const toon = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => null);
  const self = {
    registration: { scope: 'https://thuisplanner-staging.pages.dev/', showNotification: toon },
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => vensters), openWindow },
    skipWaiting: vi.fn(),
    addEventListener: (soort: string, h: (e: unknown) => void) => { handlers[soort] = h; },
  };
  vm.runInNewContext(lees('public/sw.js').toString(), { self, URL, console });
  const wacht = async (soort: string, event: Record<string, unknown>) => {
    let belofte: Promise<unknown> = Promise.resolve();
    handlers[soort]({ ...event, waitUntil: (p: Promise<unknown>) => { belofte = p; } });
    return belofte;
  };
  return { handlers, toon, openWindow, self, wacht };
}
const pushData = (inhoud: unknown) => ({
  json: () => (typeof inhoud === 'string' ? JSON.parse(inhoud) : inhoud),
  text: () => (typeof inhoud === 'string' ? inhoud : JSON.stringify(inhoud)),
});

describe('service worker (public/sw.js)', () => {
  const bron = lees('public/sw.js').toString();

  it('alleen push en notificationclick (plus installeren); geen fetch-handler en geen cache (besluit 17)', () => {
    const { handlers } = laadServiceWorker();
    expect(Object.keys(handlers).sort()).toEqual(['activate', 'install', 'notificationclick', 'push']);
    const code = bron.replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/['"]fetch['"]|\bcaches\b|\bfetch\(|importScripts|indexedDB/);
  });

  it('push: titel, tekst en adres uit de inhoud; het adres blijft in de app', async () => {
    const { wacht, toon } = laadServiceWorker();
    await wacht('push', { data: pushData({ title: '16:00 · Zwemles', body: 'Over 15 minuten', url: './#/agenda', tag: 'x' }) });
    expect(toon).toHaveBeenCalledWith('16:00 · Zwemles', expect.objectContaining({
      body: 'Over 15 minuten', tag: 'x', lang: 'nl',
      icon: 'https://thuisplanner-staging.pages.dev/pictogrammen/icon-192.png',
      data: { url: 'https://thuisplanner-staging.pages.dev/#/agenda' },
    }));
  });

  it('push: een adres buiten de app wordt de start van de app', async () => {
    for (const url of ['https://voorbeeld.nl/', '//voorbeeld.nl/x', 'javascript:alert(1)']) {
      const { wacht, toon } = laadServiceWorker();
      await wacht('push', { data: pushData({ title: 'x', url }) });
      expect((toon.mock.calls[0] as unknown[])[1]).toMatchObject({ data: { url: 'https://thuisplanner-staging.pages.dev/' } });
    }
  });

  it('push: altijd een melding, ook zonder inhoud, met gewone tekst of met te lange tekst', async () => {
    const leeg = laadServiceWorker();
    await leeg.wacht('push', { data: null });
    expect(leeg.toon).toHaveBeenCalledWith('Thuisplanner', expect.objectContaining({ body: 'Er is iets nieuws in Thuisplanner.' }));
    const tekst = laadServiceWorker();
    await tekst.wacht('push', { data: { json: () => { throw new SyntaxError('x'); }, text: () => 'Gewoon tekst' } });
    expect(tekst.toon).toHaveBeenCalledWith('Thuisplanner', expect.objectContaining({ body: 'Gewoon tekst' }));
    const lang = laadServiceWorker();
    await lang.wacht('push', { data: pushData({ title: 'a'.repeat(200), body: 'b'.repeat(500) }) });
    const [titel, opties] = lang.toon.mock.calls[0] as unknown as [string, { body: string }];
    expect([titel.length, opties.body.length]).toEqual([80, 200]);
  });

  it('notificationclick: een open venster van de app krijgt focus en gaat naar het adres', async () => {
    const navigate = vi.fn(async () => null);
    const venster = { url: 'https://thuisplanner-staging.pages.dev/#/vandaag', focus: vi.fn(async () => venster), navigate };
    const { wacht, openWindow } = laadServiceWorker({ vensters: [{ url: 'https://elders.nl/', focus: vi.fn(async () => null) }, venster] });
    const close = vi.fn();
    await wacht('notificationclick', { notification: { close, data: { url: 'https://thuisplanner-staging.pages.dev/#/agenda' } } });
    expect(close).toHaveBeenCalled();
    expect(venster.focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('https://thuisplanner-staging.pages.dev/?van=melding#/agenda');
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('notificationclick: geen open venster → de app openen; een vreemd adres wordt de start van de app', async () => {
    const { wacht, openWindow } = laadServiceWorker();
    await wacht('notificationclick', { notification: { close: vi.fn(), data: { url: 'https://voorbeeld.nl/' } } });
    expect(openWindow).toHaveBeenCalledWith('https://thuisplanner-staging.pages.dev/?van=melding');
  });

  it('notificationclick: het doel krijgt ?van=melding vóór de hash, zodat het startscherm het niet vervangt (review #57)', async () => {
    const { wacht, openWindow } = laadServiceWorker();
    await wacht('notificationclick', { notification: { close: vi.fn(), data: { url: 'https://thuisplanner-staging.pages.dev/#/agenda' } } });
    expect(openWindow).toHaveBeenCalledWith('https://thuisplanner-staging.pages.dev/?van=melding#/agenda');
  });

  it('notificationclick: lukt navigeren niet (venster niet beheerd), dan blijft het venster gewoon open', async () => {
    const venster = { url: 'https://thuisplanner-staging.pages.dev/', focus: vi.fn(async () => venster), navigate: vi.fn(async () => { throw new TypeError('niet beheerd'); }) };
    const { wacht } = laadServiceWorker({ vensters: [venster] });
    await expect(wacht('notificationclick', { notification: { close: vi.fn(), data: { url: './#/agenda' } } })).resolves.toBe(venster);
  });
});

describe('registratie van de service worker', () => {
  const venster = (protocol = 'https:', veilig = true, sw: unknown = { register: vi.fn(async () => ({ scope: 'x' })) }) =>
    ({ isSecureContext: veilig, location: { protocol }, navigator: { serviceWorker: sw } }) as never;

  it('alleen in een productiebuild, op een veilige http(s)-pagina, met service workers', () => {
    expect(magRegistreren({ prod: true, venster: venster() })).toBe(true);
    expect(magRegistreren({ prod: false, venster: venster() })).toBe(false);
    expect(magRegistreren({ prod: true, venster: venster('file:') })).toBe(false);
    expect(magRegistreren({ prod: true, venster: venster('http:', false) })).toBe(false);
    expect(magRegistreren({ prod: true, venster: { isSecureContext: true, location: { protocol: 'https:' }, navigator: {} } as never })).toBe(false);
    const afgeschermd = { isSecureContext: true, location: { protocol: 'https:' }, navigator: { get serviceWorker() { throw new DOMException('SecurityError'); } } };
    expect(magRegistreren({ prod: true, venster: afgeschermd as never })).toBe(false);
  });

  it('vast pad naast index.html, scope de hele app, sw.js nooit uit de HTTP-cache', async () => {
    const register = vi.fn(async () => ({ scope: 'https://x/' }));
    await registreerServiceWorker({ prod: true, basis: './', venster: venster('https:', true, { register }) });
    expect(register).toHaveBeenCalledWith('./sw.js', { scope: './', updateViaCache: 'none' });
  });

  it('een mislukte registratie blijft stil (de app werkt door zonder meldingen)', async () => {
    const waarschuw = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const register = vi.fn(async () => { throw new Error('mis'); });
    await expect(registreerServiceWorker({ prod: true, basis: './', venster: venster('https:', true, { register }) })).resolves.toBeNull();
    expect(waarschuw).toHaveBeenCalled();
    waarschuw.mockRestore();
  });
});

describe('VAPID-sleutel in de build', () => {
  const paar = () => { const e = createECDH('prime256v1'); e.generateKeys(); return { publiek: b64u(e.getPublicKey()), privaat: b64u(e.getPrivateKey()) }; };

  it('alleen een publieke sleutel (65 bytes, 0x04) telt', () => {
    const { publiek, privaat } = paar();
    expect(publiekeVapidSleutel(publiek)?.length).toBe(65);
    expect(publiekeVapidSleutel(privaat)).toBeNull();
    expect(publiekeVapidSleutel('geen sleutel!')).toBeNull();
    expect(publiekeVapidSleutel(undefined)).toBeNull();
    expect(base64urlNaarBytes('AQID')).toEqual(new Uint8Array([1, 2, 3]));
  });

  const basis = { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_x' };

  it('de stagingbuild weigert een private sleutel in een VITE_-variabele en een ongeldige publieke sleutel', () => {
    const { publiek, privaat } = paar();
    expect(stagingBuildFouten({ ...basis, VITE_PUSHPROEF: '1', VITE_VAPID_PUBLIC_KEY: publiek })).toEqual([]);
    expect(stagingBuildFouten({ ...basis, VITE_VAPID_PRIVATE_KEY: privaat }).join('\n')).toMatch(/VITE_VAPID_PRIVATE_KEY: een geheime sleutel/);
    expect(stagingBuildFouten({ ...basis, VITE_VAPID_PUBLIC_KEY: privaat }).join('\n')).toMatch(/geen publieke VAPID-sleutel/);
  });

  it('_headers: sw.js en het manifest altijd vers; worker-src en manifest-src alleen de eigen site', () => {
    const h = headersBestand('abcdefghijklmnopqrst');
    expect(h).toMatch(/\n\/sw\.js\n {2}Cache-Control: no-cache\n/);
    expect(h).toMatch(/\n\/manifest\.webmanifest\n {2}Cache-Control: no-cache\n/);
    expect(h).toMatch(/worker-src 'self'; manifest-src 'self'/);
  });
});

describe('verzendscript (scripts/pushproef-stuur.mjs)', () => {
  const subtle = webcrypto.subtle;
  /** Een toestel: een eigen sleutelpaar en auth-geheim, zoals de browser dat bij subscribe() maakt. */
  function toestel() {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const auth = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16)));
    const json = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', expirationTime: null, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } };
    return { ua, auth, json };
  }
  function vapid() {
    const e = createECDH('prime256v1');
    e.generateKeys();
    return stuur.vapidSleutel(b64u(e.getPublicKey()), b64u(e.getPrivateKey()));
  }

  /** Onafhankelijke ontsleuteling met WebCrypto (RFC 8291), zoals de browser het doet. */
  async function ontsleutel(body: Buffer, ua: ReturnType<typeof createECDH>, auth: Buffer): Promise<string> {
    const zout = body.subarray(0, 16);
    const rs = body.readUInt32BE(16);
    const idlen = body[20];
    const asPubliek = body.subarray(21, 21 + idlen);
    const versleuteld = body.subarray(21 + idlen);
    expect(rs).toBe(4096);
    const uaPub = ua.getPublicKey();
    const jwk = { kty: 'EC', crv: 'P-256', d: b64u(privaat32(ua)), x: b64u(uaPub.subarray(1, 33)), y: b64u(uaPub.subarray(33)) };
    const priv = await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const pub = await subtle.importKey('raw', asPubliek, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const gedeeld = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256));
    const hkdf = async (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, lengte: number) => {
      const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
      return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, lengte * 8));
    };
    const enc = (s: string) => new TextEncoder().encode(s);
    const ikm = await hkdf(gedeeld, auth, Buffer.concat([enc('WebPush: info\0'), uaPub, asPubliek]), 32);
    const cek = await hkdf(ikm, zout, enc('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(ikm, zout, enc('Content-Encoding: nonce\0'), 12);
    const sleutel = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const tekst = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, sleutel, versleuteld));
    expect(tekst[tekst.length - 1]).toBe(0x02);
    return new TextDecoder().decode(tekst.subarray(0, -1));
  }

  it('versleutelt zo dat het toestel het met zijn eigen sleutel kan lezen (aes128gcm)', async () => {
    const t = toestel();
    const inhoud = stuur.testInhoud({ adres: '#/agenda' });
    const verzoek = stuur.pushVerzoek(stuur.leesAbonnement(JSON.stringify(t.json)), inhoud, vapid(), { onderwerp: 'https://mijnthuisplanner.nl' });
    expect(verzoek.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: '300', 'Content-Type': 'application/octet-stream' });
    expect(JSON.parse(await ontsleutel(verzoek.body, t.ua, t.auth))).toEqual({ title: 'Thuisplanner', body: 'Testmelding: meldingen werken op dit toestel.', url: './#/agenda', tag: 'pushproef' });
  });

  it('VAPID: een ES256-handtekening van de eigen sleutel, voor de origin van de pushdienst, hoogstens 24 uur geldig', async () => {
    const v = vapid();
    const nu = Date.UTC(2026, 10, 24, 12);
    const kop = stuur.vapidKop('https://web.push.apple.com/QGuQyavXutnMH', v, { onderwerp: 'https://mijnthuisplanner.nl', nu });
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(kop)!;
    expect(m[4]).toBe(v.publiek);
    expect(JSON.parse(Buffer.from(m[2], 'base64url').toString())).toEqual({ aud: 'https://web.push.apple.com', exp: nu / 1000 + 12 * 3600, sub: 'https://mijnthuisplanner.nl' });
    const pub = await subtle.importKey('raw', Buffer.from(v.publiek, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const geldig = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, Buffer.from(m[3], 'base64url'), Buffer.from(`${m[1]}.${m[2]}`));
    expect(geldig).toBe(true);
    expect(() => stuur.vapidKop('https://x.nl/', v, { onderwerp: 'iemand@voorbeeld.nl' })).toThrow(/mailto: of https/);
  });

  it('een private sleutel zonder voorloopnul (31 bytes, zoals ECDH.getPrivateKey die soms geeft) is dezelfde sleutel', () => {
    // Zoek een sleutel die met een nulbyte begint; deterministisch genoeg (gemiddeld 256 pogingen).
    let e = createECDH('prime256v1');
    do { e = createECDH('prime256v1'); e.generateKeys(); } while (privaat32(e)[0] !== 0);
    const kort = privaat32(e).subarray(1);
    const v = stuur.vapidSleutel(b64u(e.getPublicKey()), b64u(kort));
    expect(v.publiek).toBe(b64u(e.getPublicKey()));
    expect(() => stuur.vapidSleutel(b64u(e.getPublicKey()), b64u(Buffer.concat([Buffer.from([1]), privaat32(e)])))).toThrow(/32 bytes/);
  });

  it('weigert sleutels die niet bij elkaar horen, ontbreken of de verkeerde lengte hebben', () => {
    const a = createECDH('prime256v1'); a.generateKeys();
    const b = createECDH('prime256v1'); b.generateKeys();
    expect(() => stuur.vapidSleutel(b64u(a.getPublicKey()), b64u(b.getPrivateKey()))).toThrow(/horen niet bij elkaar/);
    expect(() => stuur.vapidSleutel(b64u(a.getPublicKey()), undefined)).toThrow(/PUSHPROEF_VAPID_PRIVATE ontbreekt/);
    expect(() => stuur.vapidSleutel(b64u(a.getPrivateKey()), b64u(a.getPrivateKey()))).toThrow(/65 bytes/);
  });

  it('controleert het abonnement en het adres van de melding', () => {
    const t = toestel();
    expect(stuur.leesAbonnement(JSON.stringify(t.json)).endpoint).toBe(t.json.endpoint);
    expect(() => stuur.leesAbonnement('{')).toThrow(/geen geldig JSON/);
    expect(() => stuur.leesAbonnement({ ...t.json, endpoint: 'http://x.nl/' })).toThrow(/https/);
    expect(() => stuur.leesAbonnement({ ...t.json, keys: { ...t.json.keys, auth: 'AQID' } })).toThrow(/16 bytes/);
    expect(() => stuur.testInhoud({ adres: 'https://voorbeeld.nl/' })).toThrow(/adres in de app/);
    expect(() => stuur.versleutel('x'.repeat(3001), stuur.leesAbonnement(t.json))).toThrow(/te lang/);
  });

  it('uitleg bij het antwoord van de pushdienst', () => {
    expect(stuur.uitlegAntwoord(201)).toMatch(/^Verstuurd/);
    expect(stuur.uitlegAntwoord(410)).toMatch(/bestaat niet meer/);
    expect(stuur.uitlegAntwoord(403)).toMatch(/VAPID/);
  });

  it('het script staat los van de app: geen database, geen Supabase', () => {
    const bron = lees('scripts/pushproef-stuur.mjs').toString();
    expect([...bron.matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]).sort()).toEqual(['./lokaal-platform.mjs', 'node:crypto', 'node:fs']);
    expect(bron).not.toMatch(/SERVICE_ROLE|createClient/);
  });
});
