import type { Page } from '@playwright/test';

// Hulp voor de Agenda op iPhone en tablet (docs/thuisplanner-agenda.md, stap 4). Op de laptop doen beide niets extra's.

/**
 * Stap 4a: onder 960 px staat alleen de gekozen dag uitgebreid in beeld. Kies eerst die dag in de weekstrip.
 * dag: zoals de schermlezer hem noemt, bijvoorbeeld "zaterdag 17 oktober".
 */
export async function kiesDag(p: Page, dag: string): Promise<void> {
  const strip = p.getByRole('group', { name: 'Kies een dag' });
  if (await strip.isVisible()) await strip.getByRole('button', { name: new RegExp(`^${dag}(, vandaag)?:`) }).click();
}

/** Stap 4b: onder 960 px staat het gezinsfilter achter één knop; open die eerst en kies dan het lid. */
export async function kiesFilter(p: Page, naam: string): Promise<void> {
  const knop = p.getByRole('button', { name: /^Wiens agenda/ });
  if (await knop.isVisible() && (await knop.getAttribute('aria-expanded')) !== 'true') await knop.click();
  await p.getByRole('group', { name: 'Wiens agenda' }).getByRole('button', { name: naam, exact: true }).click();
}
