// Herstelronde (review): een adreswijziging moet na TPK06 ("eerst een captcha") verder kunnen, met een vers Turnstile-token,
// voor het oude én het nieuwe adres. Een token werkt één keer: na elke poging een nieuwe widget en nooit een oud token.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Account } from '../src/components/Account';
import { Ctx, type AppContext } from '../src/lib/context';

interface Widget { id: string; el: HTMLElement; opties: Record<string, (...a: unknown[]) => void>; weg: boolean }
let widgets: Widget[] = [];
beforeEach(() => {
  widgets = [];
  window.turnstile = {
    render: (el: HTMLElement, opties: Record<string, unknown>) => {
      const w = { id: 'w' + (widgets.length + 1), el, opties: opties as Widget['opties'], weg: false };
      widgets.push(w);
      return w.id;
    },
    remove: (id: string) => { const w = widgets.find(x => x.id === id); if (w) w.weg = true; },
  };
});
afterEach(() => { delete window.turnstile; });

const actief = () => widgets.filter(w => !w.weg);
const TPK06 = { ok: false as const, code: 'TPK06', fout: 'Bevestig eerst dat je geen robot bent, en probeer het dan opnieuw.' };
const TPK01 = { ok: false as const, code: 'TPK01', fout: 'Deze code klopt niet of is verlopen.' };

function toon(bevestigAdres: ReturnType<typeof vi.fn>, captchaSitekey: string | null = '0x4AAAAAAAAAAAAAAAAAAAAA') {
  const waarde = { lokaal: {
    account: 'oud@example.com', onbevestigdOpToestel: 0, nakijken: () => {}, uitloggen: async () => {},
    accountBeheer: { uitloggenOveral: async () => {}, wijzigAdres: async () => ({ ok: true, waarde: undefined }), bevestigAdres,
      wijziging: { nieuw: 'nieuw@example.com' }, captchaSitekey },
  } } as unknown as AppContext;
  return render(<Ctx.Provider value={waarde}><Account /></Ctx.Provider>);
}
const blokVan = (welk: 'oud' | 'nieuw') => screen.getByLabelText(`Code naar ${welk === 'oud' ? 'oud@example.com' : 'nieuw@example.com'}`).closest('.blok') as HTMLElement;
const vul = (welk: 'oud' | 'nieuw', code: string) => fireEvent.change(within(blokVan(welk)).getByRole('textbox'), { target: { value: code } });
const klik = async (welk: 'oud' | 'nieuw') => { await act(async () => { fireEvent.click(within(blokVan(welk)).getByRole('button', { name: 'Bevestigen' })); }); };
const widgetIn = (welk: 'oud' | 'nieuw') => actief().filter(w => blokVan(welk).contains(w.el));
const geefToken = async (welk: 'oud' | 'nieuw', t: string) => { await act(async () => { widgetIn(welk).at(-1)!.opties.callback(t); }); };

describe('adreswijziging na TPK06', () => {
  it('nieuw adres: TPK06 toont een captcha bij dat adres; elke poging een vers token; daarna lukt het', async () => {
    const bevestig = vi.fn()
      .mockResolvedValueOnce(TPK06)                                  // 1: zonder token
      .mockResolvedValueOnce(TPK01)                                  // 2: met token-1, maar een foute code
      .mockResolvedValueOnce({ ok: true, waarde: 'nog-een' });       // 3: met token-2
    toon(bevestig);
    await act(async () => {});
    expect(actief()).toHaveLength(0);                                // nog geen captcha nodig
    vul('nieuw', '111111');
    await klik('nieuw');
    expect(bevestig).toHaveBeenNthCalledWith(1, 'nieuw@example.com', '111111', null);
    expect(widgetIn('nieuw')).toHaveLength(1);
    expect(widgetIn('oud')).toHaveLength(0);                         // alleen bij het adres dat TPK06 kreeg
    await geefToken('nieuw', 'token-1');
    vul('nieuw', '222222');
    await klik('nieuw');
    expect(bevestig).toHaveBeenNthCalledWith(2, 'nieuw@example.com', '222222', 'token-1');
    expect(widgets[0].weg).toBe(true);                               // verbruikt: nieuwe widget
    expect(widgetIn('nieuw')).toHaveLength(1);
    // Zonder nieuw token: een melding en geen poging (het oude token gaat nooit nog eens mee).
    await klik('nieuw');
    expect(bevestig).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert').textContent).toMatch(/geen robot/);
    await geefToken('nieuw', 'token-2');
    await klik('nieuw');
    expect(bevestig).toHaveBeenNthCalledWith(3, 'nieuw@example.com', '222222', 'token-2');
    expect(within(blokVan('nieuw')).getByText('Bevestigd.')).toBeTruthy();
  });

  it('oud adres: ook daar herstel met een vers token; samen met het nieuwe adres is het adres gewijzigd', async () => {
    const bevestig = vi.fn(async (adres: string, _code: string, token?: string | null) => {
      if (adres === 'nieuw@example.com') return { ok: true, waarde: 'nog-een' };
      return token ? { ok: true, waarde: 'gewijzigd' } : TPK06;
    });
    toon(bevestig);
    await act(async () => {});
    vul('nieuw', '333333');
    await klik('nieuw');
    vul('oud', '444444');
    await klik('oud');
    expect(bevestig).toHaveBeenLastCalledWith('oud@example.com', '444444', null);
    expect(widgetIn('oud')).toHaveLength(1);
    await geefToken('oud', 'token-oud');
    await klik('oud');
    expect(bevestig).toHaveBeenLastCalledWith('oud@example.com', '444444', 'token-oud');
    expect(screen.getByRole('status').textContent).toMatch(/gewijzigd/);
  });

  it('zonder sitekey (lokaal) geen widget en geen blokkade; de melding van de server blijft zichtbaar', async () => {
    const bevestig = vi.fn().mockResolvedValue(TPK06);
    toon(bevestig, null);
    await act(async () => {});
    vul('nieuw', '555555');
    await klik('nieuw');
    await klik('nieuw');
    expect(actief()).toHaveLength(0);
    expect(bevestig).toHaveBeenCalledTimes(2);
    expect(bevestig).toHaveBeenLastCalledWith('nieuw@example.com', '555555', null);
  });
});
