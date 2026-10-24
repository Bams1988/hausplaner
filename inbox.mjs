// E-Mail-Eingang: liest neue Mails aus dem Mindora-Postfach (z. B. Gmail),
// lässt sie von der KI auswerten und legt Aufgaben, Kontakte und Ablage-Einträge an.
import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { extractFromText, startByOf, DEFAULT_AREAS } from '../ai.js';
import { parseEmails, guessPhase, similarity } from '../parser.js';
import { computeRemindAt } from '../store.js';

const MAX_PER_RUN = 10;
const norm = (s) => String(s || '').toLowerCase().replace(/\b(herr|frau|dr\.?)\s+/g, '').replace(/[^a-zäöüß]/g, '');
const htmlToText = (h) => String(h || '')
  .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\n{3,}/g, '\n\n').trim();

function pickProject(projects, user) {
  if (process.env.INBOX_PROJECT) return projects.find((p) => p.id === process.env.INBOX_PROJECT) || null;
  const byAddr = projects.find((p) => (p.get('inboxAddress') || '') === user);
  if (byAddr) return byAddr;
  return projects.length === 1 ? projects[0] : null;
}

function isAllowed(from, memberMails, allowed) {
  const f = (from || '').toLowerCase();
  if (!f) return false;
  if (memberMails.includes(f)) return true;
  return allowed.some((a) => (a.startsWith('@') ? f.endsWith(a) : f === a));
}

export async function processInbox({ db, admin, send, tokensFor, projects, now = Date.now(), log = console }) {
  const user = (process.env.INBOX_USER || '').trim().toLowerCase();
  const pass = (process.env.INBOX_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) return 0;
  const p = pickProject(projects, user);
  if (!p) { log.warn('E-Mail-Eingang: Mehrere Projekte gefunden – bitte die Variable INBOX_PROJECT setzen.'); return 0; }

  const members = p.get('members') || [];
  const memberNames = p.get('memberNames') || {};
  const mailOf = new Map();
  for (const uid of members) {
    const s = await db.doc(`users/${uid}`).get();
    if (s.get('email')) mailOf.set(uid, String(s.get('email')).toLowerCase());
  }
  const memberMails = [...mailOf.values()];
  const allowed = (p.get('inboxAllowed') || []).map((s) => String(s).toLowerCase());

  let aiCfg = null;
  try {
    const s = await p.ref.collection('private').doc('ai').get();
    if (s.exists && s.get('apiKey')) aiCfg = { apiKey: s.get('apiKey'), model: s.get('model') };
  } catch {}

  const client = new ImapFlow({
    host: process.env.INBOX_HOST || 'imap.gmail.com', port: Number(process.env.INBOX_PORT || 993), secure: true,
    auth: { user, pass }, logger: false,
  });
  await client.connect();
  let sent = 0;
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = ((await client.search({ seen: false }, { uid: true })) || []).slice(0, MAX_PER_RUN);
    for (const uid of uids) {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!msg?.source) continue;
      const mail = await simpleParser(msg.source);
      const from = mail.from?.value?.[0]?.address?.toLowerCase() || '';
      const fromName = mail.from?.value?.[0]?.name || from;
      const subject = (mail.subject || '').replace(/^\s*((fwd?|wg|aw|re)\s*:\s*)+/i, '').trim() || 'E-Mail';
      const logId = crypto.createHash('sha1').update(mail.messageId || `${uid}-${mail.date}`).digest('hex').slice(0, 24);
      const logRef = p.ref.collection('inboxLog').doc(logId);
      const prev = await logRef.get();
      if (prev.exists && prev.get('status') !== 'fehler') { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); continue; }

      if (!isAllowed(from, memberMails, allowed)) {
        await logRef.set({ at: now, from, subject, status: 'ignoriert' });
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        log.log(`E-Mail ignoriert (Absender nicht erlaubt): ${from}`);
        continue;
      }

      try {
        const body = (mail.text || htmlToText(mail.html) || '').trim();
        const dateIso = mail.date ? new Date(mail.date).toISOString().slice(0, 10) : null;
        const text = `Betreff: ${mail.subject || ''}\nVon: ${fromName} <${from}>\nGesendet: ${mail.date ? new Date(mail.date).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : ''}\n\n${body}`;
        const sender = members.find((u) => mailOf.get(u) === from) || null;
        const [openSnap, contactSnap, areaSnap] = await Promise.all([
          p.ref.collection('tasks').where('done', '==', false).get(),
          p.ref.collection('contacts').get(),
          p.ref.collection('areas').get(),
        ]);
        const openTasks = openSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const contacts = contactSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const areas = areaSnap.empty ? DEFAULT_AREAS : areaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        let result;
        if (aiCfg) {
          result = await extractFromText(aiCfg, text, {
            me: { name: sender ? memberNames[sender] : Object.values(memberNames).join(', '), email: from },
            contacts, openTasks, areas, now: new Date(now),
          });
        } else {
          const r = parseEmails(text, { today: new Date(now), existing: openTasks });
          result = {
            subject, from: fromName, date: dateIso, summary: '', contacts: [],
            tasks: r.tasks.filter((t) => t.selected).map((t) => {
              const ph = guessPhase(t.notes);
              const house = ph !== 'Allgemein' && areas.some((a) => a.id === 'hausbau');
              return { title: t.title, details: t.notes, due: t.due, time: t.time, dueKind: t.due ? 'frist' : 'keine', areaId: house ? 'hausbau' : (areas.find((a) => a.id === 'alltag') || areas[0]).id, phase: house ? ph : null, leadDays: null, leadReason: '', quote: '', done: false };
            }),
          };
        }

        // Kontakte anlegen oder ergänzen
        const idByKey = new Map();
        for (const c of result.contacts || []) {
          const match = contacts.find((x) => (c.email && (x.email || '').toLowerCase() === c.email) || (norm(x.name) && norm(x.name) === norm(c.name)));
          let id = match?.id;
          if (match) {
            const patch = {}; for (const k of ['company', 'role', 'email', 'phone', 'mobile', 'address', 'notes']) if (c[k] && !match[k]) patch[k] = c[k];
            if (Object.keys(patch).length) await p.ref.collection('contacts').doc(id).update(patch);
          } else {
            const ref = await p.ref.collection('contacts').add({ ...c, createdAt: now, createdBy: 'mindora', source: 'mail-auto' });
            id = ref.id; contacts.push({ id, ...c });
          }
          if (c.email) idByKey.set(c.email, id);
          idByKey.set(norm(c.name), id);
        }
        const contactFor = (t) => idByKey.get((t.contactEmail || '').toLowerCase()) || idByKey.get(norm(t.contactName)) || null;

        // Aufgaben anlegen (ohne Dubletten und ohne bereits erledigte)
        const fresh = (result.tasks || []).filter((t) => !t.done && !openTasks.some((o) => similarity(o.title, t.title) >= 0.75));
        const batch = db.batch();
        const todayIso = new Date(now).toISOString().slice(0, 10);
        for (const t of fresh) {
          const notes = [t.details, t.quote ? `„${t.quote}“` : '', t.leadReason ? `Vorlauf: ${t.leadReason}` : ''].filter(Boolean).join('\n\n');
          const due = t.due || null;
          const reminder = !due ? 'none' : (new Date(due) - new Date(todayIso)) / 864e5 <= 1 ? 'day0' : 'day1';
          const task = {
            title: t.title, due, time: t.time || null, areaId: t.areaId, phase: t.phase || null, leadDays: t.leadDays ?? null,
            dueKind: t.dueKind || null, contactId: contactFor(t), reminder, notes: `${notes}\n\nAus der E-Mail von ${result.from || fromName}${dateIso ? ` vom ${dateIso.split('-').reverse().join('.')}` : ''}\nBetreff: ${subject}`,
            source: 'mail-auto', mailSubject: subject, isNew: true, done: false, assignee: sender || 'all', createdAt: now, createdBy: 'mindora',
          };
          task.remindAt = computeRemindAt(task); task.reminded = false; task.startBy = startByOf(task);
          batch.set(p.ref.collection('tasks').doc(), task);
        }
        if (areaSnap.empty && fresh.length) for (const a of DEFAULT_AREAS) { const { id, ...rest } = a; batch.set(p.ref.collection('areas').doc(id), rest); }
        batch.set(p.ref.collection('infos').doc(), { title: subject, from: result.from || fromName, date: result.date || dateIso, text, kind: 'mail-auto', createdAt: now, createdBy: 'mindora' });
        batch.set(logRef, { at: now, from, subject, status: 'ok', tasks: fresh.length, contacts: (result.contacts || []).length });
        await batch.commit();

        if (fresh.length) {
          const all = await tokensFor(members);
          const title = `📬 ${fresh.length} ${fresh.length === 1 ? 'neue Aufgabe' : 'neue Aufgaben'} aus „${subject}“`.slice(0, 120);
          const bodyTxt = fresh.slice(0, 3).map((t) => `• ${t.title}`).join('\n') + (fresh.length > 3 ? `\n… und ${fresh.length - 3} weitere` : '');
          sent += await send(all, title, bodyTxt, 'inbox-' + logId);
        }
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        log.log(`E-Mail verarbeitet: „${subject}“ – ${fresh.length} Aufgaben`);
      } catch (e) {
        const attempts = (prev.exists ? prev.get('attempts') || 1 : 0) + 1;
        await logRef.set({ at: now, from, subject, status: 'fehler', error: String(e.message || e).slice(0, 300), attempts });
        if (attempts >= 3) await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        log.warn(`E-Mail „${subject}“ nicht verarbeitet (Versuch ${attempts}): ${e.message}`);
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  await p.ref.update({ inboxAddress: user, inboxCheckedAt: now });
  return sent;
}
