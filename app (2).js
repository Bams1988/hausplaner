import { createStore, computeRemindAt } from './store.js';
import { parseEmails, isoDate, similarity, guessPhase } from './parser.js';
import {
  extractFromText, draftEmail, assessTasks, testConnection, urgencyOf, aiKeyOf,
  STATUS, MODELS, DEFAULT_MODEL, DEFAULT_AREAS, HOUSE_PHASES,
} from './ai.js';

// ================================================================== Zustand
const REMINDERS = [
  ['none', 'Keine Erinnerung'], ['day0', 'Am Tag selbst, 8 Uhr'], ['hour1', '1 Stunde vorher'], ['day1', '1 Tag vorher, 18 Uhr'],
  ['day3', '3 Tage vorher, 18 Uhr'], ['week1', '1 Woche vorher, 18 Uhr'], ['custom', 'Eigener Zeitpunkt'],
];
const AREA_COLORS = ['#2F9E77', '#E9A23B', '#4A8FE7', '#2BB0A6', '#8E7CE0', '#E46F8E', '#D9774B', '#5B7F95'];
const AREA_EMOJIS = ['🏡', '💛', '📄', '🌿', '☀️', '🧒', '💼', '🚗', '✈️', '🎓', '🐾', '🎉', '🏃', '🛠️', '💶', '📦'];
const S = {
  view: 'home', area: 'all', filter: 'open', inboxTab: 'new', planArea: null, weekOffset: 0, dayPick: null, taskQuery: '',
  me: null, authReady: false, project: null, projectState: 'loading',
  tasks: [], infos: [], contacts: [], areas: [], ai: null, aiBusy: false,
  pasteText: '', parsed: null, saveInfo: true, openInfo: null, infoQuery: '', contactQuery: '', authTab: 'login', authError: '',
  pendingRender: false,
};
const store = createStore();
const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');

// ================================================================== Helfer
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => isoDate(new Date());
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoDate(d); };
const dayDiff = (s, from = todayISO()) => Math.round((parseISO(s) - parseISO(from)) / 864e5);
const fmtDate = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => parseISO(s).toLocaleDateString('de-DE', o).replace(/\.$/, '');
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const members = () => S.project?.members || [];
const nameOf = (uid) => (S.project?.memberNames || {})[uid] || 'Unbekannt';
const initial = (uid) => nameOf(uid).trim().charAt(0).toUpperCase() || '?';
const myName = () => (S.me?.name && S.me.name !== 'Ich' ? S.me.name : '');
const aiCfg = () => (S.ai ? { apiKey: S.ai.apiKey, model: S.ai.model || DEFAULT_MODEL } : null);
const contactById = (id) => S.contacts.find((c) => c.id === id) || null;
const norm = (s) => String(s || '').toLowerCase().replace(/\b(herr|frau|dr\.?|dipl\.?-?\w*)\s+/g, '').replace(/[^a-zäöüß]/g, '');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// --- Lebensbereiche
const areas = () => (S.areas.length ? [...S.areas].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, 'de')) : DEFAULT_AREAS);
const areaById = (id) => areas().find((a) => a.id === id) || null;
function areaOf(t) {
  if (t.areaId) { const a = areaById(t.areaId); if (a) return a; }
  return areaById('hausbau') || areaById('alltag') || areas()[0]; // ältere Aufgaben stammen aus dem Hausbau
}
const phaseOf = (t) => (t.phase && t.phase !== 'Allgemein' ? t.phase : null);
async function ensureAreasStored() {
  if (S.areas.length) return;
  for (const a of DEFAULT_AREAS) { const { id, ...rest } = a; await store.setArea(id, rest); }
}

function findContact({ email, name }) {
  const e = (email || '').trim().toLowerCase();
  if (e) { const c = S.contacts.find((x) => (x.email || '').toLowerCase() === e); if (c) return c; }
  const n = norm(name);
  return n ? S.contacts.find((x) => norm(x.name) === n) || null : null;
}

function dueLabel(t) {
  if (!t.due) return null;
  const d = dayDiff(t.due);
  let text = d === 0 ? 'Heute' : d === 1 ? 'Morgen' : d === -1 ? 'Gestern' : fmtDate(t.due);
  if (d < -1 || d > 6) text = fmtDate(t.due, { weekday: 'short', day: 'numeric', month: 'short', year: parseISO(t.due).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  if (t.time) text += `, ${t.time}`;
  return { text, late: !t.done && d < 0 };
}
const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || (a.createdAt || 0) - (b.createdAt || 0);
const urgRank = (t) => { const u = urgencyOf(t); return u ? STATUS[u.status].rank : -1; };
const byUrgency = (a, b) => urgRank(b) - urgRank(a) || ((a.startBy || a.due || '9999').localeCompare(b.startBy || b.due || '9999')) || byDue(a, b);
const badge = (u) => (u && u.status !== 'im_plan' ? `<span class="badge s-${u.status}">${esc(STATUS[u.status].label)}</span>` : '');
const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

// ================================================================== Symbole
const sv = (p, w = 24, sw = 1.9) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  today: sv('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  list: sv('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>'),
  flag: sv('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>', 18, 2),
  plan: sv('<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="12" r="2.2"/><circle cx="6" cy="18" r="2.2"/><path d="M8.2 6H14a4 4 0 0 1 0 8H10a4 4 0 0 0 0 4h-1.8"/>'),
  inbox: sv('<path d="M3.5 13.5 6 5.5h12l2.5 8"/><path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5a3.5 3.5 0 0 1-7 0Z"/>'),
  people: sv('<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6"/><path d="M15.5 5.8a3 3 0 0 1 0 5.4M17.5 14.6c1.5.6 2.5 2 3 4.4"/>'),
  more: sv('<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>', 24, 2.2),
  plus: sv('<path d="M12 5v14M5 12h14"/>', 26, 2.4),
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  bell: sv('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', 13, 2.2),
  share: sv('<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', 16, 2),
  phone: sv('<path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.7 20 4 13.3 3.5 5.6A1.5 1.5 0 0 1 5 4Z"/>', 18, 2),
  envelope: sv('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>', 18, 2),
  spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="spark"><path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5Z"/><path d="M19 15c.2 2 1.2 3 3 3.2-1.8.2-2.8 1.2-3 3.3-.2-2.1-1.2-3.1-3-3.3 1.8-.2 2.8-1.2 3-3.2Z" opacity=".6"/></svg>',
  chevron: sv('<path d="m9 6 6 6-6 6"/>', 18, 2),
  copy: sv('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 16, 2),
};

// ================================================================== Rückmeldungen
let toastTimer;
function toast(msg, action) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button class="toast-btn">${esc(action.label)}</button>` : '');
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
function celebrate(x, y) {
  if (reduceMotion) return;
  const colors = ['var(--brand)', 'var(--sun)', '#7ED3A8', '#FFD27F', '#8E7CE0'];
  for (let i = 0; i < 14; i++) {
    const d = document.createElement('i');
    d.className = 'confetti';
    const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const r = 34 + Math.random() * 30;
    d.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r - 12}px`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }
}

// ================================================================== Rendern
function render() {
  const a = document.activeElement;
  if (a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { S.pendingRender = true; return; }
  S.pendingRender = false;
  if (store.mode === 'cloud') {
    if (!S.authReady) { app.innerHTML = boot(); return; }
    if (!S.me) { app.innerHTML = viewAuth(); return; }
    if (S.projectState === 'loading') { app.innerHTML = boot(); return; }
    if (S.projectState === 'none') { app.innerHTML = viewSetup(); return; }
  }
  const views = { home: viewHome, tasks: viewTasks, plan: viewPlan, inbox: viewInbox, contacts: viewContacts, more: viewMore };
  if (!views[S.view]) S.view = 'home';
  const fab = ['home', 'tasks', 'plan'].includes(S.view) ? `<button class="fab" data-action="new-task" aria-label="Aufgabe anlegen">${I.plus}</button>`
    : S.view === 'contacts' ? `<button class="fab" data-action="new-contact" aria-label="Kontakt anlegen">${I.plus}</button>` : '';
  app.innerHTML = views[S.view]() + tabbar() + fab;
}
const boot = () => '<div class="boot"><span class="boot-sun"></span>Mindora wird geladen …</div>';
app.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender && !app.contains(document.activeElement)) render(); }, 50));

function tabbar() {
  const newN = S.tasks.filter((t) => t.isNew && !t.done).length;
  const tab = (id, label, icon, dot) => `<button data-action="tab" data-tab="${id}" ${S.view === id || (id === 'more' && S.view === 'contacts') ? 'aria-current="page"' : ''}>${icon}${dot ? `<b class="tab-dot">${dot}</b>` : ''}<span>${label}</span></button>`;
  return `<nav class="tabbar">${tab('home', 'Übersicht', I.today)}${tab('tasks', 'Aufgaben', I.list)}${tab('plan', 'Plan', I.plan)}${tab('inbox', 'Eingang', I.inbox, newN)}${tab('more', 'Mehr', I.more)}</nav>`;
}

// ================================================================== Kleine Grafiken
function ring(pct, size = 56, stroke = 7, color = 'var(--brand)', label = null) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, len = Math.max(0, Math.min(1, pct)) * c;
  return `<svg class="mini-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${stroke}"/>
    ${len > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${len} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ''}
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" class="mini-ring-t" style="font-size:${size * 0.27}px">${label ?? Math.round(pct * 100) + '%'}</text>
  </svg>`;
}
const sunArt = () => `<svg class="sun-art" viewBox="0 0 120 70" aria-hidden="true"><path d="M8 62h104" stroke="var(--line)" stroke-width="3" stroke-linecap="round"/><path d="M30 62a30 30 0 0 1 60 0" fill="var(--sun-soft)" stroke="var(--sun)" stroke-width="3"/>${[0, 1, 2, 3, 4].map((i) => { const a = Math.PI + (i + 0.5) * Math.PI / 5; return `<path d="M${60 + 38 * Math.cos(a)} ${62 + 38 * Math.sin(a)}L${60 + 48 * Math.cos(a)} ${62 + 48 * Math.sin(a)}" stroke="var(--sun)" stroke-width="3" stroke-linecap="round"/>`; }).join('')}</svg>`;

// Kennzahlen je Lebensbereich
function areaStats(a) {
  const list = S.tasks.filter((t) => areaOf(t).id === a.id);
  const open = list.filter((t) => !t.done);
  const done = list.length - open.length;
  const next = open.filter((t) => t.due).sort(byDue)[0] || null;
  const urgent = open.filter((t) => urgRank(t) >= 2).length;
  const end = open.map((t) => t.due).filter(Boolean).sort().pop() || null;
  return { list, open, done, total: list.length, pct: list.length ? done / list.length : 0, next, urgent, end };
}

// ================================================================== Übersicht (Dashboard)
function greeting() {
  const h = new Date().getHours();
  const g = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : h < 22 ? 'Guten Abend' : 'Gute Nacht';
  return myName() ? `${g}, ${myName().split(' ')[0]}` : g;
}
function viewHome() {
  const today = todayISO();
  const open = S.tasks.filter((t) => !t.done);
  const late = open.filter((t) => t.due && t.due < today);
  const dueToday = open.filter((t) => t.due === today);
  const startNow = open.filter((t) => !(t.due && t.due <= today) && urgRank(t) >= 2);
  const focus = [...late, ...dueToday, ...startNow].sort(byUrgency);
  const newOnes = open.filter((t) => t.isNew);

  let summary;
  if (!S.tasks.length) summary = 'Schön, dass du da bist. Leg deine erste Aufgabe an oder leite eine E-Mail weiter.';
  else if (!focus.length) summary = 'Heute steht nichts an. Alles im Plan.';
  else summary = [dueToday.length && `${dueToday.length} heute fällig`, late.length && `${late.length} nachzuholen`, startNow.length && `${startNow.length} jetzt starten`].filter(Boolean).join(' · ');

  let banner = '';
  if (isIOS && !standalone && !localStorage.getItem('hp-hide-install')) {
    banner = `<div class="note-card"><p><strong>Als App installieren:</strong> In Safari auf ${I.share} tippen, dann „Zum Home-Bildschirm“. Danach klappen auch Push-Nachrichten.</p><button class="x" data-action="hide-banner" data-key="hp-hide-install" aria-label="Hinweis schließen">×</button></div>`;
  }

  // 1) Heute dran
  const focusHtml = focus.length
    ? `<div class="list">${focus.slice(0, 5).map((t) => row(t, { reason: true })).join('')}</div>
       ${focus.length > 5 ? `<button class="link" data-action="tab" data-tab="tasks">Alle ${focus.length} ansehen</button>` : ''}`
    : `<div class="calm">${sunArt()}<p><strong>Nichts Dringendes.</strong> ${open.length ? `Die nächste Frist: ${esc(nextDueText(open))}.` : 'Zeit für dich.'}</p></div>`;

  // 2) Neue Aufgaben aus E-Mails
  const newHtml = newOnes.length ? `<button class="inbox-hint" data-action="goto-new">${I.inbox}<span><strong>${newOnes.length} ${newOnes.length === 1 ? 'neue Aufgabe' : 'neue Aufgaben'}</strong> aus E-Mails – kurz prüfen</span>${I.chevron}</button>` : '';

  // 4) Projekte
  const projs = areas().map((a) => ({ a, s: areaStats(a) })).filter((x) => x.s.total);
  const projHtml = projs.length ? `<div class="proj-row">${projs.map(({ a, s }) => `
      <button class="proj-card" data-action="open-plan" data-id="${esc(a.id)}" style="--area:${esc(a.color)}">
        <div class="proj-top">${ring(s.pct, 48, 6, a.color)}<span class="proj-emoji">${esc(a.emoji)}</span></div>
        <strong>${esc(a.name)}</strong>
        <span>${s.open.length ? `${s.open.length} offen` : 'Alles erledigt ✓'}</span>
        ${s.next ? `<span class="proj-next">Nächste Frist: ${esc(fmtDate(s.next.due, { day: 'numeric', month: 'short' }))}</span>` : ''}
        ${s.urgent ? `<span class="badge s-jetzt_starten">${s.urgent} jetzt starten</span>` : ''}
      </button>`).join('')}</div>` : '';

  return `<main class="view">
    <header class="hello"><p class="hello-date">${esc(new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h1>${esc(greeting())}</h1><p class="hello-sum">${esc(summary)}</p></header>
    ${banner}${newHtml}
    <section class="card">
      <div class="card-head"><h2>Heute dran</h2>${focus.length ? `<span class="count">${focus.length}</span>` : ''}</div>
      ${focusHtml}
    </section>
    <section class="card">
      <div class="card-head"><h2>${S.weekOffset ? 'Woche' : 'Die nächsten 7 Tage'}</h2>
        <div class="week-nav"><button class="icon-sm" data-action="week" data-d="-1" aria-label="7 Tage zurück">‹</button><button class="icon-sm" data-action="week" data-d="1" aria-label="7 Tage weiter">›</button></div></div>
      ${weekChart()}
    </section>
    ${projHtml ? `<section class="card plain"><div class="card-head"><h2>Projekte</h2><button class="link" data-action="tab" data-tab="plan">Zum Plan</button></div>${projHtml}</section>` : ''}
    ${!S.tasks.length ? `<div class="btn-row" style="margin-top:16px"><button class="btn" data-action="new-task">Erste Aufgabe anlegen</button><button class="btn secondary" data-action="template">Checkliste Hausbau</button></div>` : ''}
  </main>`;
}
function nextDueText(open) {
  const n = open.filter((t) => t.due).sort(byDue)[0];
  return n ? `${n.title} am ${fmtDate(n.due)}` : 'keine';
}

// Wochengrafik: 7 Tage, je Tag ein Balken mit offenen (farbig) und erledigten (grün) Aufgaben
function weekChart() {
  const ws = new Date(); ws.setHours(0, 0, 0, 0); ws.setDate(ws.getDate() + 7 * (S.weekOffset || 0));
  const days = [...Array(7)].map((_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return isoDate(d); });
  const today = todayISO();
  if (!S.dayPick || !days.includes(S.dayPick)) S.dayPick = days.includes(today) ? today : days[0];
  const per = days.map((d) => {
    const due = S.tasks.filter((t) => t.due === d);
    return { d, open: due.filter((t) => !t.done), done: due.filter((t) => t.done) };
  });
  const max = Math.max(3, ...per.map((p) => p.open.length + p.done.length));
  const label = `${fmtDate(days[0], { day: 'numeric', month: 'short' })} – ${fmtDate(days[6], { day: 'numeric', month: 'short' })}`;
  const cols = per.map((p) => {
    const dt = parseISO(p.d);
    const n = p.open.length + p.done.length;
    const segs = [...p.done.map(() => 'var(--brand)'), ...p.open.map((t) => (t.due < today ? 'var(--coral)' : areaOf(t).color))];
    return `<button class="wk-col ${p.d === today ? 'is-today' : ''} ${p.d === S.dayPick ? 'is-sel' : ''}" data-action="day" data-d="${p.d}" aria-label="${esc(fmtDate(p.d, { weekday: 'long', day: 'numeric', month: 'long' }))}: ${p.open.length} offen, ${p.done.length} erledigt">
      <span class="wk-bar">${segs.map((c) => `<i style="background:${c};height:${100 / max}%"></i>`).join('')}</span>
      <span class="wk-n">${n || ''}</span>
      <span class="wk-d">${esc(dt.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''))}</span>
      <span class="wk-num">${dt.getDate()}</span>
    </button>`;
  }).join('');
  const sel = per.find((p) => p.d === S.dayPick);
  const selList = [...sel.open.sort(byDue), ...sel.done];
  return `<p class="wk-range">${esc(label)}${S.weekOffset ? ` · <button class="link inline" data-action="week" data-d="0">Zurück zu heute</button>` : ''}</p>
    <div class="wk">${cols}</div>
    <div class="wk-legend"><span><i style="background:var(--brand)"></i>erledigt</span><span><i style="background:var(--ink-3)"></i>offen (Farbe = Bereich)</span><span><i style="background:var(--coral)"></i>überfällig</span></div>
    <h3 class="wk-day">${esc(fmtDate(S.dayPick, { weekday: 'long', day: 'numeric', month: 'long' }))}</h3>
    ${selList.length ? `<div class="list">${selList.map((t) => row(t)).join('')}</div>` : `<p class="hint" style="margin:0 4px">Keine Fristen an diesem Tag.</p>`}`;
}

// ================================================================== Aufgaben (Liste)
function viewTasks() {
  const inArea = (t) => S.area === 'all' || areaOf(t).id === S.area;
  const q = (S.taskQuery || '').trim().toLowerCase();
  let list = S.tasks.filter((t) => (S.filter === 'open' ? !t.done : t.done)).filter(inArea);
  if (q) list = list.filter((t) => `${t.title} ${t.notes || ''}`.toLowerCase().includes(q));
  let body;
  if (!S.tasks.length) body = `<div class="empty">${sunArt()}<strong>Noch keine Aufgaben</strong>Leg eine mit dem Plus an oder lies eine E-Mail ein.</div>`;
  else if (!list.length) body = S.filter === 'open'
    ? `<div class="empty">${sunArt()}<strong>${q ? 'Nichts gefunden' : 'Alles erledigt.'}</strong>${q ? 'Versuch einen anderen Suchbegriff.' : 'Zeit für dich – oder für etwas Neues mit dem Plus.'}</div>`
    : `<div class="empty"><strong>Noch nichts erledigt</strong>Abgehakte Aufgaben sammeln sich hier.</div>`;
  else if (S.filter === 'done') {
    list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    body = `<div class="list">${list.slice(0, 200).map((t) => row(t)).join('')}</div>`;
  } else {
    body = groupTasks(list).map(([name, items, cls]) => `
      <div class="group-head ${cls || ''}"><h2>${esc(name)}</h2><span>${items.length}</span></div>
      <div class="list">${items.map((t) => row(t)).join('')}</div>`).join('');
  }
  return `<main class="view">
    <header class="page-head"><h1>Aufgaben</h1></header>
    <div class="seg" role="group" aria-label="Ansicht">
      <button data-action="filter" data-filter="open" aria-pressed="${S.filter === 'open'}">Offen</button>
      <button data-action="filter" data-filter="done" aria-pressed="${S.filter === 'done'}">Erledigt</button>
    </div>
    ${S.tasks.length > 8 ? `<input class="input" type="search" data-input="task-q" value="${esc(S.taskQuery || '')}" placeholder="Aufgaben durchsuchen" style="margin-bottom:10px" aria-label="Aufgaben durchsuchen">` : ''}
    ${areaChips(S.area, 'area', true)}
    ${body}</main>`;
}

function areaChips(active, action, withAll) {
  const counts = new Map();
  for (const t of S.tasks) if (!t.done) { const id = areaOf(t).id; counts.set(id, (counts.get(id) || 0) + 1); }
  const shown = areas().filter((a) => counts.get(a.id) || active === a.id);
  if (shown.length < 2 && active === 'all') return '';
  return `<div class="chips" role="group" aria-label="Lebensbereich">
    ${withAll ? `<button class="chip" data-action="${action}" data-id="all" aria-pressed="${active === 'all'}">Alle</button>` : ''}
    ${shown.map((a) => `<button class="chip" data-action="${action}" data-id="${esc(a.id)}" aria-pressed="${active === a.id}" style="--area:${esc(a.color)}">${esc(a.emoji)} ${esc(a.name)}${counts.get(a.id) ? ` <small>${counts.get(a.id)}</small>` : ''}</button>`).join('')}
  </div>`;
}

function groupTasks(list) {
  const dow = (new Date().getDay() + 6) % 7;
  const endWeek = 6 - dow;
  const groups = new Map();
  const add = (k, t, cls) => { if (!groups.has(k)) groups.set(k, { items: [], cls }); groups.get(k).items.push(t); };
  for (const t of [...list].sort(byDue)) {
    if (!t.due) continue;
    const d = dayDiff(t.due);
    if (d < 0) add('Nachholen', t, 'overdue');
    else if (d === 0) add('Heute', t);
    else if (d === 1) add('Morgen', t);
    else if (d <= endWeek) add('Diese Woche', t);
    else if (d <= endWeek + 7) add('Nächste Woche', t);
    else add(fmtDate(t.due, { month: 'long', year: 'numeric' }), t);
  }
  const noDate = list.filter((t) => !t.due).sort(byDue);
  if (noDate.length) groups.set('Ohne Datum', { items: noDate });
  return [...groups].map(([k, v]) => [k, v.items, v.cls]);
}

function row(t, opt = {}) {
  const due = dueLabel(t);
  const a = areaOf(t);
  const u = t.done ? null : urgencyOf(t);
  const meta = [];
  if (u && u.status !== 'im_plan') meta.push(badge(u));
  if (due) meta.push(`<span class="${due.late ? 'late' : ''}">${esc(due.text)}</span>`);
  if (!opt.inPlan) meta.push(`<span class="area-tag" style="--area:${esc(a.color)}">${esc(a.emoji)} ${esc(phaseOf(t) || a.name)}</span>`);
  const c = t.contactId ? contactById(t.contactId) : null;
  if (c && !opt.reason) meta.push(`<span>${esc(c.name)}</span>`);
  const why = opt.reason && u && u.status !== 'im_plan' && (u.next || u.reason) ? `<div class="row-why">${esc(u.next || u.reason)}</div>` : '';
  const who = members().length > 1 && t.assignee && t.assignee !== 'all' ? `<span class="who" title="${esc(nameOf(t.assignee))}">${esc(initial(t.assignee))}</span>` : '';
  return `<div class="row ${t.done ? 'done' : ''}" style="--area:${esc(a.color)}">
    <button class="check" data-action="toggle" data-id="${esc(t.id)}" aria-label="${t.done ? 'Wieder öffnen' : 'Als erledigt markieren'}: ${esc(t.title)}">${I.check}</button>
    <button class="row-main" data-action="edit" data-id="${esc(t.id)}">
      <div class="row-title">${t.isNew && !t.done ? '<b class="new-dot" title="Neu aus E-Mail"></b>' : ''}${esc(t.title)}</div>
      <div class="row-meta">${meta.join('')}</div>${why}
    </button>${who}</div>`;
}

// ================================================================== Projektplan
function viewPlan() {
  if (S.planArea && S.planArea !== 'all' && areaById(S.planArea)) return viewRoadmap(areaById(S.planArea));
  const projs = areas().map((a) => ({ a, s: areaStats(a) }));
  const active = projs.filter((x) => x.s.total);
  const empty = projs.filter((x) => !x.s.total);
  const cards = active.map(({ a, s }) => {
    const steps = roadmapSteps(a);
    return `<button class="plan-card" data-action="open-plan" data-id="${esc(a.id)}" style="--area:${esc(a.color)}">
      <div class="plan-card-top">${ring(s.pct, 64, 8, a.color)}
        <div class="plan-card-t"><strong>${esc(a.emoji)} ${esc(a.name)}</strong>
          <span>${s.done} von ${s.total} erledigt</span>
          ${s.end ? `<span>Fertig voraussichtlich ${esc(fmtDate(s.end, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>` : ''}</div>${I.chevron}</div>
      ${a.phases?.length ? `<div class="mini-steps" aria-label="Abschnitte">${steps.map((st) => `<i class="ms-${st.state}" title="${esc(st.name)}"></i>`).join('')}</div>
        <span class="plan-card-now">${(() => { const cur = steps.find((x) => x.state === 'now'); return cur ? `Gerade dran: <strong>${esc(cur.name)}</strong>` : 'Alle Abschnitte erledigt ✓'; })()}</span>` : ''}
      ${s.next ? `<span class="plan-card-next">Nächste Frist: ${esc(s.next.title)} · ${esc(fmtDate(s.next.due, { day: 'numeric', month: 'short' }))}</span>` : ''}
    </button>`;
  }).join('');
  return `<main class="view">
    <header class="page-head"><h1>Plan</h1><p>Jedes Projekt Schritt für Schritt. Der Plan aktualisiert sich von selbst, sobald du Aufgaben anlegst oder abhakst.</p></header>
    ${cards || `<div class="empty">${sunArt()}<strong>Noch keine Projekte</strong>Lege Aufgaben an – hier entsteht dann dein Plan.</div>`}
    ${empty.length ? `<p class="hint">Ohne Aufgaben: ${empty.map(({ a }) => `${esc(a.emoji)} ${esc(a.name)}`).join(', ')}</p>` : ''}
  </main>`;
}

// Abschnitte eines Projekts in Reihenfolge, mit Zustand: done | now | next | later
function roadmapSteps(a) {
  const list = S.tasks.filter((t) => areaOf(t).id === a.id);
  const phases = a.phases || [];
  const groups = new Map();
  if (phases.length) {
    for (const p of phases) groups.set(p, []);
    for (const t of list) { const p = phaseOf(t); const k = p && groups.has(p) ? p : 'Weitere Aufgaben'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  } else {
    // ohne Abschnitte: nach Monaten der Frist
    for (const t of [...list].sort(byDue)) {
      const k = t.due ? fmtDate(t.due, { month: 'long', year: 'numeric' }) : 'Ohne Datum';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    if (groups.has('Ohne Datum')) { const v = groups.get('Ohne Datum'); groups.delete('Ohne Datum'); groups.set('Ohne Datum', v); }
  }
  const steps = [...groups].filter(([, items]) => items.length || phases.length).map(([name, items]) => {
    const open = items.filter((t) => !t.done);
    const dates = items.map((t) => t.startBy || t.due).filter(Boolean).sort();
    const dues = items.map((t) => t.due).filter(Boolean).sort();
    return { name, items, open, done: items.length - open.length, from: dates[0] || null, to: dues[dues.length - 1] || null, urgent: open.filter((t) => urgRank(t) >= 2).length };
  });
  let nowSet = false;
  for (const st of steps) {
    if (!st.items.length) st.state = 'empty';
    else if (!st.open.length) st.state = 'done';
    else if (!nowSet) { st.state = 'now'; nowSet = true; }
    else st.state = 'later';
  }
  return steps;
}

function viewRoadmap(a) {
  const s = areaStats(a);
  const steps = roadmapSteps(a);
  if (S.openStep === undefined || S.openStepArea !== a.id) { S.openStep = null; S.openStepArea = a.id; }
  const cur = steps.find((x) => x.state === 'now');
  const stateText = a.phases?.length ? { done: 'Erledigt', now: 'Gerade dran', later: 'Danach', empty: 'Noch keine Aufgaben' } : { done: 'Erledigt', now: 'Als Nächstes', later: 'Später', empty: '' };
  const items = steps.map((st, i) => {
    const open = S.openStep === null ? st.state === 'now' : S.openStep === i;
    const range = st.from && st.to ? (st.from === st.to ? fmtDate(st.to, { day: 'numeric', month: 'short' }) : `${fmtDate(st.from, { day: 'numeric', month: 'short' })} – ${fmtDate(st.to, { day: 'numeric', month: 'short' })}`) : st.to ? `bis ${fmtDate(st.to, { day: 'numeric', month: 'short' })}` : '';
    const tasks = [...st.open.sort(byDue), ...st.items.filter((t) => t.done)];
    return `<li class="rm-step rm-${st.state}" style="--area:${esc(a.color)}">
      <span class="rm-dot" aria-hidden="true">${st.state === 'done' ? '✓' : st.state === 'now' ? '' : i + 1}</span>
      <div class="rm-body">
        <button class="rm-head" data-action="step" data-i="${i}" aria-expanded="${open}">
          <span class="rm-state">${stateText[st.state]}</span>
          <strong>${esc(st.name)}</strong>
          <span class="rm-meta">${st.items.length ? `${st.done} von ${st.items.length} erledigt` : ''}${range ? ` · ${esc(range)}` : ''}${st.urgent ? ` · <b class="late">${st.urgent} jetzt starten</b>` : ''}</span>
          ${st.items.length ? `<span class="rm-bar"><i style="width:${(st.done / st.items.length) * 100}%"></i></span>` : ''}
        </button>
        ${open && tasks.length ? `<div class="list rm-list">${tasks.map((t) => row(t, { reason: true, inPlan: true })).join('')}</div>` : ''}
        ${open && !tasks.length ? `<p class="hint">Noch keine Aufgaben in diesem Abschnitt. <button class="link inline" data-action="new-in-step" data-phase="${esc(st.name)}">Aufgabe hinzufügen</button></p>` : ''}
      </div>
    </li>`;
  }).join('');
  return `<main class="view">
    <button class="back" data-action="plan-back">‹ Alle Projekte</button>
    <section class="rm-hero" style="--area:${esc(a.color)}">
      ${ring(s.pct, 84, 10, a.color)}
      <div><h1>${esc(a.emoji)} ${esc(a.name)}</h1>
        <p>${s.done} von ${s.total} Aufgaben erledigt</p>
        ${cur && a.phases?.length ? `<p>Gerade dran: <strong>${esc(cur.name)}</strong></p>` : !s.open.length && s.total ? '<p><strong>Alles erledigt 🎉</strong></p>' : ''}
        ${s.end ? `<p>Fertig voraussichtlich: <strong>${esc(fmtDate(s.end, { day: 'numeric', month: 'long', year: 'numeric' }))}</strong></p>` : ''}
      </div>
    </section>
    ${s.next ? `<div class="rm-next">${I.flag}<span>Nächste Frist: <strong>${esc(s.next.title)}</strong> · ${esc(dueLabel(s.next).text)}</span></div>` : ''}
    <h2 class="section-title">${a.phases?.length ? 'Schritt für Schritt' : 'Nach Monaten'}</h2>
    <ol class="roadmap">${items}</ol>
    <p class="hint">Tippe auf einen Abschnitt, um seine Aufgaben zu sehen. ${a.phases?.length ? 'Abschnitte änderst du unter Mehr → Lebensbereiche.' : 'Ohne eigene Abschnitte ordnet Mindora nach Monaten. Abschnitte legst du unter Mehr → Lebensbereiche an.'}</p>
  </main>`;
}

// ================================================================== Eingang
function viewInbox() {
  const newOnes = S.tasks.filter((t) => t.isNew && !t.done).sort(byDue);
  const seg = `<div class="seg" role="group" aria-label="Eingang">
    <button data-action="inbox-tab" data-tab="new" aria-pressed="${S.inboxTab === 'new'}">Neu${newOnes.length ? ` (${newOnes.length})` : ''}</button>
    <button data-action="inbox-tab" data-tab="paste" aria-pressed="${S.inboxTab === 'paste'}">Einfügen</button>
    <button data-action="inbox-tab" data-tab="archive" aria-pressed="${S.inboxTab === 'archive'}">Ablage</button></div>`;
  const body = S.inboxTab === 'paste' ? inboxPaste() : S.inboxTab === 'archive' ? inboxArchive() : inboxNew(newOnes);
  return `<main class="view">
    <header class="page-head"><h1>Eingang</h1><p>Was per E-Mail reinkommt, wird hier zu Aufgaben.</p></header>
    ${seg}${body}</main>`;
}
function inboxAddressCard() {
  const p = S.project || {};
  const addr = p.inboxAddress;
  if (store.mode !== 'cloud') return `<div class="note-card"><p><strong>E-Mails weiterleiten</strong> geht, sobald die Cloud eingerichtet ist (Anleitung, Stufe 2 und 5). Bis dahin: Text unter „Einfügen“ hineinkopieren.</p></div>`;
  if (!addr) return `<div class="note-card"><p><strong>Tipp:</strong> Mit einem eigenen Mindora-Postfach leitest du E-Mails einfach weiter – die KI legt die Aufgaben dann von selbst an. Einrichtung: Anleitung, Stufe 5.</p></div>`;
  const fast = p.inboxSource === 'gmail-script';
  const last = p.inboxCheckedAt ? Math.round((Date.now() - p.inboxCheckedAt) / 60000) : null;
  const stale = last != null && last > (fast ? 20 : 90);
  const ign = p.inboxLastIgnored && Date.now() - p.inboxLastIgnored.at < 3 * 864e5 && !(p.inboxAllowed || []).includes(p.inboxLastIgnored.from) ? p.inboxLastIgnored : null;
  return `<div class="address-card">
    <p>Leite E-Mails weiter an</p>
    <button class="address" data-action="copy-address">${esc(addr)} ${I.copy}</button>
    <small>${stale ? 'Längere Zeit nicht abgerufen – siehe Anleitung, falls das so bleibt.' : last == null ? (fast ? 'Wird jede Minute abgerufen.' : 'Wird alle 15 Minuten abgerufen.') : last < 2 ? 'Gerade eben abgerufen' + (fast ? ' – jede Minute aktuell.' : '.') : `Zuletzt vor ${last} Min. abgerufen.`}</small>
  </div>
  ${ign ? `<div class="note-card"><p><strong>Nicht gelesen:</strong> „${esc(ign.subject)}“ von ${esc(ign.from)}. Mindora liest nur Mails von euren eigenen Adressen und von erlaubten Absendern.</p>
    <div class="btn-row" style="margin-top:10px"><button class="btn small" data-action="allow-sender" data-from="${esc(ign.from)}">${esc(ign.from)} erlauben</button><button class="btn small ghost" data-action="allow-sender" data-from="@${esc(ign.from.split('@')[1] || '')}">Alle von @${esc(ign.from.split('@')[1] || '')}</button></div></div>` : ''}`;
}
function inboxNew(list) {
  const cards = list.map((t) => {
    const a = areaOf(t); const due = dueLabel(t);
    return `<article class="new-card" style="--area:${esc(a.color)}">
      <button class="new-main" data-action="edit" data-id="${esc(t.id)}">
        <span class="new-area">${esc(a.emoji)} ${esc(a.name)}${phaseOf(t) ? ` · ${esc(phaseOf(t))}` : ''}</span>
        <strong>${esc(t.title)}</strong>
        <span class="new-meta">${due ? esc(due.text) : 'Ohne Datum'}${t.mailSubject ? ` · aus „${esc(t.mailSubject)}“` : ''}</span>
      </button>
      <div class="btn-row"><button class="btn small" data-action="accept-new" data-id="${esc(t.id)}">Passt</button><button class="btn small ghost" data-action="discard-new" data-id="${esc(t.id)}">Weg damit</button></div>
    </article>`;
  }).join('');
  return `${inboxAddressCard()}
    ${list.length ? `<div class="group-head"><h2>Neu für dich</h2><button class="link" data-action="accept-all">Alle passen</button></div>${cards}`
      : `<div class="empty">${sunArt()}<strong>Nichts Neues.</strong>Du hast alles im Blick.</div>`}`;
}
function inboxArchive() {
  const q = S.infoQuery.trim().toLowerCase();
  const list = S.infos.filter((x) => !q || `${x.title} ${x.text} ${x.from}`.toLowerCase().includes(q));
  const items = list.map((x) => {
    const open = S.openInfo === x.id;
    return `<article class="info ${open ? 'open' : ''}">
      <button class="info-toggle" data-action="info-open" data-id="${esc(x.id)}" aria-expanded="${open}">
        <div class="info-head"><span class="info-title">${x.kind === 'mail-auto' ? '📬 ' : ''}${esc(x.title || 'Ohne Betreff')}</span><span class="info-date">${esc(x.date ? fmtDate(x.date, { day: 'numeric', month: 'short', year: '2-digit' }) : new Date(x.createdAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }))}</span></div>
        ${x.from ? `<div class="info-from">${esc(x.from)}</div>` : ''}
        <div class="info-text">${esc(x.text)}</div>
      </button>
      ${open ? `<div class="btn-row" style="margin-top:12px">
        <button class="btn secondary small" data-action="info-reparse" data-id="${esc(x.id)}">Aufgaben darin suchen</button>
        <button class="btn ghost small danger-text" data-action="info-delete" data-id="${esc(x.id)}">Löschen</button></div>` : ''}
    </article>`;
  }).join('');
  return `<div class="btn-row" style="margin-bottom:12px;flex-wrap:nowrap">
      <input class="input" type="search" data-input="info-q" value="${esc(S.infoQuery)}" placeholder="In der Ablage suchen" style="flex:1;min-width:0" aria-label="Ablage durchsuchen">
      <button class="btn small" data-action="new-info">Notiz</button>
    </div>
    ${items || `<div class="empty"><strong>${q ? 'Nichts gefunden' : 'Die Ablage ist leer'}</strong>${q ? 'Versuch einen anderen Suchbegriff.' : 'Eingelesene E-Mails und Notizen landen hier – z. B. Zugangsdaten oder Telefonnummern.'}</div>`}`;
}
function inboxPaste() {
  const p = S.parsed;
  let results = '';
  if (p) {
    const sel = p.tasks.filter((t) => t.selected).length;
    const csel = (p.contacts || []).filter((c) => c.selected).length;
    const contactsHtml = p.contacts?.length ? `<div class="group-head"><h2>${p.contacts.length} ${p.contacts.length === 1 ? 'Kontakt' : 'Kontakte'}</h2></div>${p.contacts.map((c, i) => foundContact(c, i)).join('')}` : '';
    results = p.tasks.length || p.contacts?.length ? `
      ${p.ai && p.summary ? `<div class="ai-note">${I.spark}<span>${esc(p.summary)}</span></div>` : ''}
      <div class="group-head"><h2>${p.tasks.length} ${p.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} gefunden</h2></div>
      <p class="hint">${p.ai ? 'Vorschläge der KI. Passe an, was nicht stimmt, und wähle ab, was du nicht brauchst.' : 'Häkchen setzen, Text und Datum bei Bedarf anpassen.'}</p>
      ${p.tasks.map((t, i) => foundItem(t, i)).join('')}
      ${contactsHtml}
      <label class="opt"><input type="checkbox" data-action="save-info" ${S.saveInfo ? 'checked' : ''}> E-Mail zusätzlich in der Ablage speichern</label>
      <div class="sticky-action"><button class="btn block" data-action="commit-import" id="commit-btn" ${sel || csel ? '' : 'disabled'}>${commitLabel(sel, csel)}</button></div>`
      : `<div class="empty"><strong>Keine Aufgaben erkannt</strong>In diesem Text steht nichts, was nach einer Bitte oder Frist klingt.<br><br>
         <button class="btn secondary small" data-action="new-task">Selbst anlegen</button>
         <button class="btn ghost small" data-action="info-only">Nur ablegen</button></div>`;
  }
  const has = S.pasteText.trim();
  const mainBtn = S.ai
    ? `<button class="btn block" style="margin-top:14px" data-action="parse-ai" ${has && !S.aiBusy ? '' : 'disabled'} id="parse-btn">${S.aiBusy ? '<span class="spin"></span> Mindora liest mit …' : `${I.spark} Mit KI auswerten`}</button>
       <button class="link center" data-action="parse" ${S.aiBusy ? 'disabled' : ''}>Ohne KI auswerten</button>`
    : `<button class="btn block" style="margin-top:14px" data-action="parse" ${has ? '' : 'disabled'} id="parse-btn">Aufgaben finden</button>
       <p class="hint">Mit dem KI-Assistenten (Mehr → KI-Assistent) erkennt Mindora auch Ansprechpartner, schätzt Vorlaufzeiten und versteht frei formulierte Texte.</p>`;
  return `<p class="hint" style="margin-top:0">Kopiere eine E-Mail, einen Verlauf oder einen Text aus einer anderen App hier hinein.</p>
    <textarea class="paste" id="paste" data-input="paste" placeholder="Hier einfügen …">${esc(S.pasteText)}</textarea>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn secondary small" data-action="clip">Aus Zwischenablage</button>
      <label class="btn secondary small" style="position:relative">Screenshot lesen<input type="file" accept="image/*" data-action="ocr" style="position:absolute;inset:0;opacity:0"></label>
      ${S.pasteText ? '<button class="btn ghost small" data-action="clear-paste">Leeren</button>' : ''}
    </div>
    ${mainBtn}${results}`;
}
function commitLabel(n, c = 0) {
  if (!n && !c) return 'Nichts ausgewählt';
  const parts = [];
  if (n) parts.push(`${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'}`);
  if (c) parts.push(`${c} ${c === 1 ? 'Kontakt' : 'Kontakte'}`);
  return parts.join(' und ') + ' übernehmen';
}
const KIND = { frist: 'Frist', termin: 'Termin', geschaetzt: 'Vorschlag der KI', keine: '' };
const areaSelect = (attrs, selected) => `<select ${attrs}>${areas().map((a) => `<option value="${esc(a.id)}" ${a.id === selected ? 'selected' : ''}>${esc(a.emoji)} ${esc(a.name)}</option>`).join('')}</select>`;
function foundItem(t, i) {
  const src = [t.from && `von ${t.from}`, t.messageDate && `vom ${fmtDate(t.messageDate, { day: 'numeric', month: 'short' })}`].filter(Boolean).join(' ');
  const sb = t.due && t.leadDays != null ? addDays(t.due, -t.leadDays) : null;
  return `<div class="found ${t.selected ? '' : 'off'}">
    <input type="checkbox" data-action="pick" data-i="${i}" ${t.selected ? 'checked' : ''} aria-label="Übernehmen">
    <div class="found-body">
      <textarea class="found-title" data-input="found-title" data-i="${i}" rows="2" aria-label="Titel">${esc(t.title)}</textarea>
      <div class="found-line">
        <input type="date" data-input="found-due" data-i="${i}" value="${esc(t.due || '')}" aria-label="Fällig am">
        ${t.leadDays != null ? `<label class="mini">Vorlauf <input type="number" min="0" max="120" inputmode="numeric" data-input="found-lead" data-i="${i}" value="${esc(t.leadDays)}" aria-label="Vorlauf in Tagen"> Tage</label>` : ''}
        ${areaSelect(`data-input="found-area" data-i="${i}" aria-label="Bereich"`, t.areaId)}
      </div>
      ${t.ai ? `<div class="found-src">${[KIND[t.dueKind] && t.due ? KIND[t.dueKind] : '', sb ? `starten bis ${fmtDate(sb, { day: 'numeric', month: 'short' })}` : '', t.contactName ? `Ansprechpartner: ${t.contactName}` : ''].filter(Boolean).map(esc).join(' · ')}</div>
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
  const state = c.match ? (c.addsInfo ? 'Schon gespeichert – fehlende Angaben werden ergänzt' : 'Schon gespeichert') : 'Neuer Kontakt';
  return `<div class="found ${c.selected ? '' : 'off'}">
    <input type="checkbox" data-action="pick-contact" data-i="${i}" ${c.selected ? 'checked' : ''} aria-label="Kontakt übernehmen">
    <div class="found-body">
      <div style="font-weight:700">${esc(c.name)}</div>
      ${line ? `<div class="found-src" style="margin-top:2px">${esc(line)}</div>` : ''}
      <div class="found-src" style="margin-top:2px">${esc(data)}</div>
      <div class="found-src">${esc(state)}</div>
    </div></div>`;
}

// ================================================================== Kontakte
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
    <button class="back" data-action="back-more">‹ Mehr</button>
    <header class="page-head"><h1>Kontakte</h1><p>Alle Ansprechpartner an einem Ort – direkt anschreiben oder anrufen.</p></header>
    ${S.contacts.length > 5 ? `<input class="input" type="search" data-input="contact-q" value="${esc(S.contactQuery)}" placeholder="Suchen" style="margin-bottom:12px" aria-label="Kontakte durchsuchen">` : ''}
    ${rows ? `<div class="list">${rows}</div>` : `<div class="empty"><strong>${q ? 'Nichts gefunden' : 'Noch keine Kontakte'}</strong>${q ? 'Versuch einen anderen Suchbegriff.' : 'Ansprechpartner aus E-Mail-Signaturen landen automatisch hier. Oder leg einen mit dem Plus an.'}</div>`}
  </main>`;
}

// ================================================================== Mehr
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
  const open = new Map(); for (const t of S.tasks) if (!t.done) open.set(areaOf(t).id, (open.get(areaOf(t).id) || 0) + 1);
  const mem = members().map((u) => `<div class="setting"><span class="who">${esc(initial(u))}</span><span class="grow">${esc(nameOf(u))}${u === S.me?.uid ? ' <span class="muted">(du)</span>' : ''}</span></div>`).join('');
  const modelName = S.ai ? (MODELS.find((m) => m[0] === S.ai.model) || [0, S.ai.model])[1].split(' – ')[0] : '';
  return `<main class="view">
    <header class="page-head"><h1>Mehr</h1></header>
    ${cloud ? '' : `<div class="note-card"><p><strong>Lokaler Modus.</strong> Alles bleibt auf diesem Gerät. Für Teilen, Push-Nachrichten und den E-Mail-Eingang richte die Cloud ein (Anleitung, Stufe 2).</p></div>`}

    <div class="settings" style="margin-top:4px">
      <button class="setting" data-action="open-contacts"><span class="area-dot" style="--area:var(--brand)">👥</span><span class="grow">Kontakte<small>${S.contacts.length} Ansprechpartner – anrufen oder anschreiben</small></span>${I.chevron}</button>
    </div>

    <h2 class="section-title">Lebensbereiche</h2>
    <div class="settings">
      ${areas().map((a) => `<button class="setting" data-action="area-edit" data-id="${esc(a.id)}"><span class="area-dot" style="--area:${esc(a.color)}">${esc(a.emoji)}</span><span class="grow">${esc(a.name)}<small>${open.get(a.id) || 0} offen${a.phases?.length ? ` · ${a.phases.length} Abschnitte` : ''}</small></span>${I.chevron}</button>`).join('')}
      <button class="setting" data-action="area-new"><span class="area-dot add">+</span><span class="grow">Bereich hinzufügen</span></button>
    </div>

    <h2 class="section-title">Gemeinsam planen</h2>
    <div class="settings">
      ${cloud ? mem : ''}
      <button class="setting" data-action="invite"><span class="grow">Partnerin oder Partner einladen<small>Code erzeugen und per Nachricht schicken</small></span>${I.chevron}</button>
      ${cloud ? `<button class="setting" data-action="join"><span class="grow">Mit Code beitreten</span>${I.chevron}</button>` : ''}
    </div>

    <h2 class="section-title">Erinnerungen</h2>
    <div class="settings">
      <button class="setting" data-action="push" ${ps.on ? 'disabled' : ''}><span class="status-dot ${ps.on ? 'on' : ''}"></span><span class="grow">Push-Nachrichten<small>${esc(ps.text)}</small></span>${ps.on ? '' : '<span class="end">Aktivieren</span>'}</button>
    </div>
    <p class="hint">Zur eingestellten Zeit jeder Aufgabe, morgens ab 7 Uhr eine kurze Übersicht und ein Hinweis, wenn etwas jetzt starten sollte. Jedes Gerät einmal selbst aktivieren.</p>

    <h2 class="section-title">KI-Assistent</h2>
    <div class="settings">
      <button class="setting" data-action="ai-settings"><span class="status-dot ${S.ai ? 'on' : ''}"></span><span class="grow">Claude von Anthropic<small>${S.ai ? `Aktiv · ${esc(modelName)}` : 'Nicht eingerichtet'}</small></span><span class="end">${S.ai ? 'Ändern' : 'Einrichten'}</span></button>
      ${S.ai ? `<button class="setting" data-action="assess-all" ${S.aiBusy ? 'disabled' : ''}><span class="grow">${S.aiBusy ? 'Fristen werden geprüft …' : 'Alle Fristen jetzt prüfen'}<small>Was ist bis wann realistisch zu schaffen?</small></span></button>` : ''}
    </div>

    <h2 class="section-title">E-Mail-Eingang</h2>
    <div class="settings">
      <button class="setting" data-action="inbox-settings"><span class="status-dot ${S.project?.inboxAddress ? 'on' : ''}"></span><span class="grow">${S.project?.inboxAddress ? esc(S.project.inboxAddress) : 'Nicht eingerichtet'}<small>${S.project?.inboxAddress ? 'Erlaubte Absender verwalten' : 'Anleitung, Stufe 5'}</small></span>${I.chevron}</button>
    </div>

    <h2 class="section-title">Vorlagen</h2>
    <div class="settings">
      <button class="setting" data-action="template"><span class="grow">Checkliste Hausbau<small>Vom Bauantrag bis zur Abnahme</small></span>${I.chevron}</button>
    </div>

    <h2 class="section-title">Daten</h2>
    <div class="settings">
      <button class="setting" data-action="export"><span class="grow">Sicherung speichern<small>Aufgaben, Bereiche, Kontakte und Ablage als Datei</small></span></button>
      <label class="setting" style="cursor:pointer;position:relative"><span class="grow">Sicherung einspielen</span><input type="file" accept="application/json,.json" data-action="import-file" style="position:absolute;inset:0;opacity:0"></label>
    </div>

    ${cloud ? `<h2 class="section-title">Konto</h2>
    <div class="settings">
      <div class="setting"><span class="grow">${esc(S.me?.name)}<small>${esc(S.me?.email)}</small></span></div>
      <button class="setting danger" data-action="logout">Abmelden</button>
    </div>` : ''}
    <p class="hint center" style="margin-top:28px">Mindora · Planung darf leicht sein.</p>
  </main>`;
}

// ================================================================== Anmeldung
function viewAuth() {
  const reg = S.authTab === 'register';
  return `<main class="auth">
    <div class="auth-hero">${ring(0.72, 96, 11, 'var(--brand)', '✓')}<h1>Mindora</h1><p>Dein persönlicher Assistent. Aufgaben, Fristen und E-Mails – leicht geplant.</p></div>
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
    ${reg ? '' : '<button class="link center" data-action="reset-pw">Passwort vergessen?</button>'}
  </main>`;
}
function viewSetup() {
  return `<main class="auth">
    <header class="page-head"><h1>Hallo ${esc(S.me?.name || '')}</h1><p>Leg euren gemeinsamen Bereich an. Wenn deine Partnerin oder dein Partner schon einen hat, tritt mit dem Code bei.</p></header>
    <form data-form="create" style="margin-top:20px">
      <label class="field"><span>Name</span><input name="name" value="Unser Zuhause" required></label>
      <button class="btn block" type="submit">Loslegen</button>
    </form>
    <h2 class="section-title" style="margin-top:36px">Ich habe einen Code</h2>
    <form data-form="join-setup">
      <label class="field"><span>Einladungscode</span><input name="code" autocapitalize="characters" autocomplete="off" placeholder="z. B. K7M-Q2P" required></label>
      ${S.authError ? `<p class="error">${esc(S.authError)}</p>` : ''}
      <button class="btn secondary block" type="submit">Beitreten</button>
    </form>
    <button class="link center" data-action="logout" style="margin-top:24px">Abmelden</button>
  </main>`;
}

// ================================================================== Sheets
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
function phaseOptions(areaId, selected) {
  const a = areaById(areaId);
  const ph = a?.phases || [];
  if (!ph.length) return '';
  return `<option value="">– ohne –</option>${ph.map((p) => `<option ${p === selected ? 'selected' : ''}>${esc(p)}</option>`).join('')}`;
}
function urgencyBox(t) {
  const u = urgencyOf(t);
  if (!u) return '';
  const sb = u.startBy ? `Starten spätestens: ${fmtDate(u.startBy)}` : '';
  return `<div class="ai-box u-${u.status}" data-urg>
    <div class="ai-box-head">${u.ai ? I.spark : ''}<strong>${esc(STATUS[u.status].label)}</strong>${u.ai ? '<span class="muted">KI-Einschätzung</span>' : ''}</div>
    ${u.reason ? `<p>${esc(u.reason)}</p>` : ''}
    ${u.next ? `<p><strong>Nächster Schritt:</strong> ${esc(u.next)}</p>` : ''}
    ${sb ? `<p class="muted">${esc(sb)}</p>` : ''}
    ${S.ai ? `<button type="button" class="link" data-act="assess">Mit KI neu einschätzen</button>` : ''}
  </div>`;
}

function taskSheet(task, preset = {}) {
  const defArea = preset.areaId || (S.view === 'plan' && S.planArea && S.planArea !== 'all' ? S.planArea : S.view === 'tasks' && S.area !== 'all' ? S.area : (areaById('alltag') ? 'alltag' : areas()[0].id));
  const t = task || { title: '', due: '', time: '', reminder: 'day1', areaId: defArea, phase: null, assignee: 'all', notes: '', leadDays: null, contactId: null, ...preset };
  const tArea = task ? areaOf(task).id : t.areaId;
  const memOpts = members().length > 1 ? `<label class="field"><span>Zuständig</span><select name="assignee">
      <option value="all" ${!t.assignee || t.assignee === 'all' ? 'selected' : ''}>Beide</option>
      ${members().map((u) => `<option value="${esc(u)}" ${t.assignee === u ? 'selected' : ''}>${esc(nameOf(u))}</option>`).join('')}</select></label>` : '';
  const c = t.contactId ? contactById(t.contactId) : null;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${task ? 'Aufgabe' : 'Neue Aufgabe'}</h2><button class="btn ghost" data-dismiss>${task ? 'Schließen' : 'Abbrechen'}</button></div>
    ${task?.isNew && !task.done ? `<div class="note-card soft"><p>📬 Neu aus der E-Mail${task.mailSubject ? ` „${esc(task.mailSubject)}“` : ''}. Speichern bestätigt sie.</p></div>` : ''}
    ${task && !task.done ? urgencyBox(task) : ''}
    ${task ? `<div class="btn-row" style="margin-bottom:14px">
      <button type="button" class="btn secondary small" data-act="mail">${I.envelope} ${c?.email ? `E-Mail an ${esc(c.name.split(' ').slice(-1)[0])}` : 'E-Mail schreiben'}</button>
      ${c && (c.mobile || c.phone) ? `<a class="btn secondary small" href="${esc(telHref(c.mobile || c.phone))}">${I.phone} Anrufen</a>` : ''}
    </div>` : ''}
    <form>
      <label class="field"><span>Was ist zu tun?</span><textarea name="title" rows="2" required style="min-height:64px" placeholder="z. B. Bank wegen Finanzierungsbestätigung anrufen">${esc(t.title)}</textarea></label>
      <div class="two">
        <label class="field"><span>Fällig am</span><input type="date" name="due" value="${esc(t.due || '')}"></label>
        <label class="field"><span>Bereich</span>${areaSelect('name="areaId"', tArea)}</label>
      </div>
      <label class="field"><span>Erinnerung</span><select name="reminder">${REMINDERS.map(([v, l]) => `<option value="${v}" ${(t.reminder || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field" data-custom ${t.reminder === 'custom' ? '' : 'hidden'}><span>Erinnern am</span><input type="datetime-local" name="remindCustom" value="${esc(t.remindCustom || '')}"></label>
      <p class="hint" data-remind-hint style="margin-top:-6px"></p>
      <details class="more-fields" ${task && (t.leadDays != null || t.contactId || t.time || phaseOf(t) || t.notes) ? 'open' : ''}>
        <summary>Weitere Angaben <small>Uhrzeit, Vorlauf, Abschnitt, Ansprechpartner, Notizen</small></summary>
        <div class="two">
          <label class="field"><span>Uhrzeit</span><input type="time" name="time" value="${esc(t.time || '')}"></label>
          <label class="field"><span>Vorlauf (Tage)</span><input type="number" name="leadDays" min="0" max="120" inputmode="numeric" value="${t.leadDays ?? ''}" placeholder="z. B. 14"></label>
        </div>
        <p class="hint" data-lead-hint style="margin-top:-6px"></p>
        <div class="two">
          <label class="field" data-phase-wrap ${phaseOptions(tArea) ? '' : 'hidden'}><span>Abschnitt im Plan</span><select name="phase">${phaseOptions(tArea, phaseOf(t))}</select></label>
          <label class="field"><span>Ansprechpartner</span><select name="contactId">${contactOptions(t.contactId)}</select></label>
        </div>
        ${memOpts}
        <label class="field"><span>Notizen</span><textarea name="notes" rows="4">${esc(t.notes || '')}</textarea></label>
      </details>
      <button class="btn block" type="submit">Speichern</button>
      ${task ? `<div class="btn-row" style="justify-content:space-between;margin-top:10px">
        <button type="button" class="btn ghost" data-act="done">${task.done ? 'Wieder öffnen' : 'Erledigt'}</button>
        <button type="button" class="btn ghost danger-text" data-act="delete">Löschen</button></div>
        ${task.createdBy && members().length > 1 ? `<p class="hint">Angelegt von ${esc(nameOf(task.createdBy))}${task.done && task.doneBy ? `, erledigt von ${esc(nameOf(task.doneBy))}` : ''}</p>` : ''}` : ''}
    </form>`);
  const form = sheet.querySelector('form');
  const formData = () => {
    const f = Object.fromEntries(new FormData(form));
    return {
      title: f.title.trim(), due: f.due || null, time: f.time || null, reminder: f.reminder, remindCustom: f.remindCustom || null,
      areaId: f.areaId, phase: f.phase || null, notes: f.notes.trim(), assignee: f.assignee || 'all',
      leadDays: f.leadDays === '' ? null : Math.max(0, Math.min(120, parseInt(f.leadDays, 10) || 0)), contactId: f.contactId || null,
    };
  };
  const upd = (e) => {
    const f = formData();
    if (e?.target?.name === 'areaId') {
      const opts = phaseOptions(f.areaId);
      sheet.querySelector('[data-phase-wrap]').hidden = !opts;
      form.phase.innerHTML = opts || '<option value=""></option>';
    }
    sheet.querySelector('[data-custom]').hidden = f.reminder !== 'custom';
    const at = computeRemindAt(f);
    const hint = sheet.querySelector('[data-remind-hint]');
    if (f.reminder === 'none') hint.textContent = '';
    else if (!f.due && f.reminder !== 'custom') hint.textContent = '';
    else if (at) hint.textContent = `Erinnerung: ${new Date(at).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} Uhr${at < Date.now() ? ' – liegt in der Vergangenheit' : ''}`;
    else hint.textContent = '';
    const lh = sheet.querySelector('[data-lead-hint]');
    if (f.due && f.leadDays != null) lh.textContent = `Starten spätestens am ${fmtDate(addDays(f.due, -f.leadDays))}. Ab dann erinnert Mindora dich.`;
    else lh.textContent = f.due ? 'Vorlauf = wie viele Tage vorher du anfangen musst, z. B. weil die Bank Zeit braucht. Mindora erinnert dich dann rechtzeitig.' : '';
  };
  form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
  if (!task) setTimeout(() => form.title.focus(), 280);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = formData();
    if (!data.title) return;
    try {
      if (data.areaId && !S.areas.find((a) => a.id === data.areaId)) await ensureAreasStored();
      if (task) await store.updateTask(task.id, { ...data, isNew: false }, task);
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
    e.target.disabled = true; e.target.textContent = 'Mindora schätzt ein …';
    try {
      await assessList([S.tasks.find((x) => x.id === task.id) || task]);
      const fresh = S.tasks.find((x) => x.id === task.id);
      sheet.querySelector('[data-urg]').outerHTML = urgencyBox(fresh);
    } catch (err) { toast(fail(err)); e.target.disabled = false; e.target.textContent = 'Mit KI neu einschätzen'; }
  });
  sheet.querySelector('[data-act="done"]')?.addEventListener('click', (e) => { const r = e.target.getBoundingClientRect(); closeSheet(); toggleTask(task.id, r.left + 20, r.top + 10); });
  sheet.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
    if (!confirm('Aufgabe wirklich löschen?')) return;
    closeSheet();
    try { await store.deleteTask(task.id); toast('Gelöscht', { label: 'Rückgängig', fn: () => { const { id, ...rest } = task; store.addTask(rest); } }); } catch (err) { toast(fail(err)); }
  });
}

const CHEERS = ['Erledigt 🎉', 'Geschafft ✨', 'Ein Punkt weniger 🙌', 'Stark gemacht 💪', 'Weiter so 🌿', 'Abgehakt ☀️'];
async function toggleTask(id, x, y) {
  const t = S.tasks.find((k) => k.id === id); if (!t) return;
  const patch = t.done ? { done: false, doneAt: null, doneBy: null } : { done: true, doneAt: Date.now(), doneBy: S.me?.uid || null, isNew: false };
  if (!t.done && x != null) celebrate(x, y);
  try {
    await store.updateTask(id, patch, t);
    if (!t.done) {
      const openLeft = S.tasks.filter((k) => !k.done && k.due && k.due <= todayISO()).length;
      toast(openLeft === 0 && t.due && t.due <= todayISO() ? 'Alles für heute geschafft ☀️' : pick(CHEERS), { label: 'Rückgängig', fn: () => store.updateTask(id, { done: false, doneAt: null, doneBy: null }, { ...t, ...patch }) });
    }
  } catch (e) { toast(fail(e)); }
}

// --- Kontakt
function contactSheet(c) {
  const isNew = !c;
  c = c || { name: '', company: '', role: '', email: '', phone: '', mobile: '', address: '', notes: '' };
  const tasks = isNew ? [] : S.tasks.filter((t) => !t.done && t.contactId === c.id).sort(byDue);
  const f = (name, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(c[name] || '')}" ${extra}></label>`;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${isNew ? 'Neuer Kontakt' : esc(c.name)}</h2><button class="btn ghost" data-dismiss>${isNew ? 'Abbrechen' : 'Schließen'}</button></div>
    ${isNew ? '' : `<div class="btn-row" style="margin-bottom:16px">
      ${c.email ? `<button type="button" class="btn small" data-act="mail">${I.envelope} E-Mail schreiben</button>` : ''}
      ${c.phone ? `<a class="btn secondary small" href="${esc(telHref(c.phone))}">${I.phone} ${esc(c.phone)}</a>` : ''}
      ${c.mobile ? `<a class="btn secondary small" href="${esc(telHref(c.mobile))}">${I.phone} Mobil</a>` : ''}
    </div>
    ${tasks.length ? `<h3 class="sub-title">Offene Aufgaben</h3><div class="list" style="margin-bottom:18px">${tasks.map((t) => row(t)).join('')}</div>` : ''}`}
    <form>
      ${f('name', 'Name', 'text', 'required autocomplete="off"')}
      <div class="two">${f('role', 'Rolle')}${f('company', 'Firma')}</div>
      ${f('email', 'E-Mail', 'email', 'autocomplete="off" autocapitalize="off"')}
      <div class="two">${f('phone', 'Telefon', 'tel')}${f('mobile', 'Mobil', 'tel')}</div>
      ${f('address', 'Adresse')}
      <label class="field"><span>Notizen</span><textarea name="notes" rows="3">${esc(c.notes || '')}</textarea></label>
      <button class="btn block" type="submit">Speichern</button>
      ${isNew ? '' : '<button type="button" class="btn ghost block danger-text" data-act="delete" style="margin-top:8px">Kontakt löschen</button>'}
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
  sheet.querySelectorAll('.check[data-action="toggle"]').forEach((b) => b.addEventListener('click', () => { closeSheet(); toggleTask(b.dataset.id); }));
}

// --- E-Mail schreiben
function composeSheet({ task = null, contact = null } = {}) {
  const withMail = S.contacts.filter((x) => x.email);
  const sender = myName();
  const defBody = `Guten Tag,\n\n\n\nMit freundlichen Grüßen\n${sender}`;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>E-Mail</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <form>
      ${withMail.length ? `<label class="field"><span>An</span><select name="pick">${withMail.map((x) => `<option value="${esc(x.email)}" ${contact?.id === x.id ? 'selected' : ''}>${esc(x.name)} – ${esc(x.email)}</option>`).join('')}<option value="" ${contact?.email ? '' : 'selected'}>Andere Adresse …</option></select></label>` : ''}
      <label class="field" data-other ${withMail.length && contact?.email ? 'hidden' : ''}><span>E-Mail-Adresse</span><input name="to" type="email" autocapitalize="off" value="${esc(!withMail.length || !contact?.email ? contact?.email || '' : '')}"></label>
      ${S.ai ? `<div class="ai-compose">
        <input class="input" name="instruction" placeholder="${task ? 'Optional: Worum soll es gehen?' : 'Worum soll es gehen? z. B. Termin anfragen'}">
        <button type="button" class="btn secondary small" data-act="ai">${I.spark} Mit KI formulieren</button>
      </div>` : ''}
      <label class="field"><span>Betreff</span><input name="subject" value="${esc(task ? task.title : '')}"></label>
      <label class="field"><span>Text</span><textarea name="body" rows="11">${esc(defBody)}</textarea></label>
      <button class="btn block" type="submit">${I.envelope} In Mail-App öffnen</button>
      <button type="button" class="btn ghost block" data-act="copy" style="margin-top:6px">Text kopieren</button>
      <p class="hint">Die Mail öffnet sich fertig ausgefüllt in deiner Mail-App. Dort tippst du auf Senden – so geht sie von deiner eigenen Adresse raus.</p>
    </form>`);
  const form = sheet.querySelector('form');
  const pickEl = form.pick;
  const other = sheet.querySelector('[data-other]');
  pickEl?.addEventListener('change', () => { other.hidden = !!pickEl.value; });
  const toAddr = () => (pickEl && pickEl.value) || form.to.value.trim();
  const recipient = () => S.contacts.find((x) => x.email && x.email === toAddr()) || contact;
  sheet.querySelector('[data-act="ai"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!task && !form.instruction.value.trim()) { toast('Schreib kurz, worum es gehen soll.'); form.instruction.focus(); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Mindora schreibt …';
    try {
      const area = task ? areaOf(task) : null;
      const d = await draftEmail(aiCfg(), { task, contact: recipient(), sender, project: area ? area.name : '', instruction: form.instruction.value.trim() });
      form.subject.value = d.subject; form.body.value = d.body;
    } catch (err) { toast(fail(err)); }
    btn.disabled = false; btn.innerHTML = `${I.spark} Neu formulieren`;
  });
  sheet.querySelector('[data-act="copy"]').addEventListener('click', () => copyText(`${form.subject.value}\n\n${form.body.value}`, 'Text kopiert'));
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
    <p class="hint" style="margin-top:0">Mindora nutzt Claude von Anthropic. Dafür brauchst du einen eigenen API-Schlüssel aus der Anthropic Console (Anleitung, Stufe 4). Abgerechnet wird nach Verbrauch – eine E-Mail auszuwerten kostet meist 1–3 Cent.</p>
    <form>
      <label class="field"><span>API-Schlüssel</span><input name="apiKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-ant-…" value="${esc(cur.apiKey || '')}" required></label>
      <label class="field"><span>Modell</span><select name="model">${MODELS.map(([v, l]) => `<option value="${v}" ${(cur.model || DEFAULT_MODEL) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <p class="hint">${store.mode === 'cloud' ? 'Der Schlüssel wird in eurem gemeinsamen Bereich gespeichert. So kann auch deine Partnerin die KI nutzen, und E-Mail-Eingang und tägliche Fristprüfung laufen damit. Nur ihr beide könnt ihn lesen.' : 'Der Schlüssel bleibt auf diesem Gerät.'}</p>
      <p class="error" data-err hidden></p>
      <button class="btn block" type="submit">Prüfen und speichern</button>
      ${S.ai ? '<button type="button" class="btn ghost block danger-text" data-act="remove" style="margin-top:8px">KI-Assistent ausschalten</button>' : ''}
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
      closeSheet(); toast('KI-Assistent ist bereit ✨');
    } catch (x) { err.textContent = fail(x); err.hidden = false; btn.disabled = false; btn.textContent = 'Prüfen und speichern'; }
  };
  sheet.querySelector('[data-act="remove"]')?.addEventListener('click', async () => {
    if (!confirm('KI-Assistent ausschalten und Schlüssel löschen?')) return;
    try { await store.setAi(null); closeSheet(); toast('KI-Assistent ausgeschaltet'); } catch (x) { toast(fail(x)); }
  });
}

// --- Lebensbereich
function areaSheet(a) {
  const isNew = !a;
  a = a || { name: '', emoji: '✨', color: AREA_COLORS[areas().length % AREA_COLORS.length], phases: [] };
  const used = isNew ? 0 : S.tasks.filter((t) => areaOf(t).id === a.id).length;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${isNew ? 'Neuer Bereich' : esc(a.name)}</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <form>
      <div class="area-preview" data-preview style="--area:${esc(a.color)}"><span>${esc(a.emoji)}</span></div>
      <label class="field"><span>Name</span><input name="name" value="${esc(a.name)}" required placeholder="z. B. Urlaub, Auto, Kinder"></label>
      <div class="field"><span>Symbol</span><div class="emoji-pick">${AREA_EMOJIS.map((e) => `<button type="button" data-emoji="${e}" aria-pressed="${e === a.emoji}">${e}</button>`).join('')}</div>
        <input name="emoji" value="${esc(a.emoji)}" maxlength="4" class="input emoji-input" aria-label="Eigenes Symbol"></div>
      <div class="field"><span>Farbe</span><div class="color-pick">${AREA_COLORS.map((c) => `<button type="button" data-color="${c}" style="--c:${c}" aria-pressed="${c === a.color}" aria-label="Farbe ${c}"></button>`).join('')}</div></div>
      <label class="field"><span>Abschnitte im Plan (optional, einer pro Zeile)</span><textarea name="phases" rows="4" placeholder="z. B. Planung&#10;Umsetzung&#10;Abschluss">${esc((a.phases || []).join('\n'))}</textarea></label>
      <button class="btn block" type="submit">Speichern</button>
      ${!isNew && areas().length > 1 ? `<button type="button" class="btn ghost block danger-text" data-act="delete" style="margin-top:8px">Bereich löschen</button>` : ''}
    </form>`);
  const form = sheet.querySelector('form');
  let color = a.color;
  const prev = sheet.querySelector('[data-preview]');
  sheet.querySelectorAll('[data-emoji]').forEach((b) => b.addEventListener('click', () => {
    form.emoji.value = b.dataset.emoji; prev.querySelector('span').textContent = b.dataset.emoji;
    sheet.querySelectorAll('[data-emoji]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  form.emoji.addEventListener('input', () => { prev.querySelector('span').textContent = form.emoji.value || '✨'; });
  sheet.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    color = b.dataset.color; prev.style.setProperty('--area', color);
    sheet.querySelectorAll('[data-color]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.name.value.trim(); if (!name) return;
    const data = { name, emoji: form.emoji.value.trim() || '✨', color, phases: form.phases.value.split('\n').map((s) => s.trim()).filter(Boolean), order: a.order ?? areas().length };
    try {
      await ensureAreasStored();
      const id = isNew ? (name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'bereich') + '-' + Date.now().toString(36).slice(-4) : a.id;
      await store.setArea(id, data);
      closeSheet(); toast(isNew ? `${data.emoji} ${name} angelegt` : 'Gespeichert');
    } catch (err) { toast(fail(err)); }
  };
  sheet.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
    const target = areas().find((x) => x.id !== a.id);
    if (!confirm(`Bereich „${a.name}“ löschen?${used ? ` Die ${used} Aufgaben wandern nach „${target.name}“.` : ''}`)) return;
    try {
      await ensureAreasStored();
      for (const t of S.tasks.filter((k) => areaOf(k).id === a.id)) await store.updateTask(t.id, { areaId: target.id, phase: null }, t);
      await store.deleteArea(a.id);
      if (S.area === a.id) S.area = 'all';
      if (S.planArea === a.id) S.planArea = null;
      closeSheet(); toast('Bereich gelöscht');
    } catch (err) { toast(fail(err)); }
  });
}

// --- E-Mail-Eingang
function inboxSheet() {
  const addr = S.project?.inboxAddress;
  const allowed = (S.project?.inboxAllowed || []).join('\n');
  const sheet = openSheet(`
    <div class="sheet-head"><h2>E-Mail-Eingang</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    ${addr ? `<div class="address-card" style="margin-bottom:16px"><p>Weiterleiten an</p><button class="address" type="button" data-act="copy">${esc(addr)} ${I.copy}</button></div>`
      : `<div class="note-card"><p>Noch kein Postfach verbunden. Die Einrichtung (ca. 15 Minuten) steht in der Anleitung, Stufe 5.</p></div>`}
    <form>
      <label class="field"><span>Erlaubte Absender (einer pro Zeile)</span><textarea name="allowed" rows="5" placeholder="z. B. @allkauf.de&#10;kita@beispiel.de">${esc(allowed)}</textarea></label>
      <p class="hint">Mails von euren eigenen Konto-Adressen${S.me?.email ? ` (z. B. ${esc(S.me.email)})` : ''} sind immer erlaubt – also alles, was ihr selbst weiterleitet. Ergänze hier Absender, die direkt an das Postfach schreiben oder automatisch weitergeleitet werden. Mit „@firma.de“ erlaubst du eine ganze Firma. Alles andere ignoriert Mindora – so entstehen keine Aufgaben aus Werbung.</p>
      <button class="btn block" type="submit" ${store.mode !== 'cloud' ? 'disabled' : ''}>Speichern</button>
    </form>`);
  sheet.querySelector('[data-act="copy"]')?.addEventListener('click', () => copyText(addr, 'Adresse kopiert'));
  sheet.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const list = e.target.allowed.value.split(/[\n,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^\s@]*@[^\s@]+\.[^\s@]+$/.test(s));
    try { await store.updateProject({ inboxAllowed: list }); closeSheet(); toast('Gespeichert'); } catch (err) { toast(fail(err)); }
  };
}
async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast(text); }
}

// --- Notiz
function infoSheet() {
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Notiz</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <form>
      <label class="field"><span>Titel</span><input name="title" required placeholder="z. B. Zugangsdaten Bauamt-Portal"></label>
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

// --- Vorlage Hausbau
const TEMPLATE = [
  ['Finanzierung', 'Finanzierungsbestätigung der Bank an allkauf schicken'],
  ['Finanzierung', 'Zahlungsplan mit Bank und allkauf abgleichen'],
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
    return `<label class="found ${exists ? 'off' : ''}" style="align-items:center"><input type="checkbox" name="t" value="${i}" ${exists ? '' : 'checked'}><div class="found-body"><div style="font-weight:700">${esc(title)}</div><div class="found-src">${esc(phase)}${exists ? ' · schon vorhanden' : ''}</div></div></label>`;
  }).join('');
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Checkliste Hausbau</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <p class="hint">Typische Schritte beim Fertighausbau. Was nicht passt, einfach abwählen – Termine trägst du später ein.</p>
    <form>${rows}<button class="btn block" type="submit" style="margin-top:8px">Ausgewählte hinzufügen</button></form>`);
  sheet.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const picked = [...new FormData(e.target).getAll('t')].map((i) => TEMPLATE[+i]);
    if (!picked.length) return closeSheet();
    try {
      await ensureAreasStored();
      if (!areaById('hausbau')) { const { id, ...rest } = DEFAULT_AREAS[0]; await store.setArea(id, rest); }
      await store.addTasks(picked.map(([phase, title]) => ({ title, phase, areaId: 'hausbau', reminder: 'none', source: 'vorlage', notes: '' })));
      closeSheet(); toast(`${picked.length} Aufgaben hinzugefügt`);
    } catch (err) { toast(fail(err)); }
  };
}

async function inviteSheet() {
  if (store.mode !== 'cloud') {
    openSheet(`<div class="sheet-head"><h2>Gemeinsam planen</h2><button class="btn ghost" data-dismiss>Schließen</button></div>
      <p>Damit ihr zu zweit plant, braucht Mindora einen Ort im Internet, an dem eure Daten zusammenkommen – dein eigenes, kostenloses Firebase-Projekt.</p>
      <p class="hint">Die Anleitung erklärt die Einrichtung Schritt für Schritt (ca. 30 Minuten am Computer). Bisherige Aufgaben werden übernommen.</p>`);
    return;
  }
  try {
    const code = await store.createInvite();
    const pretty = code.slice(0, 3) + '-' + code.slice(3);
    const text = `Lass uns zusammen mit Mindora planen!\n1. Öffne ${location.origin + location.pathname} in Safari\n2. Teilen → „Zum Home-Bildschirm“\n3. App öffnen, Konto erstellen, Code eingeben: ${pretty}\n(Der Code gilt 7 Tage.)`;
    const sheet = openSheet(`<div class="sheet-head"><h2>Einladen</h2><button class="btn ghost" data-dismiss>Fertig</button></div>
      <p class="hint">Schick diesen Code zusammen mit dem Link. Er gilt 7 Tage.</p>
      <div class="code">${esc(pretty)}</div>
      <button class="btn block" data-share>${I.share} Einladung senden</button>`);
    sheet.querySelector('[data-share]').onclick = async () => {
      try {
        if (navigator.share) await navigator.share({ title: 'Mindora-Einladung', text });
        else copyText(text, 'Einladung kopiert');
      } catch {}
    };
  } catch (e) { toast(fail(e)); }
}

// ================================================================== Einlesen
function ruleArea(text) {
  const ph = guessPhase(text);
  if (ph !== 'Allgemein' && areaById('hausbau')) return { areaId: 'hausbau', phase: HOUSE_PHASES.includes(ph) ? ph : null };
  return { areaId: S.area !== 'all' ? S.area : (areaById('alltag') ? 'alltag' : areas()[0].id), phase: null };
}
function runParse(text) {
  S.pasteText = text;
  const res = parseEmails(text, { today: new Date(), existing: S.tasks.filter((t) => !t.done) });
  res.tasks.forEach((t) => Object.assign(t, ruleArea(`${t.notes} ${t.subject || ''}`)));
  S.parsed = { ...res, raw: text };
  render();
  if (res.tasks.length) setTimeout(() => app.querySelector('.group-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
async function runParseAI(text) {
  S.pasteText = text; S.aiBusy = true; S.parsed = null; render();
  try {
    const r = await extractFromText(aiCfg(), text, {
      me: { name: myName(), email: S.me?.email, partner: members().filter((u) => u !== S.me?.uid).map(nameOf).join(', ') },
      contacts: S.contacts, openTasks: S.tasks.filter((t) => !t.done), areas: areas(),
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
  } catch (e) { toast(fail(e)); }
  S.aiBusy = false;
  render();
  if (S.parsed) setTimeout(() => app.querySelector('.ai-note, .group-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
async function commitImport() {
  const p = S.parsed; if (!p) return;
  const sel = p.tasks.filter((t) => t.selected && t.title.trim());
  const btn = app.querySelector('#commit-btn'); if (btn) btn.disabled = true;
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
    if (sel.length) await ensureAreasStored();
    await store.addTasks(sel.map((t) => {
      const src = [t.from && `von ${t.from}`, t.messageDate && `vom ${fmtDate(t.messageDate, { day: 'numeric', month: 'numeric', year: 'numeric' })}`].filter(Boolean).join(' ');
      const notes = [t.notes, t.quote ? `„${t.quote}“` : '', t.leadReason ? `Vorlauf: ${t.leadReason}` : ''].filter(Boolean).join('\n\n');
      return {
        title: t.title.trim(), due: t.due || null, time: t.time || null, areaId: t.areaId, phase: t.phase || null,
        leadDays: t.leadDays ?? null, contactId: p.ai ? contactFor(t) : null, dueKind: t.dueKind || null,
        reminder: !t.due ? 'none' : dayDiff(t.due) <= 1 ? 'day0' : 'day1', notes: `${notes}${src ? `\n\nAus der E-Mail ${src}` : ''}${t.subject ? `\nBetreff: ${t.subject}` : ''}`, source: p.ai ? 'mail-ki' : 'mail',
      };
    }));
    if (S.saveInfo) await saveInfoFromText(p);
    S.parsed = null; S.pasteText = ''; S.view = sel.length ? 'home' : 'contacts'; S.filter = 'open';
    render();
    const nc = (p.contacts || []).filter((c) => c.selected).length;
    toast(commitLabel(sel.length, nc).replace(' übernehmen', ' übernommen ✨'));
  } catch (e) { toast(fail(e)); if (btn) btn.disabled = false; }
}
function saveInfoFromText(p) {
  const m = p.messages?.[0] || {};
  const firstLine = p.raw.trim().split('\n').find((l) => l.trim())?.slice(0, 80);
  return store.addInfo({ title: m.subject || p.messages?.find((x) => x.subject)?.subject || firstLine || 'E-Mail', from: m.from || p.messages?.find((x) => x.from)?.from || null, date: m.date || null, text: p.raw.trim(), kind: 'mail' });
}
let tesseract;
async function ocr(file) {
  toast('Screenshot wird gelesen … (beim ersten Mal ca. 15 MB Download)');
  try {
    if (!tesseract) {
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onload = ok; s.onerror = () => no(new Error('Texterkennung konnte nicht geladen werden. Besteht eine Internetverbindung?')); document.head.appendChild(s); });
      tesseract = window.Tesseract;
    }
    const { data } = await tesseract.recognize(file, 'deu');
    const text = data.text.replace(/[ \t]+\n/g, '\n').trim();
    if (!text) { toast('Im Bild wurde kein Text erkannt.'); return; }
    S.pasteText = (S.pasteText ? S.pasteText + '\n\n' : '') + text;
    S.parsed = null; render();
    toast('Text erkannt – kurz prüfen und auswerten.');
  } catch (e) { toast(fail(e)); }
}

// --- KI-Einschätzung
async function assessList(list) {
  const todo = list.filter((t) => !t.done && t.due).map((t) => ({ ...t, areaName: areaOf(t).name }));
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

// ================================================================== Daten sichern
async function exportData() {
  const data = { app: 'mindora', version: 2, exportedAt: new Date().toISOString(), project: S.project?.name, areas: S.areas, tasks: S.tasks, infos: S.infos, contacts: S.contacts };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const name = `mindora-sicherung-${todayISO()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tasks)) throw new Error('Das ist keine Mindora-Sicherung.');
    for (const { id, ...a } of data.areas || []) if (id && !S.areas.find((x) => x.id === id)) await store.setArea(id, a);
    const tasks = data.tasks.map(({ id, ...t }) => t).filter((t) => !S.tasks.some((x) => x.title === t.title && x.due === t.due));
    if (tasks.length) await store.addTasks(tasks);
    for (const { id, ...i } of data.infos || []) if (!S.infos.some((x) => x.text === i.text)) await store.addInfo(i);
    for (const { id, ...c } of data.contacts || []) if (c.name && !findContact(c)) await store.addContact(c);
    toast(`${tasks.length} Aufgaben eingespielt`);
  } catch (e) { toast(fail(e)); }
}

// ================================================================== Ereignisse
app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]'); if (!el || el.tagName === 'INPUT') return;
  const a = el.dataset.action;
  switch (a) {
    case 'tab': if (el.dataset.tab === 'plan' && S.view === 'plan') S.planArea = null; S.view = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'filter': S.filter = el.dataset.filter; render(); break;
    case 'area': S.area = el.dataset.id; render(); break;
    case 'open-plan': S.planArea = el.dataset.id; S.view = 'plan'; S.openStep = null; S.openStepArea = el.dataset.id; render(); window.scrollTo(0, 0); break;
    case 'plan-back': S.planArea = null; render(); window.scrollTo(0, 0); break;
    case 'step': { const i = +el.dataset.i; const steps = roadmapSteps(areaById(S.planArea)); const isOpen = S.openStep === null ? steps[i].state === 'now' : S.openStep === i; S.openStep = isOpen ? -1 : i; render(); break; }
    case 'new-in-step': taskSheet(null, { areaId: S.planArea, phase: el.dataset.phase }); break;
    case 'week': S.weekOffset = +el.dataset.d === 0 ? 0 : (S.weekOffset || 0) + +el.dataset.d; S.dayPick = null; render(); break;
    case 'day': S.dayPick = el.dataset.d; render(); break;
    case 'open-contacts': S.view = 'contacts'; render(); window.scrollTo(0, 0); break;
    case 'back-more': S.view = 'more'; render(); window.scrollTo(0, 0); break;
    case 'toggle': { const r = el.getBoundingClientRect(); toggleTask(el.dataset.id, r.left + r.width / 2, r.top + r.height / 2); break; }
    case 'edit': taskSheet(S.tasks.find((t) => t.id === el.dataset.id)); break;
    case 'new-task': taskSheet(null); break;
    case 'hide-banner': localStorage.setItem(el.dataset.key, '1'); render(); break;
    case 'goto-new': S.view = 'inbox'; S.inboxTab = 'new'; render(); window.scrollTo(0, 0); break;
    case 'inbox-tab': S.inboxTab = el.dataset.tab; render(); break;
    case 'accept-new': { const t = S.tasks.find((x) => x.id === el.dataset.id); if (t) store.updateTask(t.id, { isNew: false }, t).then(() => toast('Im Plan ✓')).catch((err) => toast(fail(err))); break; }
    case 'discard-new': { const t = S.tasks.find((x) => x.id === el.dataset.id); if (t) store.deleteTask(t.id).then(() => toast('Verworfen', { label: 'Rückgängig', fn: () => { const { id, ...rest } = t; store.addTask(rest); } })).catch((err) => toast(fail(err))); break; }
    case 'accept-all': for (const t of S.tasks.filter((x) => x.isNew && !x.done)) await store.updateTask(t.id, { isNew: false }, t).catch(() => {}); toast('Alles im Plan ✓'); break;
    case 'copy-address': copyText(S.project?.inboxAddress || '', 'Adresse kopiert'); break;
    case 'allow-sender': {
      const list = [...new Set([...(S.project?.inboxAllowed || []), el.dataset.from.toLowerCase()])];
      try { await store.updateProject({ inboxAllowed: list, inboxLastIgnored: null }); toast('Erlaubt ✓ Leite die Mail einfach noch einmal weiter.'); } catch (err) { toast(fail(err)); }
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
    case 'commit-import': commitImport(); break;
    case 'info-only':
      try { await saveInfoFromText(S.parsed); S.parsed = null; S.pasteText = ''; S.inboxTab = 'archive'; render(); toast('Abgelegt'); } catch (err) { toast(fail(err)); }
      break;
    case 'info-open': S.openInfo = S.openInfo === el.dataset.id ? null : el.dataset.id; render(); break;
    case 'info-reparse': { const x = S.infos.find((i) => i.id === el.dataset.id); S.inboxTab = 'paste'; S.saveInfo = false; if (S.ai) runParseAI(x.text); else runParse(x.text); break; }
    case 'info-delete': if (confirm('Diesen Eintrag löschen?')) store.deleteInfo(el.dataset.id).catch((err) => toast(fail(err))); break;
    case 'new-info': infoSheet(); break;
    case 'contact': contactSheet(contactById(el.dataset.id)); break;
    case 'new-contact': contactSheet(null); break;
    case 'compose-contact': composeSheet({ contact: contactById(el.dataset.id) }); break;
    case 'compose-task': { const t = S.tasks.find((x) => x.id === el.dataset.id); composeSheet({ task: t, contact: t?.contactId ? contactById(t.contactId) : null }); break; }
    case 'area-edit': areaSheet(areaById(el.dataset.id)); break;
    case 'area-new': areaSheet(null); break;
    case 'inbox-settings': inboxSheet(); break;
    case 'ai-settings': aiSheet(); break;
    case 'assess-all': {
      S.aiBusy = true; render();
      try { const n = await assessList(S.tasks); toast(n ? `${n} Fristen eingeschätzt` : 'Keine offenen Aufgaben mit Frist'); } catch (err) { toast(fail(err)); }
      S.aiBusy = false; render(); break;
    }
    case 'invite': inviteSheet(); break;
    case 'join': {
      const c = prompt('Einladungscode eingeben');
      if (c) store.joinProject(c).then(() => toast('Willkommen!')).catch((err) => toast(fail(err)));
      break;
    }
    case 'push': {
      if (store.mode !== 'cloud') { inviteSheet(); break; }
      if (isIOS && !standalone) { toast('Öffne Mindora zuerst über das Symbol auf dem Home-Bildschirm.'); break; }
      if (typeof Notification === 'undefined') { toast('Dieses Gerät unterstützt keine Push-Nachrichten (iPhone: ab iOS 16.4, vom Home-Bildschirm geöffnet).'); break; }
      // iOS zeigt die Abfrage nur, wenn sie direkt beim Antippen startet – also vor jedem „await“.
      const permP = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
      toast('Push-Nachrichten werden aktiviert …');
      try {
        const r = await store.enablePush(permP);
        const msg = { unsupported: 'Dieses Gerät unterstützt keine Push-Nachrichten im Browser (iPhone: ab iOS 16.4, vom Home-Bildschirm geöffnet).', denied: 'Nicht erlaubt. Ändern unter iPhone-Einstellungen → Mitteilungen → Mindora.', dismissed: 'Die Abfrage wurde geschlossen. Tippe noch einmal auf Aktivieren und wähle „Erlauben“.', novapid: 'In config.js fehlt der vapidKey (Schritt 2.6).', notoken: 'Push-Anmeldung fehlgeschlagen. Versuch es gleich noch einmal.' };
        toast(r.ok ? 'Push-Nachrichten sind aktiv 🔔' : msg[r.reason]);
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

app.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action]')) { e.preventDefault(); e.target.click(); }
});
function debounceSearch(key, stateKey) {
  return (el) => {
    S[stateKey] = el.value; clearTimeout(S.qT);
    S.qT = setTimeout(() => { const pos = el.selectionStart; el.blur(); render(); const n = app.querySelector(`[data-input="${key}"]`); n?.focus(); n?.setSelectionRange(pos, pos); }, 250);
  };
}
const searchInfo = debounceSearch('info-q', 'infoQuery');
const searchContact = debounceSearch('contact-q', 'contactQuery');
const searchTask = debounceSearch('task-q', 'taskQuery');
app.addEventListener('input', (e) => {
  const el = e.target; const k = el.dataset.input;
  if (k === 'paste') { S.pasteText = el.value; const b = app.querySelector('#parse-btn'); if (b) b.disabled = !el.value.trim(); }
  else if (k === 'info-q') searchInfo(el);
  else if (k === 'contact-q') searchContact(el);
  else if (k === 'task-q') searchTask(el);
  else if (k?.startsWith('found-')) {
    const t = S.parsed.tasks[+el.dataset.i];
    if (k === 'found-title') t.title = el.value;
    if (k === 'found-due') t.due = el.value || null;
    if (k === 'found-area') { t.areaId = el.value; t.phase = null; }
    if (k === 'found-lead') t.leadDays = el.value === '' ? null : Math.max(0, Math.min(120, parseInt(el.value, 10) || 0));
  }
});
app.addEventListener('change', (e) => {
  const el = e.target; const a = el.dataset.action;
  if (el.dataset.input === 'found-area') { const t = S.parsed.tasks[+el.dataset.i]; t.areaId = el.value; t.phase = null; }
  if (a === 'pick') { S.parsed.tasks[+el.dataset.i].selected = el.checked; el.closest('.found').classList.toggle('off', !el.checked); updateCommitBtn(); }
  else if (a === 'pick-contact') { S.parsed.contacts[+el.dataset.i].selected = el.checked; el.closest('.found').classList.toggle('off', !el.checked); updateCommitBtn(); }
  else if (a === 'save-info') S.saveInfo = el.checked;
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
      if (seed && !confirm(`Auf diesem Gerät gibt es ${seed.tasks.length} Aufgaben aus dem lokalen Modus. Übernehmen?`)) seed = null;
      await store.createProject(f.name.trim() || 'Unser Zuhause', seed);
      if (seed) localStorage.removeItem('hausplaner-v1');
    } else if (kind === 'join-setup') {
      await store.joinProject(f.code);
    }
  } catch (err) { S.authError = fail(err); btn.disabled = false; render(); }
});

// ================================================================== Start
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
  onAreas(list) { S.areas = list; render(); },
  onAi(cfg) { S.ai = cfg; render(); },
  onError(e) { toast(fail(e)); },
  onPush(n) { toast(`${n.title || 'Erinnerung'}${n.body ? ': ' + n.body : ''}`); },
}).catch((e) => { app.innerHTML = `<div class="boot">Start fehlgeschlagen: ${esc(fail(e))}<br><br>Prüfe die Internetverbindung und config.js.</div>`; });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
