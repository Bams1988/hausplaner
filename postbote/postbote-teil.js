// =====================================================================
//  MindSpace-Postbote – läuft in deinem MindSpace-Gmail-Konto (Google Apps Script)
//  Liest jede Minute neue E-Mails, lässt sie von der KI auswerten und legt
//  Aufgaben, Kontakte und Ablage-Einträge in MindSpace an.
//  Außerdem: Push bei neuer Zuständigkeit und – als Web-App bereitgestellt – das Kalender-Abo.
//
//  Einrichtung: Anleitung, Stufe 5. Einmalig die Funktion „einrichten“ ausführen.
// =====================================================================

const PB = {
  TZ: 'Europe/Berlin',
  MAX_PRO_LAUF: 3,
  ZEIT_PRO_LAUF: 3.5 * 60 * 1000, // danach keine weitere Mail mehr anfangen
  KI_ANHAENGE: 4, // so viele Anhänge liest die KI höchstens mit
  KI_ANHANG_MB: 10, // zusammen höchstens so groß
  MAX_ANHANG: 15 * 1024 * 1024, // größere Anhänge werden nicht gespeichert
  TEIL: 900 * 1024, // Firestore: max. 1 MiB je Dokument
  LABEL_OK: 'MindSpace',
  LABEL_IGNORIERT: 'MindSpace/ignoriert',
  LABEL_FEHLER: 'MindSpace/Fehler',
  FAST_MODEL: 'claude-haiku-5-5',
};

// ------------------------------------------------------------------ Einrichtung
function einrichten() {
  const sa = dienstkonto_();
  console.log(`✓ Firebase-Zugang gefunden (Projekt „${sa.project_id}“).`);
  const projekte = fsList_('projects');
  if (!projekte.length) throw new Error('In Firebase gibt es noch keinen gemeinsamen Bereich. Lege ihn zuerst in der App an (Konto erstellen → Loslegen).');
  const p = waehleProjekt_(projekte);
  console.log(`✓ Gemeinsamer Bereich: „${p.data.name || p.id}“ (${(p.data.members || []).length} Mitglieder).`);
  for (const t of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger('postbote').timeBased().everyMinutes(1).create();
  console.log('✓ Zeitplan eingerichtet: MindSpace schaut jetzt jede Minute nach neuen E-Mails.');
  postbote();
  console.log('Fertig. Du kannst dieses Fenster schließen.');
}

function ausschalten() {
  for (const t of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(t);
  console.log('Der MindSpace-Postbote ist ausgeschaltet.');
}

// ------------------------------------------------------------------ Hauptlauf (jede Minute)
function postbote() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    try { zuweisungenMelden_(); } catch (e) { console.warn('Zuweisungen: ' + e.message); }
    const threads = GmailApp.search('in:inbox is:unread', 0, 10);
    const mails = [];
    for (const th of threads) for (const m of th.getMessages()) if (m.isUnread()) mails.push({ th, m });
    const props = PropertiesService.getScriptProperties();
    const now = Date.now();
    const last = Number(props.getProperty('letzterKontakt') || 0);
    if (!mails.length) {
      if (now - last > 10 * 60e3) { meldeAbruf_(); props.setProperty('letzterKontakt', String(now)); }
      return;
    }
    const ctx = kontext_();
    // Google beendet ein Skript nach 6 Minuten – rechtzeitig aufhören, der Rest kommt beim nächsten Lauf dran
    const start = Date.now();
    for (const { th, m } of mails.slice(0, PB.MAX_PRO_LAUF)) {
      if (Date.now() - start > PB.ZEIT_PRO_LAUF) { console.log('Zeitlimit erreicht – weitere Mails beim nächsten Lauf.'); break; }
      verarbeite_(ctx, th, m);
    }
    meldeAbruf_(ctx.p);
    props.setProperty('letzterKontakt', String(now));
  } finally {
    lock.releaseLock();
  }
}

function meldeAbruf_(p) {
  try {
    p = p || waehleProjekt_(fsList_('projects'));
    fsUpdate_(`projects/${p.id}`, { inboxAddress: Session.getEffectiveUser().getEmail().toLowerCase(), inboxCheckedAt: Date.now(), inboxSource: 'gmail-script' });
  } catch (e) { console.warn('Konnte den Abruf nicht melden: ' + e.message); }
}

function kontext_() {
  const p = waehleProjekt_(fsList_('projects'));
  const members = p.data.members || [];
  const names = p.data.memberNames || {};
  const mailOf = {}, langOf = {};
  for (const uid of members) {
    const u = fsGet_(`users/${uid}`);
    if (u && u.email) mailOf[uid] = String(u.email).toLowerCase();
    langOf[uid] = (u && u.lang) || 'de';
  }
  let ai = null;
  const a = fsGet_(`projects/${p.id}/private/ai`);
  if (a && a.apiKey) ai = { apiKey: a.apiKey, model: a.model };
  return { p, members, names, mailOf, langOf, access: p.data.access || {}, ai, allowed: (p.data.inboxAllowed || []).map((s) => String(s).toLowerCase()) };
}
// Wer darf einen Bereich sehen? (Mitglieder mit Zugriff auf alles oder auf diesen Bereich)
function berechtigt_(ctx, areaId) {
  return ctx.members.filter((u) => { const a = ctx.access[u]; return !a || a === 'all' || (Array.isArray(a) && a.includes(areaId)); });
}

function waehleProjekt_(projekte) {
  const id = PropertiesService.getScriptProperties().getProperty('PROJEKT_ID');
  if (id) {
    const p = projekte.find((x) => x.id === id.trim());
    if (!p) throw new Error(`PROJEKT_ID „${id}“ gibt es in Firebase nicht.`);
    return p;
  }
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  const byAddr = projekte.find((x) => (x.data.inboxAddress || '') === me);
  if (byAddr) return byAddr;
  if (projekte.length === 1) return projekte[0];
  const liste = projekte.map((x) => `${x.id} („${x.data.name || ''}“, ${(x.data.members || []).length} Mitglieder)`).join(', ');
  throw new Error(`Es gibt mehrere gemeinsame Bereiche: ${liste}. Trage die richtige ID als Skripteigenschaft PROJEKT_ID ein.`);
}

function absender_(m) {
  const f = m.getFrom() || '';
  const mm = f.match(/<([^>]+)>/);
  const addr = (mm ? mm[1] : f).trim().toLowerCase();
  const name = (mm ? f.slice(0, f.indexOf('<')) : '').replace(/"/g, '').trim() || addr;
  return { addr, name };
}

function erlaubt_(ctx, from) {
  if (Object.values(ctx.mailOf).includes(from)) return true;
  return ctx.allowed.some((a) => (a.startsWith('@') ? from.endsWith(a) : from === a));
}

function label_(name) { return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name); }

function verarbeite_(ctx, th, m) {
  const { p } = ctx;
  const from = absender_(m);
  const subject = (m.getSubject() || '').replace(/^\s*((fwd?|wg|aw|re)\s*:\s*)+/i, '').trim() || 'E-Mail';
  const now = Date.now();

  if (!erlaubt_(ctx, from.addr)) {
    console.log(`Ignoriert: „${subject}“ von ${from.addr} – Absender ist nicht erlaubt. Erlaubt sind ${Object.values(ctx.mailOf).join(', ')}${ctx.allowed.length ? ', ' + ctx.allowed.join(', ') : ''}.`);
    fsUpdate_(`projects/${p.id}`, { inboxLastIgnored: { from: from.addr, subject, at: now } });
    m.markRead(); th.addLabel(label_(PB.LABEL_IGNORIERT));
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const versuchKey = 'versuch_' + m.getId();
  const versuch = Number(props.getProperty(versuchKey) || 0) + 1;
  props.setProperty(versuchKey, String(versuch));

  const body = (m.getPlainBody() || '').trim();
  const dateIso = Utilities.formatDate(m.getDate(), PB.TZ, 'yyyy-MM-dd');
  let text = `Betreff: ${m.getSubject() || ''}\nVon: ${from.name} <${from.addr}>\nGesendet: ${Utilities.formatDate(m.getDate(), PB.TZ, 'dd.MM.yyyy HH:mm')}\n\n${body}`;
  const sender = ctx.members.find((u) => ctx.mailOf[u] === from.addr) || null;
  const lang = (sender && ctx.langOf[sender]) || 'de';
  const anhaenge = anhaengeLesen_(m);
  // Als Anhang weitergeleitete E-Mails (.eml) und Textdateien: Inhalt in den Text übernehmen, damit der ganze Verlauf gelesen wird
  for (const a of anhaenge) if (a.text) text += `\n\n----- ${a.eml ? 'Angehängte E-Mail' : 'Anhang'}: ${a.name} -----\n${a.text.slice(0, 30000)}`;
  console.log(`„${subject}“: ${anhaenge.length} Anhänge${anhaenge.length ? ' – ' + anhaenge.map((a) => `${a.name} (${Math.round(a.bytes.length / 1024)} KB${a.lesbar ? ', KI liest mit' : a.text ? ', Text übernommen' : ''})`).join(', ') : ''}`);

  try {
    const tasksAll = fsList_(`projects/${p.id}/tasks`);
    const openTasks = tasksAll.filter((t) => !t.data.done).map((t) => ({ id: t.id, ...t.data }));
    const contacts = fsList_(`projects/${p.id}/contacts`).map((c) => ({ id: c.id, ...c.data }));
    const areaDocs = fsList_(`projects/${p.id}/areas`);
    const areas = areaDocs.length ? areaDocs.map((a) => ({ id: a.id, ...a.data })) : DEFAULT_AREAS;

    let result;
    if (ctx.ai) {
      const cfg = { apiKey: ctx.ai.apiKey, model: versuch >= 2 ? PB.FAST_MODEL : ctx.ai.model };
      const opts = { me: { name: sender ? ctx.names[sender] : Object.values(ctx.names).join(', '), email: from.addr }, contacts, openTasks, areas, now: berlinHeute_(), lang };
      const kiAnh = anhaenge.filter((a) => a.lesbar);
      try {
        result = extractFromText(cfg, text, { ...opts, attachments: kiAnh.map((a) => ({ name: a.name, mediaType: a.type, data: Utilities.base64Encode(a.bytes) })) });
      } catch (err) {
        if (!kiAnh.length) throw err;
        // Zu groß oder zu langsam mit Anhängen → ohne Dokumente erneut, die Anhänge werden trotzdem abgelegt
        console.warn(`Auswertung mit Anhängen fehlgeschlagen (${err.message}) – versuche es ohne.`);
        for (const a of kiAnh) a.lesbar = false;
        result = extractFromText({ ...cfg, model: PB.FAST_MODEL }, text + '\n\n[Hinweis: Die Anhänge konnten nicht mitgelesen werden.]', { ...opts, attachments: [] });
      }
      // Nummern der KI beziehen sich nur auf lesbare Anhänge → auf alle Anhänge umrechnen
      const lesbar = anhaenge.map((a, i) => (a.lesbar ? i : -1)).filter((i) => i >= 0);
      const um = (i) => (i == null || lesbar[i] === undefined ? null : lesbar[i]);
      for (const t of result.tasks || []) t.attachments = (t.attachments || []).map(um).filter((x) => x != null);
      for (const z of result.payments || []) z.attachment = um(z.attachment);
      for (const x of result.attachmentInfo || []) x.index = um(x.index);
    } else {
      result = { subject, from: from.name, date: dateIso, summary: '', contacts: [], tasks: [{ title: `E-Mail ansehen: ${subject}`.slice(0, 80), details: body.slice(0, 400), due: null, time: null, dueKind: 'keine', areaId: (areas.find((a) => a.id === 'alltag') || areas[0]).id, phase: null, leadDays: null, leadReason: '', quote: '', done: false }] };
    }

    // Kontakte anlegen oder ergänzen
    const idByKey = {};
    for (const c of result.contacts || []) {
      const match = contacts.find((x) => (c.email && (x.email || '').toLowerCase() === c.email) || (normName_(x.name) && normName_(x.name) === normName_(c.name)));
      let id = match && match.id;
      if (match) {
        const patch = {};
        for (const k of ['company', 'role', 'email', 'phone', 'mobile', 'address', 'notes']) if (c[k] && !match[k]) patch[k] = c[k];
        if (Object.keys(patch).length) fsUpdate_(`projects/${p.id}/contacts/${id}`, patch);
      } else {
        id = fsCreate_(`projects/${p.id}/contacts`, { ...c, createdAt: now, createdBy: 'mindora', source: 'mail-auto' });
        contacts.push({ id, ...c });
      }
      if (c.email) idByKey[c.email] = id;
      idByKey[normName_(c.name)] = id;
    }
    const contactFor = (t) => idByKey[(t.contactEmail || '').toLowerCase()] || idByKey[normName_(t.contactName)] || null;

    // Bereiche speichern, falls noch keine eigenen existieren
    if (!areaDocs.length) for (const a of DEFAULT_AREAS) { const { id, ...rest } = a; fsSet_(`projects/${p.id}/areas/${id}`, rest); }

    // Aufgaben anlegen – passt der Inhalt zu einer vorhandenen Aufgabe, wird gebündelt statt doppelt angelegt
    const heute = berlinIso_(new Date());
    const offene = (result.tasks || []).filter((t) => !t.done);
    const fresh = [], gebuendelt = [];
    const anhangZu = {}; // Anhang-Nr. → { taskId, areaId }
    for (const t of offene) {
      const ex = (t.matchId && openTasks.find((o) => o.id === t.matchId)) || openTasks.find((o) => aehnlich_(o.title, t.title) >= 0.75);
      if (ex) {
        const area = ex.areaId || t.areaId;
        const info = [t.addition || t.details || t.title, t.due && t.due !== ex.due ? `${lang === 'en' ? 'Deadline' : 'Frist'}: ${t.due.split('-').reverse().join('.')}` : ''].filter(Boolean).join(' · ');
        fsCreate_(`projects/${p.id}/comments`, { taskId: ex.id, areaId: area, text: `📬 ${subject}: ${info}`.slice(0, 900), by: 'mindora', byName: 'MindSpace', at: now, notified: true });
        const patch = { isNew: true, mailSubject: subject };
        if (t.due && (!ex.due || t.due < ex.due)) {
          const neu = { ...ex, due: t.due, time: t.time || ex.time || null };
          Object.assign(patch, { due: neu.due, time: neu.time, remindAt: erinnerungsZeit_(neu), reminded: false, startBy: startByOf(neu) });
        }
        fsUpdate_(`projects/${p.id}/tasks/${ex.id}`, patch);
        gebuendelt.push({ ...t, id: ex.id, title: ex.title, areaId: area });
        for (const i of t.attachments || []) if (!anhangZu[i]) anhangZu[i] = { taskId: ex.id, areaId: area };
        continue;
      }
      fresh.push(t);
    }
    for (const t of fresh) {
      const notes = [t.details, t.quote ? `„${t.quote}“` : '', t.leadReason ? `Vorlauf: ${t.leadReason}` : ''].filter(Boolean).join('\n\n');
      const due = t.due || null;
      const reminder = !due ? 'none' : tageZwischen_(heute, due) <= 1 ? 'day0' : 'day1';
      const task = {
        title: t.title, due, time: t.time || null, areaId: t.areaId, phase: t.phase || null, leadDays: t.leadDays == null ? null : t.leadDays,
        dueKind: t.dueKind || null, contactId: contactFor(t), reminder,
        notes: `${notes}\n\nAus der E-Mail von ${result.from || from.name} vom ${dateIso.split('-').reverse().join('.')}\nBetreff: ${subject}`,
        source: 'mail-auto', mailSubject: subject, isNew: true, done: false, assignee: sender || 'all', createdAt: now, createdBy: 'mindora',
      };
      task.remindAt = erinnerungsZeit_(task);
      task.reminded = false;
      task.startBy = startByOf(task);
      const tid = fsCreate_(`projects/${p.id}/tasks`, task);
      openTasks.push({ id: tid, ...task });
      for (const i of t.attachments || []) if (!anhangZu[i]) anhangZu[i] = { taskId: tid, areaId: t.areaId };
    }

    // Zahlungen (Rechnungen, Abschläge) unter Kosten anlegen – ohne Dubletten
    const kostenAlt = fsList_(`projects/${p.id}/costs`).map((c) => c.data);
    const zahlungen = (result.payments || []).filter((z) => !kostenAlt.some((c) => c.amount != null && z.amount != null && Math.abs(c.amount - z.amount) < 0.01 && aehnlich_(c.title || '', z.title) >= 0.5));
    const kostenZu = {};
    for (const z of zahlungen) {
      const cid = fsCreate_(`projects/${p.id}/costs`, {
        title: z.title, amount: z.amount == null ? null : z.amount, due: z.due || null, kind: z.kind, areaId: z.areaId, paid: false, paidAt: null, isNew: true,
        note: [z.payee ? `Empfänger: ${z.payee}` : '', `Aus der E-Mail „${subject}“`].filter(Boolean).join('\n'), source: 'mail-auto', createdAt: now, createdBy: 'mindora',
      });
      if (z.attachment != null && !kostenZu[z.attachment]) kostenZu[z.attachment] = { costId: cid, areaId: z.areaId };
    }

    // Anhänge in der Aufgabe (bzw. bei der Zahlung) ablegen – mit Beschreibung für die Suche
    const ersteAufgabe = fresh.length ? openTasks[openTasks.length - fresh.length] : gebuendelt[0] || null;
    let abgelegt = 0;
    anhaenge.forEach((a, i) => {
      const info = (result.attachmentInfo || []).find((x) => x.index === i) || {};
      const ziel = anhangZu[i] || kostenZu[i] || (ersteAufgabe ? { taskId: ersteAufgabe.id, areaId: ersteAufgabe.areaId } : { areaId: info.areaId || null });
      try {
        dateiAblegen_(p.id, a, {
          taskId: ziel.taskId || null, costId: ziel.costId || (kostenZu[i] && kostenZu[i].costId) || null, areaId: ziel.areaId || info.areaId || null,
          desc: info.desc || '', name: info.title ? `${info.title}${a.name.match(/\.[a-z0-9]{2,5}$/i) ? a.name.match(/\.[a-z0-9]{2,5}$/i)[0] : ''}` : a.name,
          mailSubject: subject, createdAt: now,
        });
        abgelegt++;
      } catch (err) { console.warn(`Anhang „${a.name}“ nicht gespeichert: ${err.message}`); }
    });

    fsCreate_(`projects/${p.id}/infos`, { title: subject, from: result.from || from.name, date: result.date || dateIso, text: text.slice(0, 200000), kind: 'mail-auto', createdAt: now, createdBy: 'mindora',
      attachments: anhaenge.map((a) => ({ name: a.name, size: a.bytes.length, read: !!(a.lesbar || a.text), saved: !a.nichtGespeichert })) });

    // Push an alle, die die betroffenen Bereiche sehen dürfen – in ihrer Sprache
    const bereiche = [...new Set([...fresh, ...gebuendelt].map((t) => t.areaId).concat(zahlungen.map((z) => z.areaId)))];
    const empf = bereiche.length ? ctx.members.filter((u) => bereiche.some((b) => berechtigt_(ctx, b).includes(u))) : berechtigt_(ctx, null).filter((u) => !Array.isArray(ctx.access[u]));
    for (const L of ['de', 'en']) {
      const an = empf.filter((u) => (ctx.langOf[u] || 'de') === L); if (!an.length) continue;
      const en = L === 'en';
      if (fresh.length || zahlungen.length || gebuendelt.length) {
        const teile = [];
        if (fresh.length) teile.push(en ? `${fresh.length} new ${fresh.length === 1 ? 'task' : 'tasks'}` : `${fresh.length} ${fresh.length === 1 ? 'neue Aufgabe' : 'neue Aufgaben'}`);
        if (gebuendelt.length) teile.push(en ? `${gebuendelt.length} updated` : `${gebuendelt.length} ergänzt`);
        if (zahlungen.length) teile.push(en ? `${zahlungen.length} ${zahlungen.length === 1 ? 'payment' : 'payments'}` : `${zahlungen.length} ${zahlungen.length === 1 ? 'Zahlung' : 'Zahlungen'}`);
        const titel = `📬 ${teile.join(en ? ', ' : ', ')} ${en ? 'from' : 'aus'} „${subject}“`.slice(0, 120);
        const zeilen = [...fresh.map((t) => `• ${t.title}`), ...gebuendelt.map((t) => `• ↺ ${t.title}`), ...zahlungen.map((z) => `• 💶 ${z.title}${z.amount != null ? ` – ${z.amount.toLocaleString(en ? 'en-GB' : 'de-DE', { minimumFractionDigits: z.amount % 1 ? 2 : 0, maximumFractionDigits: 2 })} €` : ''}`)];
        if (abgelegt) zeilen.push(en ? `📎 ${abgelegt} ${abgelegt === 1 ? 'attachment' : 'attachments'} filed` : `📎 ${abgelegt} ${abgelegt === 1 ? 'Anhang' : 'Anhänge'} abgelegt`);
        const text2 = zeilen.slice(0, 4).join('\n') + (zeilen.length > 4 ? (en ? `\n… and ${zeilen.length - 4} more` : `\n… und ${zeilen.length - 4} weitere`) : '');
        sendePush_(an, titel, text2, 'inbox-' + m.getId());
      } else {
        sendePush_(an, en ? `📬 “${subject}” read` : `📬 „${subject}“ gelesen`, en ? 'No new tasks in it – the mail is in the archive.' : 'Keine neuen Aufgaben darin – die Mail liegt in der Ablage.', 'inbox-' + m.getId());
      }
    }
    m.markRead(); th.addLabel(label_(PB.LABEL_OK));
    props.deleteProperty(versuchKey);
    console.log(`Verarbeitet: „${subject}“ von ${from.addr} – ${fresh.length} neue Aufgaben, ${gebuendelt.length} gebündelt, ${zahlungen.length} Zahlungen, ${abgelegt} Anhänge, ${(result.contacts || []).length} Kontakte.`);
  } catch (e) {
    console.warn(`Fehler bei „${subject}“ (Versuch ${versuch} von 3): ${e.message}`);
    if (versuch >= 3) {
      fsCreate_(`projects/${p.id}/infos`, { title: subject, from: from.name, date: dateIso, text: `${text}\n\n[MindSpace konnte diese Mail nicht auswerten: ${e.message}]`, kind: 'mail-auto', createdAt: now, createdBy: 'mindora',
        attachments: anhaenge.map((a) => ({ name: a.name, size: a.bytes.length, read: false, saved: true })) });
      // Anhänge trotzdem sichern – sie liegen dann unter „Fotos & Dokumente“
      for (const a of anhaenge) { try { dateiAblegen_(p.id, a, { taskId: null, costId: null, areaId: null, desc: '', name: a.name, mailSubject: subject, createdAt: now }); } catch (err) { console.warn(`Anhang „${a.name}“ nicht gespeichert: ${err.message}`); } }
      sendePush_(ctx.members, `📬 „${subject}“ konnte nicht ausgewertet werden`, String(e.message).slice(0, 150), 'inbox-' + m.getId());
      m.markRead(); th.addLabel(label_(PB.LABEL_FEHLER));
      props.deleteProperty(versuchKey);
    }
  }
}

// ------------------------------------------------------------------ Hilfen: Datum & Text
function berlinIso_(d) { return Utilities.formatDate(d, PB.TZ, 'yyyy-MM-dd'); }
function berlinHeute_() { const [y, mo, d] = berlinIso_(new Date()).split('-').map(Number); return new Date(y, mo - 1, d, 12); }
function tageZwischen_(a, b) { return Math.round((Date.UTC(...b.split('-').map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...a.split('-').map((x, i) => (i === 1 ? x - 1 : +x)))) / 864e5); }
// Zeitpunkt (ms) für ein Datum/Uhrzeit in Berliner Zeit
function berlinMs_(y, mo, d, h, min) {
  const guess = Date.UTC(y, mo - 1, d, h, min || 0);
  const off = Utilities.formatDate(new Date(guess), PB.TZ, 'Z'); // z. B. +0100
  const sign = off[0] === '-' ? -1 : 1;
  return guess - sign * (Number(off.slice(1, 3)) * 60 + Number(off.slice(3, 5))) * 60e3;
}
function erinnerungsZeit_(t) {
  if (!t.due || !t.reminder || t.reminder === 'none') return null;
  const [y, m, d] = t.due.split('-').map(Number);
  const at = (od, h, min) => berlinMs_(y, m, d + od, h, min || 0);
  const [th, tm] = (t.time || '').split(':').map(Number);
  switch (t.reminder) {
    case 'hour1': return t.time ? at(0, th, tm) - 3600e3 : at(0, 8);
    case 'day0': return t.time && th < 10 ? at(0, th, tm) - 2 * 3600e3 : at(0, 8);
    case 'day1': return at(-1, 18);
    case 'day3': return at(-3, 18);
    case 'week1': return at(-7, 18);
    default: return null;
  }
}
function normName_(s) { return String(s || '').toLowerCase().replace(/\b(herr|frau|dr\.?)\s+/g, '').replace(/[^a-zäöüß]/g, ''); }
function aehnlich_(a, b) {
  const w = (s) => new Set(String(s).toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').split(/\s+/).filter((x) => x.length > 3));
  const A = w(a), B = w(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}

// ------------------------------------------------------------------ Google-Zugang (Dienstkonto)
function dienstkonto_() {
  const raw = PropertiesService.getScriptProperties().getProperty('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) throw new Error('Skripteigenschaft FIREBASE_SERVICE_ACCOUNT fehlt (Projekteinstellungen → Skripteigenschaften).');
  let sa;
  try { sa = JSON.parse(raw); } catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT ist kein gültiger Inhalt. Bitte den kompletten Inhalt der .json-Datei einfügen.'); }
  if (!sa.private_key || !sa.client_email) throw new Error('FIREBASE_SERVICE_ACCOUNT ist unvollständig.');
  return sa;
}
function token_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('gtoken');
  if (hit) return hit;
  const sa = dienstkonto_();
  const b64 = (x) => Utilities.base64EncodeWebSafe(x).replace(/=+$/, '');
  const iat = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const sig = b64(Utilities.computeRsaSha256Signature(`${head}.${claim}`, sa.private_key));
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Anmeldung bei Firebase fehlgeschlagen: ' + res.getContentText().slice(0, 200));
  const tok = JSON.parse(res.getContentText()).access_token;
  cache.put('gtoken', tok, 3000);
  return tok;
}

// ------------------------------------------------------------------ Anhänge
// PDFs und Bilder liest die KI mit; gespeichert werden alle Anhänge bis 15 MB.
function anhaengeLesen_(m) {
  const roh = [];
  let liste = [];
  try { liste = m.getAttachments({ includeInlineImages: true, includeAttachments: true }) || []; }
  catch (e) { console.warn('Anhänge nicht abrufbar: ' + e.message); }
  for (const b of liste) {
    try {
      const type = (b.getContentType() || 'application/octet-stream').split(';')[0].trim().toLowerCase();
      const name = b.getName() || 'Anhang';
      const bytes = b.getBytes();
      if (!bytes || !bytes.length) continue;
      roh.push({ name, type, bytes });
    } catch (e) { console.warn('Anhang nicht lesbar: ' + e.message); }
  }
  // Weitergeleitete E-Mails (.eml) auspacken: Text und deren Anhänge übernehmen
  const alle = [];
  for (const a of roh) {
    if (a.type === 'message/rfc822' || /\.eml$/i.test(a.name)) {
      try {
        const em = parseEml_(Utilities.newBlob(a.bytes).getDataAsString('ISO-8859-1'));
        alle.push({ name: a.name, type: 'message/rfc822', bytes: a.bytes, eml: true, text: [em.subject && `Betreff: ${em.subject}`, em.from && `Von: ${em.from}`, em.date && `Datum: ${em.date}`, '', em.text].filter((x) => x !== undefined).join('\n') });
        for (const t of em.parts) alle.push(t);
      } catch (e) { console.warn(`E-Mail-Anhang ${a.name} nicht lesbar: ${e.message}`); alle.push(a); }
    } else alle.push(a);
  }
  const out = [];
  let kiGesamt = 0, kiAnzahl = 0;
  for (const a of alle) {
    const { name, type, bytes } = a;
    if (bytes.length > PB.MAX_ANHANG) { console.log(`${name}: zu groß (${Math.round(bytes.length / 1048576)} MB) – nicht gespeichert.`); continue; }
    // Signatur-Bildchen und Logos überspringen
    if (/^image\//.test(type) && (bytes.length < 15 * 1024 || (/^(image\d{3}|outlook|logo|signature|signatur)/i.test(name) && bytes.length < 60 * 1024))) continue;
    if (!a.text && (/^text\/(plain|csv|calendar)$/.test(type) || /\.(txt|csv|ics)$/i.test(name))) {
      try { a.text = Utilities.newBlob(bytes).getDataAsString('UTF-8'); } catch (e) {}
    }
    const kiTyp = type === 'application/pdf' || /\.pdf$/i.test(name) ? 'application/pdf' : /^image\/(jpeg|png|gif|webp)$/.test(type) ? type : null;
    const max = kiTyp === 'application/pdf' ? 8 * 1048576 : 3.5 * 1048576;
    const lesbar = !!kiTyp && bytes.length <= max && kiAnzahl < PB.KI_ANHAENGE && kiGesamt + bytes.length <= PB.KI_ANHANG_MB * 1048576;
    if (lesbar) { kiGesamt += bytes.length; kiAnzahl++; }
    out.push({ ...a, type: kiTyp || type, lesbar });
  }
  return out.slice(0, 15);
}

// ---------- Einfacher MIME-Leser für weitergeleitete E-Mails (.eml)
function emlBytes_(s) { const out = new Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i) & 255; out[i] = c > 127 ? c - 256 : c; } return out; }
function emlText_(bytes, charset) { try { return Utilities.newBlob(bytes).getDataAsString(charset || 'UTF-8'); } catch (e) { return Utilities.newBlob(bytes).getDataAsString('UTF-8'); } }
function emlWords_(v) {
  return String(v || '').replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (m, cs, enc, txt) => {
    try {
      const bytes = /b/i.test(enc) ? Utilities.base64Decode(txt) : emlBytes_(txt.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16))));
      return emlText_(bytes, cs);
    } catch (e) { return txt; }
  });
}
function emlHeaders_(raw) {
  const h = {};
  raw.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach((line) => { const i = line.indexOf(':'); if (i > 0) { const k = line.slice(0, i).trim().toLowerCase(); if (!(k in h)) h[k] = line.slice(i + 1).trim(); } });
  return h;
}
function emlParam_(v, key) {
  const m = String(v || '').match(new RegExp(`${key}\\*?=(?:"([^"]*)"|([^;\\s]*))`, 'i'));
  if (!m) return '';
  let x = m[1] !== undefined ? m[1] : m[2];
  const rfc = x.match(/^([^']*)'[^']*'(.*)$/); // RFC 2231: utf-8''name%20x.pdf
  if (rfc) { try { x = emlText_(emlBytes_(unescape(rfc[2])), rfc[1] || 'UTF-8'); } catch (e) {} }
  return emlWords_(x);
}
function emlDecode_(body, enc) {
  enc = String(enc || '').toLowerCase();
  if (enc === 'base64') return Utilities.base64Decode(body.replace(/[^A-Za-z0-9+/=]/g, ''));
  if (enc === 'quoted-printable') return emlBytes_(body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16))));
  return emlBytes_(body);
}
const emlHtml_ = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();
function parseEml_(raw, tiefe) {
  tiefe = tiefe || 0;
  const cut = raw.search(/\r?\n\r?\n/);
  const head = emlHeaders_(cut >= 0 ? raw.slice(0, cut) : raw);
  const body = cut >= 0 ? raw.slice(cut).replace(/^\r?\n\r?\n/, '') : '';
  const res = { subject: emlWords_(head.subject), from: emlWords_(head.from), date: head.date || '', text: '', html: '', parts: [] };
  const walk = (h, b) => {
    const ct = String(h['content-type'] || 'text/plain').toLowerCase();
    const type = ct.split(';')[0].trim();
    const disp = String(h['content-disposition'] || '');
    const fname = emlParam_(disp, 'filename') || emlParam_(h['content-type'], 'name');
    if (/^multipart\//.test(type)) {
      const bd = emlParam_(h['content-type'], 'boundary');
      if (!bd) return;
      const pieces = b.split(new RegExp(`\\r?\\n?--${bd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\\s*\\r?\\n?`));
      for (const piece of pieces) {
        if (!piece.trim()) continue;
        const c = piece.search(/\r?\n\r?\n/);
        if (c < 0) continue;
        walk(emlHeaders_(piece.slice(0, c)), piece.slice(c).replace(/^\r?\n\r?\n/, ''));
      }
      return;
    }
    const bytes = emlDecode_(b, h['content-transfer-encoding']);
    if (type === 'message/rfc822' && tiefe < 2) {
      const inner = parseEml_(Utilities.newBlob(bytes).getDataAsString('ISO-8859-1'), tiefe + 1);
      res.text += `\n\n----- Weitergeleitete Nachricht: ${inner.subject} (${inner.from}) -----\n${inner.text}`;
      res.parts.push(...inner.parts);
      return;
    }
    if (!fname && type === 'text/plain' && !/attachment/i.test(disp)) { res.text += (res.text ? '\n' : '') + emlText_(bytes, emlParam_(h['content-type'], 'charset')); return; }
    if (!fname && type === 'text/html' && !/attachment/i.test(disp)) { res.html += emlText_(bytes, emlParam_(h['content-type'], 'charset')); return; }
    if (bytes.length) res.parts.push({ name: fname || `Anhang.${(type.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '')}`, type, bytes });
  };
  walk(head, body);
  if (!res.text.trim() && res.html) res.text = emlHtml_(res.html);
  res.text = res.text.trim();
  return res;
}
function neueId_() { const z = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < 20; i++) s += z[Math.floor(Math.random() * z.length)]; return s; }
function dateiAblegen_(pid, a, meta) {
  const id = neueId_();
  const n = Math.max(1, Math.ceil(a.bytes.length / PB.TEIL));
  for (let i = 0; i < n; i++) {
    const teil = a.bytes.slice(i * PB.TEIL, (i + 1) * PB.TEIL);
    fsSet_(`projects/${pid}/fileParts/${id}_${i}`, { fileId: id, i, areaId: meta.areaId || null, data: { __bytes: Utilities.base64Encode(teil) } });
  }
  const thumb = /^image\/(jpeg|png|gif|webp)$/.test(a.type) && a.bytes.length <= 90 * 1024 ? `data:${a.type};base64,${Utilities.base64Encode(a.bytes)}` : null;
  fsSet_(`projects/${pid}/files/${id}`, { ...meta, type: a.type, size: a.bytes.length, parts: n, thumb, createdBy: 'mindora', source: 'mail-auto' });
  return id;
}


// ------------------------------------------------------------------ Zuständigkeit: Push an die neue zuständige Person
function zuweisungenMelden_() {
  const props = PropertiesService.getScriptProperties();
  let pid = props.getProperty('PROJEKT_CACHE');
  if (!pid) { pid = waehleProjekt_(fsList_('projects')).id; props.setProperty('PROJEKT_CACHE', pid); }
  const res = fsReq_('post', `${fsBase_()}/projects/${pid}:runQuery`, {
    structuredQuery: { from: [{ collectionId: 'tasks' }], where: { fieldFilter: { field: { fieldPath: 'assignNotify' }, op: 'EQUAL', value: { booleanValue: true } } }, limit: 20 },
  }) || [];
  for (const r of res) {
    if (!r.document) continue;
    const id = r.document.name.split('/').pop();
    const t = decFields_(r.document.fields);
    fsUpdate_(`projects/${pid}/tasks/${id}`, { assignNotify: false, assignNotifiedAt: Date.now() });
    if (!t.assignee || t.assignee === 'all' || t.done) continue;
    const u = fsGet_(`users/${t.assignee}`) || {};
    const m = zuweisungText_(t, u.lang === 'en' ? 'en' : 'de');
    sendePush_([t.assignee], m.title, m.body, 'assign-' + id);
    console.log(`Zuständigkeit gemeldet: „${t.title}“`);
  }
}
function zuweisungText_(t, lang) {
  const en = lang === 'en';
  const von = t.assignByName || (en ? 'Someone' : 'Jemand');
  let due = '';
  if (t.due) {
    const [y, mo, d] = t.due.split('-').map(Number);
    due = Utilities.formatDate(new Date(Date.UTC(y, mo - 1, d, 12)), 'UTC', en ? 'd MMM' : 'dd.MM.') + (t.time ? (en ? ' ' + t.time : ', ' + t.time + ' Uhr') : '');
  }
  if (t.assignReturned) return { title: en ? '↩️ Task handed back' : '↩️ Aufgabe zurückgegeben', body: en ? `${von} handed “${t.title}” back to you.` : `${von} hat „${t.title}“ an dich zurückgegeben.` };
  return {
    title: en ? '📌 New task for you' : '📌 Neue Aufgabe für dich',
    body: (en ? `${von} asks you to take over “${t.title}”${due ? ' – due ' + due : ''}.` : `${von} bittet dich, „${t.title}“ zu übernehmen${due ? ' – fällig ' + due : ''}.`).replace(/\.\.$/, '.').slice(0, 220),
  };
}

// ------------------------------------------------------------------ Kalender-Abo (Bereitstellen → Web-App, Zugriff: Jeder)
// Kalender-Apps rufen …/exec?k=<geheimer Schlüssel> ab. Jeder Schlüssel gehört zu genau einem Mitglied
// (Sammlung calFeeds) und liefert nur Aufgaben aus dessen freigegebenen Bereichen.
function doGet(e) {
  const q = (e && e.parameter) || {};
  if (q.ping) return ContentService.createTextOutput('MindSpace-Kalender bereit');
  let ics;
  try { ics = kalender_(String(q.k || '')); }
  catch (err) { console.warn('Kalender: ' + err.message); ics = icsKalender_('MindSpace', []); }
  return ContentService.createTextOutput(ics).setMimeType(ContentService.MimeType.ICAL);
}
function kalender_(k) {
  if (!/^[A-Za-z0-9_-]{24,}$/.test(k)) return icsKalender_('MindSpace', []);
  const cache = CacheService.getScriptCache();
  const hit = cache.get('cal_' + k);
  if (hit) return hit;
  const f = fsGet_('calFeeds/' + k);
  if (!f || !f.uid || !f.pid) return icsKalender_('MindSpace', []);
  const p = fsGet_('projects/' + f.pid);
  if (!p || !(p.members || []).includes(f.uid) || !p.calUrl) return icsKalender_('MindSpace', []);
  const acc = (p.access || {})[f.uid];
  const darf = (a) => !Array.isArray(acc) || acc.indexOf(a || 'hausbau') >= 0;
  const u = fsGet_('users/' + f.uid) || {};
  const en = u.lang === 'en';
  const bereiche = {};
  for (const a of fsList_(`projects/${f.pid}/areas`)) bereiche[a.id] = `${a.data.emoji ? a.data.emoji + ' ' : ''}${a.data.name || ''}`.trim();
  const namen = p.memberNames || {};
  const heute = berlinIso_(new Date());
  const ab = berlinIso_(new Date(Date.now() - 120 * 864e5));
  const appUrl = (PropertiesService.getScriptProperties().getProperty('APP_URL') || '').replace(/\/?$/, '/');
  const events = [];
  for (const { id, data: t } of fsList_(`projects/${f.pid}/tasks`)) {
    if (!t.due || t.due < ab || !darf(t.areaId)) continue;
    if (f.scope === 'mine' && t.assignee && t.assignee !== 'all' && t.assignee !== f.uid) continue;
    const zust = t.assignee && t.assignee !== 'all' ? (t.assignee === f.uid ? (en ? 'you' : 'du') : namen[t.assignee] || '') : '';
    const info = [
      bereiche[t.areaId || 'hausbau'] || '',
      zust ? (en ? 'Responsible: ' : 'Zuständig: ') + zust : '',
      t.notes || '',
      appUrl.length > 1 ? (en ? 'Open in MindSpace: ' : 'In MindSpace öffnen: ') + appUrl + '?aufgabe=' + id : '',
    ].filter(Boolean).join('\n');
    events.push({
      id, due: t.due, time: t.time || '', mod: t.doneAt || t.createdAt || 0,
      title: (t.done ? '✅ ' : t.due < heute ? '🔴 ' : '') + (t.title || ''),
      info, url: appUrl.length > 1 ? appUrl + '?aufgabe=' + id : '', cat: bereiche[t.areaId || 'hausbau'] || '',
    });
  }
  const ics = icsKalender_(`MindSpace${p.name ? ' – ' + p.name : ''}`, events);
  if (ics.length < 95000) cache.put('cal_' + k, ics, 120);
  return ics;
}
function icsEsc_(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsUtf8_(ch) { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
function icsFold_(line) {
  let out = '', cur = '', n = 0;
  for (const ch of line) { const b = icsUtf8_(ch); if (n + b > 73) { out += cur + '\r\n '; cur = ''; n = 1; } cur += ch; n += b; }
  return out + cur;
}
function icsUtc_(ms) { return Utilities.formatDate(new Date(ms), 'UTC', "yyyyMMdd'T'HHmmss'Z'"); }
function icsKalender_(name, events) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MindSpace//Kalender//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEsc_(name), 'X-WR-TIMEZONE:Europe/Berlin', 'X-APPLE-CALENDAR-COLOR:#2F9E77',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M'];
  const stamp = icsUtc_(Date.now());
  for (const ev of events) {
    const [y, mo, d] = ev.due.split('-').map(Number);
    L.push('BEGIN:VEVENT', `UID:${ev.id}@mindspace`, 'DTSTAMP:' + stamp);
    if (ev.time && /^\d{1,2}:\d{2}$/.test(ev.time)) {
      const [h, mi] = ev.time.split(':').map(Number);
      const s = berlinMs_(y, mo, d, h, mi);
      L.push('DTSTART:' + icsUtc_(s), 'DTEND:' + icsUtc_(s + 3600e3));
    } else {
      const nx = new Date(Date.UTC(y, mo - 1, d + 1));
      L.push(`DTSTART;VALUE=DATE:${ev.due.replace(/-/g, '')}`, 'DTEND;VALUE=DATE:' + Utilities.formatDate(nx, 'UTC', 'yyyyMMdd'));
    }
    L.push('SUMMARY:' + icsEsc_(ev.title));
    if (ev.info) L.push('DESCRIPTION:' + icsEsc_(ev.info));
    if (ev.url) L.push('URL:' + ev.url);
    if (ev.cat) L.push('CATEGORIES:' + icsEsc_(ev.cat));
    L.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(icsFold_).join('\r\n') + '\r\n';
}

// ------------------------------------------------------------------ Firestore (REST)
function fsBase_() { return `https://firestore.googleapis.com/v1/projects/${dienstkonto_().project_id}/databases/(default)/documents`; }
function fsReq_(method, url, body) {
  const res = UrlFetchApp.fetch(url, { method, contentType: 'application/json', headers: { Authorization: 'Bearer ' + token_() }, payload: body ? JSON.stringify(body) : undefined, muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code === 404 && method === 'get') return null;
  if (code >= 300) throw new Error(`Firestore ${code}: ${res.getContentText().slice(0, 300)}`);
  return JSON.parse(res.getContentText() || '{}');
}
function enc_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(enc_) } : {} };
  if (typeof v === 'object' && v.__bytes) return { bytesValue: v.__bytes };
  if (typeof v === 'object') return { mapValue: { fields: encFields_(v) } };
  return { stringValue: String(v) };
}
function encFields_(o) { const f = {}; for (const k of Object.keys(o)) if (o[k] !== undefined) f[k] = enc_(o[k]); return f; }
function dec_(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue).getTime();
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec_);
  if ('mapValue' in v) return decFields_(v.mapValue.fields || {});
  return null;
}
function decFields_(f) { const o = {}; for (const k of Object.keys(f || {})) o[k] = dec_(f[k]); return o; }
const fieldPath_ = (k) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + k.replace(/`/g, '\\`') + '`');

function fsGet_(path) { const d = fsReq_('get', `${fsBase_()}/${path}`); return d ? decFields_(d.fields) : null; }
function fsList_(col) {
  const out = []; let page = '';
  do {
    const d = fsReq_('get', `${fsBase_()}/${col}?pageSize=300${page ? '&pageToken=' + encodeURIComponent(page) : ''}`) || {};
    for (const doc of d.documents || []) out.push({ id: doc.name.split('/').pop(), data: decFields_(doc.fields) });
    page = d.nextPageToken || '';
  } while (page);
  return out;
}
function fsCreate_(col, data) { const d = fsReq_('post', `${fsBase_()}/${col}`, { fields: encFields_(data) }); return d.name.split('/').pop(); }
function fsSet_(path, data) { fsReq_('patch', `${fsBase_()}/${path}`, { fields: encFields_(data) }); }
function fsUpdate_(path, data) {
  const mask = Object.keys(data).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(fieldPath_(k))).join('&');
  fsReq_('patch', `${fsBase_()}/${path}?${mask}&currentDocument.exists=true`, { fields: encFields_(data) });
}

// ------------------------------------------------------------------ Push-Nachrichten (Firebase Cloud Messaging)
function sendePush_(uids, title, body, tag) {
  const pid = dienstkonto_().project_id;
  const appUrl = PropertiesService.getScriptProperties().getProperty('APP_URL') || '';
  let n = 0;
  for (const uid of uids) {
    const u = fsGet_(`users/${uid}`);
    const tokens = (u && u.tokens) || [];
    const keep = [];
    for (const token of tokens) {
      const msg = { message: { token, notification: { title, body }, webpush: { notification: { title, body, tag }, ...(appUrl ? { fcm_options: { link: appUrl } } : {}) } } };
      if (appUrl) msg.message.webpush.notification.icon = appUrl.replace(/\/?$/, '/') + 'icons/icon-192.png';
      const res = UrlFetchApp.fetch(`https://fcm.googleapis.com/v1/projects/${pid}/messages:send`, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token_() }, payload: JSON.stringify(msg), muteHttpExceptions: true });
      const code = res.getResponseCode();
      if (code === 200) { n++; keep.push(token); }
      else if (code === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(res.getContentText())) console.log('Abgemeldetes Gerät entfernt.');
      else { keep.push(token); console.warn(`Push fehlgeschlagen (${code}): ${res.getContentText().slice(0, 200)}`); }
    }
    if (keep.length !== tokens.length) fsUpdate_(`users/${uid}`, { tokens: keep });
  }
  if (!n) console.log('Hinweis: Keine Push-Nachricht verschickt – auf dem iPhone in MindSpace unter Mehr → Push-Nachrichten aktivieren.');
  return n;
}
