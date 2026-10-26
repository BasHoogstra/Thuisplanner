// Cloudflare Turnstile (alleen online, met een ingestelde sitekey). Meestal onzichtbaar; soms één tik. Het script komt
// van challenges.cloudflare.com (toegestaan in de CSP van de staging- en bètabuild, zie scripts/staging-build.ts).
//
// Een token werkt precies één keer en verloopt na enkele minuten. Daarom:
// - de ouder geeft na elke poging een nieuwe `key`, zodat er altijd een nieuw, ongebruikt token komt;
// - na een fout of als de controle niet laadt, wordt de widget zichtbaar en staat er "Opnieuw controleren";
// - zolang er geen token is en de ouder erom vraagt (opnieuwTonen), blijft die knop zichtbaar: de gebruiker kan altijd
//   opnieuw controleren, ook als de widget zichzelf na "Gelukt!" heeft verborgen.
import { useEffect, useRef, useState } from 'react';

interface Turnstile { render(el: HTMLElement, o: Record<string, unknown>): string; remove(id: string): void }
declare global { interface Window { turnstile?: Turnstile } }

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let laden: Promise<void> | null = null;
function laadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  laden ??= new Promise((ok, mis) => {
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true; s.defer = true;
    s.onload = () => ok(); s.onerror = () => { laden = null; mis(new Error('Turnstile niet geladen')); };
    document.head.appendChild(s);
  });
  return laden;
}

export function Captcha({ sitekey, opToken, heeftToken = false, opnieuwTonen = false }: {
  sitekey: string;
  opToken: (t: string | null) => void;
  /** Heeft de ouder op dit moment een (nog ongebruikt) token? */
  heeftToken?: boolean;
  /** Toon "Opnieuw controleren" zolang er geen token is (bijvoorbeeld na een poging of een melding). */
  opnieuwTonen?: boolean;
}) {
  const plek = useRef<HTMLDivElement>(null);
  const [ronde, zetRonde] = useState(0);
  const [zichtbaar, zetZichtbaar] = useState(false);
  const [mislukt, zetMislukt] = useState(false);

  useEffect(() => {
    let id: string | null = null;
    let weg = false;
    void laadScript().then(() => {
      if (weg || !plek.current || !window.turnstile) return;
      id = window.turnstile.render(plek.current, {
        sitekey, language: 'nl', appearance: zichtbaar ? 'always' : 'interaction-only',
        callback: (t: string) => { zetMislukt(false); opToken(t); },
        'expired-callback': () => opToken(null),
        'error-callback': () => { opToken(null); zetMislukt(true); zetZichtbaar(true); },
      });
    }).catch(() => { opToken(null); zetMislukt(true); });
    return () => { weg = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [sitekey, opToken, ronde, zichtbaar]);

  const opnieuw = () => { opToken(null); zetMislukt(false); zetZichtbaar(true); zetRonde(r => r + 1); };
  return (
    <div className="captcha-blok">
      <div ref={plek} className="captcha" aria-label="Controle dat je geen robot bent" />
      {mislukt && <p className="veld-hulp" role="status">De controle lukte niet. Doe hem opnieuw.</p>}
      {!heeftToken && (mislukt || opnieuwTonen) && (
        <button type="button" className="tekstknop" onClick={opnieuw}>Opnieuw controleren</button>
      )}
    </div>
  );
}
