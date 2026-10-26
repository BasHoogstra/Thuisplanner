// Het zichtbare deel van het scherm (visualViewport). Op een iPhone krimpt de pagina niet als het toetsenbord opent: een
// venster dat onderaan vastzit, verdwijnt dan áchter het toetsenbord. De invoerbalk van de + (SnelInvoer) volgt daarom het
// zichtbare deel, zodat hij altijd vlak boven het toetsenbord staat. Zonder visualViewport (oude browser, tests): null.
import { useEffect, useState } from 'react';

export interface Zichtbaar {
  /** Bovenkant en hoogte van het zichtbare deel, in CSS-pixels ten opzichte van de pagina. */
  top: number;
  hoogte: number;
  /** Het toetsenbord (of iets anders) neemt onderaan meer dan 120 px in. */
  toetsenbord: boolean;
}

export function useZichtbaarScherm(): Zichtbaar | null {
  const lees = (): Zichtbaar | null => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return null;
    return { top: vv.offsetTop, hoogte: vv.height, toetsenbord: window.innerHeight - vv.height > 120 };
  };
  const [z, zetZ] = useState<Zichtbaar | null>(lees);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const bij = () => zetZ(oud => {
      const n = lees();
      return n && oud && n.top === oud.top && n.hoogte === oud.hoogte && n.toetsenbord === oud.toetsenbord ? oud : n;
    });
    vv.addEventListener('resize', bij);
    vv.addEventListener('scroll', bij);
    bij();
    return () => { vv.removeEventListener('resize', bij); vv.removeEventListener('scroll', bij); };
  }, []);
  return z;
}
