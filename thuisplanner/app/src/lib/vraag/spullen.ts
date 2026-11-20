// De vraagbron voor Mijn spullen & Documenten (docs/thuisplanner-spullen-documenten.md §13.3). Een pure functie: ze krijgt
// alleen wat het lid al mag zien (in het echte pad: wat RLS teruggeeft) en verzint niets. Ontbreekt een gegeven, dan zegt
// het antwoord dat; een voorstel dat nog niet bevestigd is, staat er als "nog niet bevestigd".
import { plusDagen } from '../datum';
import type { Intentie, Vervolg, Vraag } from '../intentie';
import { SOORT_NAAM, WETTELIJKE_UITLEG, datumMetJaar, documentenVan, spullenInZin, veldStatus, veldWaarde } from '../spullen/logica';
import type { Document, Spul, SpulVeld, SpullenGegevens } from '../spullen/types';
import type { Datum, Taak } from '../types';

/** Een aanklikbare bron bij een antwoord: het dossier of een document. */
export interface Bron { soort: 'spul' | 'document'; id: string; label: string }

/** Een voorstel na een antwoord: pas na een tik gemaakt (geen wijziging zonder bevestiging). */
export type VervolgVoorstel =
  | { soort: 'taak'; titel: string; datum: Datum; spulId: string; bestaat: boolean }
  | { soort: 'kan-niet'; regel: string };

export type Antwoord =
  | { soort: 'antwoord'; spulId: string; regel: string; extra?: string; uitleg?: string; voorstel: boolean; bronnen: Bron[];
    documenten?: Document[]; vervolg?: VervolgVoorstel }
  | { soort: 'ontbreekt'; spulId: string; regel: string; bronnen: Bron[]; documenten?: Document[]; vervolg?: VervolgVoorstel }
  | { soort: 'kies'; regel: string; opties: { id: string; naam: string }[] }
  | { soort: 'niets'; regel: string };

const VELD: Partial<Record<Vraag['gevraagd'], SpulVeld>> = {
  aankoopdatum: 'aankoopdatum', winkel: 'winkel', prijs: 'prijs', model: 'model', merk: 'merk', serienummer: 'serienummer',
};
const VELD_TEKST: Record<string, string> = {
  aankoopdatum: 'aankoopdatum', winkel: 'winkel', prijs: 'prijs', model: 'modelnummer', merk: 'merk', serienummer: 'serienummer',
};
const NIET_BEVESTIGD = ' (nog niet bevestigd)';
/** Waarom een persoonlijk spul geen taken krijgt (de + en de spulpagina zeggen hetzelfde). */
export const TAKEN_ALLEEN_GEDEELD = 'Taken zijn voor het hele huishouden zichtbaar, dus die koppelen we niet aan een persoonlijk spul.';

/** De datum N dagen, weken of maanden eerder (een maand eerder dan 31 maart is 28 of 29 februari). */
export function eerder(datum: Datum, aantal: number, eenheid: Vervolg['eenheid']): Datum {
  if (eenheid === 'dag') return plusDagen(datum, -aantal);
  if (eenheid === 'week') return plusDagen(datum, -7 * aantal);
  const [j, m, d] = datum.split('-').map(Number);
  const totaal = j * 12 + (m - 1) - aantal;
  const nj = Math.floor(totaal / 12), nm = totaal % 12 + 1;
  const laatste = new Date(Date.UTC(nj, nm, 0)).getUTCDate();
  return `${nj}-${String(nm).padStart(2, '0')}-${String(Math.min(d, laatste)).padStart(2, '0')}`;
}

/** De naam zoals in een zin, zonder het label "(voorbeeld)". */
const kort = (s: Spul) => s.naam.replace(/\s*\(voorbeeld\)\s*/i, '').trim() || s.naam;

function bronnenVan(_g: SpullenGegevens, s: Spul, docs: Document[]): Bron[] {
  return [{ soort: 'spul', id: s.id, label: s.naam }, ...docs.map(d => ({ soort: 'document' as const, id: d.id, label: d.titel }))];
}

/** Het aankoopbewijs als bron: factuur, bon of garantiebewijs. */
const bewijs = (docs: Document[]) => docs.filter(d => d.soort === 'factuur' || d.soort === 'bon' || d.soort === 'garantiebewijs');

function vervolgVoor(v: Vervolg | undefined, s: Spul, vandaag: Datum, taken: Taak[]): VervolgVoorstel | undefined {
  if (!v) return undefined;
  // Taken zijn voor het hele huishouden zichtbaar: bij een persoonlijk spul geen taak (en dus nooit de naam in een titel).
  if (s.zichtbaarheid === 'persoonlijk') return { soort: 'kan-niet', regel: TAKEN_ALLEEN_GEDEELD };
  const tot = s.garantieTot ?? s.extraGarantieTot;
  if (!tot) return { soort: 'kan-niet', regel: 'Zonder garantiedatum kan ik niets voor je inplannen.' };
  const datum = eerder(tot, v.aantal, v.eenheid);
  if (datum <= vandaag) return { soort: 'kan-niet', regel: `${datumMetJaar(datum)} is al voorbij; ik plan niets in.` };
  const titel = `Garantie ${kort(s)} loopt af op ${datumMetJaar(tot)}`;
  const bestaat = taken.some(t => !t.klaar && t.datum === datum && t.titel.trim().toLowerCase() === titel.toLowerCase());
  return { soort: 'taak', titel, datum, spulId: s.id, bestaat };
}

function antwoordOver(g: SpullenGegevens, s: Spul, vraag: Vraag, vervolg: Vervolg | undefined, vandaag: Datum, taken: Taak[]): Antwoord {
  const docs = documentenVan(g, s.id);
  const nv = (v: SpulVeld) => (veldStatus(s, v) === 'voorstel' ? NIET_BEVESTIGD : '');
  const volg = vervolgVoor(vervolg, s, vandaag, taken);

  if (vraag.gevraagd === 'document') {
    const soort = vraag.documentSoort;
    const passend = soort ? docs.filter(d => d.soort === soort || (soort === 'bon' && d.soort === 'factuur')) : docs;
    if (!passend.length) {
      const wat = soort ? SOORT_NAAM[soort as Document['soort']]?.toLowerCase() ?? soort : 'document';
      return { soort: 'ontbreekt', spulId: s.id, regel: `Bij ${s.naam} staat geen ${wat}.`, bronnen: bronnenVan(g, s, docs), documenten: docs, vervolg: volg };
    }
    const regel = passend.length === 1 ? `${passend[0].titel}` : `${passend.length} documenten bij ${s.naam}`;
    return { soort: 'antwoord', spulId: s.id, regel, voorstel: false, bronnen: bronnenVan(g, s, passend), documenten: passend, vervolg: volg };
  }

  if (vraag.gevraagd === 'garantie') {
    const delen: string[] = [];
    if (s.garantieTot) delen.push(`Garantie tot ${datumMetJaar(s.garantieTot)}${nv('garantieTot')}`);
    if (s.extraGarantieTot) delen.push(`Aanvullende garantie tot ${datumMetJaar(s.extraGarantieTot)}${s.extraGarantieAanbieder ? ` (${s.extraGarantieAanbieder})` : ''}${nv('extraGarantieTot')}`);
    const b = bronnenVan(g, s, docs.filter(d => d.soort === 'garantiebewijs' || d.soort === 'factuur' || d.soort === 'bon'));
    if (!delen.length) return { soort: 'ontbreekt', spulId: s.id, regel: `Bij ${s.naam} staat geen garantiedatum.`, bronnen: b, vervolg: volg };
    const voorstel = veldStatus(s, 'garantieTot') === 'voorstel' || veldStatus(s, 'extraGarantieTot') === 'voorstel';
    return { soort: 'antwoord', spulId: s.id, regel: delen.join(' · '), uitleg: WETTELIJKE_UITLEG, voorstel, bronnen: b, vervolg: volg };
  }

  const veld = VELD[vraag.gevraagd];
  if (veld) {
    const waarde = veldWaarde(s, veld);
    const b = bronnenVan(g, s, bewijs(docs));
    if (waarde === undefined) return { soort: 'ontbreekt', spulId: s.id, regel: `Bij ${s.naam} staat geen ${VELD_TEKST[veld]}.`, bronnen: b, vervolg: volg };
    const regel = veld === 'aankoopdatum' ? `Gekocht op ${waarde}${nv(veld)}${s.winkel ? ` bij ${s.winkel}` : ''}`
      : veld === 'winkel' ? `Gekocht bij ${waarde}${nv(veld)}${s.aankoopdatum ? ` op ${veldWaarde(s, 'aankoopdatum')}` : ''}`
        : veld === 'prijs' ? `Gekocht voor ${waarde}${nv(veld)}`
          : `${veld === 'model' ? 'Model' : veld === 'merk' ? 'Merk' : 'Serienummer'}: ${waarde}${nv(veld)}`;
    return { soort: 'antwoord', spulId: s.id, regel, extra: s.naam, voorstel: veldStatus(s, veld) === 'voorstel', bronnen: b, vervolg: volg };
  }

  // Een algemene vraag over één spul: wat er van de aankoop bekend is (alleen wat er staat).
  const delen = [
    s.aankoopdatum && `gekocht op ${veldWaarde(s, 'aankoopdatum')}${nv('aankoopdatum')}`,
    s.winkel && `bij ${s.winkel}${nv('winkel')}`,
    s.garantieTot && `garantie tot ${veldWaarde(s, 'garantieTot')}${nv('garantieTot')}`,
  ].filter(Boolean) as string[];
  if (!delen.length) return { soort: 'ontbreekt', spulId: s.id, regel: `Van ${s.naam} staan nog geen aankoopgegevens.`, bronnen: bronnenVan(g, s, docs), vervolg: volg };
  const regel = delen.join(', ');
  return { soort: 'antwoord', spulId: s.id, regel: regel.charAt(0).toUpperCase() + regel.slice(1), extra: s.naam, voorstel: false, bronnen: bronnenVan(g, s, bewijs(docs)), vervolg: volg };
}

/**
 * Beantwoord een vraag uit de spullen en documenten. Geeft null als de vraag niet over spullen gaat: dan geldt de
 * bestaande werking van de + (of later een andere vraagbron). `gekozen`: het spul dat de gebruiker koos na "Over welk spul?".
 */
export function beantwoordSpullen(intentie: Intentie, g: SpullenGegevens, vandaag: Datum, opties: { gekozen?: string; taken?: Taak[] } = {}): Antwoord | null {
  if (intentie.soort === 'actie' || intentie.soort === 'onduidelijk') return null;
  const { vraag } = intentie;
  const vervolg = intentie.soort === 'vraag-en-actie' ? intentie.vervolg : undefined;
  const taken = opties.taken ?? [];
  const actief = g.spullen.filter(s => !s.verwijderdOp);
  const gekozen = opties.gekozen ? actief.find(s => s.id === opties.gekozen) : undefined;
  if (gekozen) return antwoordOver(g, gekozen, vraag, vervolg, vandaag, taken);

  const gevonden = spullenInZin(actief, vraag.woorden);
  // Gaat de vraag over spullen? Een gevraagd veld of document, of een spul dat in de zin staat.
  const overSpullen = vraag.gevraagd !== 'algemeen' || gevonden.length > 0;
  if (!overSpullen) return null;
  if (gevonden.length === 1) return antwoordOver(g, gevonden[0], vraag, vervolg, vandaag, taken);
  if (gevonden.length > 1) return { soort: 'kies', regel: 'Over welk spul gaat het?', opties: gevonden.map(s => ({ id: s.id, naam: s.naam })) };

  // Niets gevonden. Een korte zoekopdracht ("factuur betalen" is geen zoekopdracht, "factuur vaatwasser" wel) valt dan
  // terug op de bestaande werking: zo wordt een gewone taak nooit een lege zoekopdracht.
  if (vraag.zekerheid === 'zoek') return null;
  // Een vraag over een veld zonder spul erbij ("Wanneer verloopt de garantie?"): één gerichte vraag, nooit gokken.
  const kandidaten = vraag.woorden.filter(w => w.length >= 3 && !STIL.has(w));
  if (!kandidaten.length && actief.length) {
    return { soort: 'kies', regel: 'Over welk spul gaat het?', opties: actief.slice(0, 8).map(s => ({ id: s.id, naam: s.naam })) };
  }
  if (!kandidaten.length) return { soort: 'niets', regel: 'Er staan nog geen spullen in Thuisplanner.' };
  return { soort: 'niets', regel: `Ik vind geen spul dat past bij "${kandidaten.join(' ')}".` };
}

/** Woorden die geen onderwerp zijn (naast de stopwoorden van het zoeken). */
const STIL = new Set(['hebben', 'heeft', 'onze', 'mijn', 'verloopt', 'garantie', 'gekocht', 'aangeschaft', 'factuur', 'bon', 'bonnetje',
  'kassabon', 'handleiding', 'garantiebewijs', 'aankoopbewijs', 'polis', 'contract', 'modelnummer', 'model', 'typenummer', 'merk',
  'serienummer', 'winkel', 'prijs', 'kostte', 'gekost', 'betaald', 'laat', 'zien', 'toon', 'open', 'zoek', 'die', 'dat', 'het', 'een',
  'van', 'voor', 'bij', 'wij', 'zijn', 'was', 'nog', 'loopt', 'aankoopdatum', 'rekening', 'gebruiksaanwijzing', 'welk', 'type',
  'geef', 'mij', 'vind', 'staat', 'heb', 'jij', 'weet', 'waar', 'wanneer', 'hoeveel', 'betalen', 'het']);
