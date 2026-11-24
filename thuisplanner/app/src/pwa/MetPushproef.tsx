import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

// De ingang van de pushproef (PR P0), buiten App.tsx: alleen in een build met VITE_PUSHPROEF=1. Dan staat boven de app
// één kleine regel met een link naar #/pushproef (op een iPhone heeft de app op het beginscherm geen adresbalk, dus een
// adres intypen kan daar niet), en toont #/pushproef de proefpagina in plaats van de app. Zonder de vlag geeft dit
// alleen de app terug; de proefpagina wordt dan nooit geladen.

export const PUSHPROEF_AAN = import.meta.env.VITE_PUSHPROEF === '1';
export const PUSHPROEF_ADRES = '#/pushproef';

const PushProef = lazy(() => import('./PushProef').then(m => ({ default: m.PushProef })));

const isProef = (adres: string) => adres === PUSHPROEF_ADRES;

export function MetPushproef({ children, aan = PUSHPROEF_AAN }: { children: ReactNode; aan?: boolean }) {
  const [proef, zetProef] = useState(() => aan && isProef(window.location.hash));
  useEffect(() => {
    if (!aan) return;
    // Het nieuwe adres uit het event zelf: de app luistert ook naar hashchange.
    const opHash = (e: HashChangeEvent) => zetProef(isProef(new URL(e.newURL).hash));
    window.addEventListener('hashchange', opHash);
    return () => window.removeEventListener('hashchange', opHash);
  }, [aan]);
  if (!aan) return <>{children}</>;
  if (proef) return <Suspense fallback={null}><PushProef /></Suspense>;
  return (
    <>
      <div className="demobalk pushproef-balk">
        <span className="demo-label">Proef</span>
        <span className="demobalk-tekst">Werken meldingen op dit toestel?</span>
        <a href={PUSHPROEF_ADRES}>Pushproef</a>
      </div>
      {children}
    </>
  );
}
