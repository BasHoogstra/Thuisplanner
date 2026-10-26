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

/** De toegangspoort en de testpoort (migratie 20261021120000_toegangspoort.sql). */
export const TOEGANG_TEKSTEN: Record<string, string> = {
  TPA01: 'Log opnieuw in met een code uit je mail.',
  TPA02: 'Je bent uitgelogd op dit toestel. Log opnieuw in met een code uit je mail.',
  TPA03: 'Thuisplanner is even niet beschikbaar. Probeer het later opnieuw.',
  TPB01: 'Thuisplanner is nog in een besloten test. Je kunt meedoen met een uitnodiging van iemand die al meedoet.',
};

/** De uitnodigingsmail (migratie 20261023120000_uitnodigingsmail.sql). */
export const MAIL_TEKSTEN: Record<string, string> = {
  TPM01: 'Je hebt deze uitnodiging net gemaild. Over 10 minuten kan het weer; deel anders de link.',
  TPM02: 'Deze uitnodiging is al 3 keer gemaild. Deel de link, of controleer het adres en nodig opnieuw uit.',
  TPM03: 'Vandaag zijn er al veel uitnodigingen gemaild vanuit dit huishouden. Deel de link; morgen kan mailen weer.',
  TPM04: 'Deze uitnodiging is niet meer open. Maak zo nodig een nieuwe.',
};

/** Inloggen met een code (Edge Function controleer-code, K1). NETWERK is van de app zelf. */
export const CODE_TEKSTEN: Record<string, string> = {
  TPK00: 'Vul de zes cijfers uit de mail in.',
  TPK01: 'Deze code klopt niet of is verlopen. Controleer de cijfers, of vraag een nieuwe code aan.',
  TPK02: 'Er is te vaak een verkeerde code geprobeerd. Probeer het later opnieuw, of log in op een toestel waarop je al eerder hebt ingelogd.',
  TPK03: 'Inloggen met een code is tijdelijk uitgeschakeld. Probeer het later opnieuw.',
  TPK04: 'Er ging iets mis. Probeer het opnieuw.',
  TPK06: 'Bevestig eerst dat je geen robot bent, en probeer het dan opnieuw.',
  NETWERK: 'Geen verbinding. Controleer je internet en probeer het opnieuw.',
};

export const codeTekst = (code: string) => CODE_TEKSTEN[code] ?? CODE_TEKSTEN.TPK04;

// Meldingen van de overige databasefuncties zijn al in gewone taal en zonder rijgegevens (KG-5C herstelronde 2). Alleen
// die codes tonen we letterlijk, tot KG-5E ook die domeinen een eigen code geeft; al het andere (netwerk, onverwacht)
// wordt een algemene melding.
const LETTERLIJK = new Set(['P0002', '22023', '23505', '42501', '54000', '23514', '22001']);

export const ALGEMEEN = 'Dat lukte nu niet. Controleer de verbinding en probeer het opnieuw.';

export function foutTekst(fout: { code?: string; message?: string } | null | undefined): string {
  if (fout?.code && UITNODIGING_TEKSTEN[fout.code]) return UITNODIGING_TEKSTEN[fout.code];
  if (fout?.code && TOEGANG_TEKSTEN[fout.code]) return TOEGANG_TEKSTEN[fout.code];
  if (fout?.code && MAIL_TEKSTEN[fout.code]) return MAIL_TEKSTEN[fout.code];
  if (fout?.code && LETTERLIJK.has(fout.code) && fout.message) return fout.message;
  return ALGEMEEN;
}
