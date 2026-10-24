import { createStore, computeRemindAt } from './store.js';
import { parseEmails, isoDate, similarity } from './parser.js';
import { extractFromText, draftEmail, assessTasks, testConnection, urgencyOf, aiKeyOf, STATUS, MODELS, DEFAULT_MODEL } from './ai.js';

// ------------------------------------------------------------------ Zustand
const PHASES = ['Allgemein', 'Finanzierung', 'Pläne & Behörden', 'Grundstück & Anschlüsse', 'Bemusterung', 'Versicherung', 'Bau & Abnahme'];
const REMINDERS = [
  ['none', 'Keine Erinnerung'], ['day0', 'Am Tag selbst, 8 Uhr'], ['hour1', '1 Stunde vorher'], ['day1', '1 Tag vorher, 18 Uhr'],
  ['day3', '3 Tage vorher, 18 Uhr'], ['week1', '1 Woche vorher, 18 Uhr'], ['custom', 'Eigener Zeitpunkt'],
];
const S = {
  view: 'tasks', filter: 'open', phase: 'all', mine: false,
  me: null, authReady: false, project: null, projectState: 'loading', tasks: [], infos: [], contacts: [], ai: null, aiBusy: false, contactQuery: '',
  pasteText: '', parsed: null, saveInfo: true, openInfo: null, infoQuery: '', authTab: 'login', authError: '',
  pendingRender: false,
};
const store = createStore();
const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');

// ------------------------------------------------------------------ Helfer
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => isoDate(new Date());
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (s) => Math.round((parseISO(s) - parseISO(todayISO())) / 864e5);
const fmtDate = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => parseISO(s).toLocaleDateString('de-DE', o);
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const members = () => S.project?.members || [];
const nameOf = (uid) => (S.project?.memberNames || {})[uid] || 'Unbekannt';
const initial = (uid) => nameOf(uid).trim().charAt(0).toUpperCase() || '?';

function dueLabel(t) {
  if (!t.due) return null;
  const d = dayDiff(t.due);
  let text = d === 0 ? 'Heute' : d === 1 ? 'Morgen' : d === -1 ? 'Gestern' : fmtDate(t.due);
  if (d < -1 || d > 6) text = fmtDate(t.due, { weekday: 'short', day: 'numeric', month: 'short', year: parseISO(t.due).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  if (t.time) text += `, ${t.time} Uhr`;
  return { text, late: !t.done && d < 0 };
}
function relText(d) {
  if (d === 0) return 'heute fällig';
  if (d === 1) return 'morgen fällig';
  if (d > 1) return `in ${d} Tagen fällig`;
  if (d === -1) return 'seit gestern überfällig';
  return `seit ${-d} Tagen überfällig`;
}
const aiCfg = () => (S.ai ? { apiKey: S.ai.apiKey, model: S.ai.model || DEFAULT_MODEL } : null);
const contactById = (id) => S.contacts.find((c) => c.id === id) || null;
const norm = (s) => String(s || '').toLowerCase().replace(/\b(herr|frau|dr\.?|dipl\.?-?\w*)\s+/g, '').replace(/[^a-zäöüß]/g, '');
function findContact({ email, name }) {
  const e = (email || '').trim().toLowerCase();
  if (e) { const c = S.contacts.find((x) => (x.email || '').toLowerCase() === e); if (c) return c; }
  const n = norm(name);
  return n ? S.contacts.find((x) => norm(x.name) === n) || null : null;
}
const urgRank = (t) => { const u = urgencyOf(t); return u ? STATUS[u.status].rank : -1; };
const byUrgency = (a, b) => urgRank(b) - urgRank(a) || ((a.startBy || a.due || '9999').localeCompare(b.startBy || b.due || '9999')) || byDue(a, b);
const badge = (u) => (u && u.status !== 'im_plan' ? `<span class="badge s-${u.status}">${esc(STATUS[u.status].label)}</span>` : '');
const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || (a.createdAt || 0) - (b.createdAt || 0);

const I = {
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9h12v-9"/><path d="m9.5 14 2 2 3.5-3.5"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
  infos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 19.5c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6"/><path d="M15.5 5.8a3 3 0 0 1 0 5.4M17.5 14.6c1.5.6 2.5 2 3 4.4"/></svg>',
  phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.7 20 4 13.3 3.5 5.6A1.5 1.5 0 0 1 5 4Z"/></svg>',
  envelope: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
  spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-3px"><path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5Z"/><path d="M19 15c.2 2 1.2 3 3 3.2-1.8.2-2.8 1.2-3 3.3-.2-2.1-1.2-3.1-3-3.3 1.8-.2 2.8-1.2 3-3.2Z" opacity=".6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  bell: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
};

let toastTimer;
function toast(msg, action) {
  const el = document.getElementById('toast');
  el.innerHTML = esc(msg) + (action ? ` <button class="btn small" style="margin-left:10px;background:var(--signal);color:var(--signal-ink)">${esc(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.classList.remove('show'); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}
function fail(e) {
  console.error(e);
  const map = {
    'auth/invalid-credential': 'E-Mail oder Passwort stimmt nicht.',
    'auth/wrong-password': 'E-Mail oder Passwort stimmt nicht.',
    'auth/user-not-found': 'Zu dieser E-Mail gibt es kein Konto.',
    'auth/email-already-in-use': 'Mit dieser E-Mail gibt es schon ein Konto. Melde dich an.',
    'auth/weak-password': 'Das Passwort braucht mindestens 6 Zeichen.',
    'auth/invalid-email': 'Die E-Mail-Adresse ist ungültig.',
    'auth/network-request-failed': 'Keine Internetverbindung.',
    'auth/unauthorized-domain': 'Diese Web-Adresse ist in Firebase noch nicht freigegeben (Authentication → Einstellungen → Autorisierte Domains).',
    'permission-denied': 'Keine Berechtigung. Sind die Firestore-Regeln veröffentlicht?',
  };
  return map[e?.code] || e?.message || 'Unbekannter Fehler.';
}

// ------------------------------------------------------------------ Rendern
function render() {
  const a = document.activeElement;
  if (a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { S.pendingRender = true; return; }
  S.pendingRender = false;
  if (store.mode === 'cloud') {
    if (!S.authReady) { app.innerHTML = '<div class="boot">Hausplaner wird geladen …</div>'; return; }
    if (!S.me) { app.innerHTML = viewAuth(); return; }
    if (S.projectState === 'loading') { app.innerHTML = '<div class="boot">Bauprojekt wird geladen …</div>'; return; }
    if (S.projectState === 'none') { app.innerHTML = viewSetup(); return; }
  }
  const views = { tasks: viewTasks, import: viewImport, contacts: viewContacts, infos: viewInfos, more: viewMore };
  const fab = S.view === 'tasks' ? `<button class="fab" data-action="new-task" aria-label="Aufgabe anlegen">${I.plus}</button>`
    : S.view === 'contacts' ? `<button class="fab" data-action="new-contact" aria-label="Kontakt anlegen">${I.plus}</button>` : '';
  app.innerHTML = views[S.view]() + tabbar() + fab;
}
app.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender && !app.contains(document.activeElement)) render(); }, 50));

function tabbar() {
  const tab = (id, label, icon) => `<button data-action="tab" data-tab="${id}" ${S.view === id ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`;
  return `<nav class="tabbar">${tab('tasks', 'Aufgaben', I.tasks)}${tab('import', 'Einlesen', I.mail)}${tab('contacts', 'Kontakte', I.people)}${tab('infos', 'Infos', I.infos)}${tab('more', 'Mehr', I.more)}</nav>`;
}

// --- Aufgaben
function viewTasks() {
  const open = S.tasks.filter((t) => !t.done).sort(byUrgency);
  const next = open[0];
  const nu = next ? urgencyOf(next) : null;
  const nc = next?.contactId ? contactById(next.contactId) : null;
  const late = open.filter((t) => t.due && dayDiff(t.due) < 0).length;
  let banner = '';
  if (isIOS && !standalone && !localStorage.getItem('hp-hide-install')) {
    banner = `<div class="banner"><p><strong>Als App installieren:</strong> unten in Safari auf ${I.share} tippen, dann „Zum Home-Bildschirm“. Erst danach funktionieren Push-Nachrichten.</p><button data-action="hide-banner" data-key="hp-hide-install" aria-label="Hinweis schließen">×</button></div>`;
  } else if (store.mode === 'local' && !localStorage.getItem('hp-hide-local')) {
    banner = `<div class="banner"><p>Die Daten liegen nur auf diesem Gerät. Zum Teilen und für Erinnerungen richte die Cloud ein (siehe Anleitung).</p><button data-action="hide-banner" data-key="hp-hide-local" aria-label="Hinweis schließen">×</button></div>`;
  }
  const schild = next ? `
    <section class="bauschild" aria-label="Nächster Schritt">
      <p class="bauschild-label">${nu && nu.status !== 'im_plan' ? esc(STATUS[nu.status].label) : 'Als Nächstes'}</p>
      <p class="bauschild-task">${esc(next.title)}</p>
      ${nu && nu.status !== 'im_plan' && (nu.next || nu.reason) ? `<p class="bauschild-why">${esc(nu.next || nu.reason)}</p>` : ''}
      <p class="bauschild-when">${next.due ? esc(relText(dayDiff(next.due))) + (Math.abs(dayDiff(next.due)) > 1 ? ' · ' + esc(dueLabel(next).text) : next.time ? `, ${esc(next.time)} Uhr` : '') : 'ohne Termin'}</p>
      <div class="bauschild-row">
        <span class="bauschild-count">${open.length} offen${late ? `, ${late} überfällig` : ''}</span>
        <span class="btn-row">${nc?.email ? `<button class="btn small" data-action="compose-task" data-id="${esc(next.id)}">E-Mail</button>` : ''}<button class="btn small" data-action="toggle" data-id="${esc(next.id)}">Erledigt</button></span>
      </div>
    </section>` : `
    <section class="bauschild" aria-label="Nächster Schritt">
      <p class="bauschild-label">Als Nächstes</p>
      <p class="bauschild-task">${S.tasks.length ? 'Alles erledigt.' : 'Noch keine Aufgaben.'}</p>
      <p class="bauschild-when">Füge eine E-Mail von Allkauf ein, dann findet die App die Aufgaben darin.</p>
      <div class="bauschild-row"><span></span><button class="btn small" data-action="tab" data-tab="import">E-Mail einlesen</button></div>
    </section>`;

  const usedPhases = PHASES.filter((p) => S.tasks.some((t) => (t.phase || 'Allgemein') === p));
  const chips = !usedPhases.length && members().length < 2 ? '' : `<div class="chips" role="group" aria-label="Bereich">
      <button class="chip" data-action="phase" data-phase="all" aria-pressed="${S.phase === 'all'}">Alle Bereiche</button>
      ${members().length > 1 ? `<button class="chip" data-action="mine" aria-pressed="${S.mine}">Nur meine</button>` : ''}
      ${usedPhases.map((p) => `<button class="chip" data-action="phase" data-phase="${esc(p)}" aria-pressed="${S.phase === p}">${esc(p)}</button>`).join('')}
    </div>`;

  let list = S.tasks.filter((t) => (S.filter === 'open' ? !t.done : t.done));
  if (S.phase !== 'all') list = list.filter((t) => (t.phase || 'Allgemein') === S.phase);
  if (S.mine) list = list.filter((t) => !t.assignee || t.assignee === 'all' || t.assignee === S.me?.uid);

  let body = '';
  if (!S.tasks.length) {
    body = '';
  } else if (!list.length) {
    body = S.filter === 'open'
      ? `<div class="empty"><strong>Hier ist nichts offen</strong>Lege eine Aufgabe mit dem Plus an oder lies eine E-Mail ein.</div>`
      : `<div class="empty"><strong>Noch nichts erledigt</strong>Abgehakte Aufgaben landen hier.</div>`;
  } else if (S.filter === 'done') {
    list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    body = `<div class="group-head"><h2>Erledigt</h2><span>${list.length}</span></div><div class="list">${list.slice(0, 150).map(row).join('')}</div>`;
  } else {
    body = groupTasks(list).map(([name, items, cls]) => `
      <div class="group-head ${cls || ''}"><h2>${esc(name)}</h2><span>${items.length}</span></div>
      <div class="list">${items.map(row).join('')}</div>`).join('');
  }
  return `<main class="view">
    <h1 class="title" data-action="rename">${esc(S.project?.name || 'Unser Haus')}</h1>
    ${banner}${schild}
    <div class="seg" role="group" aria-label="Ansicht">
      <button data-action="filter" data-filter="open" aria-pressed="${S.filter === 'open'}">Offen</button>
      <button data-action="filter" data-filter="done" aria-pressed="${S.filter === 'done'}">Erledigt</button>
    </div>
    ${chips}${body}</main>`;
}

function groupTasks(list) {
  const dow = (new Date().getDay() + 6) % 7; // Montag = 0
  const endWeek = 6 - dow;
  const groups = new Map();
  const add = (k, t, cls) => { if (!groups.has(k)) groups.set(k, { items: [], cls }); groups.get(k).items.push(t); };
  for (const t of [...list].sort(byDue)) {
    if (!t.due) continue;
    const d = dayDiff(t.due);
    if (d < 0) add('Überfällig', t, 'overdue');
    else if (d === 0) add('Heute', t);
    else if (d === 1) add('Morgen', t);
    else if (d <= endWeek) add('Diese Woche', t);
    else if (d <= endWeek + 7) add('Nächste Woche', t);
    else add(fmtDate(t.due, { month: 'long', year: 'numeric' }), t);
  }
  const noDate = list.filter((t) => !t.due).sort(byDue);
  if (noDate.length) groups.set('Ohne Termin', { items: noDate });
  return [...groups].map(([k, v]) => [k, v.items, v.cls]);
}

function row(t) {
  const due = dueLabel(t);
  const meta = [];
  if (due) meta.push(`<span class="${due.late ? 'late' : ''}">${esc(due.text)}</span>`);
  if (!t.done) { const b = badge(urgencyOf(t)); if (b) meta.unshift(b); }
  const c = t.contactId ? contactById(t.contactId) : null;
  if (c) meta.push(`<span>${esc(c.name)}</span>`);
  else if (t.phase && t.phase !== 'Allgemein') meta.push(`<span>${esc(t.phase)}</span>`);
  if (!t.done && t.remindAt && t.remindAt > Date.now()) meta.push(`<span title="Erinnerung aktiv">${I.bell}</span>`);
  const who = members().length > 1 && t.assignee && t.assignee !== 'all' ? `<span class="who" title="${esc(nameOf(t.assignee))}">${esc(initial(t.assignee))}</span>` : '';
  return `<div class="row ${t.done ? 'done' : ''}">
    <button class="check" data-action="toggle" data-id="${esc(t.id)}" aria-label="${t.done ? 'Wieder öffnen' : 'Als erledigt markieren'}: ${esc(t.title)}">${I.check}</button>
    <button class="row-main" data-action="edit" data-id="${esc(t.id)}">
      <div class="row-title">${esc(t.title)}</div>
      ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
    </button>${who}</div>`;
}

// --- Einlesen
function viewImport() {
  const p = S.parsed;
  let results = '';
  if (p) {
    const sel = p.tasks.filter((t) => t.selected).length;
    const csel = (p.contacts || []).filter((c) => c.selected).length;
    const contactsHtml = p.contacts?.length ? `
      <h2 class="section-title">${p.contacts.length} ${p.contacts.length === 1 ? 'Kontakt' : 'Kontakte'}</h2>
      ${p.contacts.map((c, i) => foundContact(c, i)).join('')}` : '';
    results = p.tasks.length || p.contacts?.length ? `
      ${p.ai && p.summary ? `<div class="ai-box" style="margin-top:22px">${I.spark} <span>${esc(p.summary)}</span></div>` : ''}
      <h2 class="section-title">${p.tasks.length} ${p.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} gefunden</h2>
      <p class="hint">${p.ai ? 'Von der KI vorgeschlagen. Prüfe Titel, Frist und Vorlauf und wähle ab, was nicht passt.' : 'Häkchen setzen, Text und Datum bei Bedarf anpassen. Bei Aufgaben aus älteren Nachrichten im Verlauf kurz prüfen, ob sie noch offen sind.'}</p>
      ${p.tasks.map((t, i) => foundItem(t, i)).join('')}
      ${contactsHtml}
      <label class="opt"><input type="checkbox" data-action="save-info" ${S.saveInfo ? 'checked' : ''}> E-Mail zusätzlich unter Infos ablegen</label>
      <div class="sticky-action"><button class="btn block" data-action="commit-import" id="commit-btn" ${sel || csel ? '' : 'disabled'}>${commitLabel(sel, csel)}</button></div>`
      : `<div class="empty"><strong>Keine Aufgaben erkannt</strong>In diesem Text steht nichts, was nach einer Bitte oder Frist klingt. Du kannst die Aufgabe selbst anlegen.<br><br>
         <button class="btn secondary" data-action="new-task">Aufgabe selbst anlegen</button>
         <button class="btn ghost" data-action="info-only">Nur unter Infos ablegen</button></div>`;
  }
  const has = S.pasteText.trim();
  const mainBtn = S.ai
    ? `<button class="btn block" style="margin-top:14px" data-action="parse-ai" ${has && !S.aiBusy ? '' : 'disabled'} id="parse-btn">${S.aiBusy ? '<span class="spin"></span> KI liest den Text …' : `${I.spark} Mit KI auswerten`}</button>
       <button class="link" data-action="parse" ${S.aiBusy ? 'disabled' : ''}>Ohne KI auswerten (feste Regeln)</button>`
    : `<button class="btn block" style="margin-top:14px" data-action="parse" ${has ? '' : 'disabled'} id="parse-btn">Aufgaben finden</button>
       <p class="hint">Tipp: Mit dem KI-Assistenten (Mehr → KI-Assistent) erkennt die App auch Ansprechpartner, schätzt Vorlaufzeiten und versteht frei formulierte Mails.</p>`;
  return `<main class="view">
    <h1 class="title">E-Mail einlesen</h1>
    <p class="subtitle">Kopiere den ganzen Verlauf aus der Mail-App oder einen Text aus der Allkauf-App hier hinein.</p>
    <textarea class="paste" id="paste" data-input="paste" placeholder="Hier einfügen: Betreff, Von, Gesendet und der Text der E-Mail – gern der komplette Verlauf.">${esc(S.pasteText)}</textarea>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn secondary small" data-action="clip">Aus Zwischenablage</button>
      <label class="btn secondary small" style="position:relative">Screenshot lesen<input type="file" accept="image/*" data-action="ocr" style="position:absolute;inset:0;opacity:0"></label>
      ${S.pasteText ? '<button class="btn ghost small" data-action="clear-paste">Leeren</button>' : ''}
    </div>
    ${mainBtn}
    ${results}
  </main>`;
}
function commitLabel(n, c = 0) {
  if (!n && !c) return 'Nichts ausgewählt';
  const parts = [];
  if (n) parts.push(`${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'}`);
  if (c) parts.push(`${c} ${c === 1 ? 'Kontakt' : 'Kontakte'}`);
  return parts.join(' und ') + ' übernehmen';
}
const KIND = { frist: 'Frist', termin: 'Termin', geschaetzt: 'Vorschlag der KI', keine: '' };

function foundItem(t, i) {
  const src = [t.from && `von ${t.from}`, t.messageDate && `vom ${fmtDate(t.messageDate, { day: 'numeric', month: 'short' })}`].filter(Boolean).join(' ');
  const sb = t.due && t.leadDays != null ? (() => { const d = parseISO(t.due); d.setDate(d.getDate() - t.leadDays); return isoDate(d); })() : null;
  return `<div class="found ${t.selected ? '' : 'off'}" data-i="${i}">
    <input type="checkbox" data-action="pick" data-i="${i}" ${t.selected ? 'checked' : ''} aria-label="Übernehmen">
    <div class="found-body">
      <textarea class="found-title" data-input="found-title" data-i="${i}" rows="2" aria-label="Titel">${esc(t.title)}</textarea>
      <div class="found-line">
        <input type="date" data-input="found-due" data-i="${i}" value="${esc(t.due || '')}" aria-label="Fällig am">
        ${t.leadDays != null ? `<label class="mini">Vorlauf <input type="number" min="0" max="120" inputmode="numeric" data-input="found-lead" data-i="${i}" value="${esc(t.leadDays)}" aria-label="Vorlauf in Tagen"> Tage</label>` : ''}
        <select data-input="found-phase" data-i="${i}" aria-label="Bereich">${PHASES.map((p) => `<option ${p === t.phase ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      </div>
      ${t.ai ? `<div class="found-src">${[KIND[t.dueKind] && t.due ? KIND[t.dueKind] : '', sb ? `anfangen bis ${fmtDate(sb, { day: 'numeric', month: 'short' })}` : '', t.contactName ? `Ansprechpartner: ${t.contactName}` : ''].filter(Boolean).map(esc).join(' · ')}</div>
        ${t.leadReason ? `<div class="found-src">${esc(t.leadReason)}</div>` : ''}
        ${t.details ? `<div class="found-src">${esc(t.details)}</div>` : ''}
        ${t.doneInThread ? '<div class="found-warn">Laut Verlauf vermutlich schon erledigt</div>' : ''}` : ''}
      ${src ? `<div class="found-src">Aus der Nachricht ${esc(src)}${t.messageIndex > 0 ? ' (älter im Verlauf)' : ''}</div>` : ''}
      ${t.existing ? `<div class="found-warn">Ähnliche Aufgabe gibt es schon: „${esc(t.existing)}“</div>` : ''}
    </div></div>`;
}
function foundContact(c, i) {
  const line = [c.role, c.company].filter(Boolean).join(', ');
  const data = [c.email, c.phone, c.mobile].filter(Boolean).join(' · ');
  const state = c.match ? (c.addsInfo ? `Schon gespeichert – fehlende Angaben werden ergänzt` : 'Schon gespeichert, nichts Neues') : 'Neuer Kontakt';
  return `<div class="found ${c.selected ? '' : 'off'}">
    <input type="checkbox" data-action="pick-contact" data-i="${i}" ${c.selected ? 'checked' : ''} aria-label="Kontakt übernehmen">
    <div class="found-body">
      <div style="font-weight:600">${esc(c.name)}</div>
      ${line ? `<div class="found-src" style="margin-top:2px">${esc(line)}</div>` : ''}
      <div class="found-src" style="margin-top:2px">${esc(data)}</div>
      <div class="found-src">${esc(state)}</div>
    </div></div>`;
}

// --- Kontakte
const telHref = (n) => 'tel:' + String(n).replace(/[^\d+]/g, '');
function viewContacts() {
  const q = S.contactQuery.trim().toLowerCase();
  const list = S.contacts.filter((c) => !q || [c.name, c.company, c.role, c.email].join(' ').toLowerCase().includes(q));
  const rows = list.map((c) => {
    const sub = [c.role, c.company].filter(Boolean).join(', ');
    const tel = c.mobile || c.phone;
    const openN = S.tasks.filter((t) => !t.done && t.contactId === c.id).length;
    return `<div class="row contact">
      <span class="avatar" aria-hidden="true">${esc((c.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span>
      <button class="row-main" data-action="contact" data-id="${esc(c.id)}">
        <div class="row-title">${esc(c.name)}</div>
        <div class="row-meta">${sub ? `<span>${esc(sub)}</span>` : ''}${openN ? `<span>${openN} offen</span>` : ''}</div>
      </button>
      ${c.email ? `<button class="icon-btn" data-action="compose-contact" data-id="${esc(c.id)}" aria-label="E-Mail an ${esc(c.name)}">${I.envelope}</button>` : ''}
      ${tel ? `<a class="icon-btn" href="${esc(telHref(tel))}" aria-label="${esc(c.name)} anrufen">${I.phone}</a>` : ''}
    </div>`;
  }).join('');
  return `<main class="view">
    <h1 class="title">Kontakte</h1>
    <p class="subtitle">Ansprechpartner bei allkauf, Bank, Behörden und Handwerkern.</p>
    ${S.contacts.length > 5 ? `<input class="input" type="search" data-input="contact-q" value="${esc(S.contactQuery)}" placeholder="Suchen" style="margin-bottom:12px" aria-label="Kontakte durchsuchen">` : ''}
    ${rows ? `<div class="list">${rows}</div>` : `<div class="empty"><strong>${q ? 'Nichts gefunden' : 'Noch keine Kontakte'}</strong>${q ? 'Versuch einen anderen Suchbegriff.' : 'Lies eine E-Mail mit dem KI-Assistenten ein – Ansprechpartner aus der Signatur landen dann hier. Oder lege einen Kontakt mit dem Plus an.'}</div>`}
  </main>`;
}

// --- Infos
function viewInfos() {
  const q = S.infoQuery.trim().toLowerCase();
  const list = S.infos.filter((x) => !q || `${x.title} ${x.text} ${x.from}`.toLowerCase().includes(q));
  const items = list.map((x) => {
    const open = S.openInfo === x.id;
    return `<article class="info ${open ? 'open' : ''}">
      <button class="info-toggle" data-action="info-open" data-id="${esc(x.id)}" aria-expanded="${open}">
        <div class="info-head"><span class="info-title">${esc(x.title || 'Ohne Betreff')}</span><span class="info-date">${esc(x.date ? fmtDate(x.date, { day: 'numeric', month: 'short', year: '2-digit' }) : new Date(x.createdAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }))}</span></div>
        ${x.from ? `<div class="info-from">${esc(x.from)}</div>` : ''}
        <div class="info-text">${esc(x.text)}</div>
      </button>
      ${open ? `<div class="btn-row" style="margin-top:12px">
        <button class="btn secondary small" data-action="info-reparse" data-id="${esc(x.id)}">Aufgaben darin suchen</button>
        <button class="btn danger small" data-action="info-delete" data-id="${esc(x.id)}">Löschen</button></div>` : ''}
    </article>`;
  }).join('');
  return `<main class="view">
    <h1 class="title">Infos</h1>
    <p class="subtitle">Abgelegte E-Mails und Notizen – für alle im Projekt sichtbar.</p>
    <div class="btn-row" style="margin-bottom:12px">
      <input class="input" type="search" data-input="info-q" value="${esc(S.infoQuery)}" placeholder="Suchen" style="flex:1;min-width:0" aria-label="Infos durchsuchen">
      <button class="btn small" data-action="new-info">Notiz</button>
    </div>
    ${items || `<div class="empty"><strong>${q ? 'Nichts gefunden' : 'Noch keine Infos'}</strong>${q ? 'Versuch einen anderen Suchbegriff.' : 'Eingelesene E-Mails und eigene Notizen erscheinen hier, zum Beispiel Zugangsdaten zum Bauamt-Portal oder Telefonnummern.'}</div>`}
  </main>`;
}

// --- Mehr
function pushState() {
  if (store.mode !== 'cloud') return { on: false, text: 'Braucht die Cloud-Einrichtung' };
  if (typeof Notification === 'undefined') return { on: false, text: isIOS && !standalone ? 'Erst zum Home-Bildschirm hinzufügen' : 'Auf diesem Gerät nicht verfügbar' };
  if (Notification.permission === 'denied') return { on: false, text: 'Abgelehnt – in den iPhone-Einstellungen erlauben' };
  if (Notification.permission === 'granted' && localStorage.getItem('hausplaner-push-token')) return { on: true, text: 'Aktiv auf diesem Gerät' };
  return { on: false, text: 'Noch nicht aktiviert' };
}
function viewMore() {
  const cloud = store.mode === 'cloud';
  const ps = pushState();
  const mem = members().map((u) => `<div class="setting"><span class="who">${esc(initial(u))}</span><span class="grow">${esc(nameOf(u))}${u === S.me?.uid ? ' <span class="muted">(du)</span>' : ''}</span></div>`).join('');
  return `<main class="view">
    <h1 class="title">Mehr</h1>
    ${cloud ? '' : `<div class="banner"><p><strong>Lokaler Modus.</strong> Alles bleibt auf diesem Gerät. Für Teilen mit deiner Frau und Push-Nachrichten trägst du deine Firebase-Daten in <em>config.js</em> ein – die Anleitung führt dich durch.</p></div>`}

    <h2 class="section-title">Bauprojekt</h2>
    <div class="settings">
      <button class="setting" data-action="rename"><span class="grow">Name<small>${esc(S.project?.name || 'Unser Haus')}</small></span><span class="end">Ändern</span></button>
      ${cloud ? mem : ''}
      <button class="setting" data-action="invite"><span class="grow">Partner einladen<small>Code erzeugen und per Nachricht schicken</small></span></button>
      ${cloud ? `<button class="setting" data-action="join"><span class="grow">Mit Code beitreten<small>Einem anderen Bauprojekt beitreten</small></span></button>` : ''}
    </div>

    <h2 class="section-title">Erinnerungen</h2>
    <div class="settings">
      <button class="setting" data-action="push" ${ps.on ? 'disabled' : ''}><span class="status-dot ${ps.on ? 'on' : ''}"></span><span class="grow">Push-Nachrichten<small>${esc(ps.text)}</small></span>${ps.on ? '' : '<span class="end">Aktivieren</span>'}</button>
    </div>
    <p class="hint">Erinnert wird zur eingestellten Zeit jeder Aufgabe. Jeden Morgen ab 7 Uhr kommt zusätzlich eine Übersicht, wenn etwas fällig ist. Jedes Gerät muss einmal selbst aktiviert werden.</p>

    <h2 class="section-title">KI-Assistent</h2>
    <div class="settings">
      <button class="setting" data-action="ai-settings"><span class="status-dot ${S.ai ? 'on' : ''}"></span><span class="grow">Claude von Anthropic<small>${S.ai ? `Aktiv · ${esc((MODELS.find((m) => m[0] === S.ai.model) || [0, S.ai.model])[1].split(' – ')[0])}` : 'Nicht eingerichtet'}</small></span><span class="end">${S.ai ? 'Ändern' : 'Einrichten'}</span></button>
      ${S.ai ? `<button class="setting" data-action="assess-all" ${S.aiBusy ? 'disabled' : ''}><span class="grow">${S.aiBusy ? 'Fristen werden geprüft …' : 'Alle Fristen jetzt prüfen'}<small>Die KI schätzt ein, was bis wann zu schaffen ist</small></span></button>` : ''}
    </div>
    <p class="hint">${S.ai ? (store.mode === 'cloud' ? 'Jeden Morgen prüft die KI alle offenen Fristen. Was jetzt angegangen werden muss, kommt als Push-Nachricht.' : 'Im lokalen Modus prüft die KI die Fristen nur, wenn du es hier antippst. Mit Cloud passiert das jeden Morgen automatisch.') : 'Liest E-Mails, erkennt Aufgaben, Fristen und Ansprechpartner, schreibt Mail-Entwürfe und warnt, wenn eine Frist knapp wird.'}</p>

    <h2 class="section-title">Aufgaben</h2>
    <div class="settings">
      <button class="setting" data-action="template"><span class="grow">Typische Bauherren-Aufgaben<small>Checkliste vom Bauantrag bis zur Abnahme hinzufügen</small></span></button>
    </div>

    <h2 class="section-title">Daten</h2>
    <div class="settings">
      <button class="setting" data-action="export"><span class="grow">Sicherung speichern<small>Alle Aufgaben, Kontakte und Infos als Datei</small></span></button>
      <label class="setting" style="cursor:pointer;position:relative"><span class="grow">Sicherung einspielen<small>Aufgaben und Infos aus einer Datei hinzufügen</small></span><input type="file" accept="application/json,.json" data-action="import-file" style="position:absolute;inset:0;opacity:0"></label>
    </div>

    ${cloud ? `<h2 class="section-title">Konto</h2>
    <div class="settings">
      <div class="setting"><span class="grow">${esc(S.me?.name)}<small>${esc(S.me?.email)}</small></span></div>
      <button class="setting danger" data-action="logout">Abmelden</button>
    </div>` : ''}
    <p class="hint" style="margin-top:28px">Hausplaner · Daten ${cloud ? 'in deinem eigenen Firebase-Projekt' : 'nur auf diesem Gerät'}</p>
  </main>`;
}

// --- Anmeldung & Projekt anlegen
function viewAuth() {
  const reg = S.authTab === 'register';
  return `<main class="auth">
    <section class="bauschild"><p class="bauschild-label">Bauvorhaben</p><p class="bauschild-task">Hausplaner</p><p class="bauschild-when">Aufgaben, Termine und E-Mails rund um euren Hausbau.</p></section>
    <div class="seg" role="group" aria-label="Anmelden oder registrieren">
      <button data-action="auth-tab" data-tab="login" aria-pressed="${!reg}">Anmelden</button>
      <button data-action="auth-tab" data-tab="register" aria-pressed="${reg}">Konto erstellen</button>
    </div>
    <form data-form="auth">
      ${reg ? '<label class="field"><span>Dein Vorname</span><input name="name" autocomplete="given-name" required></label>' : ''}
      <label class="field"><span>E-Mail</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Passwort</span><input name="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="6" required></label>
      ${S.authError ? `<p class="error">${esc(S.authError)}</p>` : ''}
      <button class="btn block" type="submit">${reg ? 'Konto erstellen' : 'Anmelden'}</button>
    </form>
    ${reg ? '' : '<button class="link" data-action="reset-pw">Passwort vergessen?</button>'}
  </main>`;
}
function viewSetup() {
  return `<main class="auth">
    <h1 class="title">Hallo ${esc(S.me?.name || '')}</h1>
    <p class="subtitle">Lege euer Bauprojekt an. Wenn deine Partnerin oder dein Partner es schon angelegt hat, tritt mit dem Code bei.</p>
    <form data-form="create" style="margin-top:20px">
      <label class="field"><span>Name des Projekts</span><input name="name" value="Unser Allkauf-Haus" required></label>
      <button class="btn block" type="submit">Bauprojekt anlegen</button>
    </form>
    <h2 class="section-title" style="margin-top:36px">Ich habe einen Code</h2>
    <form data-form="join-setup">
      <label class="field"><span>Einladungscode</span><input name="code" autocapitalize="characters" autocomplete="off" placeholder="z. B. K7MQ2P" required></label>
      ${S.authError ? `<p class="error">${esc(S.authError)}</p>` : ''}
      <button class="btn secondary block" type="submit">Beitreten</button>
    </form>
    <button class="link" data-action="logout" style="margin-top:24px">Abmelden</button>
  </main>`;
}

// ------------------------------------------------------------------ Bottom-Sheets
function openSheet(html, onMount) {
  sheetRoot.innerHTML = `<div class="backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grab"></div>${html}</div>`;
  const sheet = sheetRoot.querySelector('.sheet');
  sheetRoot.querySelector('[data-close]').onclick = closeSheet;
  sheet.querySelectorAll('[data-dismiss]').forEach((b) => (b.onclick = closeSheet));
  onMount?.(sheet);
  return sheet;
}
function closeSheet() { sheetRoot.innerHTML = ''; if (S.pendingRender) render(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetRoot.innerHTML) closeSheet(); });

function contactOptions(selected) {
  return `<option value="">– keiner –</option>${S.contacts.map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}${c.company ? ` (${esc(c.company)})` : ''}</option>`).join('')}`;
}
function urgencyBox(t) {
  const u = urgencyOf(t);
  if (!u) return '';
  const sb = u.startBy ? `Anfangen spätestens: ${fmtDate(u.startBy, { weekday: 'short', day: 'numeric', month: 'short' })}` : '';
  return `<div class="ai-box u-${u.status}" data-urg>
    <div class="ai-box-head">${u.ai ? I.spark : ''}<strong>${esc(STATUS[u.status].label)}</strong>${u.ai ? '<span class="muted">KI-Einschätzung</span>' : ''}</div>
    ${u.reason ? `<p>${esc(u.reason)}</p>` : ''}
    ${u.next ? `<p><strong>Nächster Schritt:</strong> ${esc(u.next)}</p>` : ''}
    ${sb ? `<p class="muted">${esc(sb)}</p>` : ''}
    ${S.ai ? `<button type="button" class="link" data-act="assess">Mit KI neu einschätzen</button>` : ''}
  </div>`;
}

function taskSheet(task) {
  const t = task || { title: '', due: '', time: '', reminder: 'day1', phase: S.phase !== 'all' ? S.phase : 'Allgemein', assignee: 'all', notes: '', leadDays: null, contactId: null };
  const memOpts = members().length > 1 ? `<label class="field"><span>Zuständig</span><select name="assignee">
      <option value="all" ${!t.assignee || t.assignee === 'all' ? 'selected' : ''}>Beide</option>
      ${members().map((u) => `<option value="${esc(u)}" ${t.assignee === u ? 'selected' : ''}>${esc(nameOf(u))}</option>`).join('')}</select></label>` : '';
  const c = t.contactId ? contactById(t.contactId) : null;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${task ? 'Aufgabe' : 'Neue Aufgabe'}</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    ${task && !task.done ? urgencyBox(task) : ''}
    ${task ? `<div class="btn-row" style="margin-bottom:14px">
      <button type="button" class="btn secondary small" data-act="mail">${I.envelope} ${c?.email ? `E-Mail an ${esc(c.name.split(' ').slice(-1)[0])}` : 'E-Mail schreiben'}</button>
      ${c && (c.mobile || c.phone) ? `<a class="btn secondary small" href="${esc(telHref(c.mobile || c.phone))}">${I.phone} Anrufen</a>` : ''}
    </div>` : ''}
    <form data-sheet-form>
      <label class="field"><span>Was ist zu tun?</span><textarea name="title" rows="2" required style="min-height:64px">${esc(t.title)}</textarea></label>
      <div class="two">
        <label class="field"><span>Fällig am</span><input type="date" name="due" value="${esc(t.due || '')}"></label>
        <label class="field"><span>Uhrzeit</span><input type="time" name="time" value="${esc(t.time || '')}"></label>
      </div>
      <div class="two">
        <label class="field"><span>Vorlauf (Tage)</span><input type="number" name="leadDays" min="0" max="120" inputmode="numeric" value="${t.leadDays ?? ''}" placeholder="z. B. 14"></label>
        <label class="field"><span>Ansprechpartner</span><select name="contactId">${contactOptions(t.contactId)}</select></label>
      </div>
      <p class="hint" data-lead-hint style="margin-top:-6px"></p>
      <label class="field"><span>Erinnerung</span><select name="reminder">${REMINDERS.map(([v, l]) => `<option value="${v}" ${(t.reminder || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field" data-custom ${t.reminder === 'custom' ? '' : 'hidden'}><span>Erinnern am</span><input type="datetime-local" name="remindCustom" value="${esc(t.remindCustom || '')}"></label>
      <p class="hint" data-remind-hint style="margin-top:-6px"></p>
      <div class="two">
        <label class="field"><span>Bereich</span><select name="phase">${PHASES.map((p) => `<option ${p === (t.phase || 'Allgemein') ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
        ${memOpts || '<span></span>'}
      </div>
      <label class="field"><span>Notizen</span><textarea name="notes" rows="4">${esc(t.notes || '')}</textarea></label>
      <button class="btn block" type="submit">Speichern</button>
      ${task ? `<div class="btn-row" style="justify-content:space-between;margin-top:10px">
        <button type="button" class="btn ghost" data-act="done">${task.done ? 'Wieder öffnen' : 'Als erledigt markieren'}</button>
        <button type="button" class="btn danger" data-act="delete">Löschen</button></div>
        ${task.createdBy && members().length > 1 ? `<p class="hint">Angelegt von ${esc(nameOf(task.createdBy))}${task.done && task.doneBy ? `, erledigt von ${esc(nameOf(task.doneBy))}` : ''}</p>` : ''}` : ''}
    </form>`);
  const form = sheet.querySelector('form');
  const formData = () => {
    const f = Object.fromEntries(new FormData(form));
    return { title: f.title.trim(), due: f.due || null, time: f.time || null, reminder: f.reminder, remindCustom: f.remindCustom || null, phase: f.phase, notes: f.notes.trim(), assignee: f.assignee || 'all', leadDays: f.leadDays === '' ? null : Math.max(0, Math.min(120, parseInt(f.leadDays, 10) || 0)), contactId: f.contactId || null };
  };
  const upd = () => {
    const f = formData();
    sheet.querySelector('[data-custom]').hidden = f.reminder !== 'custom';
    const at = computeRemindAt(f);
    const hint = sheet.querySelector('[data-remind-hint]');
    if (f.reminder === 'none') hint.textContent = '';
    else if (!f.due && f.reminder !== 'custom') hint.textContent = 'Für diese Erinnerung braucht die Aufgabe ein Datum.';
    else if (at) hint.textContent = `Erinnerung: ${new Date(at).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} Uhr${at < Date.now() ? ' – liegt in der Vergangenheit' : ''}`;
    else hint.textContent = '';
    const lh = sheet.querySelector('[data-lead-hint]');
    if (f.due && f.leadDays != null) { const d = parseISO(f.due); d.setDate(d.getDate() - f.leadDays); lh.textContent = `Anfangen spätestens am ${d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\.$/, '')}. Ab dann kommt eine Push-Nachricht „Jetzt angehen“.`; }
    else lh.textContent = f.due ? 'Vorlauf = wie viele Tage vor der Frist du anfangen musst (z. B. weil die Bank Zeit braucht).' : '';
  };
  form.addEventListener('input', upd); upd();
  if (!task) setTimeout(() => form.title.focus(), 280);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = formData();
    if (!data.title) return;
    try {
      if (task) await store.updateTask(task.id, data, task);
      else await store.addTask({ ...data, source: 'manual' });
      closeSheet();
      toast(task ? 'Gespeichert' : 'Aufgabe angelegt');
    } catch (err) { toast(fail(err)); }
  };
  sheet.querySelector('[data-act="mail"]')?.addEventListener('click', () => {
    const cur = { ...task, ...formData() };
    composeSheet({ task: cur, contact: cur.contactId ? contactById(cur.contactId) : null });
  });
  sheet.querySelector('[data-act="assess"]')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'KI schätzt ein …';
    try {
      await assessList([S.tasks.find((x) => x.id === task.id) || task]);
      const fresh = S.tasks.find((x) => x.id === task.id);
      sheet.querySelector('[data-urg]').outerHTML = urgencyBox(fresh);
      sheet.querySelector('[data-act="assess"]')?.addEventListener('click', () => taskSheet(fresh));
    } catch (err) { toast(fail(err)); e.target.disabled = false; e.target.textContent = 'Mit KI neu einschätzen'; }
  });
  sheet.querySelector('[data-act="done"]')?.addEventListener('click', () => { closeSheet(); toggleTask(task.id); });
  sheet.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
    if (!confirm('Aufgabe wirklich löschen?')) return;
    closeSheet();
    try { await store.deleteTask(task.id); toast('Gelöscht', { label: 'Rückgängig', fn: () => { const { id, ...rest } = task; store.addTask(rest); } }); } catch (err) { toast(fail(err)); }
  });
}

// --- Kontakt ansehen / bearbeiten
function contactSheet(c) {
  const isNew = !c;
  c = c || { name: '', company: '', role: '', email: '', phone: '', mobile: '', address: '', notes: '' };
  const tasks = isNew ? [] : S.tasks.filter((t) => !t.done && t.contactId === c.id).sort(byDue);
  const tel = c.mobile || c.phone;
  const f = (name, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(c[name] || '')}" ${extra}></label>`;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${isNew ? 'Neuer Kontakt' : esc(c.name)}</h2><button class="btn ghost" data-dismiss>${isNew ? 'Abbrechen' : 'Schließen'}</button></div>
    ${isNew ? '' : `<div class="btn-row" style="margin-bottom:16px">
      ${c.email ? `<button type="button" class="btn small" data-act="mail">${I.envelope} E-Mail schreiben</button>` : ''}
      ${c.phone ? `<a class="btn secondary small" href="${esc(telHref(c.phone))}">${I.phone} ${esc(c.phone)}</a>` : ''}
      ${c.mobile ? `<a class="btn secondary small" href="${esc(telHref(c.mobile))}">${I.phone} Mobil</a>` : ''}
    </div>
    ${tasks.length ? `<h3 class="sub-title">Offene Aufgaben</h3><div class="list" style="margin-bottom:18px">${tasks.map(row).join('')}</div>` : ''}`}
    <form>
      ${f('name', 'Name', 'text', 'required autocomplete="off"')}
      <div class="two">${f('role', 'Rolle')}${f('company', 'Firma')}</div>
      ${f('email', 'E-Mail', 'email', 'autocomplete="off" autocapitalize="off"')}
      <div class="two">${f('phone', 'Telefon', 'tel')}${f('mobile', 'Mobil', 'tel')}</div>
      ${f('address', 'Adresse')}
      <label class="field"><span>Notizen</span><textarea name="notes" rows="3">${esc(c.notes || '')}</textarea></label>
      <button class="btn block" type="submit">Speichern</button>
      ${isNew ? '' : '<button type="button" class="btn danger block" data-act="delete" style="margin-top:8px">Kontakt löschen</button>'}
    </form>`);
  const form = sheet.querySelector('form');
  if (isNew) setTimeout(() => form.name.focus(), 280);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    for (const k in d) d[k] = d[k].trim();
    d.email = d.email.toLowerCase();
    if (!d.name) return;
    try {
      if (isNew) await store.addContact({ ...d, source: 'manual' }); else await store.updateContact(c.id, d, c);
      closeSheet(); toast(isNew ? 'Kontakt angelegt' : 'Gespeichert');
    } catch (err) { toast(fail(err)); }
  };
  sheet.querySelector('[data-act="mail"]')?.addEventListener('click', () => composeSheet({ contact: c }));
  sheet.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
    if (!confirm(`${c.name} löschen?`)) return;
    try { await store.deleteContact(c.id); closeSheet(); toast('Kontakt gelöscht'); } catch (err) { toast(fail(err)); }
  });
  sheet.querySelectorAll('.row-main[data-action="edit"]').forEach((b) => b.addEventListener('click', () => taskSheet(S.tasks.find((t) => t.id === b.dataset.id))));
  sheet.querySelectorAll('.check[data-action="toggle"]').forEach((b) => b.addEventListener('click', () => { toggleTask(b.dataset.id); closeSheet(); }));
}

// --- E-Mail schreiben (öffnet die Mail-App mit fertigem Text)
function composeSheet({ task = null, contact = null } = {}) {
  const withMail = S.contacts.filter((x) => x.email);
  const sender = S.me?.name && S.me.name !== 'Ich' ? S.me.name : '';
  const greet = 'Guten Tag,';
  const defBody = `${greet}\n\n\n\nMit freundlichen Grüßen\n${sender}`;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>E-Mail</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <form>
      ${withMail.length ? `<label class="field"><span>An</span><select name="pick">${withMail.map((x) => `<option value="${esc(x.email)}" ${contact?.id === x.id ? 'selected' : ''}>${esc(x.name)} – ${esc(x.email)}</option>`).join('')}<option value="" ${contact?.email ? '' : 'selected'}>Andere Adresse …</option></select></label>` : ''}
      <label class="field" data-other ${withMail.length && contact?.email ? 'hidden' : ''}><span>E-Mail-Adresse</span><input name="to" type="email" autocapitalize="off" value="${esc(!withMail.length || !contact?.email ? contact?.email || '' : '')}"></label>
      ${S.ai ? `<div class="ai-compose">
        <input class="input" name="instruction" placeholder="${task ? 'Optional: Worum soll es gehen?' : 'Worum soll es gehen? z. B. Termin für Bemusterung anfragen'}">
        <button type="button" class="btn secondary small" data-act="ai">${I.spark} Mit KI formulieren</button>
      </div>` : ''}
      <label class="field"><span>Betreff</span><input name="subject" value="${esc(task ? task.title : '')}"></label>
      <label class="field"><span>Text</span><textarea name="body" rows="11">${esc(defBody)}</textarea></label>
      <button class="btn block" type="submit">${I.envelope} In Mail-App öffnen</button>
      <button type="button" class="btn ghost block" data-act="copy" style="margin-top:6px">Text kopieren</button>
      <p class="hint">Die Mail öffnet sich fertig ausgefüllt in deiner Mail-App. Dort prüfst du sie und tippst auf Senden – so geht sie von deiner eigenen Adresse raus.</p>
    </form>`);
  const form = sheet.querySelector('form');
  const pick = form.pick;
  const other = sheet.querySelector('[data-other]');
  pick?.addEventListener('change', () => { other.hidden = !!pick.value; });
  const toAddr = () => (pick && pick.value) || form.to.value.trim();
  const recipient = () => S.contacts.find((x) => x.email && x.email === toAddr()) || contact;
  sheet.querySelector('[data-act="ai"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!task && !form.instruction.value.trim()) { toast('Schreib kurz, worum es gehen soll.'); form.instruction.focus(); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> KI schreibt …';
    try {
      const d = await draftEmail(aiCfg(), { task, contact: recipient(), sender, project: S.project?.name, instruction: form.instruction.value.trim() });
      form.subject.value = d.subject; form.body.value = d.body;
    } catch (err) { toast(fail(err)); }
    btn.disabled = false; btn.innerHTML = `${I.spark} Neu formulieren`;
  });
  sheet.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`${form.subject.value}\n\n${form.body.value}`); toast('Text kopiert'); } catch { toast('Kopieren nicht möglich.'); }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const to = toAddr();
    if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast('Die E-Mail-Adresse sieht nicht richtig aus.'); return; }
    const url = `mailto:${to}?subject=${encodeURIComponent(form.subject.value)}&body=${encodeURIComponent(form.body.value)}`;
    if (task?.id) {
      const cur = S.tasks.find((x) => x.id === task.id);
      if (cur) store.updateTask(cur.id, { notes: `${cur.notes ? cur.notes + '\n\n' : ''}${new Date().toLocaleDateString('de-DE')}: E-Mail an ${recipient()?.name || to} – „${form.subject.value}“` }, cur).catch(() => {});
    }
    closeSheet();
    window.location.href = url;
  };
}

// --- KI einrichten
function aiSheet() {
  const cur = S.ai || {};
  const sheet = openSheet(`
    <div class="sheet-head"><h2>KI-Assistent</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <p class="hint" style="margin-top:0">Der Hausplaner nutzt Claude von Anthropic. Dafür brauchst du einen eigenen API-Schlüssel aus der Anthropic Console (Anleitung, Stufe 4). Abgerechnet wird nach Verbrauch – eine E-Mail auszuwerten kostet meist 1–3 Cent.</p>
    <form>
      <label class="field"><span>API-Schlüssel</span><input name="apiKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-ant-…" value="${esc(cur.apiKey || '')}" required></label>
      <label class="field"><span>Modell</span><select name="model">${MODELS.map(([v, l]) => `<option value="${v}" ${(cur.model || DEFAULT_MODEL) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <p class="hint">${store.mode === 'cloud' ? 'Der Schlüssel wird in eurem Bauprojekt gespeichert. So kann auch deine Partnerin die KI nutzen, und die tägliche Fristprüfung läuft damit. Nur Mitglieder des Projekts können ihn lesen.' : 'Der Schlüssel bleibt auf diesem Gerät.'}</p>
      <p class="error" data-err hidden></p>
      <button class="btn block" type="submit">Prüfen und speichern</button>
      ${S.ai ? '<button type="button" class="btn danger block" data-act="remove" style="margin-top:8px">KI-Assistent ausschalten</button>' : ''}
    </form>`);
  const form = sheet.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]'); const err = sheet.querySelector('[data-err]');
    const cfg = { apiKey: form.apiKey.value.trim(), model: form.model.value };
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Verbindung wird geprüft …'; err.hidden = true;
    try {
      await testConnection(cfg);
      await store.setAi(cfg);
      closeSheet(); toast('KI-Assistent ist aktiv');
    } catch (x) { err.textContent = fail(x); err.hidden = false; btn.disabled = false; btn.textContent = 'Prüfen und speichern'; }
  };
  sheet.querySelector('[data-act="remove"]')?.addEventListener('click', async () => {
    if (!confirm('KI-Assistent ausschalten und Schlüssel löschen?')) return;
    try { await store.setAi(null); closeSheet(); toast('KI-Assistent ausgeschaltet'); } catch (x) { toast(fail(x)); }
  });
}

// --- Fristen von der KI einschätzen lassen
async function assessList(list) {
  const todo = list.filter((t) => !t.done && t.due);
  if (!todo.length) return 0;
  let n = 0;
  for (let i = 0; i < todo.length; i += 30) {
    const res = await assessTasks(aiCfg(), todo.slice(i, i + 30));
    for (const r of res) {
      const t = S.tasks.find((x) => x.id === r.id); if (!t) continue;
      await store.updateTask(t.id, { aiStatus: r.status, aiReason: r.reason, aiNext: r.next, aiStartBy: r.startBy, aiFor: aiKeyOf(t), aiAt: Date.now() }, t);
      n++;
    }
  }
  return n;
}

async function toggleTask(id) {
  const t = S.tasks.find((x) => x.id === id); if (!t) return;
  const patch = t.done ? { done: false, doneAt: null, doneBy: null } : { done: true, doneAt: Date.now(), doneBy: S.me?.uid || null };
  try {
    await store.updateTask(id, patch, t);
    if (!t.done) toast('Erledigt', { label: 'Rückgängig', fn: () => store.updateTask(id, { done: false, doneAt: null, doneBy: null }, { ...t, ...patch }) });
  } catch (e) { toast(fail(e)); }
}

function infoSheet() {
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Notiz</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <form>
      <label class="field"><span>Titel</span><input name="title" required placeholder="z. B. Ansprechpartner Allkauf"></label>
      <label class="field"><span>Inhalt</span><textarea name="text" rows="8"></textarea></label>
      <button class="btn block" type="submit">Ablegen</button>
    </form>`);
  const form = sheet.querySelector('form');
  setTimeout(() => form.title.focus(), 280);
  form.onsubmit = async (e) => {
    e.preventDefault();
    try { await store.addInfo({ title: form.title.value.trim(), text: form.text.value.trim(), kind: 'note' }); closeSheet(); toast('Notiz abgelegt'); } catch (err) { toast(fail(err)); }
  };
}

const TEMPLATE = [
  ['Finanzierung', 'Finanzierungsbestätigung der Bank an Allkauf schicken'],
  ['Finanzierung', 'Zahlungsplan mit Bank und Allkauf abgleichen'],
  ['Finanzierung', 'Förderung (z. B. KfW) vor Baubeginn beantragen'],
  ['Finanzierung', 'Jede Abschlagsrechnung gegen den Baufortschritt prüfen'],
  ['Pläne & Behörden', 'Bodengutachten beauftragen'],
  ['Pläne & Behörden', 'Amtlichen Lageplan beim Vermesser bestellen'],
  ['Pläne & Behörden', 'Bauantrag prüfen und unterschreiben'],
  ['Pläne & Behörden', 'Entwässerungsantrag stellen'],
  ['Pläne & Behörden', 'Baubeginn beim Bauamt anzeigen'],
  ['Grundstück & Anschlüsse', 'Hausanschlüsse beantragen (Strom, Wasser, Abwasser, Glasfaser)'],
  ['Grundstück & Anschlüsse', 'Baustrom und Bauwasser organisieren'],
  ['Grundstück & Anschlüsse', 'Erdarbeiten und Bodenplatte bzw. Keller beauftragen'],
  ['Grundstück & Anschlüsse', 'Baustellenzufahrt und Lagerfläche klären'],
  ['Versicherung', 'Bauherrenhaftpflicht abschließen'],
  ['Versicherung', 'Bauleistungsversicherung prüfen'],
  ['Versicherung', 'Feuerrohbauversicherung abschließen'],
  ['Bemusterung', 'Bemusterungstermin vereinbaren'],
  ['Bemusterung', 'Elektroplan vorbereiten (Steckdosen, Licht, Netzwerk)'],
  ['Bemusterung', 'Fliesen, Sanitär und Bodenbeläge auswählen'],
  ['Bemusterung', 'Küchenplanung mit Anschlussplan abstimmen'],
  ['Bau & Abnahme', 'Unabhängigen Bausachverständigen beauftragen'],
  ['Bau & Abnahme', 'Bautagebuch mit Fotos führen'],
  ['Bau & Abnahme', 'Richtfest planen'],
  ['Bau & Abnahme', 'Abnahme mit Sachverständigem und Mängelprotokoll'],
  ['Bau & Abnahme', 'Zählerstände bei der Übergabe notieren'],
  ['Bau & Abnahme', 'Umzug planen und Adresse ummelden'],
];
function templateSheet() {
  const rows = TEMPLATE.map(([phase, title], i) => {
    const exists = S.tasks.some((t) => similarity(t.title, title) >= 0.75);
    return `<label class="found ${exists ? 'off' : ''}" style="align-items:center"><input type="checkbox" name="t" value="${i}" ${exists ? '' : 'checked'}><div class="found-body"><div style="font-weight:600">${esc(title)}</div><div class="found-src">${esc(phase)}${exists ? ' · schon vorhanden' : ''}</div></div></label>`;
  }).join('');
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Checkliste</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <p class="hint">Allgemeine Schritte beim Bau eines Fertighauses. Was bei euch nicht passt, einfach abwählen – Termine trägst du später ein.</p>
    <form>${rows}<button class="btn block" type="submit" style="margin-top:8px">Ausgewählte hinzufügen</button></form>`);
  sheet.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const picked = [...new FormData(e.target).getAll('t')].map((i) => TEMPLATE[+i]);
    if (!picked.length) return closeSheet();
    try { await store.addTasks(picked.map(([phase, title]) => ({ title, phase, reminder: 'none', source: 'vorlage', notes: '' }))); closeSheet(); toast(`${picked.length} Aufgaben hinzugefügt`); S.view = 'tasks'; render(); } catch (err) { toast(fail(err)); }
  };
}

async function inviteSheet() {
  if (store.mode !== 'cloud') {
    openSheet(`<div class="sheet-head"><h2>Partner einladen</h2><button class="btn ghost" data-dismiss>Schließen</button></div>
      <p>Zum gemeinsamen Arbeiten braucht der Hausplaner einen Ort im Internet, an dem eure Daten zusammenkommen. Das ist dein eigenes, kostenloses Firebase-Projekt.</p>
      <p class="hint">Die Anleitung erklärt die Einrichtung Schritt für Schritt (ca. 30 Minuten am Computer). Deine bisherigen Aufgaben werden dabei übernommen.</p>`);
    return;
  }
  try {
    const code = await store.createInvite();
    const pretty = code.slice(0, 3) + '-' + code.slice(3);
    const text = `Tritt unserem Hausplaner bei!\n1. Öffne ${location.origin + location.pathname} in Safari\n2. Teilen → „Zum Home-Bildschirm“\n3. App öffnen, Konto erstellen, Code eingeben: ${pretty}\n(Der Code gilt 7 Tage.)`;
    const sheet = openSheet(`<div class="sheet-head"><h2>Partner einladen</h2><button class="btn ghost" data-dismiss>Fertig</button></div>
      <p class="hint">Schick diesen Code zusammen mit dem Link. Er gilt 7 Tage.</p>
      <div class="code">${esc(pretty)}</div>
      <button class="btn block" data-share>${I.share} Einladung senden</button>`);
    sheet.querySelector('[data-share]').onclick = async () => {
      try {
        if (navigator.share) await navigator.share({ title: 'Hausplaner-Einladung', text });
        else { await navigator.clipboard.writeText(text); toast('Einladung kopiert'); }
      } catch {}
    };
  } catch (e) { toast(fail(e)); }
}

// ------------------------------------------------------------------ Einlesen
function runParse(text) {
  S.pasteText = text;
  const res = parseEmails(text, { today: new Date(), existing: S.tasks.filter((t) => !t.done) });
  S.parsed = { ...res, raw: text };
  render();
  if (res.tasks.length) setTimeout(() => app.querySelector('.section-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
async function runParseAI(text) {
  S.pasteText = text; S.aiBusy = true; S.parsed = null; render();
  try {
    const r = await extractFromText(aiCfg(), text, {
      me: { name: S.me?.name !== 'Ich' ? S.me?.name : '', email: S.me?.email, partner: members().filter((u) => u !== S.me?.uid).map(nameOf).join(', ') },
      contacts: S.contacts, openTasks: S.tasks.filter((t) => !t.done),
    });
    const open = S.tasks.filter((t) => !t.done);
    const contacts = r.contacts.map((c) => {
      const match = findContact(c);
      const addsInfo = match ? ['company', 'role', 'email', 'phone', 'mobile', 'address'].some((k) => c[k] && !match[k]) : true;
      return { ...c, match: match?.id || null, addsInfo, selected: !match || addsInfo };
    });
    const tasks = r.tasks.map((t) => {
      const ex = open.find((e) => similarity(e.title, t.title) >= 0.75);
      return { ...t, ai: true, doneInThread: t.done, existing: ex ? ex.title : null, selected: !t.done && !ex, notes: t.details, from: r.from, messageDate: r.date, subject: r.subject };
    });
    S.parsed = { ai: true, raw: text, summary: r.summary, tasks, contacts, messages: [{ subject: r.subject, from: r.from, date: r.date }] };
  } catch (e) {
    toast(fail(e));
  }
  S.aiBusy = false;
  render();
  if (S.parsed) setTimeout(() => app.querySelector('.ai-box, .section-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

async function commitImport() {
  const p = S.parsed; if (!p) return;
  const sel = p.tasks.filter((t) => t.selected && t.title.trim());
  const btn = app.querySelector('#commit-btn'); if (btn) btn.disabled = true;
  // 1) Kontakte anlegen oder ergänzen
  const idByKey = new Map();
  const keyOf = (x) => [(x.email || '').toLowerCase(), norm(x.name)];
  try {
    for (const c of p.contacts || []) {
      let id = c.match;
      if (c.selected) {
        const { selected, match, addsInfo, ...data } = c;
        if (id) {
          const ex = contactById(id);
          const patch = {}; for (const k of ['company', 'role', 'email', 'phone', 'mobile', 'address', 'notes']) if (data[k] && !ex?.[k]) patch[k] = data[k];
          if (Object.keys(patch).length) await store.updateContact(id, patch, ex);
        } else id = await store.addContact({ ...data, source: 'mail-ki' });
      }
      if (id) for (const k of keyOf(c)) if (k) idByKey.set(k, id);
    }
  } catch (e) { toast(fail(e)); if (btn) btn.disabled = false; return; }
  const contactFor = (t) => {
    if (!t.contactEmail && !t.contactName) return null;
    return idByKey.get((t.contactEmail || '').toLowerCase()) || idByKey.get(norm(t.contactName)) || findContact({ email: t.contactEmail, name: t.contactName })?.id || null;
  };
  try {
    await store.addTasks(sel.map((t) => {
      const src = [t.from && `von ${t.from}`, t.messageDate && `vom ${fmtDate(t.messageDate, { day: 'numeric', month: 'numeric', year: 'numeric' })}`].filter(Boolean).join(' ');
      const notes = [t.notes, t.quote ? `„${t.quote}“` : '', t.leadReason ? `Vorlauf: ${t.leadReason}` : ''].filter(Boolean).join('\n\n');
      return {
        title: t.title.trim(), due: t.due || null, time: t.time || null, phase: t.phase,
        leadDays: t.leadDays ?? null, contactId: p.ai ? contactFor(t) : null, dueKind: t.dueKind || null,
        reminder: !t.due ? 'none' : dayDiff(t.due) <= 1 ? 'day0' : 'day1', notes: `${notes}${src ? `\n\nAus der E-Mail ${src}` : ''}${t.subject ? `\nBetreff: ${t.subject}` : ''}`, source: p.ai ? 'mail-ki' : 'mail',
      };
    }));
    if (S.saveInfo) await saveInfoFromText(p);
    S.parsed = null; S.pasteText = ''; S.view = sel.length ? 'tasks' : 'contacts'; S.filter = 'open';
    render();
    const nc = (p.contacts || []).filter((c) => c.selected).length;
    toast(commitLabel(sel.length, nc).replace(' übernehmen', ' übernommen'));
  } catch (e) { toast(fail(e)); if (btn) btn.disabled = false; }
}
function saveInfoFromText(p) {
  const m = p.messages?.[0] || {};
  const firstLine = p.raw.trim().split('\n').find((l) => l.trim())?.slice(0, 80);
  return store.addInfo({ title: m.subject || p.messages.find((x) => x.subject)?.subject || firstLine || 'E-Mail', from: m.from || p.messages.find((x) => x.from)?.from || null, date: m.date || null, text: p.raw.trim(), kind: 'mail' });
}

let tesseract;
async function ocr(file) {
  toast('Screenshot wird gelesen … (beim ersten Mal ca. 15 MB Download)');
  try {
    if (!tesseract) {
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; s.onload = ok; s.onerror = () => no(new Error('Texterkennung konnte nicht geladen werden. Besteht eine Internetverbindung?')); document.head.appendChild(s); });
      tesseract = window.Tesseract;
    }
    const { data } = await tesseract.recognize(file, 'deu');
    const text = data.text.replace(/[ \t]+\n/g, '\n').trim();
    if (!text) { toast('Im Bild wurde kein Text erkannt.'); return; }
    S.pasteText = (S.pasteText ? S.pasteText + '\n\n' : '') + text;
    S.parsed = null; render();
    toast('Text erkannt – prüfe ihn kurz und tippe auf „Aufgaben finden“.');
  } catch (e) { toast(fail(e)); }
}

// ------------------------------------------------------------------ Daten sichern
async function exportData() {
  const data = { app: 'hausplaner', version: 1, exportedAt: new Date().toISOString(), project: S.project?.name, tasks: S.tasks, infos: S.infos, contacts: S.contacts };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const name = `hausplaner-sicherung-${todayISO()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tasks)) throw new Error('Das ist keine Hausplaner-Sicherung.');
    const tasks = data.tasks.map(({ id, ...t }) => t).filter((t) => !S.tasks.some((x) => x.title === t.title && x.due === t.due));
    if (tasks.length) await store.addTasks(tasks);
    for (const { id, ...i } of data.infos || []) if (!S.infos.some((x) => x.text === i.text)) await store.addInfo(i);
    for (const { id, ...c } of data.contacts || []) if (c.name && !findContact(c)) await store.addContact(c);
    toast(`${tasks.length} Aufgaben eingespielt`);
  } catch (e) { toast(fail(e)); }
}

// ------------------------------------------------------------------ Ereignisse
app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]'); if (!el || el.tagName === 'INPUT') return;
  const a = el.dataset.action;
  switch (a) {
    case 'tab': S.view = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'filter': S.filter = el.dataset.filter; render(); break;
    case 'phase': S.phase = el.dataset.phase; render(); break;
    case 'mine': S.mine = !S.mine; render(); break;
    case 'toggle': toggleTask(el.dataset.id); break;
    case 'edit': taskSheet(S.tasks.find((t) => t.id === el.dataset.id)); break;
    case 'new-task': taskSheet(null); break;
    case 'hide-banner': localStorage.setItem(el.dataset.key, '1'); render(); break;
    case 'rename': {
      const n = prompt('Name des Bauprojekts', S.project?.name || 'Unser Haus');
      if (n && n.trim()) store.renameProject(n.trim()).catch((err) => toast(fail(err)));
      break;
    }
    case 'clip':
      try {
        const t = await navigator.clipboard.readText();
        if (!t) { toast('Die Zwischenablage ist leer.'); break; }
        S.pasteText = t; S.parsed = null; render();
      } catch { toast('Kein Zugriff – halte stattdessen lange ins Feld und wähle „Einsetzen“.'); }
      break;
    case 'clear-paste': S.pasteText = ''; S.parsed = null; render(); break;
    case 'parse': runParse(app.querySelector('#paste').value); break;
    case 'parse-ai': runParseAI(app.querySelector('#paste').value); break;
    case 'contact': contactSheet(contactById(el.dataset.id)); break;
    case 'new-contact': contactSheet(null); break;
    case 'compose-contact': composeSheet({ contact: contactById(el.dataset.id) }); break;
    case 'compose-task': { const t = S.tasks.find((x) => x.id === el.dataset.id); composeSheet({ task: t, contact: t?.contactId ? contactById(t.contactId) : null }); break; }
    case 'ai-settings': aiSheet(); break;
    case 'assess-all': {
      S.aiBusy = true; render();
      try { const n = await assessList(S.tasks); toast(n ? `${n} Fristen eingeschätzt` : 'Keine offenen Aufgaben mit Frist'); } catch (err) { toast(fail(err)); }
      S.aiBusy = false; render(); break;
    }
    case 'commit-import': commitImport(); break;
    case 'info-only':
      try { await saveInfoFromText(S.parsed); S.parsed = null; S.pasteText = ''; S.view = 'infos'; render(); toast('Unter Infos abgelegt'); } catch (err) { toast(fail(err)); }
      break;
    case 'info-open': S.openInfo = S.openInfo === el.dataset.id ? null : el.dataset.id; render(); break;
    case 'info-reparse': { const x = S.infos.find((i) => i.id === el.dataset.id); S.view = 'import'; S.saveInfo = false; runParse(x.text); break; }
    case 'info-delete':
      if (confirm('Diese Info löschen?')) store.deleteInfo(el.dataset.id).catch((err) => toast(fail(err)));
      break;
    case 'new-info': infoSheet(); break;
    case 'invite': inviteSheet(); break;
    case 'join': {
      const c = prompt('Einladungscode eingeben');
      if (c) store.joinProject(c).then(() => toast('Beigetreten')).catch((err) => toast(fail(err)));
      break;
    }
    case 'push': {
      if (store.mode !== 'cloud') { inviteSheet(); break; }
      if (isIOS && !standalone) { toast('Öffne den Hausplaner zuerst über das Symbol auf dem Home-Bildschirm.'); break; }
      if (typeof Notification === 'undefined') { toast('Dieses Gerät unterstützt keine Push-Nachrichten (iPhone: ab iOS 16.4, vom Home-Bildschirm geöffnet).'); break; }
      // iOS zeigt die Abfrage nur, wenn sie direkt beim Antippen startet – also vor jedem „await“.
      const permP = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
      toast('Push-Nachrichten werden aktiviert …');
      try {
        const r = await store.enablePush(permP);
        const msg = { unsupported: 'Dieses Gerät unterstützt keine Push-Nachrichten im Browser (iPhone: ab iOS 16.4, vom Home-Bildschirm geöffnet).', denied: 'Nicht erlaubt. Ändern unter iPhone-Einstellungen → Mitteilungen → Hausplaner.', dismissed: 'Die Abfrage wurde geschlossen. Tippe noch einmal auf Aktivieren und wähle „Erlauben“.', novapid: 'In config.js fehlt der vapidKey (Schritt 2.6).', notoken: 'Push-Anmeldung fehlgeschlagen. Versuch es gleich noch einmal.' };
        toast(r.ok ? 'Push-Nachrichten sind aktiv' : msg[r.reason]);
      } catch (err) { toast(fail(err)); }
      render(); break;
    }
    case 'template': templateSheet(); break;
    case 'export': exportData(); break;
    case 'logout': if (confirm('Abmelden?')) store.signOut(); break;
    case 'auth-tab': S.authTab = el.dataset.tab; S.authError = ''; render(); break;
    case 'reset-pw': {
      const email = app.querySelector('input[name="email"]')?.value || prompt('Deine E-Mail-Adresse');
      if (email) store.resetPassword(email).then(() => toast('Link zum Zurücksetzen wurde gesendet.')).catch((err) => toast(fail(err)));
      break;
    }
  }
});

app.addEventListener('input', (e) => {
  const el = e.target; const k = el.dataset.input;
  if (k === 'paste') {
    S.pasteText = el.value;
    const b = app.querySelector('#parse-btn'); if (b) b.disabled = !el.value.trim();
  } else if (k === 'contact-q') {
    S.contactQuery = el.value; clearTimeout(S.qT); S.qT = setTimeout(() => { const pos = el.selectionStart; el.blur(); render(); const n = app.querySelector('[data-input="contact-q"]'); n?.focus(); n?.setSelectionRange(pos, pos); }, 250);
  } else if (k === 'info-q') {
    S.infoQuery = el.value; clearTimeout(S.qT); S.qT = setTimeout(() => { const pos = el.selectionStart; el.blur(); render(); const n = app.querySelector('[data-input="info-q"]'); n?.focus(); n?.setSelectionRange(pos, pos); }, 250);
  } else if (k?.startsWith('found-')) {
    const t = S.parsed.tasks[+el.dataset.i];
    if (k === 'found-title') t.title = el.value;
    if (k === 'found-due') t.due = el.value || null;
    if (k === 'found-phase') t.phase = el.value;
    if (k === 'found-lead') t.leadDays = el.value === '' ? null : Math.max(0, Math.min(120, parseInt(el.value, 10) || 0));
  }
});
app.addEventListener('change', (e) => {
  const el = e.target; const a = el.dataset.action;
  if (a === 'pick') {
    const t = S.parsed.tasks[+el.dataset.i]; t.selected = el.checked;
    el.closest('.found').classList.toggle('off', !el.checked);
    updateCommitBtn();
  } else if (a === 'pick-contact') {
    S.parsed.contacts[+el.dataset.i].selected = el.checked;
    el.closest('.found').classList.toggle('off', !el.checked);
    updateCommitBtn();
  } else if (a === 'save-info') S.saveInfo = el.checked;
  else if (a === 'ocr' && el.files[0]) ocr(el.files[0]);
  else if (a === 'import-file' && el.files[0]) importData(el.files[0]);
});
function updateCommitBtn() {
  const n = S.parsed.tasks.filter((x) => x.selected).length;
  const c = (S.parsed.contacts || []).filter((x) => x.selected).length;
  const b = app.querySelector('#commit-btn'); b.disabled = !n && !c; b.textContent = commitLabel(n, c);
}
app.addEventListener('submit', async (e) => {
  const form = e.target; const kind = form.dataset.form; if (!kind) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
  S.authError = '';
  try {
    if (kind === 'auth') {
      if (S.authTab === 'register') await store.signUp(f.name.trim(), f.email.trim(), f.pw);
      else await store.signIn(f.email.trim(), f.pw);
    } else if (kind === 'create') {
      let seed = null;
      try { const local = JSON.parse(localStorage.getItem('hausplaner-v1') || 'null'); if (local?.tasks?.length || local?.infos?.length || local?.contacts?.length) seed = local; } catch {}
      if (seed && !confirm(`Auf diesem Gerät gibt es ${seed.tasks.length} Aufgaben aus dem lokalen Modus. Ins neue Projekt übernehmen?`)) seed = null;
      await store.createProject(f.name.trim() || 'Unser Haus', seed);
      if (seed) localStorage.removeItem('hausplaner-v1');
    } else if (kind === 'join-setup') {
      await store.joinProject(f.code);
    }
  } catch (err) { S.authError = fail(err); btn.disabled = false; render(); }
});

// ------------------------------------------------------------------ Start
store.init({
  onAuth(me) {
    const changed = S.me?.uid !== me?.uid;
    S.me = me; S.authReady = true;
    if (me && store.mode === 'cloud' && changed) { S.projectState = 'loading'; store.resumePush(); }
    render();
  },
  onProject(p) { S.project = p; S.projectState = p ? 'ready' : 'none'; render(); },
  onTasks(list) { S.tasks = list; render(); },
  onInfos(list) { S.infos = list; render(); },
  onContacts(list) { S.contacts = list; render(); },
  onAi(cfg) { S.ai = cfg; render(); },
  onError(e) { toast(fail(e)); },
  onPush(n) { toast(`${n.title || 'Erinnerung'}${n.body ? ': ' + n.body : ''}`); },
}).catch((e) => { app.innerHTML = `<div class="boot">Start fehlgeschlagen: ${esc(fail(e))}<br><br>Prüfe die Internetverbindung und config.js.</div>`; });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
}
// Ansicht um Mitternacht und beim Zurückkehren in die App aktualisieren (Heute/Morgen)
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
