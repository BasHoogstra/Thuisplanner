// D6: de uitnodigingsmail in de app. De regels (hoogstens 3, één per 10 minuten, daglimiet, nooit dubbel) zitten in de
// database en zijn getoetst in tests/integratie/uitnodigingsmail.test.mjs; hier de teksten, de knop en het contract.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mailOpnieuw, mailStatussen, mailTekst, magOpnieuwMailen, verstuurMails, type MailStatus } from '../src/lib/lokaal/beheer';
import { foutTekst, MAIL_TEKSTEN } from '../src/lib/foutcodes';

const NU = new Date('2026-10-20T14:30:00+02:00');
const m = (o: Partial<MailStatus>): MailStatus => ({ nummer: 1, status: 'verstuurd', verstuurd: null, opnieuwVanaf: null, ...o });

describe('uitnodigingsmail', () => {
  it('een tekst voor elke stand, zonder technische woorden; delen via de link blijft genoemd waar de mail niet zeker aankwam', () => {
    expect(mailTekst(m({ verstuurd: '2026-10-20T14:02:00+02:00' }), NU)).toBe('Mail verstuurd om 14:02.');
    expect(mailTekst(m({ verstuurd: '2026-10-18T09:05:00+02:00' }), NU)).toBe('Mail verstuurd om 18 oktober om 09:05.');
    for (const s of ['onzeker', 'mislukt', 'daglimiet'] as const) expect(mailTekst(m({ status: s }), NU)).toMatch(/deel de link/i);
    expect(mailTekst(m({ status: 'niet_bezorgd' }), NU)).toBe('Mail niet bezorgd: controleer het adres.');
    expect(mailTekst(m({ status: 'wacht' }), NU)).toMatch(/opnieuw/);
    for (const s of ['wacht', 'bezig', 'verstuurd', 'onzeker', 'mislukt', 'niet_bezorgd', 'daglimiet'] as const) {
      expect(mailTekst(m({ status: s }), NU)).not.toMatch(/TPM|error|null|undefined|bounce/i);
    }
  });
  it('"Mail nog eens sturen" alleen als het mag: niet tijdens versturen, niet binnen 10 minuten, niet na 3 mails', () => {
    expect(magOpnieuwMailen(m({ opnieuwVanaf: '2026-10-20T14:12:00+02:00' }), NU)).toBe(true);
    expect(magOpnieuwMailen(m({ opnieuwVanaf: '2026-10-20T14:35:00+02:00' }), NU)).toBe(false);
    expect(magOpnieuwMailen(m({ status: 'wacht' }), NU)).toBe(false);
    expect(magOpnieuwMailen(m({ status: 'bezig' }), NU)).toBe(false);
    expect(magOpnieuwMailen(m({ nummer: 3 }), NU)).toBe(false);
    expect(magOpnieuwMailen(m({ status: 'niet_bezorgd' }), NU)).toBe(true);
  });
  it('de app roept de database en de functie aan met alleen het huishouden of de uitnodiging; fouten worden teksten', async () => {
    const aanroepen: unknown[] = [];
    const c = {
      rpc: async (naam: string, args: unknown) => {
        aanroepen.push([naam, args]);
        if (naam === 'uitnodigingsmail_opnieuw') return { data: null, error: { code: 'TPM01', message: 'Wacht 10 minuten' } };
        return { data: [{ invite_id: 'i1', nummer: 2, status: 'verstuurd', verstuurd: 'x', opnieuw_vanaf: 'y' }], error: null };
      },
      functions: { invoke: async (naam: string, o: unknown) => { aanroepen.push([naam, o]); throw new Error('offline'); } },
    } as unknown as SupabaseClient;
    expect((await mailStatussen(c, 'h1')).get('i1')).toEqual({ nummer: 2, status: 'verstuurd', verstuurd: 'x', opnieuwVanaf: 'y' });
    await expect(verstuurMails(c, 'h1')).resolves.toBeUndefined();   // geen netwerk: geen fout, volgende keer opnieuw
    expect(await mailOpnieuw(c, 'i1')).toEqual({ ok: false, fout: MAIL_TEKSTEN.TPM01 });
    expect(aanroepen).toEqual([
      ['uitnodigingsmails', { p_household: 'h1' }],
      ['stuur-uitnodiging', { body: { huishouden: 'h1' } }],
      ['uitnodigingsmail_opnieuw', { p_invite: 'i1' }],
    ]);
  });
  it('contract: precies de TPM-codes uit de migraties hebben een tekst, en de tekst van de database komt nooit op het scherm', () => {
    const map = path.resolve(__dirname, '../../supabase/migrations');
    const sql = readdirSync(map).filter(f => f.endsWith('.sql')).map(f => readFileSync(path.join(map, f), 'utf8')).join('\n');
    expect([...new Set([...sql.matchAll(/errcode = '(TPM\d\d)'/g)].map(x => x[1]))].sort()).toEqual(Object.keys(MAIL_TEKSTEN).sort());
    expect(foutTekst({ code: 'TPM03', message: 'Daglimiet voor uitnodigingsmails bereikt' })).toBe(MAIL_TEKSTEN.TPM03);
  });
});
