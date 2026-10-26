// MindSpace-Hintergrunddienst: E-Mail-Eingang, Erinnerungen, Fristprüfung und Morgen-Übersicht.
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

const fmtDue = (t, lang = 'de') => {
  if (!t.due) return '';
  const [y, m, d] = t.due.split('-').map(Number);
  const en = lang === 'en';
  const s = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(en ? 'en-GB' : 'de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const tm = t.time ? (en ? ` ${t.time}` : ` ${t.time} Uhr`) : '';
  return t.due === today ? `${en ? 'today' : 'heute'}${tm}` : `${s}${t.time ? ',' + tm : ''}`;
};
// Zweisprachige Texte: T(lang, deutsch, englisch)
const T = (lang, de, en) => (lang === 'en' ? en : de);
const STATUS_EN = { jetzt_starten: 'Start now', kritisch: 'Getting tight', unrealistisch: 'Clarify deadline', im_plan: 'On track' };
const statusLabel = (st, lang) => (lang === 'en' ? STATUS_EN[st] : STATUS[st].label);

async function tokensFor(uids) {
  const out = [];
  for (const uid of uids) {
    const snap = await db.doc(`users/${uid}`).get();
    const lang = snap.get('lang') || 'de';
    for (const token of snap.get('tokens') || []) out.push({ uid, token, lang });
  }
  return out;
}

// title/body dürfen Funktionen (lang) => Text sein; dann wird je Sprache getrennt gesendet
async function send(targets, title, body, tag) {
  if (!targets.length) return 0;
  if (typeof title === 'function' || typeof body === 'function') {
    let n = 0;
    for (const lang of ['de', 'en']) {
      const grp = targets.filter((t) => (t.lang || 'de') === lang);
      if (grp.length) n += await send(grp, typeof title === 'function' ? title(lang) : title, typeof body === 'function' ? body(lang) : body, tag);
    }
    return n;
  }
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
  const pname = p.get('name') || 'MindSpace';
  // Zugriff je Bereich: Mitglieder ohne Eintrag oder mit 'all' sehen alles
  const access = p.get('access') || {};
  const can = (uid, areaId) => { const a = access[uid]; return !a || a === 'all' || (Array.isArray(a) && a.includes(areaId || 'hausbau')); };
  const forArea = (areaId, list = all) => list.filter((x) => can(x.uid, areaId));
  const full = all.filter((x) => !Array.isArray(access[x.uid]));

  if (TEST) {
    sent += await send(all, pname, (l) => T(l, 'Test: Push-Nachrichten funktionieren.', 'Test: push notifications work.'), 'test');
    continue;
  }

  const open = (await p.ref.collection('tasks').where('done', '==', false).get()).docs;
  const targetsFor = (t) => forArea(t.areaId, t.assignee && t.assignee !== 'all' ? all.filter((x) => x.uid === t.assignee) : all);

  // 1) Einzelne Erinnerungen
  for (const doc of open) {
    const t = doc.data();
    if (!t.remindAt || t.reminded || t.remindAt > now || t.remindAt < now - MAX_AGE) continue;
    sent += await send(targetsFor(t), (l) => `${T(l, 'Erinnerung', 'Reminder')}: ${t.title}`.slice(0, 120), (l) => (t.due ? `${T(l, 'Fällig', 'Due')} ${fmtDue(t, l)}` : pname), doc.id);
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
    const projLang = (full[0] || all[0])?.lang || 'de';

    if (aiCfg && tasks.size) {
      const list = [...tasks.values()];
      for (let i = 0; i < list.length; i += 30) {
        try {
          const res = await assessTasks(aiCfg, list.slice(i, i + 30), { now: todayDate, lang: projLang });
          for (const r of res) {
            const t = tasks.get(r.id);
            const patch = { aiStatus: r.status, aiReason: r.reason, aiNext: r.next, aiStartBy: r.startBy, aiFor: aiKeyOf(t), aiAt: now };
            Object.assign(t, patch);
            await t.ref.update(patch);
          }
        } catch (e) { console.warn('KI-Prüfung fehlgeschlagen, nutze Vorlauf-Regel:', e.message); }
      }
    }

    // Benachrichtigen, wenn eine Aufgabe neu dringend geworden ist – jede Person nur über ihre Bereiche
    const alerts = [];
    for (const t of tasks.values()) {
      const u = urgencyOf(t, todayDate);
      if (!u || u.status === 'im_plan') continue;
      const key = `${u.status}|${aiKeyOf(t)}`;
      if (t.urgNotified === key) continue;
      alerts.push({ t, u, key });
    }
    alerts.sort((a, b) => STATUS[b.u.status].rank - STATUS[a.u.status].rank);
    for (const uid of members) {
      const mine = alerts.filter(({ t }) => targetsFor(t).some((x) => x.uid === uid));
      const toks = all.filter((x) => x.uid === uid);
      if (!mine.length || !toks.length) continue;
      if (mine.length > 3) {
        sent += await send(toks, (l) => T(l, `${mine.length} Aufgaben jetzt angehen`, `${mine.length} tasks to tackle now`),
          (l) => mine.slice(0, 4).map(({ t, u }) => `• ${statusLabel(u.status, l)}: ${t.title}`).join('\n') + (mine.length > 4 ? T(l, `\n… und ${mine.length - 4} weitere`, `\n… and ${mine.length - 4} more`) : ''), 'urgent');
      } else {
        for (const { t, u } of mine) sent += await send(toks, (l) => `${statusLabel(u.status, l)}: ${t.title}`.slice(0, 120), (l) => (u.next || u.reason || `${T(l, 'Fällig', 'Due')} ${fmtDue(t, l)}`).slice(0, 200), 'urg-' + t.id);
      }
    }
    for (const { t, key } of alerts) await t.ref.update({ urgNotified: key });
    await p.ref.update({ lastAssess: today });
  }

  // 3a) Neue Kommentare den anderen Mitgliedern melden (nur wer den Bereich sehen darf)
  try {
    const neu = (await p.ref.collection('comments').where('notified', '==', false).get()).docs;
    const names = p.get('memberNames') || {};
    for (const d of neu) {
      const c = d.data();
      if (c.at && c.at > now - 864e5) {
        const task = (await p.ref.collection('tasks').doc(String(c.taskId || '-')).get()).data();
        const who = names[c.by] || c.byName || 'MindSpace';
        const area = c.areaId || task?.areaId;
        sent += await send(forArea(area).filter((x) => x.uid !== c.by), (l) => `💬 ${who} ${T(l, 'zu', 'on')} „${task?.title || T(l, 'einer Aufgabe', 'a task')}“`.slice(0, 120), String(c.text || '').slice(0, 200), 'c-' + d.id);
      }
      await d.ref.update({ notified: true });
    }
  } catch (e) { console.warn('Kommentare:', e.message); }

  // 3c) Neue Zuständigkeit melden – normalerweise erledigt das der Postbote binnen einer Minute;
  //     hier nur als Ersatz, falls er nicht läuft (älter als 3 Minuten)
  try {
    const neu = (await p.ref.collection('tasks').where('assignNotify', '==', true).get()).docs;
    for (const d of neu) {
      const t = d.data();
      if (t.assignAt && t.assignAt > now - 3 * 60e3) continue;
      await d.ref.update({ assignNotify: false, assignNotifiedAt: now });
      if (!t.assignee || t.assignee === 'all' || t.done) continue;
      const von = (l) => t.assignByName || T(l, 'Jemand', 'Someone');
      const due = (l) => (t.due ? T(l, ' – fällig ', ' – due ') + fmtDue(t, l) : '');
      sent += await send(forArea(t.areaId, all.filter((x) => x.uid === t.assignee)),
        (l) => (t.assignReturned ? T(l, '↩️ Aufgabe zurückgegeben', '↩️ Task handed back') : T(l, '📌 Neue Aufgabe für dich', '📌 New task for you')),
        (l) => (t.assignReturned ? T(l, `${von(l)} hat „${t.title}“ an dich zurückgegeben.`, `${von(l)} handed “${t.title}” back to you.`)
          : T(l, `${von(l)} bittet dich, „${t.title}“ zu übernehmen${due(l)}.`, `${von(l)} asks you to take over “${t.title}”${due(l)}.`)).replace(/\.\.$/, '.').slice(0, 220),
        'assign-' + d.id);
    }
  } catch (e) { console.warn('Zuständigkeit:', e.message); }

  // 3d) Kalender-Abo neu eingerichtet: jedes Mitglied einmal fragen (die Entscheidung trifft jeder in der App)
  if (p.get('calUrl') && !p.get('calAskSent')) {
    try {
      for (const uid of members) {
        const u = (await db.doc(`users/${uid}`).get()).data() || {};
        if (u.cal) continue;
        sent += await send(all.filter((x) => x.uid === uid), (l) => T(l, '📅 Aufgaben im Kalender?', '📅 Tasks in your calendar?'),
          (l) => T(l, 'MindSpace kann deine Aufgaben in deinen Handy-Kalender eintragen – nur wenn du möchtest. Öffne MindSpace, um zu entscheiden.', 'MindSpace can add your tasks to your phone calendar – only if you want. Open MindSpace to decide.'), 'cal-ask');
      }
      await p.ref.update({ calAskSent: true });
    } catch (e) { console.warn('Kalender-Frage:', e.message); }
  }

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
        const head = (l) => (stage === 'soon' ? T(l, 'Zahlung bald fällig', 'Payment due soon') : days < 0 ? T(l, 'Zahlung überfällig', 'Payment overdue') : T(l, 'Zahlung heute fällig', 'Payment due today'));
        const amount = (l) => (c.amount != null ? Number(c.amount).toLocaleString(l === 'en' ? 'en-GB' : 'de-DE', { style: 'currency', currency: 'EUR' }) : '');
        sent += await send(forArea(c.areaId), (l) => `💶 ${head(l)}: ${c.title}`.slice(0, 120), (l) => [amount(l), `${T(l, 'fällig', 'due')} ${fmtDue(c, l)}`].filter(Boolean).join(' · '), 'pay-' + d.id);
        await d.ref.update({ payNotified: `${stage}|${c.due}` });
      }
    } catch (e) { console.warn('Zahlungen:', e.message); }
  }

  // 3) Morgen-Übersicht (einmal pro Tag ab 7 Uhr) – jede Person nur mit ihren Bereichen
  if (hour >= DIGEST_HOUR && p.get('lastDigest') !== today) {
    const dueAll = open.map((d) => d.data()).filter((t) => t.due && t.due <= today).sort((a, b) => a.due.localeCompare(b.due));
    for (const uid of members) {
      const toks = all.filter((x) => x.uid === uid);
      const due = dueAll.filter((t) => can(uid, t.areaId));
      if (!due.length || !toks.length) continue;
      const late = due.filter((t) => t.due < today).length;
      sent += await send(toks,
        (l) => T(l, `Heute: ${due.length} ${due.length === 1 ? 'Aufgabe' : 'Aufgaben'}${late ? ` (${late} überfällig)` : ''}`, `Today: ${due.length} ${due.length === 1 ? 'task' : 'tasks'}${late ? ` (${late} overdue)` : ''}`),
        (l) => due.slice(0, 3).map((t) => `• ${t.title}`).join('\n') + (due.length > 3 ? T(l, `\n… und ${due.length - 3} weitere`, `\n… and ${due.length - 3} more`) : ''), 'digest');
    }
    await p.ref.update({ lastDigest: today });
  }
}
console.log(`Fertig: ${sent} Nachricht(en) verschickt (${today}, ${hour} Uhr Berlin).`);
process.exit(0);
