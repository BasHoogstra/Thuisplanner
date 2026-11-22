// Fictieve voorbeeldgegevens voor Mijn spullen & Documenten (docs/thuisplanner-spullen-documenten.md §9). Alles is
// verzonnen en als voorbeeld gemarkeerd: geen echt product, geen echte winkel, geen echte bon. De bestanden worden in de
// app zelf gemaakt (een kleine PDF met het watermerk VOORBEELD en een getekende bon); er gaat niets over het netwerk.
import { plusDagen } from '../lib/datum';
import type { Datum } from '../lib/types';
import type { Document, DocumentKoppeling, Spul, SpullenGegevens } from '../lib/spullen/types';

/** De vaste aankoopdatum uit het demo-ontwerp. */
export const DEMO_AANKOOP: Datum = '2026-10-28';

export function demoSpullen(vandaag: Datum): SpullenGegevens {
  const spullen: Spul[] = [
    {
      id: 's-afwasser', naam: 'Afwasser 3000 (voorbeeld)', categorie: 'Vaatwasser', merk: 'Voorbeeldmerk', model: 'AW-3000-VB',
      serienummer: 'VB-0000-1234', aankoopdatum: DEMO_AANKOOP, winkel: 'Voorbeeldwinkel', prijsCenten: 54900,
      bestelnummer: 'VB-2026-0042', garantieTot: '2028-10-28', zichtbaarheid: 'gedeeld', eigenaar: 'm-eva',
    },
    {
      id: 's-fiets', naam: 'Stadsfiets Lotte (voorbeeld)', categorie: 'Fiets', merk: 'Voorbeeldfietsen', aankoopdatum: plusDagen(vandaag, -400),
      winkel: 'Fietsenmaker Voorbeeld', prijsCenten: 39900, zichtbaarheid: 'gedeeld', eigenaar: 'm-thomas',
      // Bewust onvolledig: geen model en geen garantie, zodat "ontbreekt" zichtbaar is.
    },
  ];
  const documenten: Document[] = [
    { id: 'd-factuur', titel: 'Factuur Afwasser 3000 (voorbeeld)', soort: 'factuur', datum: DEMO_AANKOOP, zichtbaarheid: 'gedeeld',
      eigenaar: 'm-eva', upload: 'klaar', type: 'application/pdf', grootte: 0, bestand: { soort: 'voorbeeld', sleutel: 'factuur-pdf' } },
    { id: 'd-bon', titel: 'Kassabon Voorbeeldwinkel (voorbeeld)', soort: 'bon', datum: DEMO_AANKOOP, zichtbaarheid: 'gedeeld',
      eigenaar: 'm-eva', upload: 'klaar', type: 'image/png', grootte: 0, bestand: { soort: 'voorbeeld', sleutel: 'bon-foto' } },
    { id: 'd-handleiding', titel: 'Handleiding Afwasser 3000 (voorbeeld)', soort: 'handleiding', zichtbaarheid: 'gedeeld',
      eigenaar: 'm-eva', upload: 'klaar', type: 'application/pdf', grootte: 0, bestand: { soort: 'voorbeeld', sleutel: 'handleiding-pdf' } },
    // Een persoonlijk document van Thomas: Eva ziet het niet en krijgt geen aanwijzing dat het bestaat (besluit 14).
    { id: 'd-polis-thomas', titel: 'Polis fietsverzekering (voorbeeld)', soort: 'polis', zichtbaarheid: 'persoonlijk',
      eigenaar: 'm-thomas', upload: 'klaar', type: 'application/pdf', grootte: 0, bestand: { soort: 'voorbeeld', sleutel: 'handleiding-pdf' } },
  ];
  const koppelingen: DocumentKoppeling[] = [
    { documentId: 'd-factuur', spulId: 's-afwasser' },
    { documentId: 'd-bon', spulId: 's-afwasser' },
    { documentId: 'd-handleiding', spulId: 's-afwasser' },
    { documentId: 'd-polis-thomas', spulId: 's-fiets' },
  ];
  return { spullen, documenten, koppelingen };
}

// ---- De voorbeeldbestanden, in de app gemaakt ----

/** Escape voor een PDF-tekststring. */
const pdfTekst = (s: string) => s.replace(/[\\()]/g, m => `\\${m}`);

/** Een kleine, geldige PDF (één A4-pagina, Helvetica) met de regels en een groot, schuin watermerk VOORBEELD. */
export function maakVoorbeeldPdf(regels: string[]): Uint8Array {
  const tekst = regels.map((r, i) => `BT /F1 ${i === 0 ? 18 : 11} Tf 1 0 0 1 60 ${770 - i * 22} Tm (${pdfTekst(r)}) Tj ET`).join('\n');
  // Watermerk: lichtgrijs, 45 graden gedraaid (cos = sin ≈ 0,7071).
  const watermerk = 'q 0.85 0.85 0.85 rg BT /F1 96 Tf 0.7071 0.7071 -0.7071 0.7071 140 260 Tm (VOORBEELD) Tj ET Q';
  const inhoud = `${watermerk}\n${tekst}`;
  const objecten = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${inhoud.length} >>\nstream\n${inhoud}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const posities: number[] = [];
  objecten.forEach((o, i) => { posities.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objecten.length + 1}\n0000000000 65535 f \n${posities.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objecten.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Alleen ASCII (de teksten hieronder bevatten geen accenten), dus één byte per teken.
  return Uint8Array.from(pdf, c => c.charCodeAt(0) & 0xff);
}

export const FACTUUR_REGELS = [
  'FACTUUR (VOORBEELD, VERZONNEN)',
  'Voorbeeldwinkel - geen echte winkel',
  'Factuurdatum: 28 oktober 2026    Bestelnummer: VB-2026-0042',
  '',
  '1 x Afwasser 3000 (voorbeeld), merk Voorbeeldmerk, model AW-3000-VB',
  'Serienummer: VB-0000-1234',
  'Prijs: EUR 549,00 (verzonnen)',
  '',
  'Garantie van de winkel: 2 jaar, tot 28 oktober 2028 (voorbeeld).',
  'Dit document is een voorbeeld voor de demo van Thuisplanner.',
];

export const HANDLEIDING_REGELS = [
  'HANDLEIDING (VOORBEELD, VERZONNEN)',
  'Afwasser 3000 (voorbeeld)',
  '',
  'Filter schoonmaken: elke maand (voorbeeld).',
  'Dit document is een voorbeeld voor de demo van Thuisplanner.',
];

/** Een getekende kassabon (geen foto van een echte bon) als PNG, via een canvas; null als er geen canvas is (tests). */
export async function maakVoorbeeldBon(): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 720;
  const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fffdf8'; x.fillRect(40, 30, 400, 660);
  x.fillStyle = '#2b2b2b'; x.font = 'bold 26px monospace'; x.textAlign = 'center';
  x.fillText('VOORBEELDWINKEL', 240, 90);
  x.font = '18px monospace';
  const regels = ['(geen echte winkel)', '', '28-10-2026  14:32', '', 'Afwasser 3000 (vb)', '      EUR 549,00', '', 'TOTAAL  EUR 549,00',
    '', 'Garantie: 2 jaar', 'Bewaar deze bon', '', 'VERZONNEN BON'];
  regels.forEach((r, i) => x.fillText(r, 240, 140 + i * 34));
  x.save(); x.translate(240, 380); x.rotate(-Math.PI / 5); x.fillStyle = 'rgba(180, 40, 40, 0.28)'; x.font = 'bold 64px sans-serif';
  x.fillText('VOORBEELD', 0, 0); x.restore();
  return new Promise(r => c.toBlob(b => r(b), 'image/png'));
}

/** Het voorbeeldbestand bij een sleutel, als Blob (om buiten de app te openen of als afbeelding te tonen). */
export async function voorbeeldBestand(sleutel: 'factuur-pdf' | 'bon-foto' | 'handleiding-pdf'): Promise<Blob | null> {
  if (sleutel === 'bon-foto') return maakVoorbeeldBon();
  const bytes = maakVoorbeeldPdf(sleutel === 'factuur-pdf' ? FACTUUR_REGELS : HANDLEIDING_REGELS);
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
