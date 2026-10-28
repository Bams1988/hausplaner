// KI-Aufrufe der App laufen über den Server: eigener Anthropic-Schlüssel, Modell je Abo, Monatskontingent.
// Die App schickt den fertigen Nachrichten-Body (aus ai.js); Modell und Grenzen bestimmt der Server.
import { AI_KINDS, planOf } from '../shared/plans.js';
import { AppError } from './util.js';
import { projectOfUser, consume, refund, addTokens } from './plan.js';

const API = 'https://api.anthropic.com/v1/messages';
const MAX_BODY = 9.5 * 1024 * 1024; // Grenze für Aufrufe aus der App (~10 MB)

export function modelFor(planId, kind, deep) {
  const plan = planOf(planId);
  const k = AI_KINDS[kind] || AI_KINDS.parse;
  if (deep && plan.features.bestModel && plan.models.best) return { model: plan.models.best, cost: Math.max(1, k.cost) * 2 };
  return { model: plan.models[k.model] || plan.models.quick, cost: k.cost };
}

function cleanBody(body, model, maxAttachments) {
  if (!body || !Array.isArray(body.messages) || !body.messages.length) throw new AppError('invalid', 'Ungültige Anfrage.');
  const out = {
    model,
    max_tokens: Math.min(Number(body.max_tokens) || 2048, 8192),
    messages: body.messages,
  };
  if (body.system) out.system = String(body.system).slice(0, 60000);
  if (Array.isArray(body.tools)) out.tools = body.tools.slice(0, 3);
  // Dokumente/Bilder begrenzen
  let docs = 0;
  for (const m of out.messages) {
    if (!Array.isArray(m.content)) continue;
    m.content = m.content.filter((b) => {
      if (b.type !== 'document' && b.type !== 'image') return true;
      docs++;
      return docs <= maxAttachments;
    });
  }
  return out;
}

export async function callAnthropic(apiKey, body, { fetchImpl = fetch, timeoutMs = 110000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(API, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
  } catch (e) {
    throw new AppError('upstream', e.name === 'AbortError' ? 'Die KI hat nicht rechtzeitig geantwortet. Versuch es noch einmal.' : 'Keine Verbindung zur KI.');
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json())?.error?.message || ''; } catch {}
    console.error('Anthropic', res.status, msg);
    if (res.status === 429 || res.status === 529 || res.status >= 500) throw new AppError('upstream', 'Die KI ist gerade überlastet. Versuch es in ein paar Minuten noch einmal.');
    if (res.status === 413 || /too large|too long|prompt is too long/i.test(msg)) throw new AppError('invalid', 'Der Inhalt ist zu groß für eine Auswertung. Versuch es mit weniger Text oder kleineren Anhängen.');
    throw new AppError('upstream', 'Die KI konnte die Anfrage nicht bearbeiten.');
  }
  return res.json();
}

// Einstieg für die aufrufbare Funktion „ai“
export async function handleAi(db, uid, data, { apiKey, fetchImpl } = {}) {
  if (!uid) throw new AppError('unauthenticated', 'Bitte anmelden.');
  if (!apiKey) throw new AppError('config', 'Der KI-Dienst ist noch nicht eingerichtet.');
  const kind = AI_KINDS[data?.kind] ? data.kind : 'parse';
  const size = JSON.stringify(data?.body || {}).length;
  if (size > MAX_BODY) throw new AppError('invalid', 'Der Inhalt ist zu groß (max. ca. 7 MB Anhänge).');
  const { pid, plan } = await projectOfUser(db, uid);
  const p = planOf(plan);
  const { model, cost: base } = modelFor(plan, kind, !!data?.deep);
  // Große Inhalte (lange Texte, viele PDF-Seiten) kosten bei der KI deutlich mehr → anteilig mehr Aktionen
  const cost = base + Math.floor(size / 250000);
  const body = cleanBody(structuredClone(data.body), model, p.limits.mailAttachments + 2);
  if (cost) await consume(db, pid, 'ai', cost, p.limits.aiActions);
  try {
    const res = await callAnthropic(apiKey, body, { fetchImpl });
    addTokens(db, pid, res.usage, model);
    return { content: res.content, stop_reason: res.stop_reason, model, plan };
  } catch (e) {
    if (cost) await refund(db, pid, 'ai', cost);
    throw e;
  }
}
