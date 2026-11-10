// Vensters voor Mijn spullen & Documenten: het dossier invullen, een document invoeren (de controlekaart, §5), en koppelen.
// Per veld zie je of het bevestigd is, een voorstel ("controleer") of ontbreekt. Een voorstel wordt nooit stil als waar
// bewaard: opslaan bewaart wat er staat, met de status erbij, en een voorstel blijft "controleer" tot je het bevestigt.
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useApp } from '../lib/context';
import { DEMO_AANKOOP, voorbeeldBestand } from '../data/spullen-demo';
import { controleer, eersteBytes, sha256, typeUitBytes, verkleinFoto } from '../lib/spullen/bestand';
import {
  SOORT_NAAM, VELD_NAAM, WETTELIJKE_UITLEG, bedrag, dubbelDocument, gedeeldeDocumentenMetNaam, isGekoppeld, leesBedrag, leesbareTitel, spulNaamVoorTitel,
  spullenVan, standaardZichtbaarheid, verborgenSpulInTitel, zoekSpullen,
} from '../lib/spullen/logica';
import { useSpullen, type InvoerBron } from '../lib/spullen/opslag';
import type { BestandType, Document, DocumentSoort, Spul, SpulVeld, VeldStatus, Zichtbaarheid } from '../lib/spullen/types';
import { IcDocument, IcPijl } from './Iconen';
import { Venster } from './Venster';

// ---------------------------------------------------------------- De invoer openen (vanuit de + of het overzicht)

export interface Invoer { bron: InvoerBron; spulId?: string; sleutel: number }

export function useSpullenInvoer() {
  const [invoer, zetInvoer] = useState<Invoer | null>(null);
  const startInvoer = useCallback((bron: InvoerBron, opties?: { spulId?: string }) => zetInvoer({ bron, spulId: opties?.spulId, sleutel: Date.now() }), []);
  const sluitInvoer = useCallback(() => zetInvoer(null), []);
  return { invoer, startInvoer, sluitInvoer };
}

export function SpullenLaag({ invoer, sluit }: { invoer: Invoer | null; sluit: () => void }) {
  if (!invoer) return null;
  return <DocumentInvoer key={invoer.sleutel} invoer={invoer} sluit={sluit} />;
}

// ---------------------------------------------------------------- Velden met status

type Velden = Partial<Record<SpulVeld, string>>;
type Status = Partial<Record<SpulVeld, VeldStatus>>;

function StatusLabel({ status, bevestig }: { status: VeldStatus; bevestig?: () => void }) {
  if (status === 'bevestigd') return null;
  if (status === 'ontbreekt') return <span className="sp-ontbreekt">ontbreekt</span>;
  return (
    <span className="sp-voorstel-rij">
      <span className="sp-voorstel">controleer</span>
      {bevestig && <button type="button" className="tekstknop" onClick={bevestig}>Klopt</button>}
    </span>
  );
}

function Veld({ veld, velden, status, zet, bevestig, type = 'text', verplicht }: {
  veld: SpulVeld; velden: Velden; status: Status; zet: (v: SpulVeld, w: string) => void; bevestig: (v: SpulVeld) => void;
  type?: 'text' | 'date'; verplicht?: boolean;
}) {
  const id = useId();
  const waarde = velden[veld] ?? '';
  const st: VeldStatus = !waarde.trim() ? 'ontbreekt' : status[veld] === 'voorstel' ? 'voorstel' : 'bevestigd';
  // De status staat naast het label, niet erin: een knop "Klopt" in een label zou ook het veld bedienen.
  return (
    <div className={'veld sp-veld' + (st === 'voorstel' ? ' voorstel' : '')}>
      <span className="sp-veld-kop">
        <label className="veld-label" htmlFor={id}>{VELD_NAAM[veld]}{!verplicht && <span className="optioneel"> (optioneel)</span>}</label>
        <StatusLabel status={verplicht && st === 'ontbreekt' ? 'bevestigd' : st} bevestig={() => bevestig(veld)} />
      </span>
      <input id={id} type={type} value={waarde} onChange={e => zet(veld, e.target.value)} autoComplete="off" maxLength={120}
        inputMode={veld === 'prijs' ? 'decimal' : undefined} placeholder={veld === 'prijs' ? 'bijvoorbeeld 549,00' : undefined} />
    </div>
  );
}

const ALLE: SpulVeld[] = ['naam', 'categorie', 'merk', 'model', 'serienummer', 'aankoopdatum', 'winkel', 'prijs', 'bestelnummer',
  'garantieTot', 'extraGarantieTot', 'extraGarantieAanbieder'];
/** Wat in "Nieuw spul" achter "Meer details" staat (alles behalve de naam). */
const DETAILS = ALLE.filter(k => k !== 'naam' && k !== 'bestelnummer');

function veldenVan(s: Partial<Spul>): Velden {
  return {
    naam: s.naam, categorie: s.categorie, merk: s.merk, model: s.model, serienummer: s.serienummer, aankoopdatum: s.aankoopdatum,
    winkel: s.winkel, prijs: s.prijsCenten !== undefined ? bedrag(s.prijsCenten).replace('€', '') : undefined, bestelnummer: s.bestelnummer,
    garantieTot: s.garantieTot, extraGarantieTot: s.extraGarantieTot, extraGarantieAanbieder: s.extraGarantieAanbieder,
  };
}

/** Van formuliervelden naar een spul; alleen ingevulde velden, met hun status (voorstel blijft voorstel). */
function spulUit(v: Velden, st: Status): { spul: Omit<Spul, 'id' | 'eigenaar' | 'zichtbaarheid'>; fout?: string } {
  const t = (x?: string) => (x?.trim() ? x.trim() : undefined);
  const prijs = t(v.prijs);
  const centen = prijs ? leesBedrag(prijs) : null;
  // De naam gaat mee, zodat een onleesbare prijs niet als "geef een naam" wordt gemeld.
  if (prijs && centen === null) return { spul: { naam: t(v.naam) ?? '' }, fout:'De prijs is geen bedrag (bijvoorbeeld 549,00).' };
  const status: Status = {};
  for (const k of ALLE) if (t(v[k]) && st[k] === 'voorstel') status[k] = 'voorstel';
  return {
    spul: {
      naam: t(v.naam) ?? '', categorie: t(v.categorie), merk: t(v.merk), model: t(v.model), serienummer: t(v.serienummer),
      aankoopdatum: t(v.aankoopdatum), winkel: t(v.winkel), prijsCenten: centen ?? undefined, bestelnummer: t(v.bestelnummer),
      garantieTot: t(v.garantieTot), extraGarantieTot: t(v.extraGarantieTot), extraGarantieAanbieder: t(v.extraGarantieAanbieder),
      status: Object.keys(status).length ? status : undefined,
    },
  };
}

function useVelden(begin: Velden, beginStatus: Status = {}) {
  const [velden, zetVelden] = useState<Velden>(begin);
  const [status, zetStatus] = useState<Status>(beginStatus);
  // Zelf iets aanpassen of "Klopt" bevestigt het veld.
  const zet = (v: SpulVeld, w: string) => { zetVelden(x => ({ ...x, [v]: w })); zetStatus(x => ({ ...x, [v]: 'bevestigd' })); };
  const bevestig = (v: SpulVeld) => zetStatus(x => ({ ...x, [v]: 'bevestigd' }));
  return { velden, status, zet, bevestig, zetVelden, zetStatus };
}

function Zichtbaarheidskeuze({ waarde, zet, mag }: { waarde: Zichtbaarheid; zet: (z: Zichtbaarheid) => void; mag: boolean }) {
  if (!mag) return <p className="stil-tekst sp-uitleg">{waarde === 'gedeeld' ? 'Gedeeld met het huishouden.' : 'Alleen voor jou.'} Alleen wie het toevoegde, kan dit wijzigen.</p>;
  return (
    <div className="veld">
      <span className="veld-label" id="sp-zicht">Wie ziet dit?</span>
      <div className="keuzes" role="group" aria-labelledby="sp-zicht">
        <button type="button" className={'keuze' + (waarde === 'gedeeld' ? ' aan' : '')} aria-pressed={waarde === 'gedeeld'} onClick={() => zet('gedeeld')}>Het huishouden</button>
        <button type="button" className={'keuze' + (waarde === 'persoonlijk' ? ' aan' : '')} aria-pressed={waarde === 'persoonlijk'} onClick={() => zet('persoonlijk')}>Alleen ik</button>
      </div>
    </div>
  );
}

/** Een gedeeld document waarvan de titel een persoonlijk spul noemt: eerst kiezen. Een eigen keuze blijft mogelijk. */
function TitelVraag({ spul, veilig, toch }: { spul: Spul; veilig: () => void; toch: () => void }) {
  return (
    <div className="kaart-vraag" role="group" aria-label="De titel noemt een persoonlijk spul">
      <p>Deze titel noemt {spul.naam}, dat alleen voor jou is. Een gedeeld document is zichtbaar voor iedereen in het huishouden.</p>
      <div className="keuzes">
        <button type="button" className="keuze" onClick={veilig}>Veilige titel gebruiken</button>
        <button type="button" className="keuze" onClick={toch}>Toch zo laten</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Het dossier invullen of aanpassen

export function SpulVenster({ bestaand, sluit, opBewaard }: { bestaand?: Spul; sluit: () => void; opBewaard?: (id: string) => void }) {
  const sp = useSpullen();
  const app = useApp();
  const v = useVelden(veldenVan(bestaand ?? {}), bestaand?.status);
  const [zicht, zetZicht] = useState<Zichtbaarheid>(bestaand?.zichtbaarheid ?? 'gedeeld');
  const [fout, zetFout] = useState<string | null>(null);
  // Compact: naam en zichtbaarheid direct, de rest achter "Meer details". Ingeklapt blijven de waarden gewoon bewaard;
  // bij aanpassen staat het open als er al details zijn, zodat je ziet wat er staat.
  const ingevuld = DETAILS.filter(k => v.velden[k]?.trim()).length;
  const [details, zetDetails] = useState(() => ingevuld > 0);
  const detailsId = useId();
  if (!sp) return null;
  const bewaar = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = spulUit(v.velden, v.status);
    if (!r.spul.naam) { zetFout('Geef het spul een naam.'); return; }
    // De prijs staat onder "Meer details": klap het open, zodat het veld met de fout te zien is.
    if (r.fout) { zetFout(r.fout); zetDetails(true); return; }
    const id = await sp.spulBewaren({ ...r.spul, id: bestaand?.id, zichtbaarheid: zicht, notities: bestaand?.notities });
    sluit();
    opBewaard?.(id);
  };
  const p = { velden: v.velden, status: v.status, zet: v.zet, bevestig: v.bevestig };
  // Wordt een gedeeld spul persoonlijk, dan blijven gedeelde documenten zichtbaar; hun titel kan het spul nog noemen.
  const wordtPersoonlijk = bestaand?.zichtbaarheid === 'gedeeld' && zicht === 'persoonlijk';
  const blijftZichtbaar = wordtPersoonlijk ? gedeeldeDocumentenMetNaam(sp.gegevens, bestaand) : [];
  // Taken zijn voor iedereen zichtbaar: bij opslaan verliezen ze hun koppeling met dit spul (ook de database doet dat).
  const losTaken = wordtPersoonlijk ? app.staat.items.filter(t => t.soort === 'taak' && t.spulId === bestaand.id) : [];
  return (
    <Venster titel={bestaand ? 'Spul aanpassen' : 'Nieuw spul'} sluit={sluit}>
      <form onSubmit={bewaar} noValidate>
        <Veld veld="naam" verplicht {...p} />
        {fout && <span className="veld-fout" role="alert">{fout}</span>}
        <Zichtbaarheidskeuze waarde={zicht} zet={zetZicht} mag={!bestaand || bestaand.eigenaar === sp.ik} />
        {losTaken.length > 0 && (
          <p className="sp-noot" role="alert">
            {losTaken.length === 1 ? 'Er hoort 1 taak' : `Er horen ${losTaken.length} taken`} bij dit spul. Taken zijn zichtbaar voor het hele huishouden, dus bij opslaan verdwijnt die koppeling. De {losTaken.length === 1 ? 'taak blijft' : 'taken blijven'} bestaan, maar {losTaken.length === 1 ? 'hoort' : 'horen'} niet meer bij dit spul. Kijk of de titel iets over dit spul zegt: {losTaken.map(t => t.soort === 'taak' ? t.titel : '').join(', ')}.
          </p>
        )}
        {blijftZichtbaar.length > 0 && (
          <p className="sp-noot" role="note">Deze gedeelde documenten noemen dit spul in de titel en blijven zichtbaar voor het huishouden: {blijftZichtbaar.map(d => d.titel).join(', ')}. Pas de titel aan of maak ze ook persoonlijk.</p>
        )}
        <button type="button" className="sp-details-knop" aria-expanded={details} aria-controls={detailsId} onClick={() => zetDetails(x => !x)}>
          <span>Meer details{!details && ingevuld > 0 ? ` (${ingevuld} ingevuld)` : ''}</span>
          <IcPijl className={'uitklap-pijl' + (details ? ' open' : '')} width={16} height={16} aria-hidden="true" />
        </button>
        <div id={detailsId} className="sp-details" hidden={!details}>
          <Veld veld="merk" {...p} />
          <Veld veld="model" {...p} />
          <Veld veld="serienummer" {...p} />
          <Veld veld="aankoopdatum" type="date" {...p} />
          <Veld veld="categorie" {...p} />
          <Veld veld="winkel" {...p} />
          <Veld veld="prijs" {...p} />
          <Veld veld="garantieTot" type="date" {...p} />
          <p className="stil-tekst sp-uitleg">Vul de garantie in zoals de winkel of de fabrikant die geeft. {WETTELIJKE_UITLEG}</p>
          <Veld veld="extraGarantieTot" type="date" {...p} />
          <Veld veld="extraGarantieAanbieder" {...p} />
        </div>
        <button type="submit" className="knop breed">{bestaand ? 'Opslaan' : 'Bewaren'}</button>
      </form>
    </Venster>
  );
}

// ---------------------------------------------------------------- Een document aanpassen

export function DocumentVenster({ bestaand, sluit, magZichtbaarheid }: { bestaand: Document; sluit: () => void; magZichtbaarheid: boolean }) {
  const sp = useSpullen();
  const [titel, zetTitel] = useState(bestaand.titel);
  const [soort, zetSoort] = useState<DocumentSoort>(bestaand.soort);
  const [datum, zetDatum] = useState(bestaand.datum ?? '');
  const [zicht, zetZicht] = useState<Zichtbaarheid>(bestaand.zichtbaarheid);
  const [goedgekeurd, zetGoedgekeurd] = useState<string | null>(null);
  const { vandaag } = useApp();
  if (!sp) return null;
  const bij = spullenVan(sp.gegevens, bestaand.id);
  // Een lege titel wordt een leesbare terugvalnaam (de soort met het spul, of met de datum); nooit een persoonlijk spul in een gedeeld document.
  const terugval = leesbareTitel('', { soort, spulNaam: spulNaamVoorTitel(bij, zicht), datum: datum || vandaag });
  const lek = verborgenSpulInTitel(titel, bij, zicht);
  const vraag = !!lek && goedgekeurd !== titel.trim();
  return (
    <Venster titel="Document aanpassen" sluit={sluit}>
      <form onSubmit={e => { e.preventDefault(); if (vraag) return; sp.documentBijwerken({ ...bestaand, titel: titel.trim() || terugval, soort, datum: datum || undefined, zichtbaarheid: zicht }); sluit(); }} noValidate>
        <label className="veld"><span className="veld-label">Titel</span><input value={titel} onChange={e => zetTitel(e.target.value)} maxLength={120} placeholder={terugval} /></label>
        <SoortKeuze soort={soort} zet={zetSoort} />
        <label className="veld"><span className="veld-label">Datum <span className="optioneel">(optioneel)</span></span><input type="date" value={datum} onChange={e => zetDatum(e.target.value)} /></label>
        <Zichtbaarheidskeuze waarde={zicht} zet={zetZicht} mag={magZichtbaarheid} />
        {vraag && lek && <TitelVraag spul={lek} veilig={() => zetTitel(terugval)} toch={() => zetGoedgekeurd(titel.trim())} />}
        <button type="submit" className="knop breed" disabled={vraag}>Opslaan</button>
      </form>
    </Venster>
  );
}

function SoortKeuze({ soort, zet }: { soort: DocumentSoort; zet: (s: DocumentSoort) => void }) {
  return (
    <div className="veld">
      <span className="veld-label" id="sp-soort">Soort document</span>
      <div className="keuzes" role="group" aria-labelledby="sp-soort">
        {(Object.keys(SOORT_NAAM) as DocumentSoort[]).map(s => (
          <button key={s} type="button" className={'keuze' + (s === soort ? ' aan' : '')} aria-pressed={s === soort} onClick={() => zet(s)}>{SOORT_NAAM[s]}</button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Koppelen (document ↔ spul), zonder duplicaten

export function KoppelVenster({ spulId, documentId, sluit }: { spulId?: string; documentId?: string; sluit: () => void }) {
  const sp = useSpullen();
  if (!sp) return null;
  const g = sp.gegevens;
  const opties = spulId
    ? g.documenten.filter(d => !d.verwijderdOp && !isGekoppeld(g.koppelingen, d.id, spulId)).map(d => ({ id: d.id, naam: d.titel, sub: SOORT_NAAM[d.soort] }))
    : g.spullen.filter(s => !s.verwijderdOp && !isGekoppeld(g.koppelingen, documentId!, s.id)).map(s => ({ id: s.id, naam: s.naam, sub: s.categorie ?? '' }));
  return (
    <Venster titel={spulId ? 'Document koppelen' : 'Koppelen aan een spul'} sluit={sluit}>
      {opties.length ? (
        <ul className="lijst sp-keuzelijst">
          {opties.map(o => (
            <li key={o.id} className="rij">
              <button type="button" className="rij-knop" onClick={() => { if (spulId) sp.koppel(o.id, spulId); else sp.koppel(documentId!, o.id); sluit(); }}>
                <span className="rij-inhoud"><span className="rij-titel">{o.naam}</span>{o.sub && <span className="rij-sub"><span className="plek">{o.sub}</span></span>}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="stil-tekst">{spulId ? 'Alle documenten zijn al aan dit spul gekoppeld.' : 'Er is geen ander spul om aan te koppelen.'}</p>}
      <p className="stil-tekst sp-uitleg">Koppelen kopieert niets: het is hetzelfde document op twee plekken.</p>
    </Venster>
  );
}

// ---------------------------------------------------------------- Een document invoeren: de controlekaart

/** Nagespeelde herkenning, alleen voor de meegeleverde voorbeelden (de demo zegt dat). Echte herkenning bestaat nog niet. */
interface Herkenning { soort: DocumentSoort; titel: string; datum?: string; velden: Velden; spulNaam: string }
const NAGESPEELD: Record<'bon-foto' | 'factuur-pdf', Herkenning> = {
  'bon-foto': {
    soort: 'bon', titel: 'Kassabon Voorbeeldwinkel (voorbeeld)', datum: DEMO_AANKOOP, spulNaam: 'Afwasser 3000',
    // Bewust onvolledig: een bon noemt geen model en geen garantietermijn.
    velden: { naam: 'Afwasser 3000 (voorbeeld)', winkel: 'Voorbeeldwinkel', aankoopdatum: DEMO_AANKOOP, prijs: '549,00' },
  },
  'factuur-pdf': {
    soort: 'factuur', titel: 'Factuur Afwasser 3000 (voorbeeld)', datum: DEMO_AANKOOP, spulNaam: 'Afwasser 3000',
    velden: { naam: 'Afwasser 3000 (voorbeeld)', merk: 'Voorbeeldmerk', model: 'AW-3000-VB', serienummer: 'VB-0000-1234', winkel: 'Voorbeeldwinkel',
      aankoopdatum: DEMO_AANKOOP, prijs: '549,00', bestelnummer: 'VB-2026-0042', garantieTot: '2028-10-28' },
  },
};

type Voorbereid =
  | { fase: 'bezig' }
  | { fase: 'fout'; reden: string }
  | { fase: 'klaar'; blob: Blob; type: BestandType; naam: string; bestandsnaam?: string; sha?: string; herkenning?: Herkenning; voorbeeld?: 'bon-foto' | 'factuur-pdf' };

/** HEIC/HEIF (iPhone): "ftyp" op plek 4, met een heic-merk. Wordt op het toestel omgezet naar JPEG. */
const isHeic = (b: Uint8Array) => b.length >= 12 && String.fromCharCode(...b.slice(4, 8)) === 'ftyp' && /^(heic|heix|hevc|mif1|msf1|heif)$/.test(String.fromCharCode(...b.slice(8, 12)));

async function bereidVoor(bron: InvoerBron): Promise<Voorbereid> {
  if (bron.soort === 'voorbeeld') {
    const blob = await voorbeeldBestand(bron.sleutel);
    if (!blob) return { fase: 'fout', reden: 'Het voorbeeld kon op dit toestel niet worden gemaakt.' };
    return { fase: 'klaar', blob, type: bron.sleutel === 'bon-foto' ? 'image/png' : 'application/pdf', naam: NAGESPEELD[bron.sleutel].titel,
      herkenning: NAGESPEELD[bron.sleutel], voorbeeld: bron.sleutel };
  }
  const f = bron.bestand;
  const kop = await eersteBytes(f);
  let blob: Blob = f;
  // Foto's (ook HEIC) verkleinen en opnieuw tekenen: kleiner, en zonder plaatsgegevens.
  if (isHeic(kop) || typeUitBytes(kop)?.startsWith('image/')) {
    const klein = await verkleinFoto(f);
    if (!klein) return { fase: 'fout', reden: isHeic(kop) ? 'Deze foto kan dit toestel niet openen. Kies hem opnieuw als JPEG.' : 'Deze foto kan niet worden gelezen.' };
    blob = klein;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const c = controleer(bytes.slice(0, 16), blob.size);
  if (!c.ok) return { fase: 'fout', reden: c.reden };
  return { fase: 'klaar', blob, type: c.type, naam: f.name.replace(/\.[a-z0-9]{2,5}$/i, ''), bestandsnaam: f.name, sha: await sha256(bytes) };
}

function DocumentInvoer({ invoer, sluit }: { invoer: Invoer; sluit: () => void }) {
  const sp = useSpullen();
  const { openSpullen, vandaag } = useApp();
  const [v, zetV] = useState<Voorbereid>({ fase: 'bezig' });
  const [beeld, zetBeeld] = useState<string | null>(null);
  const [titel, zetTitel] = useState('');
  // Zolang de titel niet zelf is aangepast, volgt hij de soort en het spul (een leesbare naam, nooit een bestandscode).
  const [eigenTitel, zetEigenTitel] = useState(false);
  const [soort, zetSoort] = useState<DocumentSoort>('bon');
  const [datum, zetDatum] = useState('');
  const [zicht, zetZicht] = useState<Zichtbaarheid>('gedeeld');
  const [goedgekeurd, zetGoedgekeurd] = useState<string | null>(null);
  const [doel, zetDoel] = useState<'nieuw' | 'bestaand' | 'alleen'>(invoer.spulId ? 'bestaand' : 'nieuw');
  const [gekozen, zetGekozen] = useState<string | undefined>(invoer.spulId);
  const [toch, zetToch] = useState(false);
  const [bezig, zetBezig] = useState(false);
  const [fout, zetFout] = useState<string | null>(null);
  const velden = useVelden({});

  useEffect(() => {
    let weg = false;
    void bereidVoor(invoer.bron).then(r => {
      if (weg) return;
      zetV(r);
      if (r.fase !== 'klaar') return;
      const h = r.herkenning;
      if (h) { zetTitel(h.titel); zetEigenTitel(true); }
      const s = h?.soort ?? (r.type === 'application/pdf' ? 'factuur' : 'bon');
      zetSoort(s);
      zetZicht(standaardZichtbaarheid(s));
      if (h?.datum) zetDatum(h.datum);
      if (h) {
        velden.zetVelden(h.velden);
        velden.zetStatus(Object.fromEntries(Object.keys(h.velden).map(k => [k, 'voorstel'])) as Status);
      }
    }).catch(() => { if (!weg) zetV({ fase: 'fout', reden: 'Dit bestand kon niet worden gelezen.' }); });
    return () => { weg = true; };
    // Eén keer per invoer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // De afbeelding alleen als blob-adres in het geheugen; bij sluiten vrijgegeven. Niets gaat naar de browseropslag of cache.
  useEffect(() => {
    if (v.fase !== 'klaar' || !v.type.startsWith('image/')) return;
    const u = URL.createObjectURL(v.blob);
    zetBeeld(u);
    return () => URL.revokeObjectURL(u);
  }, [v]);

  // "Hoort dit bij de Afwasser 3000?": een voorstel op naam, nooit vanzelf gekoppeld.
  const voorstelSpul = useMemo(() => {
    if (!sp || v.fase !== 'klaar' || !v.herkenning) return undefined;
    const r = zoekSpullen(sp.gegevens.spullen, v.herkenning.spulNaam);
    return r.length === 1 ? r[0] : undefined;
  }, [sp, v]);
  const actief = sp ? sp.gegevens.spullen.filter(s => !s.verwijderdOp) : [];
  const gekozenSpul = doel === 'bestaand' ? actief.filter(s => s.id === gekozen) : [];
  const bijPersoonlijk = gekozenSpul[0]?.zichtbaarheid === 'persoonlijk';
  // Een nieuw spul krijgt dezelfde zichtbaarheid als het document; bij een bestaand spul mag de naam niet altijd mee.
  const spulNaam = doel === 'nieuw' ? velden.velden.naam : spulNaamVoorTitel(gekozenSpul, zicht);
  const autoTitel = v.fase === 'klaar' ? leesbareTitel(v.naam, { soort, spulNaam, datum: datum || vandaag }) : '';
  useEffect(() => { if (!eigenTitel && autoTitel) zetTitel(autoTitel); }, [eigenTitel, autoTitel]);
  // Bij een persoonlijk spul is ook het document standaard persoonlijk; delen blijft een eigen keuze.
  useEffect(() => {
    if (v.fase === 'klaar') zetZicht(bijPersoonlijk ? 'persoonlijk' : standaardZichtbaarheid(soort));
    // Alleen als het gekozen spul verandert (of het bestand klaar is), niet bij elke keuze hieronder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bijPersoonlijk, v.fase]);
  if (!sp) return null;
  const lek = verborgenSpulInTitel(titel, gekozenSpul, zicht);
  const vraag = !!lek && goedgekeurd !== titel.trim();
  const dubbel = v.fase === 'klaar' ? dubbelDocument(sp.gegevens.documenten, v.sha) : undefined;

  const bewaar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (v.fase !== 'klaar' || bezig || vraag) return;
    let nieuwSpul: Omit<Spul, 'id' | 'eigenaar'> | undefined;
    if (doel === 'nieuw') {
      const r = spulUit(velden.velden, velden.status);
      if (!r.spul.naam) { zetFout('Geef het spul een naam, of kies "Alleen bewaren".'); return; }
      if (r.fout) { zetFout(r.fout); return; }
      nieuwSpul = { ...r.spul, zichtbaarheid: zicht };
    }
    if (doel === 'bestaand' && !gekozen) { zetFout('Kies bij welk spul dit hoort.'); return; }
    zetBezig(true);
    try {
      const r = await sp.documentBewaren({
        document: { titel: titel.trim() || autoTitel, soort, datum: datum || undefined, zichtbaarheid: zicht, type: v.type, grootte: v.blob.size, sha256: v.sha },
        bestand: v.blob, voorbeeld: v.voorbeeld, spullen: doel === 'bestaand' && gekozen ? [gekozen] : [], nieuwSpul,
      });
      sluit();
      const spul = r.spulId ?? (doel === 'bestaand' ? gekozen : undefined);
      openSpullen(spul ? `spul/${encodeURIComponent(spul)}` : `document/${encodeURIComponent(r.documentId)}`);
    } catch (e) {
      // "Bewaard" verschijnt alleen als het echt gelukt is; de melding zegt wat er misging (een vaste tekst).
      zetBezig(false);
      zetFout(e instanceof Error && e.message ? e.message : 'Niet gelukt. Probeer het opnieuw.');
    }
  };
  const p = { velden: velden.velden, status: velden.status, zet: velden.zet, bevestig: velden.bevestig };
  return (
    <Venster titel="Document bewaren" sluit={sluit}>
      {v.fase === 'bezig' && <p className="stil-tekst" role="status">Bestand voorbereiden…</p>}
      {v.fase === 'fout' && (
        <>
          <p className="veld-fout" role="alert">{v.reden}</p>
          <button type="button" className="knop breed stil" onClick={sluit}>Sluiten</button>
        </>
      )}
      {v.fase === 'klaar' && (
        <form onSubmit={bewaar} noValidate>
          <div className="sp-bestand">
            {beeld ? <img src={beeld} alt="Gekozen afbeelding" /> : <span className="lid-avatar vak-icoon" aria-hidden="true"><IcDocument width={20} height={20} /></span>}
            <span className="stil-tekst">{v.type === 'application/pdf' ? 'PDF' : 'Foto'} · {Math.max(1, Math.round(v.blob.size / 1024))} kB{v.type.startsWith('image/') && !v.voorbeeld ? ' · verkleind, zonder plaatsgegevens' : ''}
              {v.bestandsnaam && <span className="sp-bestandsnaam">Bestand: {v.bestandsnaam}</span>}</span>
          </div>
          {sp.soort === 'demo' && (
            <p className="sp-noot" role="note"><span className="demo-label">Demo</span> {v.herkenning ? 'Deze herkenning is nagespeeld. ' : 'Herkenning is in deze versie handmatig. '}Er wordt niets echt bewaard{v.voorbeeld ? '' : ', ook je bestand niet'}.</p>
          )}
          {dubbel && !toch && (
            <div className="kaart-vraag" role="group" aria-label="Dit document staat er al">
              <p>Dit document staat er al: {dubbel.titel}.</p>
              <div className="keuzes">
                <button type="button" className="keuze" onClick={() => { sluit(); openSpullen(`document/${encodeURIComponent(dubbel.id)}`); }}>Bekijken</button>
                <button type="button" className="keuze" onClick={() => zetToch(true)}>Toch bewaren</button>
              </div>
            </div>
          )}
          <label className="veld"><span className="veld-label">Titel</span><input value={titel} onChange={e => { zetTitel(e.target.value); zetEigenTitel(true); }}
            onBlur={() => { if (!titel.trim()) zetEigenTitel(false); }} maxLength={120} placeholder={autoTitel} /></label>
          <SoortKeuze soort={soort} zet={s => { zetSoort(s); if (!bijPersoonlijk) zetZicht(standaardZichtbaarheid(s)); }} />
          <label className="veld"><span className="veld-label">Datum <span className="optioneel">(optioneel)</span>{v.herkenning?.datum && datum === v.herkenning.datum && <> <StatusLabel status="voorstel" /></>}</span>
            <input type="date" value={datum} onChange={e => zetDatum(e.target.value)} /></label>

          <div className="veld">
            <span className="veld-label" id="sp-doel">Waar hoort het bij?</span>
            {voorstelSpul && doel !== 'bestaand' && (
              <div className="kaart-vraag" role="group" aria-label={`Hoort dit bij ${voorstelSpul.naam}?`}>
                <p>Hoort dit bij {voorstelSpul.naam}?</p>
                <div className="keuzes">
                  <button type="button" className="keuze" onClick={() => { zetDoel('bestaand'); zetGekozen(voorstelSpul.id); }}>Ja, koppelen</button>
                </div>
              </div>
            )}
            <div className="keuzes" role="group" aria-labelledby="sp-doel">
              <button type="button" className={'keuze' + (doel === 'nieuw' ? ' aan' : '')} aria-pressed={doel === 'nieuw'} onClick={() => zetDoel('nieuw')}>Nieuw spul</button>
              {actief.length > 0 && <button type="button" className={'keuze' + (doel === 'bestaand' ? ' aan' : '')} aria-pressed={doel === 'bestaand'} onClick={() => zetDoel('bestaand')}>Bestaand spul</button>}
              <button type="button" className={'keuze' + (doel === 'alleen' ? ' aan' : '')} aria-pressed={doel === 'alleen'} onClick={() => zetDoel('alleen')}>Alleen bewaren</button>
            </div>
          </div>
          {doel === 'bestaand' && (
            <div className="keuzes sp-spulkeuze" role="group" aria-label="Kies het spul">
              {actief.map(s => <button key={s.id} type="button" className={'keuze' + (gekozen === s.id ? ' aan' : '')} aria-pressed={gekozen === s.id} onClick={() => zetGekozen(s.id)}>{s.naam}</button>)}
            </div>
          )}
          {doel === 'nieuw' && (
            <div className="sp-nieuw">
              <Veld veld="naam" verplicht {...p} />
              <Veld veld="merk" {...p} />
              <Veld veld="model" {...p} />
              <Veld veld="aankoopdatum" type="date" {...p} />
              <Veld veld="winkel" {...p} />
              <Veld veld="prijs" {...p} />
              <Veld veld="garantieTot" type="date" {...p} />
              <p className="stil-tekst sp-uitleg">{WETTELIJKE_UITLEG}</p>
            </div>
          )}
          <Zichtbaarheidskeuze waarde={zicht} zet={zetZicht} mag />
          {bijPersoonlijk && zicht === 'gedeeld' && <p className="stil-tekst sp-uitleg">Dit spul blijft alleen voor jou. Het huishouden ziet het document, maar niet bij welk spul het hoort.</p>}
          {vraag && lek && (
            <TitelVraag spul={lek} toch={() => zetGoedgekeurd(titel.trim())}
              veilig={() => { zetTitel(leesbareTitel('', { soort, spulNaam: spulNaamVoorTitel(gekozenSpul, zicht), datum: datum || vandaag })); zetEigenTitel(true); }} />
          )}
          {fout && <p className="veld-fout" role="alert">{fout}</p>}
          <button type="submit" className="knop breed" disabled={bezig || vraag || (!!dubbel && !toch)}>{bezig ? 'Bezig…' : 'Bewaren'}</button>
        </form>
      )}
    </Venster>
  );
}
