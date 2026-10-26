// Turnstile op het codescherm (staging, 25 oktober 2026): een token werkt één keer. Na elke poging moet er een nieuwe
// widget komen (dus een nieuw token), na een fout wordt hij zichtbaar, en zolang er geen token is kan de gebruiker altijd
// "Opnieuw controleren". Aanleiding: na "Gelukt!" verdween de widget, Supabase weigerde het token (captcha_failed), en
// daarna was er geen manier meer om opnieuw te controleren zonder de pagina te herladen.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CodeInloggen } from '../src/components/CodeInloggen';
import type { LokaleConfig, Sessie } from '../src/lib/lokaal/sessie';

const CONFIG = { omgeving: 'staging', url: 'https://abcdefghijklmnopqrst.supabase.co', anonKey: 'anon', accounts: [], turnstile: '0x4AAAAAAAAAAAAAAAAAAAAA' } as LokaleConfig;

// Nagebootste Turnstile: elke render krijgt een eigen id; de test laat een widget een token, een fout of een verloop geven.
interface Widget { id: string; opties: Record<string, (...a: unknown[]) => void> & { appearance?: string }; weg: boolean }
let widgets: Widget[] = [];
beforeEach(() => {
  widgets = [];
  sessionStorage.clear(); localStorage.clear();
  window.turnstile = {
    render: (_el: HTMLElement, opties: Record<string, unknown>) => {
      const w = { id: 'w' + (widgets.length + 1), opties: opties as Widget['opties'], weg: false };
      widgets.push(w);
      return w.id;
    },
    remove: (id: string) => { const w = widgets.find(x => x.id === id); if (w) w.weg = true; },
  };
});
afterEach(() => { delete window.turnstile; });

const actief = () => widgets.filter(w => !w.weg);
const laatste = () => actief().at(-1)!;
async function geefToken(t: string) { await act(async () => { laatste().opties.callback(t); }); }

function nepSessie(extra: Record<string, unknown> = {}) {
  return { config: CONFIG, vraagCode: vi.fn(async () => ({ ok: true, waarde: undefined })), controleerCode: vi.fn(async () => ({ ok: true, waarde: undefined })),
    uitloggen: vi.fn(), leesNaam: async () => null, bewaarNaam: async () => {}, ...extra } as unknown as Sessie;
}
async function vulAdres() {
  fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'joris@example.com' } });
}
const knopOpnieuw = () => screen.queryByRole('button', { name: 'Opnieuw controleren' });

describe('Turnstile op het codescherm', () => {
  it('het token gaat mee met "Stuur code"; na een geweigerd token komt er een nieuwe widget en kan de gebruiker opnieuw', async () => {
    const s = nepSessie({ vraagCode: vi.fn()
      .mockResolvedValueOnce({ ok: false, fout: 'Bevestig eerst dat je geen robot bent, en probeer het dan opnieuw.' })
      .mockResolvedValueOnce({ ok: true, waarde: undefined }) });
    render(<CodeInloggen sessie={s} />);
    await act(async () => {});
    expect(actief()).toHaveLength(1);
    await vulAdres();
    await geefToken('token-1');
    expect(knopOpnieuw()).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stuur code' })); });
    expect(s.vraagCode).toHaveBeenNthCalledWith(1, 'joris@example.com', 'token-1');
    // Geweigerd: de oude widget is weg, er staat een nieuwe, en zonder token is "Opnieuw controleren" er.
    expect(widgets[0].weg).toBe(true);
    expect(actief()).toHaveLength(1);
    expect(laatste().id).not.toBe('w1');
    expect(knopOpnieuw()).toBeTruthy();
    // Het oude token gaat nooit nog eens mee: zonder nieuw token de lokale melding, en geen aanvraag.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stuur code' })); });
    expect(s.vraagCode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe('Bevestig eerst dat je geen robot bent.');
    // Met een nieuw token wel, en dan verdwijnt de knop.
    await geefToken('token-2');
    expect(knopOpnieuw()).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stuur code' })); });
    expect(s.vraagCode).toHaveBeenNthCalledWith(2, 'joris@example.com', 'token-2');
    expect(screen.getByLabelText('Code uit de mail')).toBeTruthy();
  });

  it('"Opnieuw controleren" start een nieuwe, zichtbare widget, ook als de widget zichzelf verborg', async () => {
    render(<CodeInloggen sessie={nepSessie()} />);
    await act(async () => {});
    await vulAdres();
    // Geen token (de widget verborg zich na "Gelukt!", of het token verliep): de lokale melding en de knop.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stuur code' })); });
    expect(knopOpnieuw()).toBeTruthy();
    await act(async () => { fireEvent.click(knopOpnieuw()!); });
    expect(widgets[0].weg).toBe(true);
    expect(laatste().opties.appearance).toBe('always');
    await geefToken('token-na-opnieuw');
    expect(knopOpnieuw()).toBeNull();
  });

  it('een fout van Turnstile: de widget wordt zichtbaar, met uitleg en de knop', async () => {
    render(<CodeInloggen sessie={nepSessie()} />);
    await act(async () => {});
    expect(laatste().opties.appearance).toBe('interaction-only');
    await act(async () => { laatste().opties['error-callback'](); });
    expect(laatste().opties.appearance).toBe('always');
    expect(screen.getByRole('status').textContent).toMatch(/De controle lukte niet/);
    expect(knopOpnieuw()).toBeTruthy();
  });

  it('een verlopen token telt niet: "Stuur code" vraagt dan eerst een nieuwe controle', async () => {
    const s = nepSessie();
    render(<CodeInloggen sessie={s} />);
    await act(async () => {});
    await vulAdres();
    await geefToken('token-oud');
    await act(async () => { laatste().opties['expired-callback'](); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stuur code' })); });
    expect(s.vraagCode).not.toHaveBeenCalled();
    expect(knopOpnieuw()).toBeTruthy();
  });

  it('na een gelukte aanvraag: een nieuwe widget voor het codescherm, zonder knop; na een foute code weer een nieuwe', async () => {
    const s = nepSessie({ controleerCode: vi.fn(async () => ({ ok: false, fout: 'De code klopt niet.', code: 'TPK01' })) });
    render(<CodeInloggen sessie={s} />);
    await act(async () => {});
    await vulAdres();
    await geefToken('token-aanvraag');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stuur code' })); });
    expect(widgets[0].weg).toBe(true);
    expect(actief()).toHaveLength(1);
    expect(knopOpnieuw()).toBeNull();
    await geefToken('token-controle');
    await act(async () => { fireEvent.change(screen.getByLabelText('Code uit de mail'), { target: { value: '000000' } }); });
    expect(s.controleerCode).toHaveBeenCalledWith('joris@example.com', '000000', 'token-controle');
    // Het token is bij de controle gebruikt: een nieuwe widget, en de knop zolang er geen nieuw token is.
    expect(actief()).toHaveLength(1);
    expect(laatste().id).not.toBe(widgets[1].id);
    expect(knopOpnieuw()).toBeTruthy();
  });
});
