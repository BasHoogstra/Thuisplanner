import '@testing-library/jest-dom/vitest';
import { vergeetStartBeurt } from '../src/lib/voorkeuren';

// Elke test is een nieuwe paginalading: het startscherm mag weer één keer gelden (besluit 20).
beforeEach(() => vergeetStartBeurt());
