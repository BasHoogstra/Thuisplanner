#!/usr/bin/env node
// Pushproef (PR P0): stuurt één testmelding naar één abonnement, vanaf de eigen computer. Geen database, geen
// Supabase, geen extra npm-pakket: Web Push (RFC 8030), versleuteling aes128gcm (RFC 8188/8291) en VAPID (RFC 8292)
// met alleen node:crypto. P1 doet hetzelfde vanuit een Edge Function.
//
//   node --env-file=.env.pushproef.local scripts/pushproef-stuur.mjs abonnement.json [--titel …] [--tekst …] [--adres …] [--droog]
//
// - abonnement.json: het JSON dat de pushproefpagina (#/pushproef) toont of kopieert.
// - Sleutels alleen uit omgevingsvariabelen, nooit als argument (dat komt in de shellgeschiedenis):
//     PUSHPROEF_VAPID_PUBLIC   de publieke sleutel (dezelfde als VITE_VAPID_PUBLIC_KEY in de build); valt terug op
//                              VITE_VAPID_PUBLIC_KEY
//     PUSHPROEF_VAPID_PRIVATE  de private sleutel (32 bytes, base64url). Geheim: alleen op deze computer.
//     PUSHPROEF_VAPID_SUBJECT  contact voor de pushdienst (mailto: of https:); standaard https://mijnthuisplanner.nl
//   `.env.*` staat in .gitignore, dus .env.pushproef.local komt nooit in git.
// - --droog: alles klaarzetten en controleren, maar niets versturen.
// De inhoud van de melding is een vaste testtekst zonder gegevens uit de planning (besluit 16 en 20).
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isHoofdscript } from './lokaal-platform.mjs';

const b64u = bytes => Buffer.from(bytes).toString('base64url');

/** base64url naar bytes, streng (Buffer zelf slikt ook ongeldige tekens). */
export function vanB64u(tekst, wat) {
  if (typeof tekst !== 'string' || !/^[A-Za-z0-9_-]+$/.test(tekst.trim())) throw new Error(`${wat} is geen base64url.`);
  return Buffer.from(tekst.trim(), 'base64url');
}

/** Controleert het abonnement uit de pushproefpagina en geeft { endpoint, p256dh, auth } (bytes) terug. */
export function leesAbonnement(json) {
  let a;
  try { a = typeof json === 'string' ? JSON.parse(json) : json; } catch { throw new Error('Het abonnement is geen geldig JSON.'); }
  let url;
  try { url = new URL(a?.endpoint); } catch { throw new Error('Het abonnement heeft geen geldig endpoint.'); }
  if (url.protocol !== 'https:') throw new Error('Het endpoint moet https zijn.');
  const p256dh = vanB64u(a?.keys?.p256dh, 'keys.p256dh');
  const auth = vanB64u(a?.keys?.auth, 'keys.auth');
  if (p256dh.length !== 65 || p256dh[0] !== 0x04) throw new Error('keys.p256dh is geen publieke P-256-sleutel (65 bytes).');
  if (auth.length !== 16) throw new Error('keys.auth moet 16 bytes zijn.');
  return { endpoint: url.href, p256dh, auth };
}

/** Het VAPID-sleutelpaar uit base64url; controleert dat de twee bij elkaar horen. */
export function vapidSleutel(publiek, privaat) {
  if (!publiek) throw new Error('PUSHPROEF_VAPID_PUBLIC (of VITE_VAPID_PUBLIC_KEY) ontbreekt.');
  if (!privaat) throw new Error('PUSHPROEF_VAPID_PRIVATE ontbreekt.');
  const pub = vanB64u(publiek, 'De publieke VAPID-sleutel');
  const d = vanB64u(privaat, 'De private VAPID-sleutel');
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('De publieke VAPID-sleutel moet 65 bytes zijn (begint met B).');
  if (d.length !== 32) throw new Error('De private VAPID-sleutel moet 32 bytes zijn.');
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  if (!ecdh.getPublicKey().equals(pub)) throw new Error('De private en de publieke VAPID-sleutel horen niet bij elkaar.');
  const sleutel = createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) },
  });
  return { publiek: b64u(pub), sleutel };
}

/** De Authorization-kop (VAPID, RFC 8292): een ES256-JWT voor de origin van de pushdienst, 12 uur geldig. */
export function vapidKop(endpoint, vapid, { onderwerp, nu = Date.now() }) {
  if (!/^(mailto:|https:\/\/)/.test(onderwerp)) throw new Error('PUSHPROEF_VAPID_SUBJECT moet met mailto: of https:// beginnen.');
  const kop = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nu / 1000) + 12 * 3600, sub: onderwerp }));
  const handtekening = sign('sha256', Buffer.from(`${kop}.${claims}`), { key: vapid.sleutel, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${kop}.${claims}.${b64u(handtekening)}, k=${vapid.publiek}`;
}

const MAX_INHOUD = 3000;   // ruim binnen één record van 4096 bytes en de 4 KB van de pushdiensten

/**
 * Versleutelt de inhoud voor dit toestel (aes128gcm, RFC 8291): één record, afsluitend met 0x02.
 * `zout` en `afzender` (een createECDH-object met sleutels) alleen voor de tests; anders per bericht nieuw.
 */
export function versleutel(inhoud, { p256dh, auth }, { zout = randomBytes(16), afzender } = {}) {
  const tekst = Buffer.from(inhoud, 'utf8');
  if (tekst.length > MAX_INHOUD) throw new Error(`De inhoud is te lang (${tekst.length} bytes; hoogstens ${MAX_INHOUD}).`);
  const ecdh = afzender ?? createECDH('prime256v1');
  if (!afzender) ecdh.generateKeys();
  const asPubliek = ecdh.getPublicKey();
  const gedeeld = ecdh.computeSecret(p256dh);
  const ikm = Buffer.from(hkdfSync('sha256', gedeeld, auth, Buffer.concat([Buffer.from('WebPush: info\0'), p256dh, asPubliek]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, zout, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, zout, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const versleuteld = Buffer.concat([cipher.update(Buffer.concat([tekst, Buffer.from([0x02])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([zout, rs, Buffer.from([asPubliek.length]), asPubliek, versleuteld]);
}

/** De vaste testmelding; het adres moet een hashroute van de app zijn (de service worker houdt het binnen de app). */
export function testInhoud({ titel = 'Thuisplanner', tekst = 'Testmelding: meldingen werken op dit toestel.', adres = './' } = {}) {
  if (adres !== './' && !/^#\/[a-z0-9/_-]*$/i.test(adres)) throw new Error('--adres moet een adres in de app zijn, zoals #/agenda.');
  return JSON.stringify({ title: titel, body: tekst, url: adres === './' ? './' : './' + adres, tag: 'pushproef' });
}

/** Het complete verzoek aan de pushdienst. */
export function pushVerzoek(abonnement, inhoud, vapid, { onderwerp, nu, ttl = 300, ...versleutelOpties } = {}) {
  return {
    url: abonnement.endpoint,
    method: 'POST',
    headers: {
      TTL: String(ttl),
      Urgency: 'normal',
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Authorization: vapidKop(abonnement.endpoint, vapid, { onderwerp, nu }),
    },
    body: versleutel(inhoud, abonnement, versleutelOpties),
  };
}

/** Een leesbare uitleg bij het antwoord van de pushdienst. */
export function uitlegAntwoord(status) {
  if (status >= 200 && status < 300) return 'Verstuurd. De melding hoort binnen enkele seconden op het toestel te staan.';
  if (status === 404 || status === 410) return 'Dit abonnement bestaat niet meer. Maak op de pushproefpagina een nieuw abonnement.';
  if (status === 401 || status === 403) return 'De pushdienst weigert de VAPID-sleutel. Staat dezelfde publieke sleutel in de build als hier?';
  if (status === 413) return 'De inhoud is te groot voor de pushdienst.';
  if (status === 429) return 'Te veel verzoeken; probeer het over een paar minuten opnieuw.';
  return `De pushdienst gaf status ${status}.`;
}

function leesArgumenten(args) {
  const uit = { droog: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--droog') uit.droog = true;
    else if (a === '--titel' || a === '--tekst' || a === '--adres') uit[a.slice(2)] = args[++i];
    else if (!a.startsWith('--') && !uit.bestand) uit.bestand = a;
    else throw new Error(`Onbekend argument: ${a}`);
  }
  if (!uit.bestand) throw new Error('Geef het bestand met het abonnement mee, bijvoorbeeld: abonnement.json');
  return uit;
}

async function hoofd() {
  const args = leesArgumenten(process.argv.slice(2));
  const abonnement = leesAbonnement(readFileSync(args.bestand, 'utf8'));
  const vapid = vapidSleutel(process.env.PUSHPROEF_VAPID_PUBLIC || process.env.VITE_VAPID_PUBLIC_KEY, process.env.PUSHPROEF_VAPID_PRIVATE);
  const onderwerp = process.env.PUSHPROEF_VAPID_SUBJECT || 'https://mijnthuisplanner.nl';
  const verzoek = pushVerzoek(abonnement, testInhoud(args), vapid, { onderwerp });
  // Het volledige endpoint is geheim genoeg om dit toestel meldingen te sturen: alleen de pushdienst tonen.
  console.log(`Pushdienst: ${new URL(verzoek.url).origin} · ${verzoek.body.length} bytes versleuteld`);
  if (args.droog) { console.log('Droog: niets verstuurd.'); return; }
  const antwoord = await fetch(verzoek.url, { method: verzoek.method, headers: verzoek.headers, body: verzoek.body });
  console.log(`${antwoord.status}: ${uitlegAntwoord(antwoord.status)}`);
  if (!antwoord.ok) {
    const tekst = (await antwoord.text().catch(() => '')).slice(0, 300);
    if (tekst) console.log(tekst);
    process.exitCode = 1;
  }
}

if (isHoofdscript(import.meta.url, process.argv[1])) {
  hoofd().catch(fout => { console.error(`Fout: ${fout.message}`); process.exitCode = 1; });
}
