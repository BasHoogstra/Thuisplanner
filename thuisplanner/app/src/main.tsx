import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Foutgrens } from './components/Foutgrens';
import './styles/app.css';
import { vangUitnodiging } from './lib/uitnodiging';

// Eerst een eventuele uitnodiging uit de adresbalk halen, vóór de app iets laadt (zie lib/uitnodiging.ts).
vangUitnodiging();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* N2: het laatste vangnet (inloggen, uitnodigingen, de schil); de schermen hebben elk hun eigen grens in App.tsx. */}
    <Foutgrens plek="De app">
      <App />
    </Foutgrens>
  </StrictMode>,
);
