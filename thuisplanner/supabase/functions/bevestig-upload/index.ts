// Mijn spullen & Documenten: een upload bevestigen, fase 3 van 3 (docs/thuisplanner-spullen-documenten.md §6.3 en §14.2).
// De app roept deze functie aan met de eigen sessie, na het uploaden van het object. Eerst als de gebruiker zelf (RLS):
// het document moet zichtbaar zijn en op 'wacht' staan. Pas daarna, met de service-rol, het object lezen: bestaat het,
// klopt de grootte, en zeggen de eerste bytes hetzelfde type als de rij? Dan 'klaar' (documenten_klaar controleert de
// grootte en het object nog eens in de database). Anders 'mislukt' en het object weg. Geeft nooit inhoud terug.
import { instelling, json, log, opslagObject, rpc } from '../_gedeeld/k1.ts';
import { typeUitBytes } from '../_gedeeld/bestandstype.ts';

type Rij = { id: string; upload_status: string; mime: string; size_bytes: number; storage_path: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Het document zoals de aanroeper het mag zien (zijn eigen sessie, dus RLS en de poort); null als het er niet is. */
async function eigenRij(req: Request, id: string): Promise<Rij | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!/^Bearer \S+$/.test(auth)) return null;
  const r = await fetch(`${instelling('SUPABASE_URL')}/rest/v1/documents?id=eq.${id}&select=id,upload_status,mime,size_bytes,storage_path`, {
    headers: { apikey: instelling('SUPABASE_ANON_KEY'), Authorization: auth },
  });
  if (!r.ok) return null;
  const rijen = (await r.json()) as Rij[];
  return rijen.length === 1 ? rijen[0] : null;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, {});
  let id = '';
  try { id = String(((await req.json()) as { document_id?: unknown }).document_id ?? ''); } catch { return json(400, { fout: 'geen-document' }); }
  if (!UUID.test(id)) return json(400, { fout: 'geen-document' });
  const rij = await eigenRij(req, id);
  if (!rij) return json(404, { fout: 'niet-gevonden' });
  if (rij.upload_status !== 'wacht') return json(409, { status: rij.upload_status });

  // Vanaf hier de service-rol: alleen voor dit ene, gecontroleerde document.
  const o = await opslagObject('documenten', rij.storage_path, 'GET');
  if (!o.ok) {
    await rpc('documenten_mislukt', { p_id: id });
    log('bevestig-upload', { uitkomst: 'geen-object' });
    return json(422, { status: 'mislukt', fout: 'geen-object' });
  }
  const bytes = new Uint8Array(await o.arrayBuffer());
  const type = typeUitBytes(bytes.slice(0, 16));
  if (bytes.length !== rij.size_bytes || type !== rij.mime) {
    await rpc('documenten_mislukt', { p_id: id });
    await opslagObject('documenten', rij.storage_path, 'DELETE');
    log('bevestig-upload', { uitkomst: 'geweigerd', grootte_klopt: bytes.length === rij.size_bytes, type_klopt: type === rij.mime });
    return json(422, { status: 'mislukt', fout: 'type-of-grootte' });
  }
  const status = await rpc<string>('documenten_klaar', { p_id: id, p_type: type });
  log('bevestig-upload', { uitkomst: status });
  return json(status === 'klaar' ? 200 : 422, { status });
});
