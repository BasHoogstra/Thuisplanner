// Agenda (stap 4, docs/thuisplanner-agenda.md): is het scherm breed genoeg voor de weekweergave van de laptop?
// Smaller (iPhone, tablet) krijgt de weekstrip met de gekozen dag. Zonder matchMedia (bijvoorbeeld jsdom in de
// unittests) geldt het scherm als breed, zodat het gedrag daar gelijk blijft.
import { useSyncExternalStore } from 'react';

export const BREED = '(min-width: 960px)';

function abonneer(melden: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const m = window.matchMedia(BREED);
  m.addEventListener('change', melden);
  return () => m.removeEventListener('change', melden);
}

const isBreed = () => typeof window.matchMedia !== 'function' || window.matchMedia(BREED).matches;

/** Waar vanaf 960 px (de laptopindeling); onwaar op iPhone en tablet. */
export function useBreed(): boolean {
  return useSyncExternalStore(abonneer, isBreed, () => true);
}
