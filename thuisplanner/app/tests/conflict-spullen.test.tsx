// Tweede review PR #54: gerichte conflictregressies voor de formulieren van Mijn spullen & Documenten. Een venster bewaart
// met de versie van het moment waarop het openging; bij een versieconflict blijft het open met je invoer en een uitleg, en
// opnieuw opslaan gebruikt de versie die dan bekend is (zoals taken, afspraken en plannen in conflict-venster.test.tsx).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { DocumentVenster, SpulVenster } from '../src/components/SpullenVensters';
import { Ctx, type AppContext } from '../src/lib/context';
import { SpullenCtx, type SpullenContext } from '../src/lib/spullen/opslag';
import type { Document, Spul } from '../src/lib/spullen/types';

const EVA = 'm-eva';
const leden = [{ id: EVA, naam: 'Eva', soort: 'volwassene', kleur: 'red', heeftAccount: true }];
const spul = (s: Partial<Spul> = {}): Spul => ({ id: 's1', naam: 'Vaatwasser', zichtbaarheid: 'gedeeld', eigenaar: EVA, versie: 3, ...s });
const doc = (d: Partial<Document> = {}): Document => ({ id: 'd1', titel: 'Factuur vaatwasser', soort: 'factuur', zichtbaarheid: 'gedeeld',
  eigenaar: EVA, upload: 'klaar', type: 'application/pdf', grootte: 10, bestand: { soort: 'opslag', pad: 'h/d1/origineel' }, versie: 7, ...d });

const app = {
  staat: { items: [], vakanties: [], pakitems: [], paklijsten: [], koppelingen: [], plannen: [], onderdelen: [], planKoppelingen: [], weggeklikt: new Set(), melding: null },
  huishouden: { naam: 'Gezin', ik: EVA, leden }, vandaag: '2026-11-13', nu: '09:00', uur: 9, lid: (id: string) => leden.find(l => l.id === id), meld: vi.fn(),
} as unknown as AppContext;

function opslag(extra: Partial<SpullenContext>, spullen: Spul[] = [], documenten: Document[] = []): SpullenContext {
  return { soort: 'echt', ik: EVA, gegevens: { spullen, documenten, koppelingen: [] }, startInvoer: vi.fn(), ...extra } as unknown as SpullenContext;
}
const omhul = (sp: SpullenContext, kind: ReactNode) => <Ctx.Provider value={app}><SpullenCtx.Provider value={sp}>{kind}</SpullenCtx.Provider></Ctx.Provider>;
const d = () => within(screen.getByRole('dialog'));

describe('spul aanpassen', () => {
  it('conflict: het venster blijft open met je invoer; opnieuw opslaan gebruikt de versie die nu bekend is', async () => {
    const spulBewaren = vi.fn().mockRejectedValueOnce(new Error('conflict')).mockResolvedValueOnce('s1');
    const sluit = vi.fn();
    const { rerender } = render(omhul(opslag({ spulBewaren }, [spul()]), <SpulVenster bestaand={spul()} sluit={sluit} />));
    const user = userEvent.setup();
    const naam = d().getByRole('textbox', { name: /naam/i });
    await user.clear(naam);
    await user.type(naam, 'Vaatwasser keuken');
    await user.click(d().getByRole('button', { name: 'Opslaan' }));
    expect(spulBewaren.mock.calls[0][0]).toMatchObject({ id: 's1', naam: 'Vaatwasser keuken', versie: 3 });
    expect(sluit).not.toHaveBeenCalled();
    expect(d().getByRole('alert')).toHaveTextContent('Iemand anders heeft dit net aangepast');
    // De partner bewaarde intussen versie 4; het venster krijgt die binnen, je invoer blijft staan.
    const nieuw = spul({ naam: 'Vaatwasser (Bosch)', versie: 4 });
    rerender(omhul(opslag({ spulBewaren }, [nieuw]), <SpulVenster bestaand={nieuw} sluit={sluit} />));
    expect(d().getByRole('textbox', { name: /naam/i })).toHaveValue('Vaatwasser keuken');
    await user.click(d().getByRole('button', { name: 'Opslaan' }));
    expect(spulBewaren.mock.calls[1][0]).toMatchObject({ naam: 'Vaatwasser keuken', versie: 4 });
    expect(sluit).toHaveBeenCalled();
  });

  it('tegenproef: een nieuwere versie bij openen-en-opslaan zonder conflict verandert de versie van het openen niet', async () => {
    const spulBewaren = vi.fn().mockResolvedValue('s1');
    const sluit = vi.fn();
    const { rerender } = render(omhul(opslag({ spulBewaren }, [spul()]), <SpulVenster bestaand={spul()} sluit={sluit} />));
    const nieuw = spul({ versie: 9 });
    rerender(omhul(opslag({ spulBewaren }, [nieuw]), <SpulVenster bestaand={nieuw} sluit={sluit} />));
    await userEvent.setup().click(d().getByRole('button', { name: 'Opslaan' }));
    expect(spulBewaren.mock.calls[0][0]).toMatchObject({ versie: 3 });
    expect(sluit).toHaveBeenCalled();
  });
});

describe('document aanpassen', () => {
  it('conflict: het venster blijft open met je titel en zichtbaarheid; opnieuw opslaan gebruikt de nieuwe versie', async () => {
    const documentBijwerken = vi.fn().mockResolvedValueOnce('conflict').mockResolvedValueOnce('ok');
    const sluit = vi.fn();
    const { rerender } = render(omhul(opslag({ documentBijwerken }, [], [doc()]), <DocumentVenster bestaand={doc()} sluit={sluit} magZichtbaarheid />));
    const user = userEvent.setup();
    const titel = d().getByRole('textbox', { name: 'Titel' });
    await user.clear(titel);
    await user.type(titel, 'Factuur vaatwasser 2026');
    await user.click(d().getByRole('button', { name: 'Alleen ik' }));
    await user.click(d().getByRole('button', { name: 'Opslaan' }));
    expect(documentBijwerken.mock.calls[0][0]).toMatchObject({ titel: 'Factuur vaatwasser 2026', zichtbaarheid: 'persoonlijk', versie: 7 });
    expect(sluit).not.toHaveBeenCalled();
    expect(d().getByRole('alert')).toHaveTextContent('Iemand anders heeft dit net aangepast');
    const nieuw = doc({ titel: 'Factuur (partner)', versie: 8 });
    rerender(omhul(opslag({ documentBijwerken }, [], [nieuw]), <DocumentVenster bestaand={nieuw} sluit={sluit} magZichtbaarheid />));
    expect(d().getByRole('textbox', { name: 'Titel' })).toHaveValue('Factuur vaatwasser 2026');
    await user.click(d().getByRole('button', { name: 'Opslaan' }));
    expect(documentBijwerken.mock.calls[1][0]).toMatchObject({ titel: 'Factuur vaatwasser 2026', zichtbaarheid: 'persoonlijk', versie: 8 });
    expect(sluit).toHaveBeenCalled();
  });

  it('tegenproef: zonder conflict sluit het venster, met de versie van het openen', async () => {
    const documentBijwerken = vi.fn().mockResolvedValue('ok');
    const sluit = vi.fn();
    const { rerender } = render(omhul(opslag({ documentBijwerken }, [], [doc()]), <DocumentVenster bestaand={doc()} sluit={sluit} magZichtbaarheid />));
    const nieuw = doc({ versie: 12 });
    rerender(omhul(opslag({ documentBijwerken }, [], [nieuw]), <DocumentVenster bestaand={nieuw} sluit={sluit} magZichtbaarheid />));
    await userEvent.setup().click(d().getByRole('button', { name: 'Opslaan' }));
    expect(documentBijwerken.mock.calls[0][0]).toMatchObject({ versie: 7 });
    expect(sluit).toHaveBeenCalled();
  });
});
