import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IcSluit } from './Iconen';

/**
 * Een rustig venster: onderaan op mobiel, in het midden op desktop. Escape en de sluitknop sluiten;
 * de focus blijft binnen het venster en gaat bij sluiten terug naar wat het opende.
 */
export function Venster({ titel, sluit, children }: { titel: string; sluit: () => void; children: ReactNode }) {
  const kopId = useId();
  const venster = useRef<HTMLDivElement>(null);
  const terug = useRef(document.activeElement as HTMLElement | null);
  const sluitRef = useRef(sluit);
  sluitRef.current = sluit;

  useEffect(() => {
    const vorige = terug.current;
    const opToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); sluitRef.current(); }
      if (e.key === 'Tab' && venster.current) {
        const f = [...venster.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]')]
          .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
        if (!f.length) return;
        const eerste = f[0], laatste = f[f.length - 1];
        if (e.shiftKey && document.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
        else if (!e.shiftKey && document.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
      }
    };
    document.addEventListener('keydown', opToets);
    document.body.classList.add('geen-scroll');
    if (!venster.current?.contains(document.activeElement)) venster.current?.focus();
    return () => {
      document.removeEventListener('keydown', opToets);
      document.body.classList.remove('geen-scroll');
      if (vorige?.isConnected) vorige.focus();
    };
  }, []);

  return (
    <div className="laag" onMouseDown={e => { if (e.target === e.currentTarget) sluit(); }}>
      <div className="venster" role="dialog" aria-modal="true" aria-labelledby={kopId} ref={venster} tabIndex={-1}>
        <div className="venster-kop">
          <h2 id={kopId}>{titel}</h2>
          <button type="button" className="icoonknop" onClick={sluit} aria-label="Sluiten"><IcSluit /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
