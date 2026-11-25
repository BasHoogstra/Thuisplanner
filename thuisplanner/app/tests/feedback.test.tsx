// "Feedback of hulp" onder Meer (docs/thuisplanner-beta-voorbereiding.md §6): een mailto-link naar het adres uit de
// build (VITE_FEEDBACK_ADRES), geen formulier en geen derde partij. Zonder (geldig) adres verschijnt er niets.
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { App } from '../src/App';
import { feedbackAdres, feedbackLink } from '../src/lib/feedback';
import { FeedbackRij } from '../src/screens/Meer';

// Alleen voor de test: een adres op een domein dat nooit bestaat (.invalid), nooit een echt adres.
const PROEF = 'hulp@thuisplanner.invalid';
const naar = (hash: string) => window.history.replaceState(null, '', `/?nu=2026-10-21T10:00${hash}`);
afterEach(() => vi.unstubAllEnvs());

it('het adres komt alleen uit de build, en alleen als het een gewoon e-mailadres is', () => {
  expect(feedbackAdres({})).toBeNull();
  expect(feedbackAdres({ VITE_FEEDBACK_ADRES: '' })).toBeNull();
  expect(feedbackAdres({ VITE_FEEDBACK_ADRES: '   ' })).toBeNull();
  // Geen adres, of een poging om extra ontvangers, kopjes of een andere link in de mailto te smokkelen.
  for (const fout of ['geen-adres', 'a@b', 'a@b.c', 'x@y.nl?bcc=z@y.nl', 'x@y.nl,z@y.nl', 'x@y.nl;z@y.nl', '<x@y.nl>',
    'x y@z.nl', 'javascript:alert(1)//@x.nl', 'x@y.nl\nBcc: z@y.nl']) {
    expect(feedbackAdres({ VITE_FEEDBACK_ADRES: fout }), fout).toBeNull();
  }
  expect(feedbackAdres({ VITE_FEEDBACK_ADRES: ` ${PROEF} ` })).toBe(PROEF);
});

it('de link: alleen het adres en een vast onderwerp; geen tijdstip, scherm, account of inhoud', () => {
  const href = feedbackLink(PROEF);
  expect(href).toBe(`mailto:${PROEF}?subject=Thuisplanner%3A%20feedback%20of%20hulp`);
  expect(href).not.toMatch(/body=|cc=|bcc=/i);
});

it('zonder ingesteld adres staat er niets: geen rij, geen lege link', () => {
  const { container } = render(<FeedbackRij env={{}} />);
  expect(container).toBeEmptyDOMElement();
});

it('met een adres: één rij "Feedback of hulp" die het mailprogramma opent', () => {
  render(<FeedbackRij env={{ VITE_FEEDBACK_ADRES: PROEF }} />);
  const link = screen.getByRole('link', { name: `Feedback of hulp: mail ${PROEF}` });
  expect(link).toHaveAttribute('href', feedbackLink(PROEF));
  expect(link).not.toHaveAttribute('target');
  expect(document.querySelector('form, input, iframe, script')).toBeNull();
});

it('in de app onder Meer: zichtbaar met een adres in de build, weg zonder', () => {
  // Zonder adres (zoals de tests en de demo nu draaien).
  naar('#/meer');
  const { unmount } = render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: 'Meer' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Feedback of hulp/ })).not.toBeInTheDocument();
  unmount();

  // Met een adres in de build.
  vi.stubEnv('VITE_FEEDBACK_ADRES', PROEF);
  naar('#/meer');
  render(<App />);
  expect(screen.getByRole('link', { name: `Feedback of hulp: mail ${PROEF}` })).toHaveAttribute('href', feedbackLink(PROEF));
});
