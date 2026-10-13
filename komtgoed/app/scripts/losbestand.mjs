// Maakt van de build (dist/) één los HTML-bestand met de CSS en JS ingesloten:
//   dist-los/komtgoed-demo.html  (volledig document, dubbelklikken opent het in de browser)
//   dist-los/komtgoed-demo.fragment.html  (zonder <html>/<head>/<body>, voor een gedeelde preview-pagina)
// Geen externe bestanden of verbindingen nodig.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(app, 'dist');
const uit = join(app, 'dist-los');
mkdirSync(uit, { recursive: true });
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const lees = (href) => readFileSync(join(dist, href.replace(/^\.\//, '')), 'utf8');

const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(m => lees(m[1])).join('\n');
const js = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(m => lees(m[1])).join('\n')
  .replace(/<\/script/gi, '<\\/script');
if (!css || !js) throw new Error('Geen CSS of JS gevonden in dist/index.html; eerst "npm run build".');

const kop = (html.match(/<head>([\s\S]*?)<\/head>/) || [])[1]
  .replace(/\s*<link rel="stylesheet"[^>]*>/g, '').replace(/\s*<script type="module"[^>]*><\/script>/g, '');

const inhoud = `<div id="root"></div>\n<noscript>Deze demo heeft JavaScript nodig.</noscript>\n<script type="module">\n${js}\n</script>`;
writeFileSync(join(uit, 'komtgoed-demo.html'),
  `<!doctype html>\n<html lang="nl">\n<head>${kop}<style>\n${css}\n</style>\n</head>\n<body>\n${inhoud}\n</body>\n</html>\n`);
writeFileSync(join(uit, 'komtgoed-demo.fragment.html'),
  `<title>KomtGoed Vandaag (demo)</title>\n<style>\n${css}\n</style>\n${inhoud}\n`);
console.log('Gemaakt: dist-los/komtgoed-demo.html en dist-los/komtgoed-demo.fragment.html');
