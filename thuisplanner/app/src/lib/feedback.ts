// "Feedback of hulp" onder Meer (docs/thuisplanner-beta-voorbereiding.md §6): één mailto-link, geen formulier en geen
// derde partij. Het adres komt uit de build (VITE_FEEDBACK_ADRES). Zolang het niet is ingevuld, of geen geldig
// e-mailadres is, verschijnt de link niet: de app verzint nooit een adres.
//
// De mail bevat alleen een onderwerp. Geen tijdstip, scherm, account of inhoud van de planner: wat de tester wil
// vertellen, schrijft die zelf.

const ADRES = /^[^@\s<>"(),;:\\[\]]+@[^@\s<>"(),;:\\[\]]+\.[a-z]{2,}$/i;

/** Het feedbackadres uit de build, of null als het ontbreekt of geen gewoon e-mailadres is. */
export function feedbackAdres(env: Record<string, string | undefined> = import.meta.env): string | null {
  const adres = env.VITE_FEEDBACK_ADRES?.trim();
  return adres && ADRES.test(adres) ? adres : null;
}

/** De mailto-link: alleen het adres en een vast onderwerp. */
export function feedbackLink(adres: string): string {
  return `mailto:${adres}?subject=${encodeURIComponent('Thuisplanner: feedback of hulp')}`;
}
