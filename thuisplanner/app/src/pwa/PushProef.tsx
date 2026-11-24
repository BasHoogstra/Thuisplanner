import { useCallback, useEffect, useState } from 'react';
import { abonnementTekst, publiekeVapidSleutel, pushStand, type PushStand, type Toestemming } from './push';
import './pushproef.css';

// De pushproef (PR P0; besluit 16: "een pushproef op de testtelefoons"). Een verborgen pagina (#/pushproef) die alleen
// in een build met VITE_PUSHPROEF=1 bestaat. Ze toont de stand van dit toestel, vraagt na een eigen uitleg om
// toestemming, en maakt een push-abonnement met de publieke VAPID-sleutel uit de build (VITE_VAPID_PUBLIC_KEY).
// Het abonnement wordt alleen getoond en gekopieerd: niets gaat naar de database of naar een server, en niets wordt
// op het toestel bewaard (de browser zelf houdt het abonnement bij). De testmelding stuurt de tester daarna met
// scripts/pushproef-stuur.mjs (README, "Pushproef").

const TOESTEMMING: Record<Toestemming, string> = {
  default: 'Nog niet gevraagd',
  granted: 'Toegestaan',
  denied: 'Geweigerd',
  'niet-ondersteund': 'Niet beschikbaar in deze browser',
};

export interface PushProefProps {
  /** De publieke VAPID-sleutel (base64url); standaard uit de build. */
  sleutel?: string;
  /** Voor de tests: de stand van het toestel en de browser-API's. */
  stand?: () => PushStand;
  serviceWorker?: ServiceWorkers | null;
  vraagToestemming?: () => Promise<NotificationPermission>;
  kopieer?: (tekst: string) => Promise<void>;
}

/** getRegistration, en (in de browser) ready: bij het eerste bezoek registreert main.tsx pas na het laden. */
type ServiceWorkers = Pick<ServiceWorkerContainer, 'getRegistration'> & Partial<Pick<ServiceWorkerContainer, 'ready'>>;

function standaardServiceWorker(): ServiceWorkers | null {
  try { return 'serviceWorker' in navigator ? navigator.serviceWorker : null; } catch { return null; }
}

export function PushProef({
  sleutel = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined,
  stand: leesStand = pushStand,
  serviceWorker = standaardServiceWorker(),
  vraagToestemming = () => Notification.requestPermission(),
  kopieer = tekst => navigator.clipboard.writeText(tekst),
}: PushProefProps) {
  const [stand, zetStand] = useState<PushStand>(leesStand);
  const [registratie, zetRegistratie] = useState<ServiceWorkerRegistration | null | undefined>(undefined);
  const [abonnement, zetAbonnement] = useState<PushSubscription | null>(null);
  const [uitleg, zetUitleg] = useState(false);
  const [bezig, zetBezig] = useState(false);
  const [status, zetStatus] = useState('');
  const [fout, zetFout] = useState('');
  const sleutelBytes = publiekeVapidSleutel(sleutel);

  useEffect(() => {
    let weg = false;
    void (async () => {
      let reg = serviceWorker ? await serviceWorker.getRegistration().catch(() => undefined) : undefined;
      // Net geopend: de registratie (na het laden van de pagina) kan nog bezig zijn. ready wacht daarop, maar blijft
      // hangen als er nooit een service worker komt (ontwikkelserver), dus hoogstens een paar seconden.
      if (!reg && serviceWorker?.ready) {
        reg = await Promise.race([serviceWorker.ready, new Promise<undefined>(klaar => setTimeout(() => klaar(undefined), 4000))]);
      }
      const ab = reg?.pushManager ? await reg.pushManager.getSubscription().catch(() => null) : null;
      if (!weg) { zetRegistratie(reg ?? null); zetAbonnement(ab); }
    })();
    return () => { weg = true; };
  }, [serviceWorker]);

  const actie = useCallback(async (wat: () => Promise<void>) => {
    zetBezig(true); zetFout(''); zetStatus('');
    try { await wat(); } catch (e) {
      // Naam en tekst van de browserfout (bijvoorbeeld NotAllowedError of AbortError): nodig om de proef te beoordelen.
      const { name, message } = (e ?? {}) as { name?: string; message?: string };
      zetFout(`Dat lukte niet${name ? ` (${name})` : ''}: ${message || String(e)}`);
    } finally {
      zetBezig(false);
      zetStand(leesStand());
    }
  }, [leesStand]);

  const vraag = () => actie(async () => {
    zetUitleg(false);
    const uitkomst = await vraagToestemming();
    zetStatus(uitkomst === 'granted' ? 'Meldingen staan aan op dit toestel.' : 'Meldingen staan niet aan.');
  });

  const maakAbonnement = () => actie(async () => {
    if (!registratie || !sleutelBytes) return;
    const ab = await registratie.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: sleutelBytes as BufferSource });
    zetAbonnement(ab);
    zetStatus('Abonnement gemaakt. Kopieer het en stuur er een testmelding naar.');
  });

  const zegOp = () => actie(async () => {
    if (!abonnement) return;
    await abonnement.unsubscribe();
    zetAbonnement(null);
    zetStatus('Abonnement opgezegd.');
  });

  const lokaleMelding = () => actie(async () => {
    if (!registratie) return;
    await registratie.showNotification('Thuisplanner', { body: 'Lokale testmelding van dit toestel.', lang: 'nl', data: { url: './' } });
    zetStatus('Lokale testmelding getoond (zonder server).');
  });

  const kopieerAbonnement = () => actie(async () => {
    if (!abonnement) return;
    await kopieer(abonnementTekst(abonnement));
    zetStatus('Gekopieerd.');
  });

  const toegestaan = stand.toestemming === 'granted';
  return (
    <div className="schil pushproef">
      <main className="hoofd">
        <div className="scherm">
          <header className="kop">
            <p className="kop-datum"><span className="demo-label">Proef</span></p>
            <h1>Pushproef</h1>
            <p className="kop-samenvatting">Werkt een melding op dit toestel? Deze pagina bewaart niets en stuurt niets naar Thuisplanner.</p>
          </header>

          <h2 className="sectie-kop">Dit toestel</h2>
          <dl className="lijst pushproef-stand">
            <div><dt>Meldingen</dt><dd>{TOESTEMMING[stand.toestemming]}</dd></div>
            <div><dt>Geopend als</dt><dd>{stand.standalone ? 'App op het beginscherm' : 'Tabblad in de browser'}</dd></div>
            <div><dt>Service worker</dt><dd>{registratie === undefined ? 'Even kijken…' : registratie ? 'Actief' : 'Niet actief'}</dd></div>
            <div><dt>Push</dt><dd>{stand.pushOndersteund ? 'Ondersteund' : 'Niet ondersteund'}</dd></div>
            <div><dt>Publieke sleutel</dt><dd>{sleutelBytes ? 'Aanwezig' : sleutel ? 'Ongeldig' : 'Ontbreekt in deze build'}</dd></div>
          </dl>

          {stand.ios && !stand.standalone && (
            <p className="pushproef-noot">
              Op een iPhone werken meldingen alleen in de app op het beginscherm (iOS 16.4 of nieuwer). Tik in Safari op
              Deel, kies <strong>Zet op beginscherm</strong>, en open Thuisplanner daarna vanaf het beginscherm.
            </p>
          )}
          {registratie === null && (
            <p className="pushproef-noot">De service worker is niet actief. Hij draait alleen in een gebouwde app via https (zoals staging).</p>
          )}

          <h2 className="sectie-kop">Stappen</h2>
          {stand.toestemming === 'default' && !uitleg && (
            <button type="button" className="knop breed" disabled={bezig} onClick={() => zetUitleg(true)}>1. Meldingen aanzetten</button>
          )}
          {uitleg && (
            <section className="pushproef-uitleg" aria-labelledby="h-pushproef-uitleg">
              <h3 id="h-pushproef-uitleg">Eerst even uitleg</h3>
              <p>
                Zo meteen vraagt je {stand.ios ? 'iPhone' : 'browser'} of Thuisplanner meldingen mag sturen. Dit is alleen een
                proef: je krijgt een testmelding die we zelf versturen, zonder gegevens uit jullie planning.
              </p>
              <p>Je kunt meldingen later altijd weer uitzetten in de instellingen van je {stand.ios ? 'iPhone' : 'browser'}.</p>
              <div className="pushproef-knoppen">
                <button type="button" className="knop" disabled={bezig} onClick={vraag}>Doorgaan</button>
                <button type="button" className="knop stil" disabled={bezig} onClick={() => zetUitleg(false)}>Niet nu</button>
              </div>
            </section>
          )}
          {stand.toestemming === 'denied' && (
            <p className="pushproef-noot">
              Meldingen zijn geweigerd. Zet ze weer aan in de instellingen ({stand.ios ? 'Instellingen → Meldingen → Thuisplanner' : 'het slotje of de site-instellingen van de browser'}) en laad deze pagina opnieuw.
            </p>
          )}
          {stand.toestemming === 'niet-ondersteund' && (
            <p className="pushproef-noot">Deze browser kent geen meldingen{stand.ios ? ' buiten de app op het beginscherm' : ''}.</p>
          )}

          {toegestaan && (
            <div className="pushproef-knoppen">
              {!abonnement && (
                <button type="button" className="knop" disabled={bezig || !registratie || !sleutelBytes} onClick={maakAbonnement}>2. Abonnement maken</button>
              )}
              <button type="button" className="knop stil" disabled={bezig || !registratie} onClick={lokaleMelding}>Lokale testmelding</button>
            </div>
          )}

          {abonnement && (
            <section className="pushproef-abonnement" aria-labelledby="h-pushproef-abonnement">
              <h3 id="h-pushproef-abonnement">3. Het abonnement</h3>
              <p className="stil-tekst">
                Kopieer dit en zet het in een bestand op de computer van waaruit je de testmelding stuurt. Wie dit heeft, kan
                dit toestel meldingen sturen: deel het niet verder en zeg het op na de proef.
              </p>
              <label className="sr-only" htmlFor="pushproef-json">Abonnement als JSON</label>
              <textarea id="pushproef-json" readOnly rows={8} value={abonnementTekst(abonnement)} onFocus={e => e.currentTarget.select()} />
              <div className="pushproef-knoppen">
                <button type="button" className="knop" disabled={bezig} onClick={kopieerAbonnement}>Kopiëren</button>
                <button type="button" className="knop stil" disabled={bezig} onClick={zegOp}>Opzeggen</button>
              </div>
            </section>
          )}

          <p className="pushproef-melding" role="status">{status}</p>
          {fout && <p className="pushproef-fout" role="alert">{fout}</p>}

          <p className="pushproef-terug"><a href="#/vandaag">Terug naar de app</a></p>
        </div>
      </main>
    </div>
  );
}
