// De echte opslag van Mijn spullen & Documenten (lokale modus en staging), achter dezelfde interface als de demo
// (SpullenOpslag in opslag.ts). Lezen komt uit de sync (wat RLS teruggeeft); schrijven gaat via de acties van de sync,
// en bestanden via sync/spullen-opslag.js (uploaden in twee fasen, ondertekende links, no-store). Alleen actief met
// VITE_SPULLEN=aan (LokaleConfig.spullen); de rest van de app merkt er dan niets van.
import { useMemo, useRef } from 'react';
import { CONFLICT_IN_VENSTER, type Opgeslagen } from '../acties';
import { maakSpullenOpslag } from '../../../../sync/spullen-opslag.js';
import type { DocumentKoppelingRij, DocumentRij, SpulRij, Toestand } from '../../../../sync/thuisplanner-sync.js';
import type { Sessie } from '../lokaal/sessie';
import { uuidV4 } from '../../../../sync/thuisplanner-sync.js';
import type { SpullenOpslag } from './opslag';
import type { BestandType, Document, DocumentKoppeling, Spul, SpulVeld, SpullenGegevens } from './types';

/** App-veld ↔ databasekolom (ook voor field_status). */
const KOLOM: Record<SpulVeld, string> = {
  naam: 'name', categorie: 'category', merk: 'brand', model: 'model', serienummer: 'serial', aankoopdatum: 'purchase_date',
  winkel: 'shop', prijs: 'price_cents', bestelnummer: 'order_number', garantieTot: 'warranty_commercial_until',
  extraGarantieTot: 'warranty_extra_until', extraGarantieAanbieder: 'warranty_extra_provider',
};
const VELD = Object.fromEntries(Object.entries(KOLOM).map(([v, k]) => [k, v])) as Record<string, SpulVeld>;

const syncStaat = (r: { wachtend?: boolean; onzeker?: boolean; geweigerd?: boolean }) =>
  (r.wachtend ? 'wachtend' : r.onzeker ? 'onzeker' : r.geweigerd ? 'geweigerd' : undefined) as Spul['sync'];

export function naarSpul(r: SpulRij): Spul {
  const status = Object.fromEntries(Object.keys(r.field_status ?? {}).filter(k => VELD[k]).map(k => [VELD[k], 'voorstel' as const]));
  const v = <T,>(x: T | null) => (x === null ? undefined : x);
  return {
    id: r.id, naam: r.name, categorie: v(r.category), merk: v(r.brand), model: v(r.model), serienummer: v(r.serial),
    aankoopdatum: v(r.purchase_date), winkel: v(r.shop), prijsCenten: v(r.price_cents), bestelnummer: v(r.order_number),
    garantieTot: v(r.warranty_commercial_until), extraGarantieTot: v(r.warranty_extra_until), extraGarantieAanbieder: v(r.warranty_extra_provider),
    notities: v(r.notes), zichtbaarheid: r.visibility === 'private' ? 'persoonlijk' : 'gedeeld', eigenaar: r.owner_member_id,
    status: Object.keys(status).length ? status : undefined, verwijderdOp: r.deleted_at, versie: r.version, sync: syncStaat(r),
  };
}

export function naarDocument(r: DocumentRij): Document {
  return {
    id: r.id, titel: r.title, soort: r.kind as Document['soort'], datum: r.document_date ?? undefined,
    zichtbaarheid: r.visibility === 'private' ? 'persoonlijk' : 'gedeeld', eigenaar: r.owner_member_id, upload: r.upload_status,
    type: r.mime as BestandType, grootte: r.size_bytes, sha256: r.sha256 ?? undefined,
    bestand: { soort: 'opslag', pad: r.storage_path ?? `${r.household_id}/${r.id}/origineel` }, verwijderdOp: r.deleted_at,
    versie: r.version, sync: syncStaat(r),
  };
}

/** De kolommen van een spul (zonder id, huishouden en eigenaar). Leeg = null, zodat wissen ook echt wist. */
export function spulKolommen(s: Omit<Spul, 'id' | 'eigenaar'>): Record<string, unknown> {
  const status: Record<string, 'voorstel'> = {};
  for (const [v, st] of Object.entries(s.status ?? {})) if (st === 'voorstel' && KOLOM[v as SpulVeld]) status[KOLOM[v as SpulVeld]] = 'voorstel';
  const n = <T,>(x: T | undefined) => (x === undefined || x === '' ? null : x);
  return {
    name: s.naam, category: n(s.categorie), brand: n(s.merk), model: n(s.model), serial: n(s.serienummer), purchase_date: n(s.aankoopdatum),
    shop: n(s.winkel), price_cents: n(s.prijsCenten), order_number: n(s.bestelnummer), warranty_commercial_until: n(s.garantieTot),
    warranty_extra_until: n(s.extraGarantieTot), warranty_extra_provider: n(s.extraGarantieAanbieder), notes: n(s.notities),
    visibility: s.zichtbaarheid === 'persoonlijk' ? 'private' : 'household', field_status: status,
  };
}

/** Wat de app ziet: alleen documenten die 'klaar' zijn (een upload die nog wacht of mislukte, staat apart). */
export function gegevensUit(t: Toestand | null): { gegevens: SpullenGegevens; onvoltooid: Document[] } {
  if (!t) return { gegevens: { spullen: [], documenten: [], koppelingen: [] }, onvoltooid: [] };
  const docs = (t.documenten ?? []).map(naarDocument);
  return {
    gegevens: {
      spullen: (t.spullen ?? []).map(naarSpul),
      documenten: docs.filter(d => d.upload === 'klaar'),
      koppelingen: (t.documentKoppelingen ?? []).map((k): DocumentKoppeling => ({ documentId: k.document_id, spulId: k.possession_id })),
    },
    // Alleen de eigen onvoltooide uploads (tweede review PR #54, P2-a): zo ziet de partner geen titel van een document
    // dat (nog) niet bewaard is, en geen knoppen die alleen voor de eigenaar zin hebben.
    onvoltooid: docs.filter(d => d.upload !== 'klaar' && !d.verwijderdOp && d.eigenaar === t.lid?.member_id),
  };
}

/** De echte opslag. `meld` toont een korte melding (die van de app); fouten van de server meldt de sync zelf. */
type Poging = { documentId: string; spulId: string; bestand: string; documentVersie?: number; spulVersie?: number; vervang?: boolean;
  /** De velden die deze invoer eerder instuurde: telt als "van ons" als de versie onbekend is (P2-3). */
  documentEigen: Record<string, unknown>[]; spulEigen: Record<string, unknown>[] };

export function useSupabaseSpullen(sessie: Sessie, toestand: Toestand | null, meld: (tekst: string) => void): SpullenOpslag & { onvoltooid: Document[] } {
  const huishouden = toestand?.lid?.household_id ?? '';
  const ik = toestand?.lid?.member_id ?? '';
  const tRef = useRef(toestand);
  tRef.current = toestand;
  // Per invoer (poging) dezelfde UUID's, ook bij opnieuw bewaren na een fout of verloren antwoord (P2, review PR #54).
  // Met de versies die de app na de vorige poging van het spul en het document kende (P1-b, tweede review).
  const pogingen = useRef(new Map<string, Poging>());
  const { gegevens, onvoltooid } = useMemo(() => gegevensUit(toestand), [toestand]);
  return useMemo(() => {
    const sync = sessie.syncObject;
    const a = () => sessie.acties;
    const t = () => tRef.current;
    const spulRij = (id: string) => t()?.spullen?.find(x => x.id === id);
    const docRij = (id: string) => t()?.documenten?.find(x => x.id === id);
    const linkRij = (documentId: string, spulId: string): DocumentKoppelingRij | undefined =>
      t()?.documentKoppelingen?.find(x => x.document_id === documentId && x.possession_id === spulId);
    const bestanden = sync ? maakSpullenOpslag({ supabase: sessie.client, sync, huishoudenId: huishouden, nieuweId: () => uuidV4() }) : null;
    const ok = async (p: Promise<{ ok: boolean }> | undefined, tekst?: string) => { const r = await p; if (r?.ok && tekst) meld(tekst); return !!r?.ok; };
    // Zoals ok, maar met de soort uitkomst: een versieconflict laat het venster open (P1, review PR #54).
    const uitkomst = async (p: Promise<{ ok: boolean; melding?: { soort?: string } | null }> | undefined, tekst?: string): Promise<Opgeslagen> => {
      const r = await p;
      if (r?.ok) { if (tekst) meld(tekst); return 'ok'; }
      return r?.melding?.soort === 'conflict' ? 'conflict' : 'fout';
    };
    return {
      soort: 'echt' as const,
      gegevens,
      onvoltooid,
      ik,
      spulBewaren: async s => {
        const bestaand = s.id ? spulRij(s.id) : undefined;
        if (bestaand) {
          // De versie van het moment waarop het venster openging (anders de huidige): geen stille overschrijving.
          const u = await uitkomst(a()?.spulBijwerken(bestaand, spulKolommen(s), s.versie ?? bestaand.version), `${s.naam} aangepast`);
          if (u !== 'ok') throw new Error(u === 'conflict' ? 'conflict' : 'niet bewaard');
          return bestaand.id;
        }
        const id = uuidV4();
        if (!(await ok(a()?.spulToevoegen(id, { ...spulKolommen(s), owner_member_id: ik }), `${s.naam} bewaard`))) throw new Error('niet bewaard');
        return id;
      },
      spulVerwijderen: (id, metDocumenten = false) => {
        const r = spulRij(id);
        if (!r) return;
        void ok(a()?.spulVerwijderen(r), `${r.name} staat in de prullenbak`);
        if (metDocumenten) {
          for (const k of t()?.documentKoppelingen ?? []) {
            const d = k.possession_id === id ? docRij(k.document_id) : undefined;
            if (d && !d.deleted_at) void a()?.documentVerwijderen(d);
          }
        }
      },
      spulTerugzetten: id => { const r = spulRij(id); if (r) void ok(a()?.spulTerugzetten(r), 'Teruggezet'); },
      documentBewaren: async n => {
        if (!bestanden || !n.bestand) throw new Error('Kies eerst een bestand.');
        // Een ander bestand in hetzelfde venster is een andere invoer: nieuwe UUID's (bestand, type en grootte liggen bij een
        // document vast). Gewijzigde gegevens (titel, zichtbaarheid, het nieuwe spul) stemt de opslag af vóór de upload.
        const b = n.bestand as Blob & { name?: string; lastModified?: number };
        const bestand = `${b.name ?? ''}|${b.size}|${b.type}|${b.lastModified ?? ''}`;
        const p: Poging = (n.poging ? pogingen.current.get(n.poging) : undefined) ?? { documentId: uuidV4(), spulId: uuidV4(), bestand, documentEigen: [], spulEigen: [] };
        if (n.poging) pogingen.current.set(n.poging, p);
        // Een document dat niet meer bruikbaar is (ander bestand, geweigerd, of weg): een nieuwe document-UUID, maar hetzelfde
        // nieuwe spul (P1-a: anders een tweede spul). Eerst de oude, onvoltooide rij opruimen (persoonlijk én prullenbak, op
        // de server opgezocht; P2-4), en pas als dat lukt verder; anders blijft alles staan en probeert de volgende poging
        // het opnieuw.
        if (p.bestand !== bestand) p.vervang = true;
        if (p.vervang) {
          const op = await bestanden.ruimOnvoltooidOp(p.documentId);
          if (!op.ok) throw new Error(op.tekst ?? 'Het vorige, niet afgeronde document kon niet worden opgeruimd. Probeer het opnieuw.');
          p.documentId = uuidV4();
          p.documentVersie = undefined;
          p.documentEigen = [];
          p.vervang = false;
          p.bestand = bestand;
        }
        const documentId = p.documentId;
        const nieuwSpul = n.nieuwSpul ? { id: p.spulId, versie: p.spulVersie, eigen: [...p.spulEigen], velden: { ...spulKolommen(n.nieuwSpul), owner_member_id: ik } } : null;
        const velden = { title: n.document.titel, kind: n.document.soort, document_date: n.document.datum ?? null,
          visibility: n.document.zichtbaarheid === 'persoonlijk' ? 'private' : 'household', owner_member_id: ik,
          mime: n.document.type, size_bytes: n.bestand.size, sha256: n.document.sha256 ?? null };
        const r = await bestanden.bewaarDocument({
          documentId, documentVersie: p.documentVersie, documentEigen: [...p.documentEigen], bytes: n.bestand, spullen: n.spullen, nieuwSpul, velden,
        });
        // Deze poging kan de rijen hebben geschreven: haar velden tellen voortaan als "van ons".
        p.documentEigen.push(velden);
        if (nieuwSpul) p.spulEigen.push(nieuwSpul.velden);
        // Een versie gaat alleen mee om na een getoonde conflictmelding bewust door te zetten, en maar voor één poging.
        // Nooit een versie uit de toestand: die werkt Realtime ook bij, dan zou de wijziging van de partner als "bekend"
        // gelden en stil worden overschreven (review PR #54, R1).
        p.spulVersie = undefined;
        p.documentVersie = undefined;
        if (!r.ok) {
          if (r.conflict) {
            // Iemand anders paste het aan: je invoer blijft staan; opnieuw bewaren zet bewust je eigen waarden door.
            if (r.fase === 'spul') p.spulVersie = r.versie; else p.documentVersie = r.versie;
            throw new Error(CONFLICT_IN_VENSTER);
          }
          if (r.opnieuw === false) {
            if (r.fase === 'spul') { p.spulId = uuidV4(); p.spulVersie = undefined; p.spulEigen = []; }   // het spul is weg
            else p.vervang = true;                                                       // geweigerd bestand of de rij is weg
          }
          throw new Error(r.tekst ?? 'Niet gelukt. Probeer het opnieuw.');
        }
        meld('Bewaard');
        return { documentId, spulId: nieuwSpul?.id };
      },
      documentBijwerken: async d => {
        const r = docRij(d.id);
        if (!r) return 'fout';
        return uitkomst(a()?.documentBijwerken(r, { title: d.titel, kind: d.soort, document_date: d.datum ?? null,
          visibility: d.zichtbaarheid === 'persoonlijk' ? 'private' : 'household' }, d.versie ?? r.version), `${d.titel} aangepast`);
      },
      documentVerwijderen: id => { const r = docRij(id); if (r) void ok(a()?.documentVerwijderen(r), `${r.title} staat in de prullenbak`); },
      documentTerugzetten: id => { const r = docRij(id); if (r) void ok(a()?.documentTerugzetten(r), 'Teruggezet'); },
      koppel: (documentId, spulId) => { void ok(a()?.documentKoppelen(documentId, spulId, uuidV4()), 'Gekoppeld'); },
      ontkoppel: (documentId, spulId) => {
        const k = linkRij(documentId, spulId);
        if (k) void ok(a()?.documentOntkoppelen(k), 'Ontkoppeld; het document blijft bewaard');
      },
      openBestand: async d => {
        if (!bestanden) return null;
        const r = await bestanden.openBestand(d.id);
        if (!r.ok) { meld(r.tekst); return null; }
        return r.blob;
      },
    };
  }, [sessie, huishouden, ik, gegevens, onvoltooid, meld]);
}
