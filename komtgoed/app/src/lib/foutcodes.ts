// Stabiele foutcodes van de database naar teksten in de Thuisplanner-toon (KG-5H deel 1b; de richting van KG-5E,
// punt 5). De app vertaalt alleen de code, nooit de technische melding. Een contracttest (tests/foutcodes.test.ts)
// faalt als een TPU-code in de migraties hier geen tekst heeft, of andersom.

/** Uitnodigingen (migratie 20261020120000_uitnodigingen_op_email.sql). */
export const UITNODIGING_TEKSTEN: Record<string, string> = {
  TPU01: 'Deze uitnodiging bestaat niet (meer). Vraag degene die je uitnodigde om een nieuwe.',
  TPU02: 'Deze uitnodiging is verlopen. Vraag degene die je uitnodigde om een nieuwe.',
  TPU03: 'Deze uitnodiging is al gebruikt.',
  TPU04: 'Deze uitnodiging is ingetrokken.',
  TPU05: 'Deze uitnodiging is niet meer geldig. Vraag degene die je uitnodigde om een nieuwe.',
  TPU06: 'Deze uitnodiging is voor een ander e-mailadres. Log in met het adres waarop je bent uitgenodigd.',
  TPU07: 'Je bent al lid van dit huishouden.',
  TPU08: 'Er staan al 10 uitnodigingen open. Trek er eerst een in.',
  TPU09: 'Dit e-mailadres lijkt niet te kloppen. Controleer het en probeer het opnieuw.',
  TPU10: 'Deze uitnodiging is geweigerd.',
};

// Meldingen van de overige databasefuncties zijn al in gewone taal en zonder rijgegevens (KG-5C herstelronde 2). Alleen
// die codes tonen we letterlijk, tot KG-5E ook die domeinen een eigen code geeft; al het andere (netwerk, onverwacht)
// wordt een algemene melding.
const LETTERLIJK = new Set(['P0002', '22023', '23505', '42501', '54000', '23514', '22001']);

export const ALGEMEEN = 'Dat lukte nu niet. Controleer de verbinding en probeer het opnieuw.';

export function foutTekst(fout: { code?: string; message?: string } | null | undefined): string {
  if (fout?.code && UITNODIGING_TEKSTEN[fout.code]) return UITNODIGING_TEKSTEN[fout.code];
  if (fout?.code && LETTERLIJK.has(fout.code) && fout.message) return fout.message;
  return ALGEMEEN;
}
