import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Foutgrens } from './components/Foutgrens';
import './styles/app.css';
import { vangUitnodiging } from './lib/uitnodiging';
import { MetPushproef } from './pwa/MetPushproef';
import { registreerNaLaden } from './pwa/registreer';

// Eerst een eventuele uitnodiging uit de adresbalk halen, vóór de app iets laadt (zie lib/uitnodiging.ts).
vangUitnodiging();

// PWA-basis (PR P0): de service worker voor meldingen, alleen in een productiebuild (zie pwa/registreer.ts).
registreerNaLaden();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* N2: het laatste vangnet (inloggen, uitnodigingen, de schil); de schermen hebben elk hun eigen grens in App.tsx. */}
    <Foutgrens plek="De app">
      {/* Alleen met VITE_PUSHPROEF=1: de verborgen pushproef (pwa/MetPushproef.tsx); anders precies de app. */}
      <MetPushproef>
        <App />
      </MetPushproef>
    </Foutgrens>
  </StrictMode>,
);
