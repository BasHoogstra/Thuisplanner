// De pushproefpagina (PR P0, src/pwa/PushProef.tsx) en de ingang achter de vlag (src/pwa/MetPushproef.tsx).
// De browser-API's (service worker, Push, Notification, klembord) zijn nagebootst; de sleutel wordt per testrun in het
// geheugen gemaakt.
import { createECDH } from 'node:crypto';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetPushproef } from '../src/pwa/MetPushproef';
import { PushProef } from '../src/pwa/PushProef';
import type { PushStand } from '../src/pwa/push';

const e = createECDH('prime256v1');
e.generateKeys();
const SLEUTEL = e.getPublicKey().toString('base64url');
const ABONNEMENT = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', expirationTime: null, keys: { p256dh: 'BPx', auth: 'xyz' } };

function opzet({ stand = {} as Partial<PushStand>, abonnement = null as null | object, registratie = true } = {}) {
  let huidig: PushStand = { toestemming: 'default', standalone: true, pushOndersteund: true, ios: false, ...stand };
  const unsubscribe = vi.fn(async () => true);
  const maakAbonnement = (a: object) => ({ toJSON: () => a, unsubscribe }) as unknown as PushSubscription;
  const subscribe = vi.fn(async () => maakAbonnement(ABONNEMENT));
  const showNotification = vi.fn(async () => undefined);
  const reg = { pushManager: { subscribe, getSubscription: vi.fn(async () => (abonnement ? maakAbonnement(abonnement) : null)) }, showNotification };
  const serviceWorker = { getRegistration: vi.fn(async () => (registratie ? reg : undefined)) } as never;
  const vraagToestemming = vi.fn(async () => { huidig = { ...huidig, toestemming: 'granted' }; return 'granted' as const; });
  const kopieer = vi.fn(async () => undefined);
  const props = { sleutel: SLEUTEL, stand: () => huidig, serviceWorker, vraagToestemming, kopieer };
  return { props, subscribe, showNotification, vraagToestemming, kopieer, unsubscribe };
}

afterEach(() => { window.location.hash = ''; });

describe('pushproefpagina', () => {
  it('toont de stand van het toestel', async () => {
    const { props } = opzet();
    render(<PushProef {...props} />);
    expect(screen.getByRole('heading', { name: 'Pushproef' })).toBeInTheDocument();
    const stand = within(document.querySelector<HTMLElement>('dl.pushproef-stand')!);
    expect(stand.getByText('Nog niet gevraagd')).toBeInTheDocument();
    expect(stand.getByText('App op het beginscherm')).toBeInTheDocument();
    expect(await stand.findByText('Actief')).toBeInTheDocument();
    expect(stand.getByText('Aanwezig')).toBeInTheDocument();
  });

  it('eerst een eigen uitleg; pas na "Doorgaan" de vraag van het systeem', async () => {
    const { props, vraagToestemming } = opzet();
    render(<PushProef {...props} />);
    await userEvent.click(screen.getByRole('button', { name: '1. Meldingen aanzetten' }));
    expect(screen.getByRole('heading', { name: 'Eerst even uitleg' })).toBeInTheDocument();
    expect(vraagToestemming).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Niet nu' }));
    expect(vraagToestemming).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '1. Meldingen aanzetten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Doorgaan' }));
    expect(vraagToestemming).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('Meldingen staan aan op dit toestel.');
    expect(screen.getByText('Toegestaan')).toBeInTheDocument();
  });

  it('maakt een abonnement met de publieke sleutel uit de build, en toont en kopieert het als JSON', async () => {
    const { props, subscribe, kopieer } = opzet({ stand: { toestemming: 'granted' } });
    render(<PushProef {...props} />);
    await screen.findByText('Actief');
    await userEvent.click(screen.getByRole('button', { name: '2. Abonnement maken' }));
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    const sleutel = (subscribe.mock.calls[0] as unknown as [{ applicationServerKey: Uint8Array }])[0].applicationServerKey;
    expect(Buffer.from(sleutel).toString('base64url')).toBe(SLEUTEL);
    const veld = screen.getByLabelText('Abonnement als JSON') as HTMLTextAreaElement;
    expect(JSON.parse(veld.value)).toEqual(ABONNEMENT);
    await userEvent.click(screen.getByRole('button', { name: 'Kopiëren' }));
    expect(kopieer).toHaveBeenCalledWith(JSON.stringify(ABONNEMENT, null, 2));
    expect(screen.getByRole('status')).toHaveTextContent('Gekopieerd.');
  });

  it('een bestaand abonnement staat er meteen; opzeggen en een lokale testmelding kunnen', async () => {
    const { props, unsubscribe, showNotification } = opzet({ stand: { toestemming: 'granted' }, abonnement: ABONNEMENT });
    render(<PushProef {...props} />);
    expect(await screen.findByLabelText('Abonnement als JSON')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lokale testmelding' }));
    expect(showNotification).toHaveBeenCalledWith('Thuisplanner', expect.objectContaining({ body: 'Lokale testmelding van dit toestel.' }));
    await userEvent.click(screen.getByRole('button', { name: 'Opzeggen' }));
    expect(unsubscribe).toHaveBeenCalled();
    expect(screen.queryByLabelText('Abonnement als JSON')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. Abonnement maken' })).toBeEnabled();
  });

  it('zonder (geldige) sleutel of service worker kan er geen abonnement worden gemaakt', async () => {
    const zonder = opzet({ stand: { toestemming: 'granted' } });
    const { unmount } = render(<PushProef {...zonder.props} sleutel="" />);
    await screen.findByText('Actief');
    expect(screen.getByText('Ontbreekt in deze build')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. Abonnement maken' })).toBeDisabled();
    unmount();
    const geenSw = opzet({ stand: { toestemming: 'granted' }, registratie: false });
    render(<PushProef {...geenSw.props} />);
    expect(await screen.findByText(/De service worker is niet actief/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. Abonnement maken' })).toBeDisabled();
  });

  it('iPhone in Safari (niet op het beginscherm): uitleg hoe je de app op het beginscherm zet', async () => {
    const { props } = opzet({ stand: { ios: true, standalone: false, toestemming: 'niet-ondersteund', pushOndersteund: false } });
    render(<PushProef {...props} />);
    await screen.findByText('Actief');
    expect(screen.getByText(/alleen in de app op het beginscherm \(iOS 16\.4 of nieuwer\)/)).toBeInTheDocument();
    expect(screen.getByText('Zet op beginscherm')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1. Meldingen aanzetten' })).not.toBeInTheDocument();
  });

  it('een fout van de browser komt in beeld, zonder dat de pagina vastloopt', async () => {
    const o = opzet({ stand: { toestemming: 'granted' } });
    o.subscribe.mockRejectedValueOnce(new DOMException('Registration failed - push service not available', 'AbortError'));
    render(<PushProef {...o.props} />);
    await screen.findByText('Actief');
    await userEvent.click(screen.getByRole('button', { name: '2. Abonnement maken' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Dat lukte niet (AbortError): Registration failed - push service not available');
  });
});

describe('de ingang achter de vlag', () => {
  it('zonder VITE_PUSHPROEF: alleen de app, geen regel en geen proefpagina (ook niet op #/pushproef)', () => {
    window.location.hash = '#/pushproef';
    render(<MetPushproef aan={false}><p>De app</p></MetPushproef>);
    expect(screen.getByText('De app')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pushproef' })).not.toBeInTheDocument();
  });

  it('met de vlag: een kleine regel boven de app, en #/pushproef toont de proef in plaats van de app', async () => {
    render(<MetPushproef aan><p>De app</p></MetPushproef>);
    expect(screen.getByText('De app')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pushproef' })).toHaveAttribute('href', '#/pushproef');
    await act(async () => {
      const oud = window.location.href;
      window.location.hash = '#/pushproef';
      window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: oud, newURL: window.location.href }));
    });
    expect(await screen.findByRole('heading', { name: 'Pushproef' })).toBeInTheDocument();
    expect(screen.queryByText('De app')).not.toBeInTheDocument();
    await act(async () => {
      const oud = window.location.href;
      window.location.hash = '#/vandaag';
      window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: oud, newURL: window.location.href }));
    });
    expect(screen.getByText('De app')).toBeInTheDocument();
  });
});
