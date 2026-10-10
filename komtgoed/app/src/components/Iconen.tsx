// Kleine, eigen lijniconen (geen externe iconenset nodig).
import type { SVGProps } from 'react';

const basis = (p: SVGProps<SVGSVGElement>) => ({
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
});

export const IcVandaag = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
);
export const IcAgenda = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis(p)}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
export const IcBoodschappen = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis(p)}><path d="M5 8h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" /><path d="M9 8V7a3 3 0 0 1 6 0v1" /></svg>
);
export const IcMeer = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis(p)}><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></svg>
);
export const IcPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis({ strokeWidth: 2.2, ...p })}><path d="M12 5v14M5 12h14" /></svg>
);
export const IcVink = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis({ strokeWidth: 2.4, width: 14, height: 14, ...p })}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IcSluit = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IcSlot = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis({ width: 14, height: 14, ...p })}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const IcPijl = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis({ width: 16, height: 16, ...p })}><path d="M9 6l6 6-6 6" /></svg>
);
export const IcHerhaal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis({ width: 14, height: 14, ...p })}><path d="M4 11a8 8 0 0 1 13.7-5.6L20 7.7" /><path d="M20 3.5v4.2h-4.2" /><path d="M20 13a8 8 0 0 1-13.7 5.6L4 16.3" /><path d="M4 20.5v-4.2h4.2" /></svg>
);
export const IcLinks = (p: SVGProps<SVGSVGElement>) => (
  <svg {...basis({ width: 16, height: 16, ...p })}><path d="M15 6l-6 6 6 6" /></svg>
);
