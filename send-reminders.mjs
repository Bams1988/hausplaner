// Verschickt fällige Erinnerungen und die Morgen-Übersicht als Push-Nachricht.
// Läuft automatisch alle 15 Minuten über GitHub Actions (siehe .github/workflows/reminders.yml).
import admin from 'firebase-admin';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id) {
  console.error('Secret FIREBASE_SERVICE_ACCOUNT fehlt oder ist ungültig.');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const fcm = admin.messaging();

const APP_URL = process.env.APP_URL || '';
const TZ = 'Europe/Berlin';
const DIGEST_HOUR = 7;
const now = Date.now();
const MAX_AGE = 3 * 864e5; // ältere verpasste Erinnerungen nicht mehr senden
const TEST = process.env.TEST_PUSH === 'true';

const berlin = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date());
const part = (t) => berlin.find((p) => p.type === t).value;
const today = `${part('year')}-${part('month')}-${part('day')}`;
const hour = Number(part('hour'));

const fmtDue = (t) => {
  if (!t.due) return '';
  const [y, m, d] = t.due.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return t.due === today ? `heute${t.time ? ' ' + t.time + ' Uhr' : ''}` : `${s}${t.time ? ', ' + t.time + ' Uhr' : ''}`;
};

async function tokensFor(uids) {
  const out = [];
  for (const uid of uids) {
    const snap = await db.doc(`users/${uid}`).get();
    for (const token of snap.get('tokens') || []) out.push({ uid, token });
  }
  return out;
}

async function send(targets, title, body, tag) {
  if (!targets.length) return 0;
  const res = await fcm.sendEachForMulticast({
    tokens: targets.map((t) => t.token),
    notification: { title, body },
    webpush: {
      notification: { title, body, tag, ...(APP_URL ? { icon: APP_URL + 'icons/icon-192.png' } : {}) },
      ...(APP_URL ? { fcmOptions: { link: APP_URL } } : {}),
    },
  });
  // Abgemeldete Geräte aufräumen
  for (const [i, r] of res.responses.entries()) {
    if (!r.success) {
      const code = r.error?.code || '';
      console.warn('Senden fehlgeschlagen:', code);
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token') || code.includes('invalid-argument')) {
        await db.doc(`users/${targets[i].uid}`).update({ tokens: admin.firestore.FieldValue.arrayRemove(targets[i].token) }).catch(() => {});
      }
    }
  }
  return res.successCount;
}

let sent = 0;
const projects = await db.collection('projects').get();
for (const p of projects.docs) {
  const members = p.get('members') || [];
  const all = await tokensFor(members);
  const pname = p.get('name') || 'Hausplaner';

  if (TEST) {
    sent += await send(all, pname, 'Test: Push-Nachrichten funktionieren.', 'test');
    continue;
  }

  const open = (await p.ref.collection('tasks').where('done', '==', false).get()).docs;

  // 1) Einzelne Erinnerungen
  for (const doc of open) {
    const t = doc.data();
    if (!t.remindAt || t.reminded || t.remindAt > now || t.remindAt < now - MAX_AGE) continue;
    const targets = t.assignee && t.assignee !== 'all' ? all.filter((x) => x.uid === t.assignee) : all;
    const when = fmtDue(t);
    sent += await send(targets, `Erinnerung: ${t.title}`.slice(0, 120), when ? `Fällig ${when}` : pname, doc.id);
    await doc.ref.update({ reminded: true, remindedAt: now });
  }

  // 2) Morgen-Übersicht (einmal pro Tag ab 7 Uhr)
  if (hour >= DIGEST_HOUR && p.get('lastDigest') !== today) {
    const due = open.map((d) => d.data()).filter((t) => t.due && t.due <= today).sort((a, b) => a.due.localeCompare(b.due));
    if (due.length) {
      const late = due.filter((t) => t.due < today).length;
      const head = `Heute: ${due.length} ${due.length === 1 ? 'Aufgabe' : 'Aufgaben'}${late ? ` (${late} überfällig)` : ''}`;
      const body = due.slice(0, 3).map((t) => `• ${t.title}`).join('\n') + (due.length > 3 ? `\n… und ${due.length - 3} weitere` : '');
      sent += await send(all, head, body, 'digest');
    }
    await p.ref.update({ lastDigest: today });
  }
}
console.log(`Fertig: ${sent} Nachricht(en) verschickt (${today}, ${hour} Uhr Berlin).`);
process.exit(0);
