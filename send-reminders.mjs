// Mindora-Hintergrunddienst: E-Mail-Eingang, Erinnerungen, Fristprüfung und Morgen-Übersicht.
// Läuft automatisch alle 15 Minuten über GitHub Actions (siehe .github/workflows/reminders.yml).
import admin from 'firebase-admin';
import { assessTasks, urgencyOf, aiKeyOf, STATUS } from '../ai.js';
import { processInbox } from './inbox.mjs';

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
const todayDate = new Date(`${today}T12:00:00`); // „heute“ in Berliner Zeit

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
let projects = await db.collection('projects').get();

// 0) E-Mail-Eingang abholen (nur wenn ein Postfach eingerichtet ist)
if (!TEST && process.env.INBOX_USER) {
  try { sent += await processInbox({ db, admin, send, tokensFor, projects: projects.docs }); }
  catch (e) { console.warn('E-Mail-Eingang fehlgeschlagen:', e.message); }
  projects = await db.collection('projects').get();
}
for (const p of projects.docs) {
  const members = p.get('members') || [];
  const all = await tokensFor(members);
  const pname = p.get('name') || 'Mindora';

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

  // 2) Täglicher Fristen-Check: Ist es noch realistisch? Muss die Aufgabe jetzt angegangen werden?
  if (hour >= DIGEST_HOUR && p.get('lastAssess') !== today) {
    const tasks = new Map(open.filter((d) => d.get('due')).map((d) => [d.id, { id: d.id, ref: d.ref, ...d.data() }]));
    let aiCfg = null;
    try {
      const s = await p.ref.collection('private').doc('ai').get();
      if (s.exists && s.get('apiKey')) aiCfg = { apiKey: s.get('apiKey'), model: s.get('model') };
    } catch (e) { console.warn('KI-Einstellungen nicht lesbar:', e.message); }

    if (aiCfg && tasks.size) {
      const list = [...tasks.values()];
      for (let i = 0; i < list.length; i += 30) {
        try {
          const res = await assessTasks(aiCfg, list.slice(i, i + 30), { now: todayDate });
          for (const r of res) {
            const t = tasks.get(r.id);
            const patch = { aiStatus: r.status, aiReason: r.reason, aiNext: r.next, aiStartBy: r.startBy, aiFor: aiKeyOf(t), aiAt: now };
            Object.assign(t, patch);
            await t.ref.update(patch);
          }
        } catch (e) { console.warn('KI-Prüfung fehlgeschlagen, nutze Vorlauf-Regel:', e.message); }
      }
    }

    // Benachrichtigen, wenn eine Aufgabe neu dringend geworden ist
    const alerts = [];
    for (const t of tasks.values()) {
      const u = urgencyOf(t, todayDate);
      if (!u || u.status === 'im_plan') continue;
      const key = `${u.status}|${aiKeyOf(t)}`;
      if (t.urgNotified === key) continue;
      alerts.push({ t, u, key });
    }
    alerts.sort((a, b) => STATUS[b.u.status].rank - STATUS[a.u.status].rank);
    if (alerts.length > 3) {
      const body = alerts.slice(0, 4).map(({ t, u }) => `• ${STATUS[u.status].label}: ${t.title}`).join('\n') + (alerts.length > 4 ? `\n… und ${alerts.length - 4} weitere` : '');
      sent += await send(all, `${alerts.length} Aufgaben jetzt angehen`, body, 'urgent');
    } else {
      for (const { t, u } of alerts) {
        const targets = t.assignee && t.assignee !== 'all' ? all.filter((x) => x.uid === t.assignee) : all;
        sent += await send(targets, `${STATUS[u.status].label}: ${t.title}`.slice(0, 120), (u.next || u.reason || `Fällig ${fmtDue(t)}`).slice(0, 200), 'urg-' + t.id);
      }
    }
    for (const { t, key } of alerts) await t.ref.update({ urgNotified: key });
    await p.ref.update({ lastAssess: today });
  }

  // 3a) Neue Kommentare den anderen Mitgliedern melden
  try {
    const neu = (await p.ref.collection('comments').where('notified', '==', false).get()).docs;
    const names = p.get('memberNames') || {};
    for (const d of neu) {
      const c = d.data();
      if (c.at && c.at > now - 864e5) {
        const task = (await p.ref.collection('tasks').doc(String(c.taskId || '-')).get()).data();
        const who = names[c.by] || c.byName || 'Jemand';
        sent += await send(all.filter((x) => x.uid !== c.by), `💬 ${who} zu „${task?.title || 'einer Aufgabe'}“`.slice(0, 120), String(c.text || '').slice(0, 200), 'c-' + d.id);
      }
      await d.ref.update({ notified: true });
    }
  } catch (e) { console.warn('Kommentare:', e.message); }

  // 3b) Zahlungen: 3 Tage vorher und am Fälligkeitstag erinnern (ab 7 Uhr)
  if (hour >= DIGEST_HOUR) {
    try {
      const offen = (await p.ref.collection('costs').where('paid', '==', false).get()).docs;
      for (const d of offen) {
        const c = d.data();
        if (!c.due) continue;
        const days = Math.round((new Date(`${c.due}T12:00:00`) - todayDate) / 864e5);
        const stage = days <= 0 ? 'due' : days <= 3 ? 'soon' : null;
        if (!stage || days < -7 || c.payNotified === `${stage}|${c.due}`) continue;
        const amount = c.amount != null ? Number(c.amount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }) : '';
        const head = stage === 'soon' ? 'Zahlung bald fällig' : days < 0 ? 'Zahlung überfällig' : 'Zahlung heute fällig';
        sent += await send(all, `💶 ${head}: ${c.title}`.slice(0, 120), [amount, `fällig ${fmtDue(c)}`].filter(Boolean).join(' · '), 'pay-' + d.id);
        await d.ref.update({ payNotified: `${stage}|${c.due}` });
      }
    } catch (e) { console.warn('Zahlungen:', e.message); }
  }

  // 3) Morgen-Übersicht (einmal pro Tag ab 7 Uhr)
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
