// Thuisplanner · Mijn spullen & Documenten: bestanden bewaren en openen (docs/thuisplanner-spullen-documenten.md §6.3
// en §14). Framework-onafhankelijk, zoals de sync: werkt in de browser en in node (de integratietests).
//
// Uploaden in twee fasen, met dezelfde regels als de rest van de sync:
//  1. de rij op 'wacht' via de sync (vaste UUID van de app; de server zet de status, de client kan dat niet);
//  2. het bestand naar <household_id>/<document_id>/origineel in de privé-bucket "documenten" (nooit overschrijven;
//     de policy staat alleen een eigen 'wacht'-document toe);
//  3. de Edge Function bevestig-upload: magic bytes, grootte en type op de server, dan pas 'klaar';
//  4. daarna de koppelingen met spullen.
// Mislukt een stap, dan zegt het resultaat welke (fase) en of opnieuw proberen zin heeft. Er wordt niets "bewaard"
// genoemd vóór stap 3. Een 'wacht'-document dat blijft hangen, ruimt de opruimronde na 24 uur op.
//
// Openen: een ondertekende link van 60 seconden, als bijlage, en het bestand met cache: 'no-store' opgehaald. Zo komt
// een factuur niet in de browsercache; de app maakt er een blob-adres van in het geheugen.

export const BUCKET = 'documenten';
export const LINK_SECONDEN = 60;

/** Het vaste pad van een document (zoals storage_path in de database). */
export const padVan = (huishoudenId, documentId) => `${huishoudenId}/${documentId}/origineel`;

const geenVerbinding = () => globalThis.navigator?.onLine === false;
const MELDING = {
  offline: 'Geen verbinding: het document is niet bewaard. Probeer het opnieuw als je weer verbinding hebt.',
  upload: 'Het bestand kon niet worden verstuurd. Probeer het opnieuw; er komt geen tweede document bij.',
  controle: 'Dit bestand is geweigerd: het is geen PDF of foto, of het klopt niet met wat er werd verstuurd.',
  bevestigen: 'Het is nog niet bevestigd dat het bestand goed is aangekomen. Probeer het opnieuw.',
  openen: 'Het bestand kon niet worden geopend. Probeer het opnieuw.',
  fout: 'Er ging iets mis. Probeer het opnieuw.',
};

/**
 * @param {object} o
 * @param {import('@supabase/supabase-js').SupabaseClient} o.supabase  client met de sessie van de gebruiker (nooit service-role)
 * @param {{ acties: object, vernieuw: () => Promise<void> }} o.sync  de sync van hetzelfde huishouden, met spullen: true
 * @param {string} o.huishoudenId
 * @param {() => string} o.nieuweId  UUID's van de app (zoals de sync)
 */
export function maakSpullenOpslag({ supabase, sync, huishoudenId, nieuweId }) {
  /** Fase 2 en 3: uploaden en laten controleren. Ook bij opnieuw proberen (dezelfde document-UUID). */
  async function uploadEnBevestig(documentId, bytes, mime) {
    const pad = padVan(huishoudenId, documentId);
    if (geenVerbinding()) return { ok: false, fase: 'offline', opnieuw: true, tekst: MELDING.offline };
    let up;
    try {
      up = await supabase.storage.from(BUCKET).upload(pad, bytes, { contentType: mime, upsert: false, cacheControl: '0' });
    } catch {
      up = { error: { onzeker: true } };
    }
    // Er staat al een object (een eerdere poging kwam aan): niet overschrijven, maar wel laten controleren.
    const alEr = up.error && (String(up.error.statusCode) === '409' || /exist|duplicate/i.test(up.error.message || ''));
    if (up.error && !alEr) return { ok: false, fase: 'upload', opnieuw: true, tekst: MELDING.upload };
    let r;
    try {
      r = await supabase.functions.invoke('bevestig-upload', { body: { document_id: documentId } });
    } catch {
      return { ok: false, fase: 'bevestigen', opnieuw: true, tekst: MELDING.bevestigen };
    }
    if (!r.error && r.data?.status === 'klaar') return { ok: true };
    const status = r.error?.context?.status;
    let body = null;
    try { body = r.error?.context ? await r.error.context.json() : null; } catch { body = null; }
    if (status === 409 && body?.status === 'klaar') return { ok: true };          // al eerder bevestigd
    if (status === 422) return { ok: false, fase: 'controle', opnieuw: false, tekst: MELDING.controle };
    return { ok: false, fase: 'bevestigen', opnieuw: true, tekst: MELDING.bevestigen };
  }

  return {
    padVan: id => padVan(huishoudenId, id),

    /**
     * Een document bewaren, eventueel met een nieuw spul en koppelingen.
     * @param {{ documentId: string, velden: object, bytes: Blob | Uint8Array, spullen?: string[], nieuwSpul?: { id: string, velden: object } | null }} n
     */
    async bewaarDocument({ documentId, velden, bytes, spullen = [], nieuwSpul = null }) {
      if (geenVerbinding()) return { ok: false, fase: 'offline', opnieuw: true, tekst: MELDING.offline };
      if (nieuwSpul) {
        const s = await sync.acties.spulToevoegen(nieuwSpul.id, nieuwSpul.velden);
        if (!s.ok) return { ok: false, fase: 'spul', opnieuw: true, tekst: s.melding?.tekst ?? MELDING.fout };
      }
      const b = await sync.acties.documentBegin(documentId, velden);
      if (!b.ok) return { ok: false, fase: 'begin', opnieuw: true, tekst: b.melding?.tekst ?? MELDING.fout };
      const u = await uploadEnBevestig(documentId, bytes, velden.mime);
      if (!u.ok) { await sync.vernieuw(); return u; }
      for (const spulId of [...spullen, ...(nieuwSpul ? [nieuwSpul.id] : [])]) {
        const k = await sync.acties.documentKoppelen(documentId, spulId, nieuweId());
        if (!k.ok) return { ok: false, fase: 'koppelen', opnieuw: true, tekst: k.melding?.tekst ?? MELDING.fout, bewaard: true };
      }
      await sync.vernieuw();
      return { ok: true, documentId, spulId: nieuwSpul?.id };
    },

    /** Opnieuw proberen na een mislukte upload of bevestiging: dezelfde UUID, nooit een tweede document. */
    opnieuwUploaden(documentId, bytes, mime) {
      return uploadEnBevestig(documentId, bytes, mime).finally(() => sync.vernieuw());
    },

    /**
     * Het bestand ophalen om buiten de app te openen: een ondertekende link (60 s, als bijlage) en no-store, zodat het
     * niet in de browsercache komt. Geeft een Blob, of null met een vaste melding.
     */
    async openBestand(documentId) {
      if (geenVerbinding()) return { ok: false, tekst: MELDING.offline };
      const l = await supabase.storage.from(BUCKET).createSignedUrl(padVan(huishoudenId, documentId), LINK_SECONDEN, { download: true });
      if (l.error || !l.data?.signedUrl) return { ok: false, tekst: MELDING.openen };
      try {
        const r = await fetch(l.data.signedUrl, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!r.ok) return { ok: false, tekst: MELDING.openen };
        return { ok: true, blob: await r.blob() };
      } catch {
        return { ok: false, tekst: MELDING.openen };
      }
    },
  };
}
