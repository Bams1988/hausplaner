// MindSpace-Hintergrunddienst (bisheriger Betrieb über GitHub Actions, alle 5 Minuten):
// E-Mail-Eingang (IMAP, optional), Erinnerungen, Fristprüfung, Zahlungen und Morgen-Übersicht.
// Sobald die Server-Dienste (Ordner functions/) laufen, überspringt dieses Skript die betroffenen
// Bereiche automatisch – dann kannst du den Zeitplan in GitHub abschalten.
import admin from 'firebase-admin';
import { runReminders } from '../reminders-core.js';
import { makeSender, tokensFor as tokensOf } from '../functions/lib/push.js';
import { processInbox } from './inbox.mjs';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id) {
  console.error('Secret FIREBASE_SERVICE_ACCOUNT fehlt oder ist ungültig.');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const send = makeSender({ db, messaging: admin.messaging(), appUrl: process.env.APP_URL || '', FieldValue: admin.firestore.FieldValue });
const tokensFor = (uids) => tokensOf(db, uids);
const TEST = process.env.TEST_PUSH === 'true';

let sent = 0;
let projects = await db.collection('projects').get();
if (!TEST && process.env.INBOX_USER) {
  try { sent += await processInbox({ db, admin, send, tokensFor, projects: projects.docs }); }
  catch (e) { console.warn('E-Mail-Eingang fehlgeschlagen:', e.message); }
  projects = await db.collection('projects').get();
}
const res = await runReminders({
  db, send, tokensFor, projects: projects.docs, TEST,
  // Bisheriger Betrieb: eigener KI-Schlüssel des Bereichs (Mehr → KI-Assistent)
  aiConfigFor: async (p) => {
    const s = await p.ref.collection('private').doc('ai').get();
    return s.exists && s.get('apiKey') ? { apiKey: s.get('apiKey'), model: s.get('model') } : null;
  },
});
sent += res.sent;
console.log(`Fertig: ${sent} Nachricht(en) verschickt (${res.today}, ${res.hour} Uhr Berlin).`);
process.exit(0);
