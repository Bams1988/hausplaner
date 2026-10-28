// Bereitet die Web-App für die native App vor:
// 1. Programmdateien aus dem Hauptordner nach native/www kopieren
// 2. native Brücke (src/bridge.js) und Firebase lokal bündeln – Apps dürfen keinen Programmcode nachladen
// 3. Schrift „Inter“ lokal einbinden (funktioniert auch offline)
// 4. App-Kennung (APP_ID) und Version in capacitor.config.json eintragen
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const nat = join(here, '..');
const root = join(nat, '..');
const www = join(nat, 'www');
rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

const files = ['index.html', 'app.js', 'store.js', 'parser.js', 'ai.js', 'i18n.js', 'plans.js', 'native.js', 'styles.css', 'manifest.webmanifest'];
for (const f of files) cpSync(join(root, f), join(www, f));
cpSync(join(root, 'icons'), join(www, 'icons'), { recursive: true });
// config.js: aus dem Repository oder aus der Umgebungsvariable MINDSPACE_CONFIG (GitHub-Secret)
if (process.env.MINDSPACE_CONFIG) writeFileSync(join(www, 'config.js'), process.env.MINDSPACE_CONFIG);
else if (existsSync(join(root, 'config.js'))) cpSync(join(root, 'config.js'), join(www, 'config.js'));
else throw new Error('config.js fehlt');
const cfg = readFileSync(join(www, 'config.js'), 'utf8');
if (!/apiKey:\s*'[^']+'/.test(cfg)) console.warn('⚠️  config.js enthält keinen Firebase-apiKey – die App startet im lokalen Modus.');
if (!/enabled:\s*true/.test(cfg)) console.warn('⚠️  backend.enabled ist nicht true – Abos und KI über MindSpace sind aus.');

// Bündeln
await build({ entryPoints: [join(nat, 'src', 'bridge.js')], bundle: true, format: 'iife', outfile: join(www, 'native-bridge.js'), target: ['ios15', 'chrome100'], minify: true, legalComments: 'none' });
await build({
  entryPoints: ['app', 'auth', 'firestore', 'functions', 'storage'].map((m) => join(nat, 'src', `firebase-${m}.js`)),
  bundle: true, splitting: true, format: 'esm', outdir: join(www, 'vendor', 'firebase'), target: ['es2020'], minify: true, legalComments: 'none',
  entryNames: '[name]', chunkNames: 'chunk-[hash]',
});

// index.html: Brücke vor die App, Schrift lokal statt von Google
let html = readFileSync(join(www, 'index.html'), 'utf8');
html = html.replace('<script src="config.js"></script>', '<script src="config.js"></script>\n  <script src="native-bridge.js"></script>');
const font = join(nat, 'node_modules', '@fontsource-variable', 'inter', 'files', 'inter-latin-wght-normal.woff2');
if (existsSync(font)) {
  mkdirSync(join(www, 'fonts'), { recursive: true });
  cpSync(font, join(www, 'fonts', 'inter.woff2'));
  html = html.replace(/\s*<link rel="preconnect"[^>]*>/g, '').replace(/\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '\n  <style>@font-face{font-family:Inter;font-style:normal;font-display:swap;font-weight:100 900;src:url(fonts/inter.woff2) format("woff2")}</style>');
}
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
writeFileSync(join(www, 'index.html'), html);

// App-Kennung und Version
const capPath = join(nat, 'capacitor.config.json');
const cap = JSON.parse(readFileSync(capPath, 'utf8'));
if (process.env.APP_ID) cap.appId = process.env.APP_ID;
writeFileSync(capPath, JSON.stringify(cap, null, 2) + '\n');
const ver = (readFileSync(join(root, 'app.js'), 'utf8').match(/APP_VERSION = '(\d+)'/) || [])[1] || '1';
writeFileSync(join(nat, 'www', 'version.json'), JSON.stringify({ app: ver, appId: cap.appId }));
console.log(`✓ Web-App vorbereitet (Version ${ver}, ${cap.appId})`);
