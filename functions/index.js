// MindSpace-Server-Dienste (Firebase Cloud Functions, 2. Generation).
// Bereitstellen: siehe VEROEFFENTLICHUNG.md, Schritt „Server-Dienste“.
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten, onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { simpleParser } from 'mailparser';

import { runReminders } from './shared/reminders-core.js';
import { planOf } from './shared/plans.js';
import { handleAi } from './lib/ai-proxy.js';
import { syncFromRevenueCat, recomputeForUser, recomputeProjectPlan, projectOfUser, effectiveUserPlan } from './lib/plan.js';
import { makeSender, tokensFor } from './lib/push.js';
import { onTaskWritten, onCommentCreated, onFileChange } from './lib/notify.js';
import { calendarFeed } from './lib/calendar.js';
import { handleInbound, ensureInboxAlias } from './lib/mail.js';
import { deleteAccount } from './lib/account.js';
import { AppError, berlinIso } from './lib/util.js';

initializeApp();
const db = getFirestore();
const REGION = 'europe-west3'; // Frankfurt

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const REVENUECAT_SECRET_KEY = defineSecret('REVENUECAT_SECRET_KEY'); // RevenueCat → API keys → Secret (v1)
const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH'); // frei gewähltes Passwort, auch in RevenueCat eintragen
const INBOUND_SECRET = defineSecret('INBOUND_SECRET'); // frei gewähltes Passwort, auch im Cloudflare-Worker
const APP_URL = defineString('APP_URL', { default: '' });
const MAIL_DOMAIN = defineString('MAIL_DOMAIN', { default: '' }); // z. B. in.mindspace-app.de
const BETA_CODE = defineString('BETA_CODE', { default: '' }); // Testphase: Code für Tester (leer = Testphase aus)
const ADMIN_EMAIL = defineString('ADMIN_EMAIL', { default: '' }); // bekommt Feedback als Push

const sender = () => makeSender({ db, messaging: getMessaging(), appUrl: APP_URL.value(), FieldValue });

// Fehler einheitlich an die App melden
const wrap = (fn) => async (req) => {
  try { return await fn(req); }
  catch (e) {
    if (e instanceof HttpsError) throw e;
    const map = { quota: 'resource-exhausted', forbidden: 'permission-denied', invalid: 'invalid-argument', unauthenticated: 'unauthenticated', config: 'failed-precondition', upstream: 'unavailable' };
    if (e instanceof AppError) throw new HttpsError(map[e.code] || 'internal', e.message, { code: e.code, ...(e.details || {}) });
    console.error(e);
    throw new HttpsError('internal', 'Unerwarteter Fehler. Bitte später noch einmal versuchen.');
  }
};
const needAuth = (req) => { if (!req.auth?.uid) throw new AppError('unauthenticated', 'Bitte anmelden.'); return req.auth.uid; };

// ---------- KI über den MindSpace-Schlüssel (mit Monatskontingent je Abo)
export const ai = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 180, memory: '512MiB', maxInstances: 20 },
  wrap((req) => handleAi(db, needAuth(req), req.data, { apiKey: ANTHROPIC_API_KEY.value() })));

// ---------- Abo-Stand abfragen/aktualisieren (direkt nach einem Kauf aufrufen)
export const refreshPlan = onCall({ region: REGION, secrets: [REVENUECAT_SECRET_KEY] }, wrap(async (req) => {
  const uid = needAuth(req);
  let plan = null;
  try { plan = await syncFromRevenueCat(db, uid, { apiKey: REVENUECAT_SECRET_KEY.value() }); }
  catch (e) { console.warn('RevenueCat:', e.message); await recomputeForUser(db, uid); }
  const { project } = await projectOfUser(db, uid).catch(() => ({ project: {} }));
  return { userPlan: plan, projectPlan: project.plan || 'free' };
}));

// ---------- RevenueCat-Webhook: bei jedem Kauf, jeder Verlängerung oder Kündigung
export const revenuecat = onRequest({ region: REGION, secrets: [REVENUECAT_SECRET_KEY, REVENUECAT_WEBHOOK_AUTH] }, async (req, res) => {
  const auth = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!REVENUECAT_WEBHOOK_AUTH.value() || auth !== REVENUECAT_WEBHOOK_AUTH.value()) { res.status(401).send('nope'); return; }
  const ev = req.body?.event || {};
  const ids = new Set([ev.app_user_id, ev.original_app_user_id, ...(ev.aliases || []), ...(ev.transferred_from || []), ...(ev.transferred_to || [])].filter((x) => x && !String(x).startsWith('$RCAnonymousID')));
  for (const uid of ids) {
    try { await syncFromRevenueCat(db, uid, { apiKey: REVENUECAT_SECRET_KEY.value() }); }
    catch (e) { console.warn(`Abo von ${uid} nicht aktualisiert:`, e.message); }
  }
  res.status(200).send({ ok: true, users: ids.size });
});

// ---------- Plan neu berechnen, wenn sich am Abo/Recht einer Person etwas ändert (auch manuelles „grant“)
export const userPlanChanged = onDocumentWritten('users/{uid}', async (event) => {
  const b = event.data?.before?.data() || {}, a = event.data?.after?.data() || {};
  if (effectiveUserPlan(b) === effectiveUserPlan(a) && b.planUntil === a.planUntil && b.projectId === a.projectId) return;
  await recomputeForUser(db, event.params.uid);
});
export const membersChanged = onDocumentWritten('projects/{pid}', async (event) => {
  const b = event.data?.before?.data(), a = event.data?.after?.data();
  if (!a || JSON.stringify(b?.members || []) === JSON.stringify(a.members || [])) return;
  await recomputeProjectPlan(db, event.params.pid);
});

// ---------- Sofort-Push: Zuständigkeit und Kommentare
export const taskWritten = onDocumentWritten('projects/{pid}/tasks/{tid}', async (event) => {
  await onTaskWritten({ db, send: sender(), pid: event.params.pid, tid: event.params.tid, before: event.data?.before?.data(), after: event.data?.after?.data() });
});
export const commentCreated = onDocumentCreated('projects/{pid}/comments/{cid}', async (event) => {
  await onCommentCreated({ db, send: sender(), pid: event.params.pid, cid: event.params.cid, c: event.data?.data() });
});

// ---------- Speicherverbrauch mitzählen
export const fileCreated = onDocumentCreated('projects/{pid}/files/{fid}', async (event) => {
  await onFileChange({ db, FieldValue, pid: event.params.pid, size: event.data?.get('size') || 0, sign: 1 });
});
export const fileDeleted = onDocumentDeleted('projects/{pid}/files/{fid}', async (event) => {
  const d = event.data?.data() || {};
  await onFileChange({ db, FieldValue, pid: event.params.pid, size: d.size || 0, sign: -1 });
  if (d.path) await getStorage().bucket().file(d.path).delete().catch(() => {});
});

// ---------- Erinnerungen, Fristen-Check (Daily Driver/Pro mit KI), Zahlungen, Morgen-Übersicht
export const reminders = onSchedule({ region: REGION, schedule: 'every 5 minutes', timeZone: 'Europe/Berlin', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: '512MiB' }, async () => {
  const today = berlinIso();
  const projects = (await db.collection('projects').get()).docs;
  const res = await runReminders({
    db, send: sender(), tokensFor: (uids) => tokensFor(db, uids), projects, backend: true,
    aiConfigFor: async (p) => {
      const plan = planOf(p.get('plan'));
      return plan.features.dailyCheck && ANTHROPIC_API_KEY.value() ? { apiKey: ANTHROPIC_API_KEY.value(), model: plan.models.quick } : null;
    },
    // einmal täglich: abgelaufene Abos und manuelle Rechte nachziehen
    onProject: async (p) => { if (p.get('planDay') !== today) { await recomputeProjectPlan(db, p.id); await p.ref.update({ planDay: today }).catch(() => {}); } },
  });
  console.log(`Erinnerungen: ${res.sent} Nachrichten.`);
});

// ---------- Kalender-Abo (iCalendar)
export const calendar = onRequest({ region: REGION, cors: false, maxInstances: 20 }, async (req, res) => {
  try {
    const ics = await calendarFeed(db, String(req.query.k || ''), { appUrl: APP_URL.value() });
    res.set('Content-Type', 'text/calendar; charset=utf-8').set('Cache-Control', 'private, max-age=300').status(200).send(ics);
  } catch (e) { console.error(e); res.status(500).send('Fehler'); }
});

// ---------- E-Mail-Eingang (vom Cloudflare-Worker)
export const inboundMail = onRequest({ region: REGION, secrets: [ANTHROPIC_API_KEY, INBOUND_SECRET], timeoutSeconds: 300, memory: '1GiB', maxInstances: 10 }, async (req, res) => {
  if (!INBOUND_SECRET.value() || req.get('x-mindspace-secret') !== INBOUND_SECRET.value()) { res.status(401).send('nope'); return; }
  try {
    const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.body || '');
    const out = await handleInbound({ db, bucket: getStorage().bucket(), FieldValue, send: sender(), simpleParser, apiKey: ANTHROPIC_API_KEY.value() },
      { raw, to: req.get('x-mindspace-to') || '', domain: MAIL_DOMAIN.value() });
    console.log('E-Mail:', JSON.stringify(out));
    res.status(out.status === 'unknown-address' ? 404 : 200).send(out);
  } catch (e) { console.error(e); res.status(500).send({ status: 'error' }); }
});

// ---------- E-Mail-Adresse des Bereichs vergeben/anzeigen
export const inboxAddress = onCall({ region: REGION }, wrap(async (req) => {
  const uid = needAuth(req);
  const { pid, project } = await projectOfUser(db, uid);
  if (Array.isArray((project.access || {})[uid])) throw new AppError('forbidden', 'Nur mit vollem Zugriff.');
  if (!MAIL_DOMAIN.value()) throw new AppError('config', 'Der E-Mail-Eingang ist noch nicht eingerichtet.');
  const alias = await ensureInboxAlias(db, pid);
  return { address: `${alias}@${MAIL_DOMAIN.value()}` };
}));

// ---------- Testphase: Tester wählen ihre Stufe selbst (mit Test-Code, ohne Bezahlung)
export const betaPlan = onCall({ region: REGION }, wrap(async (req) => {
  const uid = needAuth(req);
  const code = BETA_CODE.value().trim();
  if (!code) throw new AppError('forbidden', 'Die Testphase ist beendet.');
  if (String(req.data?.code || '').trim().toUpperCase() !== code.toUpperCase()) throw new AppError('forbidden', 'Der Test-Code stimmt nicht.');
  const plan = ['free', 'daily', 'pro'].includes(req.data?.plan) ? req.data.plan : 'free';
  await db.doc(`users/${uid}`).set({ grant: plan === 'free' ? null : plan, grantUntil: null, grantSource: 'beta' }, { merge: true });
  await recomputeForUser(db, uid);
  return { plan };
}));

// ---------- Feedback der Tester → Push an dich (ADMIN_EMAIL)
export const feedbackCreated = onDocumentCreated('feedback/{id}', async (event) => {
  const f = event.data?.data() || {};
  const mail = ADMIN_EMAIL.value().trim();
  if (!mail) return;
  try {
    const admin = await getAuth().getUserByEmail(mail);
    const kinds = { bug: '🐞 Fehler', idea: '💡 Idee', other: '💬 Feedback' };
    await sender()(await tokensFor(db, [admin.uid]), `${kinds[f.kind] || kinds.other} von ${f.name || 'Tester'}`.slice(0, 120), String(f.text || '').slice(0, 200), 'fb-' + event.params.id);
  } catch (e) { console.warn('Feedback-Push:', e.message); }
});

// ---------- Konto löschen
export const deleteMyAccount = onCall({ region: REGION, timeoutSeconds: 300 }, wrap(async (req) => {
  const uid = needAuth(req);
  return deleteAccount({ db, auth: getAuth(), bucket: getStorage().bucket(), FieldValue }, uid);
}));
