// Kopiert die gemeinsam genutzten Dateien (Abo-Stufen, KI, Erinnerungen) in functions/shared,
// weil Firebase nur den Ordner functions/ hochlädt. Läuft automatisch vor jedem Bereitstellen.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dest = join(here, '..', 'shared');
mkdirSync(dest, { recursive: true });
for (const f of ['plans.js', 'ai.js', 'reminders-core.js']) { copyFileSync(join(root, f), join(dest, f)); console.log('✓', f); }
