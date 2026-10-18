// De gedeelde ontwerpbasis (komtgoed/ontwerp) in de app: het tabbladpictogram komt bij het bouwen uit
// ontwerp/pictogram.svg en wordt als data-URI in index.html gezet. Zo is er één bron, werkt het ook in de losse build
// (scripts/losbestand.mjs) en is er geen extra verzoek nodig (CSP img-src blijft ongewijzigd).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const ONTWERP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ontwerp');

/** Het pictogram als data-URI (SVG, procent-gecodeerd). */
export function pictogramDataUri(bestand = path.join(ONTWERP, 'pictogram.svg')): string {
  const svg = readFileSync(bestand, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
  if (!/^<svg[\s>]/.test(svg) || !svg.endsWith('</svg>')) throw new Error(`${bestand} is geen SVG`);
  return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/');
}

/** Vervangt %THUISPLANNER_PICTOGRAM% in index.html door het pictogram. */
export function ontwerp(): Plugin {
  return {
    name: 'thuisplanner-ontwerp',
    transformIndexHtml(html) {
      if (!html.includes('%THUISPLANNER_PICTOGRAM%')) throw new Error('index.html mist %THUISPLANNER_PICTOGRAM%');
      return html.replace('%THUISPLANNER_PICTOGRAM%', pictogramDataUri());
    },
  };
}
