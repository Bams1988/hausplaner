// Abo-Stand: welcher Plan gilt für eine Person und für einen gemeinsamen Bereich, und wie viel ist verbraucht.
import { PLANS, ENTITLEMENTS, bestPlan, planOf, monthKey, rank } from '../shared/plans.js';
import { AppError } from './util.js';

// Plan einer Person: Store-Abo (solange gültig) oder manuell vergebenes Recht („grant“, z. B. für dich selbst)
export function effectiveUserPlan(u = {}, now = Date.now()) {
  const store = u.plan && u.plan !== 'free' && (!u.planUntil || u.planUntil > now) ? u.plan : 'free';
  const grant = u.grant && PLANS[u.grant] && (!u.grantUntil || u.grantUntil > now) ? u.grant : 'free';
  return rank(grant) > rank(store) ? grant : store;
}

// Plan des gemeinsamen Bereichs = bestes Abo aller Mitglieder (eine Person zahlt, alle profitieren)
export async function recomputeProjectPlan(db, pid, now = Date.now()) {
  const ref = db.doc(`projects/${pid}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const members = snap.get('members') || [];
  let plan = 'free', by = null;
  for (const uid of members) {
    const u = (await db.doc(`users/${uid}`).get()).data() || {};
    const up = effectiveUserPlan(u, now);
    if (rank(up) > rank(plan)) { plan = up; by = uid; }
  }
  const limits = planOf(plan).limits;
  const patch = { plan, planBy: by, storageLimit: limits.storageMB * 1024 * 1024, memberLimit: limits.members, planAt: now };
  if (snap.get('plan') !== plan || snap.get('planBy') !== by || snap.get('storageLimit') !== patch.storageLimit) await ref.update(patch);
  return plan;
}

export async function recomputeForUser(db, uid, now = Date.now()) {
  const projects = await db.collection('projects').where('members', 'array-contains', uid).get();
  const out = {};
  for (const p of projects.docs) out[p.id] = await recomputeProjectPlan(db, p.id, now);
  return out;
}

// Aktive Berechtigungen aus RevenueCat → Plan-ID
export function planFromEntitlements(active) {
  const ids = Object.keys(active || {});
  if (ids.includes(ENTITLEMENTS.pro)) return 'pro';
  if (ids.includes(ENTITLEMENTS.daily)) return 'daily';
  return 'free';
}

// RevenueCat-Kunde abfragen (REST v1) und den Plan in Firestore eintragen
export async function syncFromRevenueCat(db, uid, { apiKey, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!apiKey) throw new AppError('config', 'REVENUECAT_SECRET_KEY fehlt.');
  const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new AppError('upstream', `RevenueCat ${res.status}`);
  const sub = (await res.json()).subscriber || {};
  const active = {};
  let until = 0;
  for (const [id, e] of Object.entries(sub.entitlements || {})) {
    const exp = e.expires_date ? Date.parse(e.expires_date) : Infinity;
    if (exp > now) { active[id] = e; until = Math.max(until, exp); }
  }
  const plan = planFromEntitlements(active);
  await db.doc(`users/${uid}`).set({ plan, planUntil: plan === 'free' ? null : until === Infinity ? null : until, planSource: 'revenuecat', planSyncedAt: now }, { merge: true });
  await recomputeForUser(db, uid, now);
  return plan;
}

// Kontingent verbrauchen (Transaktion). Wirft AppError('quota') wenn das Monatslimit erreicht ist.
export async function consume(db, pid, field, amount, limit, now = new Date()) {
  const ref = db.doc(`projects/${pid}/usage/${monthKey(now)}`);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const used = (s.exists && s.get(field)) || 0;
    if (amount > 0 && used + amount > limit) throw new AppError('quota', 'Monatskontingent erreicht.', { field, used, limit });
    tx.set(ref, { [field]: used + amount, month: monthKey(now), updatedAt: Date.now() }, { merge: true });
    return used + amount;
  });
}
export const refund = (db, pid, field, amount, now = new Date()) => consume(db, pid, field, -amount, Infinity, now).catch(() => {});

export async function addTokens(db, pid, usage, model, now = new Date()) {
  if (!usage) return;
  const ref = db.doc(`projects/${pid}/usage/${monthKey(now)}`);
  const key = String(model || 'model').replace(/[^a-z0-9]/gi, '_');
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const tok = (s.exists && s.get('tokens')) || {};
    const cur = tok[key] || { in: 0, out: 0 };
    tok[key] = { in: cur.in + (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0), out: cur.out + (usage.output_tokens || 0) };
    tx.set(ref, { tokens: tok }, { merge: true });
  }).catch(() => {});
}

// Projekt des Aufrufers laden und Mitgliedschaft prüfen
export async function projectOfUser(db, uid) {
  const u = (await db.doc(`users/${uid}`).get()).data() || {};
  if (!u.projectId) throw new AppError('forbidden', 'Kein gemeinsamer Bereich.');
  const p = await db.doc(`projects/${u.projectId}`).get();
  if (!p.exists || !(p.get('members') || []).includes(uid)) throw new AppError('forbidden', 'Kein Zugriff auf diesen Bereich.');
  return { user: u, pid: p.id, project: p.data(), plan: p.get('plan') || 'free' };
}

export { bestPlan };
