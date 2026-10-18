// Cloudflare Turnstile (alleen online, met een ingestelde sitekey). Meestal onzichtbaar; soms één tik. Het script komt
// van challenges.cloudflare.com (toegestaan in de CSP van de staging- en bètabuild, zie scripts/staging-build.ts).
import { useEffect, useRef } from 'react';

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

export function Captcha({ sitekey, opToken }: { sitekey: string; opToken: (t: string | null) => void }) {
  const plek = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | null = null;
    let weg = false;
    void laadScript().then(() => {
      if (weg || !plek.current || !window.turnstile) return;
      id = window.turnstile.render(plek.current, {
        sitekey, language: 'nl', appearance: 'interaction-only',
        callback: (t: string) => opToken(t), 'expired-callback': () => opToken(null), 'error-callback': () => opToken(null),
      });
    }).catch(() => opToken(null));
    return () => { weg = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [sitekey, opToken]);
  return <div ref={plek} className="captcha" aria-label="Controle dat je geen robot bent" />;
}
