// Mijn spullen & Documenten: de opruimronde (docs/thuisplanner-spullen-documenten.md §6.4 en §14.1). Een SQL-cascade
// wist rijen, geen bestanden; deze functie wist de bestanden die documenten_op_te_ruimen teruggeeft: de prullenbak na
// 30 dagen, wachtende of mislukte uploads na 24 uur, en wezen (een object zonder rij, bijvoorbeeld na delete_household
// of een verwijderd account). Alleen de database roept haar aan (pg_net, met het wachtrijgeheim uit Vault), zoals
// stuur-uitnodiging. Het inplannen (pg_cron) volgt met een eigen akkoord; tot dan alleen handmatig en in de tests.
import { geheimGelijk, instelling, json, log, opslagWissen, rpc } from '../_gedeeld/k1.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, {});
  const geheim = req.headers.get('x-thuisplanner-wachtrij') ?? '';
  let verwacht: string;
  try { verwacht = instelling('WACHTRIJ_GEHEIM'); } catch { return json(503, {}); }
  if (verwacht.length < 32 || !geheimGelijk(geheim, verwacht)) return json(401, {});
  const paden = ((await rpc<{ pad: string }[]>('documenten_op_te_ruimen', {})) ?? []).map(r => r.pad);
  let gewist = 0;
  for (let i = 0; i < paden.length; i += 100) gewist += await opslagWissen('documenten', paden.slice(i, i + 100));
  log('opruimen-documenten', { paden: paden.length, gewist });
  return json(200, { paden: paden.length, gewist });
});
