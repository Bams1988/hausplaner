// E-Mail-Eingang für alle Kunden: Jeder gemeinsame Bereich bekommt eine eigene Adresse
// (z. B. k7m2x9qa@in.deine-domain.de). Cloudflare Email Routing leitet jede Mail an diese Funktion weiter.
// Ablauf wie beim Postboten: Absender prüfen → KI liest Text und Anhänge → Aufgaben (gebündelt),
// Zahlungen, Kontakte und Dateien anlegen → Push an alle, die den Bereich sehen dürfen.
import crypto from 'node:crypto';
import { DEFAULT_AREAS, extractFromText, startByOf } from '../shared/ai.js';
import { planOf } from '../shared/plans.js';
import { AppError, berlinIso, berlinParts, daysBetween, deDate, newId, normName, remindAtOf, similar, T } from './util.js';
import { consume } from './plan.js';
import { tokensFor, canSee } from './push.js';

const MAX_FILE = 15 * 1024 * 1024;
const KI_TOTAL = 10 * 1024 * 1024;

export const htmlToText = (h) => String(h || '')
  .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\n{3,}/g, '\n\n').trim();

export function aliasFrom(to, domain) {
  const m = String(to || '').toLowerCase().match(/([a-z0-9._+-]+)@([a-z0-9.-]+)/);
  if (!m || (domain && m[2] !== domain.toLowerCase())) return null;
  return m[1].split('+')[0];
}

export function senderAllowed(addr, memberMails, allowed) {
  const f = String(addr || '').toLowerCase();
  if (!f) return false;
  if (memberMails.includes(f)) return true;
  return (allowed || []).some((a) => { a = String(a).toLowerCase(); return a.startsWith('@') ? f.endsWith(a) : f === a; });
}

// Anhänge sammeln; weitergeleitete Mails (.eml) auspacken; festlegen, welche die KI mitliest
export async function collectAttachments(parsed, simpleParser, maxKi) {
  const raw = (parsed.attachments || []).map((a) => ({ name: a.filename || 'Anhang', type: String(a.contentType || 'application/octet-stream').split(';')[0].trim().toLowerCase(), bytes: a.content }));
  const all = [];
  for (const a of raw) {
    if (!a.bytes || !a.bytes.length) continue;
    if (a.type === 'message/rfc822' || /\.eml$/i.test(a.name)) {
      try {
        const em = await simpleParser(a.bytes);
        const date = em.date instanceof Date && !isNaN(em.date) ? em.date.toISOString().slice(0, 10) : '';
        all.push({ ...a, type: 'message/rfc822', eml: true, text: [em.subject && `Betreff: ${em.subject}`, em.from?.text && `Von: ${em.from.text}`, date && `Datum: ${date}`, '', em.text || htmlToText(em.html)].filter((x) => x !== undefined && x !== false && x !== null).join('\n') });
        for (const b of em.attachments || []) if (b.content?.length) all.push({ name: b.filename || 'Anhang', type: String(b.contentType || '').split(';')[0].trim().toLowerCase(), bytes: b.content });
      } catch (e) { console.warn(`E-Mail-Anhang ${a.name} nicht lesbar: ${e.message}`); all.push(a); }
    } else all.push(a);
  }
  const out = [];
  let kiBytes = 0, kiCount = 0;
  for (const a of all) {
    if (a.bytes.length > MAX_FILE) { console.log(`${a.name}: zu groß – nicht gespeichert.`); continue; }
    if (/^image\//.test(a.type) && (a.bytes.length < 15 * 1024 || (/^(image\d{3}|outlook|logo|signature|signatur)/i.test(a.name) && a.bytes.length < 60 * 1024))) continue;
    if (!a.text && (/^text\/(plain|csv|calendar)$/.test(a.type) || /\.(txt|csv|ics)$/i.test(a.name))) a.text = a.bytes.toString('utf8');
    const kiType = a.type === 'application/pdf' || /\.pdf$/i.test(a.name) ? 'application/pdf' : /^image\/(jpeg|png|gif|webp)$/.test(a.type) ? a.type : null;
    const max = kiType === 'application/pdf' ? 8 * 1048576 : 3.5 * 1048576;
    const readable = !!kiType && a.bytes.length <= max && kiCount < maxKi && kiBytes + a.bytes.length <= KI_TOTAL;
    if (readable) { kiBytes += a.bytes.length; kiCount++; }
    out.push({ ...a, type: kiType || a.type, readable });
  }
  return out.slice(0, 15);
}

async function saveFile({ db, bucket, FieldValue }, pid, p, a, meta) {
  if ((p.storageBytes || 0) + a.bytes.length > (p.storageLimit || planOf(p.plan).limits.storageMB * 1048576)) throw new AppError('quota', 'Speicher voll');
  const ref = db.collection(`projects/${pid}/files`).doc();
  const safe = (meta.name || a.name).replace(/[^\w.\-äöüÄÖÜß ]+/g, '_').slice(0, 80) || 'datei';
  const path = `projects/${pid}/files/${ref.id}/${safe}`;
  await bucket.file(path).save(a.bytes, { resumable: false, contentType: a.type, metadata: { metadata: { areaId: meta.areaId || '' } } });
  const thumb = /^image\/(jpeg|png|gif|webp)$/.test(a.type) && a.bytes.length <= 90 * 1024 ? `data:${a.type};base64,${a.bytes.toString('base64')}` : null;
  await ref.set({ ...meta, type: a.type, size: a.bytes.length, path, thumb, createdBy: 'mindora', source: 'mail-auto' });
  p.storageBytes = (p.storageBytes || 0) + a.bytes.length; // Zähler selbst erhöht der Auslöser
  return ref.id;
}

// Haupteinstieg: rohe Mail (Buffer) + Empfängeradresse
export async function handleInbound(deps, { raw, to, domain }) {
  const { db, send, simpleParser, apiKey, now = Date.now() } = deps;
  const alias = aliasFrom(to, domain);
  if (!alias) return { status: 'unknown-address' };
  const ps = await db.collection('projects').where('inboxAlias', '==', alias).limit(1).get();
  if (ps.empty) return { status: 'unknown-address' };
  const pdoc = ps.docs[0], pid = pdoc.id, p = pdoc.data();

  const parsed = await simpleParser(raw);
  const msgId = parsed.messageId || crypto.createHash('sha1').update(raw).digest('hex');
  const logRef = db.doc(`projects/${pid}/mailLog/${crypto.createHash('sha1').update(msgId).digest('hex').slice(0, 24)}`);
  try { await logRef.create({ at: now, msgId: String(msgId).slice(0, 300) }); } catch { return { status: 'duplicate' }; }

  const fromV = parsed.from?.value?.[0] || {};
  const from = { addr: String(fromV.address || '').toLowerCase(), name: fromV.name || fromV.address || '' };
  const rawSubject = parsed.subject || '';
  const subject = rawSubject.replace(/^\s*((fwd?|wg|aw|re)\s*:\s*)+/i, '').trim() || 'E-Mail';
  const members = p.members || [];
  const users = {};
  for (const uid of members) users[uid] = (await db.doc(`users/${uid}`).get()).data() || {};
  const memberMails = members.map((u) => String(users[u].email || '').toLowerCase()).filter(Boolean);
  if (!senderAllowed(from.addr, memberMails, p.inboxAllowed)) {
    await pdoc.ref.update({ inboxLastIgnored: { from: from.addr, subject, at: now } });
    await logRef.update({ ignored: 'sender' });
    return { status: 'sender-not-allowed' };
  }

  const plan = planOf(p.plan);
  const langOf = (u) => users[u]?.lang || 'de';
  const sender = members.find((u) => String(users[u].email || '').toLowerCase() === from.addr) || null;
  const lang = sender ? langOf(sender) : 'de';
  const date = parsed.date instanceof Date && !isNaN(parsed.date) ? parsed.date : new Date(now);
  const dateIso = berlinIso(date);
  const body = (parsed.text || htmlToText(parsed.html) || '').trim();
  let text = `Betreff: ${rawSubject}\nVon: ${from.name} <${from.addr}>\nGesendet: ${deDate(dateIso)}\n\n${body}`;
  const att = await collectAttachments(parsed, simpleParser, plan.limits.mailAttachments);
  for (const a of att) if (a.text) text += `\n\n----- ${a.eml ? 'Angehängte E-Mail' : 'Anhang'}: ${a.name} -----\n${a.text.slice(0, 30000)}`;

  const pushTo = async (uids, title, msg, tag) => send(await tokensFor(db, uids), title, msg, tag);
  const fullMembers = members.filter((u) => !Array.isArray((p.access || {})[u]));
  const infoAtt = () => att.map((a) => ({ name: a.name, size: a.bytes.length, read: !!(a.readable || a.text), saved: !!a.saved }));

  // Monatskontingent
  try { await consume(db, pid, 'mails', 1, plan.limits.mails, new Date(now)); }
  catch (e) {
    if (e.code !== 'quota') throw e;
    await db.collection(`projects/${pid}/infos`).add({ title: subject, from: from.name, date: dateIso, text: `${text}\n\n[Nicht ausgewertet: Das Monatskontingent von ${plan.limits.mails} E-Mails (${plan.name}) ist erreicht.]`, kind: 'mail-auto', createdAt: now, createdBy: 'mindora', attachments: infoAtt(), quota: true });
    await pushTo(fullMembers, (l) => T(l, '📬 E-Mail-Kontingent erreicht', '📬 Email quota reached'), (l) => T(l, `„${subject}“ liegt ungelesen in der Ablage. Mit einem größeren Abo liest MindSpace mehr E-Mails pro Monat.`, `“${subject}” was filed unread. A bigger plan reads more emails per month.`), 'quota-mail');
    return { status: 'quota' };
  }

  const tasksSnap = await db.collection(`projects/${pid}/tasks`).where('done', '==', false).get();
  const openTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const contacts = (await db.collection(`projects/${pid}/contacts`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const areaDocs = (await db.collection(`projects/${pid}/areas`).get()).docs;
  const areas = areaDocs.length ? areaDocs.map((a) => ({ id: a.id, ...a.data() })) : DEFAULT_AREAS;
  const today = berlinParts(new Date(now));
  const todayDate = new Date(today.y, today.m - 1, today.d, 12);

  let result;
  try {
    const cfg = { apiKey, model: p.aiDeep && plan.features.bestModel ? plan.models.best : plan.models.mail };
    const opts = { me: { name: sender ? (p.memberNames || {})[sender] : Object.values(p.memberNames || {}).join(', '), email: from.addr }, contacts, openTasks, areas, now: todayDate, lang };
    const ki = att.filter((a) => a.readable);
    try {
      result = await extractFromText(cfg, text, { ...opts, attachments: ki.map((a) => ({ name: a.name, mediaType: a.type, data: a.bytes.toString('base64') })) });
    } catch (err) {
      console.warn(`Auswertung ${ki.length ? 'mit Anhängen ' : ''}fehlgeschlagen (${err.message}) – neuer Versuch ${ki.length ? 'ohne Anhänge' : 'mit schnellem Modell'}.`);
      for (const a of ki) a.readable = false;
      result = await extractFromText({ ...cfg, model: plan.models.quick }, text + (ki.length ? '\n\n[Hinweis: Die Anhänge konnten nicht mitgelesen werden.]' : ''), { ...opts, attachments: [] });
    }
    const readIdx = att.map((a, i) => (a.readable ? i : -1)).filter((i) => i >= 0);
    const map = (i) => (i == null || readIdx[i] === undefined ? null : readIdx[i]);
    for (const t of result.tasks || []) t.attachments = (t.attachments || []).map(map).filter((x) => x != null);
    for (const z of result.payments || []) z.attachment = map(z.attachment);
    for (const x of result.attachmentInfo || []) x.index = map(x.index);
  } catch (e) {
    console.error('KI-Auswertung fehlgeschlagen:', e.message);
    await db.collection(`projects/${pid}/infos`).add({ title: subject, from: from.name, date: dateIso, text: `${text}\n\n[MindSpace konnte diese Mail nicht auswerten: ${e.message}]`, kind: 'mail-auto', createdAt: now, createdBy: 'mindora', attachments: infoAtt() });
    for (const a of att) { try { await saveFile(deps, pid, p, a, { taskId: null, costId: null, areaId: null, desc: '', name: a.name, mailSubject: subject, createdAt: now }); a.saved = true; } catch (err) { console.warn(`Anhang ${a.name}: ${err.message}`); } }
    await pushTo(fullMembers, `📬 „${subject}“ ${lang === 'en' ? 'could not be read' : 'konnte nicht ausgewertet werden'}`.slice(0, 120), String(e.message).slice(0, 150), 'inbox-' + logRef.id);
    return { status: 'ai-failed' };
  }

  // Kontakte
  const idByKey = {};
  for (const c of result.contacts || []) {
    const match = contacts.find((x) => (c.email && String(x.email || '').toLowerCase() === c.email) || (normName(x.name) && normName(x.name) === normName(c.name)));
    let id = match?.id;
    if (match) {
      const patch = {};
      for (const k of ['company', 'role', 'email', 'phone', 'mobile', 'address', 'notes']) if (c[k] && !match[k]) patch[k] = c[k];
      if (Object.keys(patch).length) await db.doc(`projects/${pid}/contacts/${id}`).update(patch);
    } else {
      id = (await db.collection(`projects/${pid}/contacts`).add({ ...c, createdAt: now, createdBy: 'mindora', source: 'mail-auto' })).id;
      contacts.push({ id, ...c });
    }
    if (c.email) idByKey[c.email] = id;
    idByKey[normName(c.name)] = id;
  }
  const contactFor = (t) => idByKey[String(t.contactEmail || '').toLowerCase()] || idByKey[normName(t.contactName)] || null;
  if (!areaDocs.length) for (const a of DEFAULT_AREAS) { const { id, ...rest } = a; await db.doc(`projects/${pid}/areas/${id}`).set(rest); }

  // Aufgaben (bündeln statt doppelt)
  const fresh = [], bundled = [], attTo = {};
  for (const t of (result.tasks || []).filter((x) => !x.done)) {
    const ex = (t.matchId && openTasks.find((o) => o.id === t.matchId)) || openTasks.find((o) => similar(o.title, t.title) >= 0.75);
    if (ex) {
      const area = ex.areaId || t.areaId;
      const info = [t.addition || t.details || t.title, t.due && t.due !== ex.due ? `${T(lang, 'Frist', 'Deadline')}: ${deDate(t.due)}` : ''].filter(Boolean).join(' · ');
      await db.collection(`projects/${pid}/comments`).add({ taskId: ex.id, areaId: area, text: `📬 ${subject}: ${info}`.slice(0, 900), by: 'mindora', byName: 'MindSpace', at: now, notified: true });
      const patch = { isNew: true, mailSubject: subject };
      if (t.due && (!ex.due || t.due < ex.due)) {
        const nu = { ...ex, due: t.due, time: t.time || ex.time || null };
        Object.assign(patch, { due: nu.due, time: nu.time, remindAt: remindAtOf(nu), reminded: false, startBy: startByOf(nu) });
      }
      await db.doc(`projects/${pid}/tasks/${ex.id}`).update(patch);
      bundled.push({ ...t, id: ex.id, title: ex.title, areaId: area });
      for (const i of t.attachments || []) if (!attTo[i]) attTo[i] = { taskId: ex.id, areaId: area };
      continue;
    }
    const notes = [t.details, t.quote ? `„${t.quote}“` : '', t.leadReason ? `Vorlauf: ${t.leadReason}` : ''].filter(Boolean).join('\n\n');
    const due = t.due || null;
    const task = {
      title: t.title, due, time: t.time || null, areaId: t.areaId, phase: t.phase || null, leadDays: t.leadDays ?? null, dueKind: t.dueKind || null,
      contactId: contactFor(t), reminder: !due ? 'none' : daysBetween(today.iso, due) <= 1 ? 'day0' : 'day1',
      notes: `${notes}\n\n${T(lang, 'Aus der E-Mail von', 'From the email by')} ${result.from || from.name} ${T(lang, 'vom', 'of')} ${deDate(dateIso)}\n${T(lang, 'Betreff', 'Subject')}: ${subject}`,
      source: 'mail-auto', mailSubject: subject, isNew: true, done: false, assignee: sender || 'all', createdAt: now, createdBy: 'mindora',
      ...(t.repeat ? { repeat: t.repeat } : {}),
    };
    task.remindAt = remindAtOf(task); task.reminded = false; task.startBy = startByOf(task);
    const ref = await db.collection(`projects/${pid}/tasks`).add(task);
    const created = { id: ref.id, ...task };
    openTasks.push(created); fresh.push(created);
    for (const i of t.attachments || []) if (!attTo[i]) attTo[i] = { taskId: ref.id, areaId: t.areaId };
  }

  // Zahlungen ohne Dubletten
  const oldCosts = (await db.collection(`projects/${pid}/costs`).get()).docs.map((d) => d.data());
  const pays = (result.payments || []).filter((z) => !oldCosts.some((c) => c.amount != null && z.amount != null && Math.abs(c.amount - z.amount) < 0.01 && similar(c.title || '', z.title) >= 0.5));
  const costTo = {};
  for (const z of pays) {
    const ref = await db.collection(`projects/${pid}/costs`).add({
      title: z.title, amount: z.amount ?? null, due: z.due || null, kind: z.kind, areaId: z.areaId, paid: false, paidAt: null, isNew: true,
      note: [z.payee ? `${T(lang, 'Empfänger', 'Payee')}: ${z.payee}` : '', `${T(lang, 'Aus der E-Mail', 'From the email')} „${subject}“`].filter(Boolean).join('\n'), source: 'mail-auto', createdAt: now, createdBy: 'mindora',
    });
    if (z.attachment != null && !costTo[z.attachment]) costTo[z.attachment] = { costId: ref.id, areaId: z.areaId };
  }

  // Anhänge ablegen
  const first = fresh[0] || bundled[0] || null;
  let filed = 0, full = false;
  for (const [i, a] of att.entries()) {
    const info = (result.attachmentInfo || []).find((x) => x.index === i) || {};
    const goal = attTo[i] || costTo[i] || (first ? { taskId: first.id, areaId: first.areaId } : { areaId: info.areaId || null });
    const ext = (a.name.match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
    try {
      await saveFile(deps, pid, p, a, { taskId: goal.taskId || null, costId: goal.costId || costTo[i]?.costId || null, areaId: goal.areaId || info.areaId || null, desc: info.desc || '', name: info.title ? info.title + ext : a.name, mailSubject: subject, createdAt: now });
      a.saved = true; filed++;
    } catch (err) { if (err.code === 'quota') full = true; console.warn(`Anhang „${a.name}“ nicht gespeichert: ${err.message}`); }
  }

  await db.collection(`projects/${pid}/infos`).add({ title: subject, from: result.from || from.name, date: result.date || dateIso, text: text.slice(0, 200000), kind: 'mail-auto', createdAt: now, createdBy: 'mindora', attachments: infoAtt(), ...(full ? { storageFull: true } : {}) });

  // Push in der Sprache jedes Empfängers
  const areasHit = [...new Set([...fresh, ...bundled].map((t) => t.areaId).concat(pays.map((z) => z.areaId)))];
  const recipients = areasHit.length ? members.filter((u) => areasHit.some((a) => canSee(p, u, a))) : fullMembers;
  const head = (l) => {
    const parts = [];
    if (fresh.length) parts.push(T(l, `${fresh.length} ${fresh.length === 1 ? 'neue Aufgabe' : 'neue Aufgaben'}`, `${fresh.length} new ${fresh.length === 1 ? 'task' : 'tasks'}`));
    if (bundled.length) parts.push(T(l, `${bundled.length} ergänzt`, `${bundled.length} updated`));
    if (pays.length) parts.push(T(l, `${pays.length} ${pays.length === 1 ? 'Zahlung' : 'Zahlungen'}`, `${pays.length} ${pays.length === 1 ? 'payment' : 'payments'}`));
    return parts.length ? `📬 ${parts.join(', ')} ${T(l, 'aus', 'from')} „${subject}“`.slice(0, 120) : T(l, `📬 „${subject}“ gelesen`, `📬 “${subject}” read`);
  };
  const lines = (l) => {
    if (!fresh.length && !bundled.length && !pays.length) return T(l, 'Keine neuen Aufgaben darin – die Mail liegt in der Ablage.', 'No new tasks in it – the mail is in the archive.');
    const z = [...fresh.map((t) => `• ${t.title}`), ...bundled.map((t) => `• ↺ ${t.title}`), ...pays.map((x) => `• 💶 ${x.title}${x.amount != null ? ` – ${x.amount.toLocaleString(l === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 2 })} €` : ''}`)];
    if (filed) z.push(T(l, `📎 ${filed} ${filed === 1 ? 'Anhang' : 'Anhänge'} abgelegt`, `📎 ${filed} ${filed === 1 ? 'attachment' : 'attachments'} filed`));
    if (full) z.push(T(l, '⚠️ Speicher voll – nicht alle Anhänge gesichert', '⚠️ Storage full – not all attachments saved'));
    return z.slice(0, 4).join('\n') + (z.length > 4 ? T(l, `\n… und ${z.length - 4} weitere`, `\n… and ${z.length - 4} more`) : '');
  };
  await pushTo(recipients, head, lines, 'inbox-' + logRef.id);
  await logRef.update({ tasks: fresh.length, bundled: bundled.length, payments: pays.length, files: filed });
  return { status: 'ok', tasks: fresh.length, bundled: bundled.length, payments: pays.length, files: filed };
}

// Eindeutige Adresse für einen Bereich vergeben (nur der Server darf inboxAlias setzen)
export async function ensureInboxAlias(db, pid) {
  const ref = db.doc(`projects/${pid}`);
  const cur = (await ref.get()).get('inboxAlias');
  if (cur) return cur;
  for (let i = 0; i < 5; i++) {
    const alias = newId(10).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    if (alias.length < 8) continue;
    const taken = await db.collection('projects').where('inboxAlias', '==', alias).limit(1).get();
    if (taken.empty) { await ref.update({ inboxAlias: alias }); return alias; }
  }
  throw new AppError('upstream', 'Adresse konnte nicht vergeben werden.');
}
