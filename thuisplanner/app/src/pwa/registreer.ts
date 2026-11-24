// De service worker registreren (PWA-basis, PR P0; bouwvoorstel besluit 20 §5.3). Zie public/sw.js: hij handelt
// alleen push en notificationclick af, zonder fetch-handler en zonder cache (besluit 17).
//
// - Alleen in een productiebuild (`vite build`, ook staging); de ontwikkelserver en de tests registreren niets.
// - Alleen op een veilige pagina (https, of localhost/127.0.0.1 voor `vite preview` en de e2e-tests). Het losse
//   bestand (file://) en een afgeschermd frame slaan het stil over.
// - Een vast pad naast index.html (`./sw.js`, base './' in vite.config.ts) met scope './': op staging en productie
//   staat de app in de root, dus de scope is de hele app. Hashroutes (#/agenda) vallen daar altijd onder.
// - updateViaCache 'none': de browser haalt sw.js altijd vers op (Cloudflare krijgt daarnaast no-cache in _headers).
// Registreren vraagt geen toestemming en toont niets: meldingen vragen gebeurt pas als iemand ze zelf aanzet
// (besluit 16).

export const SW_PAD = 'sw.js';

export interface RegistratieOmgeving {
  prod: boolean;
  basis: string;
  venster: Pick<Window, 'isSecureContext' | 'location'> & { navigator: Pick<Navigator, 'serviceWorker'> | Navigator };
}

/** Mag deze pagina een service worker registreren? */
export function magRegistreren({ prod, venster }: Pick<RegistratieOmgeving, 'prod' | 'venster'>): boolean {
  if (!prod) return false;
  if (!venster.isSecureContext) return false;
  if (!/^https?:$/.test(venster.location.protocol)) return false;
  try {
    return 'serviceWorker' in venster.navigator && !!venster.navigator.serviceWorker;
  } catch {
    return false;   // een afgeschermd frame gooit al bij het lezen van navigator.serviceWorker
  }
}

/** Registreert ./sw.js met scope ./ (relatief aan de basis van de build). Fouten blijven stil op dit toestel. */
export async function registreerServiceWorker(omg: RegistratieOmgeving): Promise<ServiceWorkerRegistration | null> {
  if (!magRegistreren(omg)) return null;
  try {
    return await omg.venster.navigator.serviceWorker.register(omg.basis + SW_PAD, { scope: omg.basis, updateViaCache: 'none' });
  } catch (fout) {
    // Alleen in de console van dit toestel; de app werkt zonder service worker gewoon door (dan geen meldingen).
    console.warn('Thuisplanner: de service worker kon niet worden geregistreerd', fout);
    return null;
  }
}

/** Voor main.tsx: na het laden van de pagina, zodat het opstarten van de app voorgaat. */
export function registreerNaLaden(): void {
  const omg: RegistratieOmgeving = { prod: import.meta.env.PROD, basis: import.meta.env.BASE_URL, venster: window };
  if (!magRegistreren(omg)) return;
  if (document.readyState === 'complete') void registreerServiceWorker(omg);
  else window.addEventListener('load', () => void registreerServiceWorker(omg), { once: true });
}
