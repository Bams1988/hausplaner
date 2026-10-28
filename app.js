import { createStore, computeRemindAt } from './store.js';
import { tr, LANG, LOC, setLang, startTranslator } from './i18n.js';
import { parseEmails, isoDate, similarity, guessPhase, extractDate } from './parser.js';
import {
  extractFromText, draftEmail, assessTasks, testConnection, urgencyOf, aiKeyOf, searchWithAI,
  STATUS, MODELS, DEFAULT_MODEL, DEFAULT_AREAS, HOUSE_PHASES,
} from './ai.js';
import { PLANS, PLAN_ORDER, planOf, fmtLimit, storageLabel } from './plans.js';
import * as native from './native.js';
const APP_VERSION = '15.1';
const CFG = self.HAUS_CONFIG || {};

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
  tasks: [], infos: [], contacts: [], areas: [], costs: [], comments: [], files: [], ai: null, aiBusy: false, costArea: 'all', docsArea: 'all', prevView: null,
  pasteText: '', parsed: null, saveInfo: true, openInfo: null, infoQuery: '', contactQuery: '', authTab: 'login', authError: '',
  pendingRender: false, usage: {},
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
const fmtDate = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => parseISO(s).toLocaleDateString(LOC(), o).replace(/\.$/, '');
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = native.isNative() || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isDesktop = () => window.matchMedia('(min-width: 900px) and (hover: hover)').matches;
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('MindSpace ist jetzt als Programm installiert ✨'); render(); });
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const members = () => S.project?.members || [];
const nameOf = (uid) => (S.project?.memberNames || {})[uid] || 'Unbekannt';
const initial = (uid) => nameOf(uid).trim().charAt(0).toUpperCase() || '?';
const myName = () => (S.me?.name && S.me.name !== 'Ich' ? S.me.name : '');
const aiCfg = () => {
  if (!S.ai) return null;
  // Mit Abo: KI läuft über den MindSpace-Server; ist das Kontingent aufgebraucht, erscheint die Abo-Auswahl
  if (S.ai.managed) return { proxy: (body, kind) => store.aiProxy(body, kind, !!S.project?.aiDeep).catch((e) => { if (e.code === 'quota') setTimeout(() => paywallSheet('ai'), 250); throw e; }) };
  return { apiKey: S.ai.apiKey, model: S.ai.model || DEFAULT_MODEL };
};
const contactById = (id) => S.contacts.find((c) => c.id === id) || null;
const norm = (s) => String(s || '').toLowerCase().replace(/\b(herr|frau|dr\.?|dipl\.?-?\w*)\s+/g, '').replace(/[^a-zäöüß]/g, '');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// --- Lebensbereiche
const DEF_AREAS = DEFAULT_AREAS.map((a) => ({ ...a, name: tr(a.name), phases: (a.phases || []).map(tr) }));
const fullAccess = () => store.mode !== 'cloud' || !Array.isArray(S.project?.access?.[S.me?.uid]);
// Abo: nur mit Server-Diensten (backend.enabled) – im bisherigen Betrieb gibt es keine Limits
const billing = () => store.mode === 'cloud' && !!store.backend;
const curPlan = () => (billing() ? (S.project?.plan || 'free') : null);
const lim = (k) => (billing() ? planOf(curPlan()).limits[k] : Infinity);
const ownProjects = () => S.areas.filter((a) => !DEFAULT_AREAS.some((d) => d.id === a.id)).length;
const scopeLabel = (sc) => (!Array.isArray(sc) ? 'Alle Projekte' : sc.map((id) => S.areas.find((a) => a.id === id)?.name || DEF_AREAS.find((a) => a.id === id)?.name || id).join(', ') || 'Keine Projekte');
const areas = () => (!fullAccess() ? [...S.areas].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)) : S.areas.length ? [...S.areas].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name, LANG)) : DEF_AREAS);
const areaById = (id) => areas().find((a) => a.id === id) || null;
function areaOf(t) {
  if (t.areaId) { const a = areaById(t.areaId); if (a) return a; }
  return areaById('hausbau') || areaById('alltag') || areas()[0]; // ältere Aufgaben stammen aus dem Hausbau
}
const phaseOf = (t) => (t.phase && t.phase !== 'Allgemein' ? t.phase : null);
async function ensureAreasStored() {
  if (S.areas.length || !fullAccess()) return;
  for (const a of DEFAULT_AREAS) { const { id, ...rest } = a; await store.setArea(id, { ...rest, name: tr(rest.name), phases: (rest.phases || []).map(tr) }); }
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
const fmtDateY = (s) => fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short', year: parseISO(s).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || (a.createdAt || 0) - (b.createdAt || 0);
const urgRank = (t) => { const u = urgencyOf(t); return u ? STATUS[u.status].rank : -1; };
const byUrgency = (a, b) => urgRank(b) - urgRank(a) || ((a.startBy || a.due || '9999').localeCompare(b.startBy || b.due || '9999')) || byDue(a, b);
const badge = (u) => (u && u.status !== 'im_plan' ? `<span class="badge s-${u.status}">${esc(STATUS[u.status].label)}</span>` : '');
// Ampel-Farben je Aufgabe: erledigt grün, heute gelb, überfällig rot, jetzt starten orange, im Plan blau, ohne Datum grau
function statusOf(t) {
  if (t.done) return 'done';
  if (!t.due) return 'none';
  const d = dayDiff(t.due);
  if (d < 0) return 'late';
  if (d === 0) return 'today';
  return urgRank(t) >= 2 ? 'start' : 'ok';
}
const ST_COLOR = { done: 'var(--st-done)', today: 'var(--st-today)', late: 'var(--st-late)', start: 'var(--st-start)', ok: 'var(--st-ok)', none: 'var(--st-none)' };
function legend() {
  return `<div class="legend" role="note" aria-label="Farblegende">${[['late', 'Überfällig'], ['today', 'Heute fällig'], ['start', 'Jetzt starten'], ['ok', 'Im Plan'], ['done', 'Erledigt']].map(([k, l]) => `<span><i style="background:${ST_COLOR[k]}"></i>${l}</span>`).join('')}</div>`;
}
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
  arrowUp: sv('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>', 22, 2.6),
  chevron: sv('<path d="m9 6 6 6-6 6"/>', 18, 2),
  mic: sv('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>', 20, 2),
  search: sv('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', 20, 2.2),
  lock: sv('<rect x="5" y="11" width="14" height="9.5" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 18, 2.2),
  camera: sv('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="12.8" r="3.4"/>', 20, 2),
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
  const views = { home: viewHome, tasks: viewTasks, plan: viewPlan, inbox: viewInbox, contacts: viewContacts, more: viewMore, costs: viewCosts, docs: viewDocs, search: viewSearch };
  if (!views[S.view]) S.view = 'home';
  const fab = ['home', 'tasks', 'plan'].includes(S.view) ? `<button class="fab" data-action="new-task" aria-label="Aufgabe anlegen">${I.plus}</button>`
    : S.view === 'contacts' ? `<button class="fab" data-action="new-contact" aria-label="Kontakt anlegen">${I.plus}</button>`
    : S.view === 'costs' ? `<button class="fab" data-action="cost-new" aria-label="Kosten erfassen">${I.plus}</button>` : '';
  app.innerHTML = views[S.view]() + tabbar() + fab;
}
const boot = () => '<div class="boot"><span class="boot-sun"></span>MindSpace wird geladen …</div>';
app.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender && !app.contains(document.activeElement)) render(); }, 50));

function tabbar() {
  const newN = S.tasks.filter((t) => t.isNew && !t.done).length;
  const tab = (id, label, icon, dot) => `<button data-action="tab" data-tab="${id}" ${S.view === id || (id === 'more' && ['contacts', 'costs', 'docs'].includes(S.view)) ? 'aria-current="page"' : ''}>${icon}${dot ? `<b class="tab-dot">${dot}</b>` : ''}<span>${label}</span></button>`;
  return `<nav class="tabbar"><div class="side-brand" aria-hidden="true"><img src="icons/logo.svg" alt="">MindSpace</div><button class="side-search" data-action="open-search" ${S.view === 'search' ? 'aria-current="page"' : ''}>${I.search}<span>Suchen</span><kbd>Ctrl K</kbd></button>${tab('home', 'Übersicht', I.today)}${tab('tasks', 'Aufgaben', I.list)}${tab('plan', 'Plan', I.plan)}${tab('inbox', 'Eingang', I.inbox, newN)}${tab('more', 'Mehr', I.more)}<button class="side-new" data-action="new-task">${I.plus}<span>Neue Aufgabe</span><kbd>N</kbd></button></nav>`;
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
  const weekEnd = addDays(today, 6);
  const sets = {
    heute: { label: 'Heute', items: open.filter((t) => t.due === today), empty: 'Heute ist nichts fällig.' },
    nachholen: { label: 'Überfällig', items: open.filter((t) => t.due && t.due < today), empty: 'Nichts überfällig. Sehr gut!' },
    starten: { label: 'Jetzt starten', items: open.filter((t) => !(t.due && t.due <= today) && urgRank(t) >= 2), empty: 'Nichts muss gerade angestoßen werden.' },
    woche: { label: '7 Tage', items: open.filter((t) => t.due && t.due > today && t.due <= weekEnd), empty: 'In den nächsten 7 Tagen ist nichts fällig.' },
  };
  if (!S.homeSet) S.homeSet = sets.nachholen.items.length || sets.heute.items.length ? (sets.heute.items.length ? 'heute' : 'nachholen') : sets.starten.items.length ? 'starten' : 'woche';
  const cur = sets[S.homeSet];
  const newOnes = open.filter((t) => t.isNew);
  const tone = { heute: 'brand', nachholen: 'coral', starten: 'sun', woche: 'ink' };

  let banner = '';
  if (isIOS && !standalone && !localStorage.getItem('hp-hide-install')) {
    banner = `<div class="note-card"><p><strong>Als App installieren:</strong> In Safari auf ${I.share} tippen, dann „Zum Home-Bildschirm“. Danach klappen auch Push-Nachrichten.</p><button class="x" data-action="hide-banner" data-key="hp-hide-install" aria-label="Hinweis schließen">×</button></div>`;
  }
  const gestureTip = S.tasks.length && !localStorage.getItem('hp-tip-gestures')
    ? `<div class="note-card tip"><p><strong>Tipp:</strong> Aufgabe nach <strong>rechts wischen</strong> = erledigt, nach <strong>links wischen</strong> = verschieben. <strong>Gedrückt halten</strong> und auf einen Tag ziehen = neues Datum.</p><button class="x" data-action="hide-banner" data-key="hp-tip-gestures" aria-label="Tipp schließen">×</button></div>` : '';

  const tiles = Object.entries(sets).map(([k, s]) => `
    <button class="tile t-${tone[k]} ${S.homeSet === k ? 'on' : ''}" data-action="home-set" data-k="${k}" aria-pressed="${S.homeSet === k}">
      <b>${s.items.length}</b><span>${s.label}</span>
    </button>`).join('');
  const list = cur.items.sort(byUrgency);
  const listHtml = list.length
    ? `<div class="list">${list.slice(0, 8).map((t) => row(t, { reason: true })).join('')}</div>${list.length > 8 ? `<button class="link" data-action="tab" data-tab="plan">Alle ${list.length} im Planer</button>` : ''}`
    : `<div class="calm">${sunArt()}<p>${esc(cur.empty)}</p></div>`;

  const projs = areas().map((a) => ({ a, s: areaStats(a) })).filter((x) => x.s.total);
  const projHtml = projs.length ? `<div class="proj-row">${projs.map(({ a, s }) => `
      <button class="proj-card" data-action="open-plan" data-id="${esc(a.id)}" style="--area:${esc(a.color)}">
        <div class="proj-top">${ring(s.pct, 48, 6, a.color)}<span class="proj-emoji">${esc(a.emoji)}</span></div>
        <strong>${esc(a.name)}</strong>
        <span>${s.open.length ? `${s.open.length} offen` : 'Alles erledigt ✓'}</span>
        ${s.next ? `<span class="proj-next">Nächste Frist: ${esc(fmtDate(s.next.due, { day: 'numeric', month: 'short' }))}</span>` : ''}
      </button>`).join('')}
      <button class="proj-card add" data-action="area-new"><span class="proj-plus">+</span><strong>Neues Projekt</strong><span>z. B. Urlaub, Auto</span></button></div>` : '';

  if (!standalone && !isIOS && window.matchMedia('(hover: hover)').matches && !localStorage.getItem('hp-hide-desktop')) {
    banner += `<div class="note-card install-card"><p><strong>MindSpace als Programm nutzen:</strong> eigenes Fenster, eigenes Symbol in der Taskleiste, startet wie jede App. ${installPrompt ? '' : esc(installHow())}</p>
      ${installPrompt ? '<button class="btn small" data-action="install">Jetzt installieren</button>' : ''}<button class="x" data-action="hide-banner" data-key="hp-hide-desktop" aria-label="Hinweis schließen">×</button></div>`;
  }
  return `<main class="view home-view">
    <header class="hello"><button class="head-btn" data-action="open-search" aria-label="Suchen">${I.search}</button><p class="hello-date">${esc(new Date().toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h1>${esc(greeting())}</h1></header>
    ${quickAdd()}
    ${banner}${gestureTip}
    ${assignCard()}
    ${newOnes.length ? `<button class="inbox-hint" data-action="goto-new">${I.inbox}<span><strong>${newOnes.length} ${newOnes.length === 1 ? 'neue Aufgabe' : 'neue Aufgaben'}</strong> aus E-Mails – kurz prüfen</span>${I.chevron}</button>` : ''}
    <div class="home-grid"><div class="hg-a">
    <div class="tiles" role="tablist" aria-label="Filter">${tiles}</div>
    ${legend()}
    <section class="card">
      <div class="card-head"><h2>${esc(cur.label === '7 Tage' ? 'Die nächsten 7 Tage' : cur.label)}</h2>
        ${S.homeSet === 'nachholen' && list.length ? `<button class="btn small secondary" data-action="all-today">Alle auf heute</button>` : ''}</div>
      ${listHtml}
    </section></div><div class="hg-b">
    <section class="card">
      <div class="card-head"><h2>Wochenblick</h2>
        <div class="week-nav"><button class="icon-sm" data-action="week" data-d="-1" aria-label="7 Tage zurück">‹</button><button class="icon-sm" data-action="week" data-d="1" aria-label="7 Tage weiter">›</button></div></div>
      ${weekChart()}
    </section>
    ${homeCosts()}
    </div></div>
    ${projHtml ? `<section class="card plain"><div class="card-head"><h2>Projekte</h2><button class="link" data-action="plan-mode" data-m="projekte">Alle</button></div>${projHtml}</section>` : ''}
    ${!S.tasks.length ? `<div class="btn-row" style="margin-top:16px"><button class="btn secondary" data-action="template">Checkliste Hausbau laden</button></div>` : ''}
  </main>`;
}

// ---------- Schnelleingabe (wie Todoist: „Bank anrufen morgen 10 Uhr #hausbau“)
function quickAdd() {
  return `<form class="quick" data-form="quick" autocomplete="off">
    <span class="quick-plus">${I.plus}</span>
    <input name="q" data-input="quick" placeholder="Neue Aufgabe, z. B. „Bank anrufen morgen 10 Uhr“" value="${esc(S.quick || '')}" enterkeyhint="done" aria-label="Neue Aufgabe">
    <button class="quick-go" type="submit" ${S.quick?.trim() ? '' : 'hidden'} aria-label="Hinzufügen">${I.arrowUp}</button>
    ${micButton(`data-action="voice" ${S.quick?.trim() ? 'hidden' : ''}`)}
    <div class="quick-preview" data-quick-preview>${quickPreview(S.quick || '')}</div>
  </form>`;
}
// Englische Schnelleingabe in die Wörter übersetzen, die die Datumserkennung versteht
const EN_DAYS = { monday: 'montag', tuesday: 'dienstag', wednesday: 'mittwoch', thursday: 'donnerstag', friday: 'freitag', saturday: 'samstag', sunday: 'sonntag' };
function enToDe(text) {
  let t = ` ${text} `;
  const R = (re, to) => { t = t.replace(re, to); };
  const D = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
  R(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, (m, h, mi, ap) => { let H = +h % 12; if (/pm/i.test(ap)) H += 12; return ` ${H}:${mi || '00'} uhr`; });
  R(/\sat\s+(\d{1,2}:\d{2})\b/gi, ' $1 uhr');
  R(/\sday after tomorrow\b/gi, ' übermorgen'); R(/\stomorrow\b/gi, ' morgen'); R(/\stoday\b/gi, ' heute');
  R(/\s(?:this|on the|at the)\s+weekend\b/gi, ' am wochenende'); R(/\snext week\b/gi, ' nächste woche'); R(/\sthis week\b/gi, ' diese woche');
  R(/\sin\s+(\d+|a|an|one|two|three)\s+(day|days|week|weeks|month|months)\b/gi, (m, n, u) => ` in ${({ a: 1, an: 1, one: 1, two: 2, three: 3 })[n.toLowerCase()] || n} ${/day/i.test(u) ? 'tagen' : /week/i.test(u) ? 'wochen' : 'monaten'}`);
  R(new RegExp(`\\severy\\s+${D}\\b`, 'gi'), (m, d) => ` jeden ${EN_DAYS[d.toLowerCase()]}`);
  R(/\s(?:every day|daily)\b/gi, ' täglich'); R(/\s(?:every weekday|weekdays)\b/gi, ' werktags');
  R(/\s(?:every other week|every 2 weeks|every two weeks|biweekly|fortnightly)\b/gi, ' alle 2 wochen');
  R(/\s(?:every week|weekly)\b/gi, ' wöchentlich'); R(/\s(?:every quarter|quarterly|every 3 months)\b/gi, ' vierteljährlich');
  R(/\s(?:every month|monthly)\b/gi, ' monatlich'); R(/\s(?:every year|yearly|annually)\b/gi, ' jährlich');
  R(new RegExp(`\\snext\\s+${D}\\b`, 'gi'), (m, d) => ` nächsten ${EN_DAYS[d.toLowerCase()]}`);
  R(new RegExp(`\\s(?:on|by)\\s+${D}\\b`, 'gi'), (m, d) => ` am ${EN_DAYS[d.toLowerCase()]}`);
  R(new RegExp(`\\s${D}\\b`, 'gi'), (m, d) => ` ${EN_DAYS[d.toLowerCase()]}`);
  R(/\s(?:by|on|due)(?=\s+(?:morgen|heute|übermorgen|am|nächsten)\b)/gi, '');
  return t.trim();
}
function parseQuick(text) {
  if (LANG === 'en') text = enToDe(text);
  const rp = takeRepeat(` ${text} `);
  let t = rp.text;
  let areaId = null;
  const tag = t.match(/\s#([^\s#]+)/);
  if (tag) {
    const k = norm(tag[1]);
    const a = areas().find((x) => norm(x.name).startsWith(k) || norm(x.id).startsWith(k));
    if (a) areaId = a.id;
    t = t.replace(tag[0], ' ');
  }
  // Ein einzelner Wochentag („Arzt Montag 10 Uhr“) ist in der Schnelleingabe immer ein Datum
  t = t.replace(/(?<!\b(?:am|bis|zum|nächsten|kommenden|diesen))\s(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)(?=\s)/gi, (_, w) => ` am ${w.toLowerCase()}`);
  const d = extractDate(t, new Date());
  if (d) {
    t = t.replace(/\s(?:bis\s+(?:zum\s+)?|am\s+|ab\s+|um\s+)?(?:\d{1,2}\.\d{1,2}\.(?:\d{2,4})?)/gi, ' ')
      .replace(/\s(?:am\s+|bis\s+)?(?:nächsten\s+|kommenden\s+)?(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/gi, ' ')
      .replace(/\s(?:bis\s+)?(?:heute|morgen|übermorgen)\b/gi, ' ')
      .replace(/\s(?:in|innerhalb von)\s+(?:\d+|einer|einem|zwei|drei|vier)\s+(?:tag|tagen|woche|wochen|monat|monaten)\b/gi, ' ')
      .replace(/\s(?:bis\s+)?(?:nächste|nächsten|kommende|kommenden|diese|dieser)\s+woche\b/gi, ' ')
      .replace(/\s(?:um\s+)?\d{1,2}(?::\d{2})?\s*uhr\b/gi, ' ')
      .replace(/\s(?:um\s+)?\d{1,2}:\d{2}\b/g, ' ');
  }
  const title = t.replace(/\s+/g, ' ').trim();
  let phase = null;
  if (!areaId) {
    const g = guessPhase(title);
    if (g !== 'Allgemein' && areaById('hausbau')) { areaId = 'hausbau'; const hp = areaById('hausbau').phases || []; phase = hp.includes(g) ? g : hp.includes(tr(g)) ? tr(g) : null; }
  }
  const due = d?.date || (rp.repeat ? firstRepeatDue(rp.repeat) : null);
  return { title: title.charAt(0).toUpperCase() + title.slice(1), due, time: d?.time || null, areaId: areaId || (areaById('alltag') ? 'alltag' : areas()[0].id), phase, repeat: rp.repeat };
}
function quickPreview(text) {
  if (!text.trim()) return '';
  const q = parseQuick(text);
  const a = areaById(q.areaId);
  return `<span class="qp">📅 ${q.due ? esc(fmtDate(q.due)) : 'ohne Datum'}</span>${q.time ? `<span class="qp">⏰ ${esc(q.time)}</span>` : ''}${q.repeat ? `<span class="qp">↻ ${esc(REPEAT_SHORT[q.repeat])}</span>` : ''}<span class="qp" style="--area:${esc(a.color)}">${esc(a.emoji)} ${esc(a.name)}</span><span class="qp hint-q">#bereich ändert den Bereich</span>`;
}
async function submitQuick(text) {
  const q = parseQuick(text);
  if (!q.title) return;
  try {
    if (!S.areas.length) await ensureAreasStored();
    const ex = findSimilar(q.title, 0.8);
    if (ex) {
      await bundleInto(ex, { text: `✍️ ${text.trim()}`, due: q.due, time: q.time });
      S.quick = ''; render();
      toast(`Gibt es schon – zu „${ex.title}“ hinzugefügt`, { label: 'Doch neu', fn: () => store.addTask({ title: q.title, due: q.due, time: q.time, areaId: q.areaId, phase: q.phase, repeat: q.repeat || null, reminder: !q.due ? 'none' : 'day0', notes: '', source: 'quick' }) });
      return;
    }
    await store.addTask({ title: q.title, due: q.due, time: q.time, areaId: q.areaId, phase: q.phase, repeat: q.repeat || null, repeatDay: q.repeat && q.due ? parseISO(q.due).getDate() : null, reminder: !q.due ? 'none' : q.time ? 'hour1' : dayDiff(q.due) <= 1 ? 'day0' : 'day1', notes: '', source: 'quick' });
    S.quick = '';
    if (q.due) S.dayPick = q.due;
    render();
    toast(`Angelegt${q.due ? ` für ${fmtDate(q.due)}` : ''} ✓`);
    app.querySelector('[data-input="quick"]')?.focus();
  } catch (e) { toast(fail(e)); }
}

function nextDueText(open) {
  const n = open.filter((t) => t.due).sort(byDue)[0];
  return n ? `${n.title} am ${fmtDate(n.due)}` : 'keine';
}

// Wochenblick: 7 Tage, je Tag ein Balken. Tippen = Tag zeigen, Aufgaben hierher ziehen = verschieben.
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
  const cols = per.map((p) => {
    const dt = parseISO(p.d);
    const n = p.open.length + p.done.length;
    const segs = [...p.done.map(() => ST_COLOR.done), ...p.open.map((t) => ST_COLOR[statusOf(t)])];
    return `<button class="wk-col ${p.d === today ? 'is-today' : ''} ${p.d === S.dayPick ? 'is-sel' : ''}" data-action="day" data-d="${p.d}" data-drop-day="${p.d}" aria-label="${esc(fmtDate(p.d, { weekday: 'long', day: 'numeric', month: 'long' }))}: ${p.open.length} offen, ${p.done.length} erledigt">
      <span class="wk-bar">${segs.map((c) => `<i style="background:${c};height:${100 / max}%"></i>`).join('')}</span>
      <span class="wk-n">${n || ''}</span>
      <span class="wk-d">${esc(dt.toLocaleDateString(LOC(), { weekday: 'short' }).replace('.', ''))}</span>
      <span class="wk-num">${dt.getDate()}</span>
    </button>`;
  }).join('');
  const sel = per.find((p) => p.d === S.dayPick);
  const selList = [...sel.open.sort(byDue), ...sel.done];
  return `<div class="wk">${cols}</div>
    <h3 class="wk-day">${esc(fmtDate(S.dayPick, { weekday: 'long', day: 'numeric', month: 'long' }))}${S.weekOffset ? ` · <button class="link inline" data-action="week" data-d="0">Zurück zu heute</button>` : ''}</h3>
    ${selList.length ? `<div class="list">${selList.map((t) => row(t)).join('')}</div>` : ''}
    <button class="add-line" data-action="new-on-day" data-d="${S.dayPick}">${I.plus} Aufgabe für diesen Tag</button>`;
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
    <header class="page-head with-btn"><h1>Aufgaben</h1><button class="head-btn" data-action="open-search" aria-label="Suchen">${I.search}</button></header>
    <div class="seg" role="group" aria-label="Ansicht">
      <button data-action="filter" data-filter="open" aria-pressed="${S.filter === 'open'}">Offen</button>
      <button data-action="filter" data-filter="done" aria-pressed="${S.filter === 'done'}">Erledigt</button>
    </div>
    ${S.tasks.length > 8 ? `<input class="input" type="search" data-input="task-q" value="${esc(S.taskQuery || '')}" placeholder="Aufgaben durchsuchen" style="margin-bottom:10px" aria-label="Aufgaben durchsuchen">` : ''}
    ${areaChips(S.area, 'area', true)}
    ${S.tasks.length ? legend() : ''}
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
  if (due && !opt.noDate) meta.push(`<span class="${due.late ? 'late' : ''}">${esc(due.text)}</span>`);
  else if (opt.noDate && t.time) meta.push(`<span>${esc(t.time)} Uhr</span>`);
  if (!opt.inPlan) meta.push(`<span class="area-tag" style="--area:${esc(a.color)}">${esc(a.emoji)} ${esc(phaseOf(t) || a.name)}</span>`);
  const c = t.contactId ? contactById(t.contactId) : null;
  if (c && !opt.reason) meta.push(`<span>${esc(c.name)}</span>`);
  if (t.repeat && !t.done) meta.push(`<span class="rep">↻ ${esc(REPEAT_SHORT[t.repeat] || '')}</span>`);
  const nc = counts().c.get(t.id), nf = counts().f.get(t.id);
  if (nc) meta.push(`<span class="ico-n" aria-label="${nc} Kommentare">💬 ${nc}</span>`);
  if (nf) meta.push(`<span class="ico-n" aria-label="${nf} Dateien">📎 ${nf}</span>`);
  if (t.done && t.doneBy && members().length > 1) meta.push(`<span>✓ ${esc(whoName(t.doneBy))}</span>`);
  const why = opt.reason && u && u.status !== 'im_plan' && (u.next || u.reason) ? `<div class="row-why">${esc(u.next || u.reason)}</div>` : '';
  const who = members().length > 1 && t.assignee && t.assignee !== 'all' ? `<span class="who ${t.assignAck === false ? 'wait' : ''}" title="${esc(nameOf(t.assignee))}${t.assignAck === false ? ' – noch nicht bestätigt' : ''}">${esc(initial(t.assignee))}</span>` : '';
  return `<div class="row st-${statusOf(t)} ${t.done ? 'done' : ''}" data-tid="${esc(t.id)}" style="--area:${esc(a.color)};--st:${ST_COLOR[statusOf(t)]}">
    <button class="check" data-action="toggle" data-id="${esc(t.id)}" aria-label="${t.done ? 'Wieder öffnen' : 'Als erledigt markieren'}: ${esc(t.title)}">${I.check}</button>
    <button class="row-main" data-action="edit" data-id="${esc(t.id)}">
      <div class="row-title" translate="no">${t.isNew && !t.done ? '<b class="new-dot" title="Neu aus E-Mail"></b>' : ''}${esc(t.title)}</div>
      <div class="row-meta">${meta.join('')}</div>${why}
    </button>${who}</div>`;
}

// ================================================================== Planer
// Aufbau nach dem Vorbild der bekanntesten Planer-Apps:
//  • Woche  – Wochenleiste oben, darunter jeder Tag als Abschnitt (Todoist „Demnächst“)
//  • Monat  – Monatskalender mit Punkten je Aufgabe (TickTick)
//  • Projekte – Projekte mit Abschnitten und Fortschritt (Things 3)
function viewPlan() {
  const mode = S.planMode || 'woche';
  if (mode === 'projekte' && S.planArea && areaById(S.planArea)) return viewRoadmap(areaById(S.planArea));
  const seg = `<div class="seg" role="tablist" aria-label="Ansicht">
    ${[['woche', '7 Tage'], ['monat', 'Monat'], ['projekte', 'Projekte']].map(([k, l]) => `<button data-action="plan-mode" data-m="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>`;
  const body = mode === 'monat' ? planMonth() : mode === 'projekte' ? planProjects() : planWeek();
  return `<main class="view">
    <header class="page-head with-btn"><h1>Planer</h1><button class="head-btn" data-action="open-search" aria-label="Suchen">${I.search}</button></header>
    ${seg}${mode !== 'projekte' ? legend() : ''}${body}</main>`;
}

// ---------- Woche
function planWeek() {
  const today = todayISO();
  const base = parseISO(today); base.setDate(base.getDate() + 7 * (S.planWeek || 0)); // rollierend: ab heute 7 Tage
  const days = [...Array(7)].map((_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return isoDate(d); });
  const open = S.tasks.filter((t) => !t.done);
  const late = S.planWeek ? [] : open.filter((t) => t.due && t.due < today).sort(byDue);
  const monthLabel = parseISO(days[3]).toLocaleDateString(LOC(), { month: 'long', year: 'numeric' });
  const strip = days.map((d) => {
    const dt = parseISO(d);
    const items = S.tasks.filter((t) => t.due === d);
    const dots = items.filter((t) => !t.done).slice(0, 3).map((t) => `<i style="background:${ST_COLOR[statusOf(t)]}"></i>`).join('');
    return `<button class="ws-day ${d === today ? 'is-today' : ''}" data-action="goto-day" data-d="${d}" data-drop-day="${d}" aria-label="${esc(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }))}, ${items.length} Aufgaben">
      <span>${esc(dt.toLocaleDateString(LOC(), { weekday: 'short' }).replace('.', ''))}</span><b>${dt.getDate()}</b><em>${dots}</em></button>`;
  }).join('');
  const sections = days.map((d) => {
    const items = S.tasks.filter((t) => t.due === d).sort((a, b) => (a.done - b.done) || byDue(a, b));
    const diff = dayDiff(d);
    const rel = diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : diff === -1 ? 'Gestern' : '';
    return `<section class="day-sec" id="day-${d}" data-drop-day="${d}">
      <h2 class="day-h ${diff === 0 ? 'is-today' : ''}"><span>${esc(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' }))}</span>${rel ? `<em>${rel}</em>` : ''}</h2>
      ${items.length ? `<div class="list">${items.map((t) => row(t, { noDate: true })).join('')}</div>` : ''}
      <button class="add-line" data-action="new-on-day" data-d="${d}">${I.plus} Aufgabe hinzufügen</button>
    </section>`;
  }).join('');
  const nodate = !S.planWeek ? open.filter((t) => !t.due) : [];
  return `<div class="ws">
      <div class="ws-head"><strong>${esc(monthLabel)}</strong>
        <div class="week-nav">${S.planWeek ? '<button class="link inline" data-action="pweek" data-d="0">Heute</button>' : ''}<button class="icon-sm" data-action="pweek" data-d="-1" aria-label="7 Tage zurück">‹</button><button class="icon-sm" data-action="pweek" data-d="1" aria-label="7 Tage weiter">›</button></div></div>
      <div class="ws-strip">${strip}</div>
    </div>
    ${late.length ? `<section class="day-sec late-sec">
      <h2 class="day-h"><span>Überfällig</span><button class="btn small secondary" data-action="all-today">Alle auf heute</button></h2>
      <div class="list">${late.map((t) => row(t)).join('')}</div></section>` : ''}
    ${sections}
    ${nodate.length ? `<section class="day-sec"><h2 class="day-h"><span>Ohne Datum</span><em>${nodate.length}</em></h2><div class="list">${nodate.sort(byDue).map((t) => row(t)).join('')}</div></section>` : ''}
    <p class="hint center">Aufgabe gedrückt halten und auf einen Tag oben ziehen, um sie zu verschieben.</p>`;
}

// ---------- Monat
function planMonth() {
  const today = todayISO();
  const ref = parseISO(today); ref.setDate(1); ref.setMonth(ref.getMonth() + (S.planMonth || 0));
  const y = ref.getFullYear(), m = ref.getMonth();
  const first = new Date(y, m, 1); const startOff = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m + 1, 0).getDate();
  if (!S.monthPick || parseISO(S.monthPick).getMonth() !== m || parseISO(S.monthPick).getFullYear() !== y) S.monthPick = (S.planMonth ? isoDate(first) : today);
  const cells = [];
  for (let i = 0; i < startOff; i++) cells.push('<span class="mc empty"></span>');
  for (let d = 1; d <= daysIn; d++) {
    const iso = isoDate(new Date(y, m, d));
    const items = S.tasks.filter((t) => t.due === iso);
    const openI = items.filter((t) => !t.done);
    const late = openI.some((t) => iso < today);
    const dots = openI.slice(0, 4).map((t) => `<i style="background:${ST_COLOR[statusOf(t)]}"></i>`).join('') + (openI.length > 4 ? '<i class="more"></i>' : '');
    cells.push(`<button class="mc ${iso === today ? 'is-today' : ''} ${iso === S.monthPick ? 'is-sel' : ''} ${late ? 'is-late' : ''} ${items.length && !openI.length ? 'all-done' : ''}" data-action="month-day" data-d="${iso}" data-drop-day="${iso}" aria-label="${esc(fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }))}, ${openI.length} offen">
      <b>${d}</b><em>${dots}</em>
      <span class="mc-t">${openI.sort(byDue).slice(0, 3).map((t) => `<i style="--area:${ST_COLOR[statusOf(t)]}">${esc(t.title)}</i>`).join('')}${openI.length > 3 ? `<i class="more">+${openI.length - 3} weitere</i>` : ''}</span></button>`);
  }
  const sel = S.tasks.filter((t) => t.due === S.monthPick).sort((a, b) => (a.done - b.done) || byDue(a, b));
  const monthOpen = S.tasks.filter((t) => !t.done && t.due && t.due.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).length;
  return `<div class="mcal">
      <div class="ws-head"><strong>${esc(first.toLocaleDateString(LOC(), { month: 'long', year: 'numeric' }))}</strong>
        <div class="week-nav">${S.planMonth ? '<button class="link inline" data-action="pmonth" data-d="0">Heute</button>' : ''}<button class="icon-sm" data-action="pmonth" data-d="-1" aria-label="Voriger Monat">‹</button><button class="icon-sm" data-action="pmonth" data-d="1" aria-label="Nächster Monat">›</button></div></div>
      <div class="mc-head">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="mc-grid">${cells.join('')}</div>
      <p class="mc-sum">${monthOpen ? `${monthOpen} offene Fristen in diesem Monat` : 'In diesem Monat ist nichts offen.'}</p>
    </div>
    <section class="day-sec" data-drop-day="${S.monthPick}">
      <h2 class="day-h"><span>${esc(fmtDate(S.monthPick, { weekday: 'long', day: 'numeric', month: 'long' }))}</span>${dayDiff(S.monthPick) === 0 ? '<em>Heute</em>' : ''}</h2>
      ${sel.length ? `<div class="list">${sel.map((t) => row(t, { noDate: true })).join('')}</div>` : ''}
      <button class="add-line" data-action="new-on-day" data-d="${S.monthPick}">${I.plus} Aufgabe für diesen Tag</button>
    </section>`;
}

// ---------- Projekte
function planProjects() {
  const projs = areas().map((a) => ({ a, s: areaStats(a) }));
  const active = projs.filter((x) => x.s.total);
  const empty = projs.filter((x) => !x.s.total);
  const cards = active.map(({ a, s }) => {
    const steps = roadmapSteps(a);
    const cur = steps.find((x) => x.state === 'now');
    return `<button class="plan-card" data-action="open-plan" data-id="${esc(a.id)}" style="--area:${esc(a.color)}">
      <div class="plan-card-top">${ring(s.pct, 60, 8, a.color)}
        <div class="plan-card-t"><strong>${esc(a.emoji)} ${esc(a.name)}</strong>
          <span>${s.done} von ${s.total} erledigt${s.end ? ` · fertig ca. ${esc(fmtDate(s.end, { day: 'numeric', month: 'short' }))}` : ''}</span></div>${I.chevron}</div>
      ${a.phases?.length ? `<div class="mini-steps" aria-hidden="true">${steps.map((st) => `<i class="ms-${st.state}"></i>`).join('')}</div>
        <span class="plan-card-now">${cur ? `Gerade dran: <strong>${esc(cur.name)}</strong>` : 'Alle Abschnitte erledigt ✓'}</span>` : ''}
      ${s.next ? `<span class="plan-card-next">${I.flag} ${esc(s.next.title)} · ${esc(fmtDate(s.next.due, { day: 'numeric', month: 'short' }))}</span>` : ''}
    </button>`;
  }).join('');
  return `${cards || `<div class="empty">${sunArt()}<strong>Noch keine Projekte</strong>Lege Aufgaben an – hier entsteht dann dein Plan.</div>`}
    <button class="add-line big" data-action="area-new">${I.plus} Neues Projekt / Lebensbereich</button>
    ${empty.length ? `<p class="hint">Noch ohne Aufgaben: ${empty.map(({ a }) => `${esc(a.emoji)} ${esc(a.name)}`).join(', ')}</p>` : ''}`;
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
    ${roadmapLinks(a)}
    <h2 class="section-title">${a.phases?.length ? 'Schritt für Schritt' : 'Nach Monaten'}</h2>
    <ol class="roadmap">${items}</ol>
    <p class="hint">Tippe auf einen Abschnitt, um seine Aufgaben zu sehen. ${a.phases?.length ? 'Abschnitte änderst du unter Mehr → Lebensbereiche.' : 'Ohne eigene Abschnitte ordnet MindSpace nach Monaten. Abschnitte legst du unter Mehr → Lebensbereiche an.'}</p>
  </main>`;
}

function roadmapLinks(a) {
  const cs = costStats(a.id);
  const nf = S.files.filter((f) => fileArea(f) === a.id).length;
  const showCosts = cs.list.length || cs.budget || a.id === 'hausbau';
  return `<div class="rm-links">
    ${showCosts ? `<button class="rm-link" data-action="open-costs" data-area="${esc(a.id)}"><span class="rm-ico">💶</span><span><strong>Kosten</strong><small>${cs.list.length ? `${esc(eur(cs.paid))} von ${esc(eur(cs.planned))} bezahlt` : 'Zahlungsplan & Budget'}</small></span>${I.chevron}</button>` : ''}
    <button class="rm-link" data-action="open-docs" data-area="${esc(a.id)}"><span class="rm-ico">📷</span><span><strong>Fotos & Dokumente</strong><small>${nf ? `${nf} ${nf === 1 ? 'Datei' : 'Dateien'}` : a.id === 'hausbau' ? 'Baufortschritt, Rechnungen, Protokolle' : 'Belege und Unterlagen'}</small></span>${I.chevron}</button>
  </div>`;
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
  const addr = inboxAddr();
  if (billing() && !addr) return fullAccess() && mailDomainReady() ?`<div class="note-card"><p><strong>E-Mails weiterleiten:</strong> MindSpace gibt euch eine eigene Adresse. Alles, was ihr dorthin weiterleitet, liest die KI – samt Anhängen – und legt Aufgaben, Zahlungen und Kontakte an.</p><button class="btn small" data-action="inbox-create" style="margin-top:10px">Adresse anlegen</button></div>` : '';
  if (store.mode !== 'cloud') return `<div class="note-card"><p><strong>E-Mails weiterleiten</strong> geht, sobald die Cloud eingerichtet ist (Anleitung, Stufe 2 und 5). Bis dahin: Text unter „Einfügen“ hineinkopieren.</p></div>`;
  if (!addr) return `<div class="note-card"><p><strong>Tipp:</strong> Mit einem eigenen MindSpace-Postfach leitest du E-Mails einfach weiter – die KI legt die Aufgaben dann von selbst an. Einrichtung: Anleitung, Stufe 5.</p></div>`;
  const fast = billing() || p.inboxSource === 'gmail-script';
  const last = p.inboxCheckedAt ? Math.round((Date.now() - p.inboxCheckedAt) / 60000) : null;
  const stale = last != null && last > (fast ? 20 : 90);
  const ign = p.inboxLastIgnored && Date.now() - p.inboxLastIgnored.at < 3 * 864e5 && !(p.inboxAllowed || []).includes(p.inboxLastIgnored.from) ? p.inboxLastIgnored : null;
  return `<div class="address-card">
    <p>Leite E-Mails weiter an</p>
    <button class="address" data-action="copy-address">${esc(addr)} ${I.copy}</button>
    <small>${billing() ? `Kommt sofort an · ${S.usage?.mails || 0} von ${fmtLimit(lim('mails'))} E-Mails diesen Monat` : stale ? 'Längere Zeit nicht abgerufen – siehe Anleitung, falls das so bleibt.' : last == null ? (fast ? 'Wird jede Minute abgerufen.' : 'Wird alle 15 Minuten abgerufen.') : last < 2 ? 'Gerade eben abgerufen' + (fast ? ' – jede Minute aktuell.' : '.') : `Zuletzt vor ${last} Min. abgerufen.`}</small>
  </div>
  ${ign ? `<div class="note-card"><p><strong>Nicht gelesen:</strong> „${esc(ign.subject)}“ von ${esc(ign.from)}. MindSpace liest nur Mails von euren eigenen Adressen und von erlaubten Absendern.</p>
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
        <div class="info-head"><span class="info-title">${x.kind === 'mail-auto' ? '📬 ' : ''}${esc(x.title || 'Ohne Betreff')}</span><span class="info-date">${esc(x.date ? fmtDate(x.date, { day: 'numeric', month: 'short', year: '2-digit' }) : new Date(x.createdAt).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' }))}</span></div>
        ${x.from ? `<div class="info-from">${esc(x.from)}</div>` : ''}
        ${x.attachments?.length ? `<div class="info-att">📎 ${x.attachments.map((f) => `<span class="${f.read ? 'ok' : ''}" translate="no">${esc(f.name)}</span>`).join('')}</div>` : ''}
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
    const psel = (p.payments || []).filter((x) => x.selected).length;
    const payHtml = p.payments?.length ? `<div class="group-head"><h2>${p.payments.length} ${p.payments.length === 1 ? 'Zahlung' : 'Zahlungen'}</h2></div>
      <p class="hint">Landet unter Kosten – mit Erinnerung vor dem Fälligkeitstag.</p>${p.payments.map((x, i) => foundPayment(x, i)).join('')}` : '';
    const contactsHtml = p.contacts?.length ? `<div class="group-head"><h2>${p.contacts.length} ${p.contacts.length === 1 ? 'Kontakt' : 'Kontakte'}</h2></div>${p.contacts.map((c, i) => foundContact(c, i)).join('')}` : '';
    results = p.tasks.length || p.contacts?.length || p.payments?.length ? `
      ${p.ai && p.summary ? `<div class="ai-note">${I.spark}<span>${esc(p.summary)}</span></div>` : ''}
      <div class="group-head"><h2>${p.tasks.length} ${p.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} gefunden</h2></div>
      <p class="hint">${p.ai ? 'Vorschläge der KI. Passe an, was nicht stimmt, und wähle ab, was du nicht brauchst.' : 'Häkchen setzen, Text und Datum bei Bedarf anpassen.'}</p>
      ${p.tasks.map((t, i) => foundItem(t, i)).join('')}
      ${payHtml}
      ${contactsHtml}
      <label class="opt"><input type="checkbox" data-action="save-info" ${S.saveInfo ? 'checked' : ''}> E-Mail zusätzlich in der Ablage speichern</label>
      <div class="sticky-action"><button class="btn block" data-action="commit-import" id="commit-btn" ${sel || csel || psel ? '' : 'disabled'}>${commitLabel(sel, csel, psel)}</button></div>`
      : `<div class="empty"><strong>Keine Aufgaben erkannt</strong>In diesem Text steht nichts, was nach einer Bitte oder Frist klingt.<br><br>
         <button class="btn secondary small" data-action="new-task">Selbst anlegen</button>
         <button class="btn ghost small" data-action="info-only">Nur ablegen</button></div>`;
  }
  const has = S.pasteText.trim();
  const mainBtn = S.ai
    ? `<button class="btn block" style="margin-top:14px" data-action="parse-ai" ${has && !S.aiBusy ? '' : 'disabled'} id="parse-btn">${S.aiBusy ? '<span class="spin"></span> MindSpace liest mit …' : `${I.spark} Mit KI auswerten`}</button>
       <button class="link center" data-action="parse" ${S.aiBusy ? 'disabled' : ''}>Ohne KI auswerten</button>`
    : `<button class="btn block" style="margin-top:14px" data-action="parse" ${has ? '' : 'disabled'} id="parse-btn">Aufgaben finden</button>
       <p class="hint">Mit dem KI-Assistenten (Mehr → KI-Assistent) erkennt MindSpace auch Ansprechpartner, schätzt Vorlaufzeiten und versteht frei formulierte Texte.</p>`;
  return `<p class="hint" style="margin-top:0">Kopiere eine E-Mail, einen Verlauf oder einen Text aus einer anderen App hier hinein.</p>
    <textarea class="paste" id="paste" data-input="paste" placeholder="Hier einfügen …">${esc(S.pasteText)}</textarea>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn secondary small" data-action="clip">Aus Zwischenablage</button>
      <label class="btn secondary small" style="position:relative">Screenshot lesen<input type="file" accept="image/*" data-action="ocr" style="position:absolute;inset:0;opacity:0"></label>
      ${S.pasteText ? '<button class="btn ghost small" data-action="clear-paste">Leeren</button>' : ''}
    </div>
    ${mainBtn}${results}`;
}
function commitLabel(n, c = 0, z = 0) {
  if (!n && !c && !z) return 'Nichts ausgewählt';
  const parts = [];
  if (n) parts.push(`${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'}`);
  if (z) parts.push(`${z} ${z === 1 ? 'Zahlung' : 'Zahlungen'}`);
  if (c) parts.push(`${c} ${c === 1 ? 'Kontakt' : 'Kontakte'}`);
  return (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' und ' + parts[parts.length - 1] : parts[0]) + ' übernehmen';
}
function foundPayment(x, i) {
  return `<div class="found ${x.selected ? '' : 'off'}">
    <input type="checkbox" data-action="pick-pay" data-i="${i}" ${x.selected ? 'checked' : ''} aria-label="Zahlung übernehmen">
    <div class="found-body">
      <input class="found-title one" data-input="pay-title" data-i="${i}" value="${esc(x.title)}" aria-label="Wofür">
      <div class="found-line">
        <label class="mini">€ <input class="amt-in" inputmode="decimal" data-input="pay-amount" data-i="${i}" value="${esc(eurInput(x.amount))}" aria-label="Betrag"></label>
        <input type="date" data-input="pay-due" data-i="${i}" value="${esc(x.due || '')}" aria-label="Fällig am">
        <span class="found-src" style="margin:0">${esc(kindName(x.kind))}${x.payee ? ` · an ${esc(x.payee)}` : ''}</span>
      </div>
      ${x.existing ? `<div class="found-warn">Gibt es schon unter Kosten: „${esc(x.existing)}“</div>` : ''}
    </div></div>`;
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
      ${t.bundleTitle ? `<label class="bundle-opt"><input type="checkbox" data-action="pick-bundle" data-i="${i}" ${t.bundle ? 'checked' : ''}> ↺ Mit „${esc(t.bundleTitle)}“ bündeln statt neu anlegen</label>` : ''}
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
  if (native.isNative()) return localStorage.getItem('hausplaner-push-token') ? { on: true, text: 'Aktiv auf diesem Gerät' } : { on: false, text: 'Noch nicht aktiviert' };
  if (typeof Notification === 'undefined') return { on: false, text: isIOS && !standalone ? 'Erst zum Home-Bildschirm hinzufügen' : 'Auf diesem Gerät nicht verfügbar' };
  if (Notification.permission === 'denied') return { on: false, text: isIOS ? 'Abgelehnt – in den iPhone-Einstellungen erlauben' : 'Abgelehnt – im Browser beim Schloss-Symbol neben der Adresse erlauben' };
  if (Notification.permission === 'granted' && localStorage.getItem('hausplaner-push-token')) return { on: true, text: 'Aktiv auf diesem Gerät' };
  return { on: false, text: 'Noch nicht aktiviert' };
}
// ---------- Design (hell / dunkel / automatisch)
function themePref() { try { return localStorage.getItem('ms-theme') || 'auto'; } catch { return 'auto'; } }
function applyTheme(pref = themePref()) {
  const root = document.documentElement;
  if (pref === 'auto') delete root.dataset.theme; else root.dataset.theme = pref;
  const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute('content', dark ? '#0F1513' : '#F3F7F4'); m.removeAttribute('media'); });
}
function installHow() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'In Edge: oben rechts auf „…“ → „Apps“ → „Diese Website als App installieren“.';
  if (/Chrome\//.test(ua)) return 'In Chrome: rechts in der Adresszeile auf das Symbol „Installieren“ klicken (Bildschirm mit Pfeil) oder Menü ⋮ → „Streamen, speichern und teilen“ → „Seite als App installieren“.';
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return 'In Safari auf dem Mac: Menü „Ablage“ → „Zum Dock hinzufügen“.';
  if (/Firefox\//.test(ua)) return 'Firefox kann keine Web-Apps installieren – öffne MindSpace dafür in Edge oder Chrome.';
  return 'Öffne MindSpace in Edge oder Chrome und wähle dort „App installieren“.';
}
function viewMore() {
  const cloud = store.mode === 'cloud';
  const ps = pushState();
  const open = new Map(); for (const t of S.tasks) if (!t.done) open.set(areaOf(t).id, (open.get(areaOf(t).id) || 0) + 1);
  const full = fullAccess();
  const mem = members().map((u) => {
    const sc = S.project?.access?.[u];
    const inner = `<span class="who">${esc(initial(u))}</span><span class="grow">${esc(nameOf(u))}${u === S.me?.uid ? ' <span class="muted">(du)</span>' : ''}<small>${esc(scopeLabel(sc))}</small></span>`;
    return full && u !== S.me?.uid ? `<button class="setting" data-action="member" data-id="${esc(u)}">${inner}${I.chevron}</button>` : `<div class="setting">${inner}</div>`;
  }).join('');
  const modelName = S.ai?.model ? (MODELS.find((m) => m[0] === S.ai.model) || [0, String(S.ai.model)])[1].split(' – ')[0] : S.ai?.apiKey ? MODELS[0][1].split(' – ')[0] : '';
  return `<main class="view">
    <header class="page-head"><h1>Mehr</h1></header>
    ${billing() ? planCard() : ''}
    ${CFG.backend?.beta && store.mode === 'cloud' ? `<div class="settings" style="margin-bottom:14px"><button class="setting" data-action="feedback"><span class="area-dot" style="--area:#8E7CE0">🧪</span><span class="grow">Feedback zur Testversion<small>Fehler, Ideen, Wünsche – direkt an das MindSpace-Team</small></span>${I.chevron}</button></div>` : ''}
    ${cloud ? '' : `<div class="note-card"><p><strong>Lokaler Modus.</strong> Alles bleibt auf diesem Gerät. Für Teilen, Push-Nachrichten und den E-Mail-Eingang richte die Cloud ein (Anleitung, Stufe 2).</p></div>`}

    <div class="settings" style="margin-top:4px">
      <button class="setting" data-action="open-contacts"><span class="area-dot" style="--area:var(--brand)">👥</span><span class="grow">Kontakte<small>${S.contacts.length} Ansprechpartner – anrufen oder anschreiben</small></span>${I.chevron}</button>
      <button class="setting" data-action="open-costs"><span class="area-dot" style="--area:#4A8FE7">💶</span><span class="grow">Kosten & Zahlungen<small>${S.costs.length ? `${esc(eur(costStats('all').paid))} von ${esc(eur(costStats('all').planned))} bezahlt` : 'Budget, Ratenplan, Rechnungen'}</small></span>${I.chevron}</button>
      <button class="setting" data-action="open-docs"><span class="area-dot" style="--area:#E9A23B">📷</span><span class="grow">Fotos & Dokumente<small>${S.files.length ? `${S.files.length} ${S.files.length === 1 ? 'Datei' : 'Dateien'}` : 'Baufortschritt, Belege, Protokolle'}</small></span>${I.chevron}</button>
    </div>

    <h2 class="section-title">Lebensbereiche</h2>
    <div class="settings">
      ${areas().map((a) => `<button class="setting" data-action="area-edit" data-id="${esc(a.id)}" ${full ? '' : 'disabled'}><span class="area-dot" style="--area:${esc(a.color)}">${esc(a.emoji)}</span><span class="grow">${esc(a.name)}<small>${open.get(a.id) || 0} offen${a.phases?.length ? ` · ${a.phases.length} Abschnitte` : ''}</small></span>${I.chevron}</button>`).join('')}
      ${full ? `<button class="setting" data-action="area-new"><span class="area-dot add">+</span><span class="grow">Bereich hinzufügen</span></button>` : ''}
    </div>
    ${full ? '' : `<p class="hint">Du bist zu ${esc(scopeLabel(S.project?.access?.[S.me?.uid]))} eingeladen. Weitere Projekte kann dir jemand mit vollem Zugriff freigeben.</p>`}

    <h2 class="section-title">Gemeinsam planen</h2>
    <div class="settings">
      ${cloud ? mem : ''}
      ${full ? `<button class="setting" data-action="invite"><span class="grow">Jemanden einladen<small>Zu allen Projekten oder nur zu einzelnen</small></span>${I.chevron}</button>` : ''}
      ${cloud && full ? `<button class="setting" data-action="join"><span class="grow">Mit Code beitreten</span>${I.chevron}</button>` : ''}
    </div>

    ${cloud ? calSection(full) : ''}

    <h2 class="section-title">Erinnerungen</h2>
    <div class="settings">
      <button class="setting" data-action="push" ${ps.on ? 'disabled' : ''}><span class="status-dot ${ps.on ? 'on' : ''}"></span><span class="grow">Push-Nachrichten<small>${esc(ps.text)}</small></span>${ps.on ? '' : '<span class="end">Aktivieren</span>'}</button>
    </div>
    <p class="hint">Zur eingestellten Zeit jeder Aufgabe, morgens ab 7 Uhr eine kurze Übersicht und ein Hinweis, wenn etwas jetzt starten sollte. Jedes Gerät einmal selbst aktivieren.</p>

    ${billing() ? `<h2 class="section-title">KI-Assistent</h2>
    <div class="settings">
      <div class="setting"><span class="status-dot on"></span><span class="grow">Im Abo enthalten<small>${S.usage?.ai || 0} von ${fmtLimit(lim('aiActions'))} KI-Aktionen diesen Monat · Spracheingabe, Suche, Entwürfe, Auswerten</small></span></div>
      ${full ? `<button class="setting" data-action="ai-deep"><span class="status-dot ${S.project?.aiDeep && curPlan() === 'pro' ? 'on' : ''}"></span><span class="grow">Gründlich-Modus${curPlan() === 'pro' ? '' : ' <span class="plan-badge">Pro</span>'}<small>Stärkstes KI-Modell für E-Mails und Entwürfe – zählt doppelt</small></span><span class="end">${S.project?.aiDeep && curPlan() === 'pro' ? 'An' : 'Aus'}</span></button>` : ''}
      ${full && planOf(curPlan()).features.dailyCheck ? `<button class="setting" data-action="assess-all" ${S.aiBusy ? 'disabled' : ''}><span class="grow">${S.aiBusy ? 'Fristen werden geprüft …' : 'Alle Fristen jetzt prüfen'}<small>Passiert sonst jeden Morgen automatisch</small></span></button>` : ''}
    </div>
    ${full ? `<h2 class="section-title">E-Mail-Eingang</h2>
    <div class="settings">
      <button class="setting" data-action="inbox-settings"><span class="status-dot ${inboxAddr() ? 'on' : ''}"></span><span class="grow">${inboxAddr() ? esc(inboxAddr()) : 'Noch keine Adresse'}<small>${inboxAddr() ? `${S.usage?.mails || 0} von ${fmtLimit(lim('mails'))} E-Mails diesen Monat · Absender verwalten` : 'Eigene Weiterleitungs-Adresse anlegen'}</small></span>${I.chevron}</button>
    </div>` : ''}
    ` : full ? `<h2 class="section-title">KI-Assistent</h2>
    <div class="settings">
      <button class="setting" data-action="ai-settings"><span class="status-dot ${S.ai ? 'on' : ''}"></span><span class="grow">Claude von Anthropic<small>${S.ai ? `Aktiv · ${esc(modelName)}` : 'Nicht eingerichtet'}</small></span><span class="end">${S.ai ? 'Ändern' : 'Einrichten'}</span></button>
      ${S.ai ? `<button class="setting" data-action="assess-all" ${S.aiBusy ? 'disabled' : ''}><span class="grow">${S.aiBusy ? 'Fristen werden geprüft …' : 'Alle Fristen jetzt prüfen'}<small>Was ist bis wann realistisch zu schaffen?</small></span></button>` : ''}
    </div>

    <h2 class="section-title">E-Mail-Eingang</h2>
    <div class="settings">
      <button class="setting" data-action="inbox-settings"><span class="status-dot ${inboxAddr() ? 'on' : ''}"></span><span class="grow">${inboxAddr() ? esc(inboxAddr()) : 'Nicht eingerichtet'}<small>${inboxAddr() ? 'Erlaubte Absender verwalten' : billing() ? 'Eigene Adresse anlegen' : 'Anleitung, Stufe 5'}</small></span>${I.chevron}</button>
    </div>

    ` : ''}
    <h2 class="section-title">Vorlagen</h2>
    <div class="settings">
      <button class="setting" data-action="template"><span class="grow">Checkliste Hausbau<small>Vom Bauantrag bis zur Abnahme</small></span>${I.chevron}</button>
    </div>

    <h2 class="section-title">Darstellung</h2>
    <div class="settings">
      <label class="setting"><span class="area-dot" style="--area:#4A8FE7">🌐</span><span class="grow">Sprache<small>Deutsch oder Englisch</small></span>
        <select class="set-select" data-action="set-lang" aria-label="Sprache"><option value="de" ${LANG === 'de' ? 'selected' : ''}>Deutsch</option><option value="en" ${LANG === 'en' ? 'selected' : ''}>English</option></select></label>
      <label class="setting"><span class="area-dot" style="--area:#8E7CE0">🌓</span><span class="grow">Design<small>Hell, dunkel oder wie das System</small></span>
        <select class="set-select" data-action="set-theme" aria-label="Design">${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<option value="${v}" ${themePref() === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>

    ${native.isNative() || window.PublicKeyCredential || lockCfg() ? `<h2 class="section-title">Sicherheit</h2>
    <div class="settings">
      <button class="setting" data-action="${lockCfg() ? 'lock-off' : 'lock-on'}"><span class="status-dot ${lockCfg() ? 'on' : ''}"></span><span class="grow">${lockCfg()?.type === 'pin' ? 'App-Sperre mit PIN' : `Mit ${esc(bioName())} entsperren`}<small>${lockCfg() ? 'An – MindSpace sperrt sich nach 2 Minuten im Hintergrund' : 'Face ID, Touch ID oder PIN – auf jedem Gerät einmal einschalten'}</small></span><span class="end">${lockCfg() ? 'Ausschalten' : 'Einschalten'}</span></button>
    </div>` : ''}

    <h2 class="section-title">App</h2>
    <div class="settings">
      ${standalone ? '' : installPrompt
        ? `<button class="setting" data-action="install"><span class="area-dot" style="--area:var(--brand)">💻</span><span class="grow">Als Programm installieren<small>Eigenes Fenster und Symbol – auf diesem Computer oder Gerät</small></span><span class="end">Installieren</span></button>`
        : !isIOS ? `<div class="setting"><span class="area-dot" style="--area:var(--brand)">💻</span><span class="grow">Als Programm installieren<small>${esc(installHow())}</small></span></div>` : ''}
      ${isDesktop() ? `<div class="setting"><span class="area-dot" style="--area:#8E7CE0">⌨️</span><span class="grow">Tastenkürzel<small>N = neue Aufgabe · / = Schnelleingabe · 1–5 = Bereiche wechseln · Esc = schließen</small></span></div>` : ''}
      ${native.isNative() ? `<div class="setting"><span class="grow">Version ${APP_VERSION}<small>Updates kommen über den ${native.platform() === 'ios' ? 'App Store' : 'Play Store'}</small></span></div>`
        : `<button class="setting" data-action="hard-reload"><span class="grow">Neueste Version laden<small>Version ${APP_VERSION} – Speicher leeren und neu starten</small></span></button>`}
      ${legalLinks()}
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
      ${billing() ? '<button class="setting danger" data-action="delete-account">Konto löschen</button>' : ''}
    </div>` : ''}
    <p class="hint center" style="margin-top:28px">MindSpace · Planung darf leicht sein.</p>
  </main>`;
}

// ================================================================== Anmeldung
function viewAuth() {
  const reg = S.authTab === 'register';
  return `<main class="auth">
    <div class="auth-hero">${ring(0.72, 96, 11, 'var(--brand)', '✓')}<h1>MindSpace</h1><p>Dein persönlicher Assistent. Aufgaben, Fristen und E-Mails – leicht geplant.</p></div>
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
      <label class="field"><span>Name</span><input name="name" value="${esc(tr('Unser Zuhause'))}" required></label>
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
let sheetGuard = null; // Aufräumen/Sichern, bevor ein Blatt geschlossen oder ersetzt wird
function openSheet(html, onMount) {
  if (sheetGuard) { const g = sheetGuard; sheetGuard = null; try { g(); } catch (e) { console.warn(e); } }
  sheetRoot.innerHTML = `<div class="backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grab"></div>${html}</div>`;
  const sheet = sheetRoot.querySelector('.sheet');
  sheetRoot.querySelector('[data-close]').onclick = closeSheet;
  sheet.querySelectorAll('[data-dismiss]').forEach((b) => (b.onclick = closeSheet));
  onMount?.(sheet);
  return sheet;
}
function closeSheet(opts) {
  const g = sheetGuard; sheetGuard = null;
  if (g && !opts?.saved) { try { g(); } catch (e) { console.warn(e); } }
  sheetRoot.innerHTML = ''; if (S.pendingRender) render();
}
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
      <option value="all" ${!t.assignee || t.assignee === 'all' ? 'selected' : ''}>${members().length > 2 ? 'Alle' : 'Beide'}</option>
      ${members().map((u) => `<option value="${esc(u)}" ${t.assignee === u ? 'selected' : ''}>${esc(nameOf(u))}${u === S.me?.uid ? ' (du)' : ''}</option>`).join('')}</select></label>
      <p class="hint" style="margin-top:-6px">Wählst du jemand anderen aus, bekommt er eine Push-Nachricht und bestätigt die Übernahme.</p>` : '';
  const c = t.contactId ? contactById(t.contactId) : null;
  const pending = [];
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${task ? 'Aufgabe' : 'Neue Aufgabe'}</h2><button class="btn ghost" data-dismiss>${task ? 'Schließen' : 'Abbrechen'}</button></div>
    ${task?.isNew && !task.done ? `<div class="note-card soft"><p>📬 Neu aus der E-Mail${task.mailSubject ? ` „${esc(task.mailSubject)}“` : ''}. Speichern bestätigt sie.</p></div>` : ''}
    ${task ? assignNote(task) : ''}
    ${task && !task.done ? urgencyBox(task) : ''}
    ${task ? `<div class="btn-row" style="margin-bottom:14px">
      <button type="button" class="btn secondary small" data-act="mail">${I.envelope} ${c?.email ? `E-Mail an ${esc(c.name.split(' ').slice(-1)[0])}` : 'E-Mail schreiben'}</button>
      ${c && (c.mobile || c.phone) ? `<a class="btn secondary small" href="${esc(telHref(c.mobile || c.phone))}">${I.phone} Anrufen</a>` : ''}
      ${task.due && !calCovers(task) ? `<button type="button" class="btn secondary small" data-act="ics">📅 In Kalender</button>` : ''}
    </div>` : ''}
    <form>
      <label class="field"><span>Was ist zu tun?</span><textarea name="title" rows="2" required style="min-height:64px" placeholder="z. B. Bank wegen Finanzierungsbestätigung anrufen">${esc(t.title)}</textarea></label>
      <div class="field"><span>Wann?</span>
        <div class="date-chips">${quickDates().slice(0, 4).map(([l, d]) => `<button type="button" class="dchip" data-setdue="${d}">${l}</button>`).join('')}<button type="button" class="dchip" data-setdue="">Ohne</button></div>
        <input type="date" name="due" class="input" value="${esc(t.due || '')}" aria-label="Fällig am"></div>
      <label class="field"><span>Wiederholen</span><select name="repeat">${REPEATS.map(([v, l]) => `<option value="${v}" ${(t.repeat || '') === v ? 'selected' : ''}>${v ? '↻ ' : ''}${l}</option>`).join('')}</select></label>
      <p class="hint" data-repeat-hint style="margin-top:-6px"></p>
      <label class="field"><span>Bereich</span>${areaSelect('name="areaId"', tArea)}</label>
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
      <div class="field"><span>Fotos & Dateien</span><div data-att-wrap>${attachBox({ taskId: task?.id }, pending)}</div></div>
      <button class="btn block" type="submit">Speichern</button>
      ${task ? `<div class="btn-row" style="justify-content:space-between;margin-top:10px">
        <button type="button" class="btn ghost" data-act="done">${task.done ? 'Wieder öffnen' : 'Erledigt'}</button>
        <button type="button" class="btn ghost danger-text" data-act="delete">Löschen</button></div>` : ''}
    </form>
    ${task ? `<section class="thread-wrap" data-thread>
      <h3 class="thread-h">Verlauf & Kommentare</h3>
      ${threadList(task)}
      <div class="cmt-form"><textarea rows="1" data-cmt placeholder="${members().length > 1 ? 'Kommentar für alle, z. B. „Bank hat zurückgerufen“' : 'Notiz zum Verlauf, z. B. „Bank hat zurückgerufen“'}" aria-label="Kommentar"></textarea><button type="button" class="btn small" data-cmt-send>Senden</button></div>
      ${members().length > 1 ? '<p class="hint" style="margin-top:6px">Die anderen bekommen eine Push-Nachricht.</p>' : ''}
    </section>` : ''}`);
  const form = sheet.querySelector('form');
  const formData = () => {
    const f = Object.fromEntries(new FormData(form));
    return {
      title: f.title.trim(), due: f.due || null, time: f.time || null, reminder: f.reminder, remindCustom: f.remindCustom || null,
      areaId: f.areaId, phase: f.phase || null, notes: f.notes.trim(), assignee: f.assignee || 'all',
      leadDays: f.leadDays === '' ? null : Math.max(0, Math.min(120, parseInt(f.leadDays, 10) || 0)), contactId: f.contactId || null,
      repeat: f.repeat || null, repeatDay: f.repeat && f.due ? parseISO(f.due).getDate() : null,
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
    else if (at) hint.textContent = `Erinnerung: ${new Date(at).toLocaleString(LOC(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} Uhr${at < Date.now() ? ' – liegt in der Vergangenheit' : ''}`;
    else hint.textContent = '';
    const rh = sheet.querySelector('[data-repeat-hint]');
    if (f.repeat) {
      const base = { ...f, due: f.due || firstRepeatDue(f.repeat) };
      rh.textContent = `${f.due ? '' : `Beginnt ${fmtDate(base.due)}. `}Nach dem Abhaken legt MindSpace den nächsten Termin automatisch an – nächstes Mal ${fmtDateY(stepRepeat(base.due, f.repeat, base.repeatDay))}.`;
    } else rh.textContent = '';
    const lh = sheet.querySelector('[data-lead-hint]');
    if (f.due && f.leadDays != null) lh.textContent = `Starten spätestens am ${fmtDate(addDays(f.due, -f.leadDays))}. Ab dann erinnert MindSpace dich.`;
    else lh.textContent = f.due ? 'Vorlauf = wie viele Tage vorher du anfangen musst, z. B. weil die Bank Zeit braucht. MindSpace erinnert dich dann rechtzeitig.' : '';
  };
  form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
  // Ungespeicherte Eingaben schützen: Entwurf auf dem Gerät, bestehende Aufgaben automatisch speichern
  const draftKey = task ? `task:${task.id}` : 'task:new';
  const rawFields = () => Object.fromEntries(new FormData(form));
  const cmtBox = () => sheet.querySelector('[data-cmt]');
  let initial = JSON.stringify(rawFields());
  const dirty = () => JSON.stringify(rawFields()) !== initial;
  const keepDraft = () => {
    const cmt = cmtBox()?.value || '';
    if (dirty() || cmt.trim()) draftSave({ key: draftKey, fields: rawFields(), cmt, ts: Date.now() });
    else draftClear(draftKey);
  };
  sheet.addEventListener('input', keepDraft);
  sheet.addEventListener('change', keepDraft);
  const saveSilently = async ({ quiet = false } = {}) => {
    if (!task || !dirty()) return false;
    const data = formData();
    if (!data.title) return false;
    if (data.repeat && !data.due) { data.due = firstRepeatDue(data.repeat); data.repeatDay = parseISO(data.due).getDate(); }
    if ((data.assignee || 'all') !== (task.assignee || 'all') && data.assignee !== 'all' && !canSee(data.assignee, data.areaId)) return false;
    assignPatch(data, task);
    const before = S.tasks.find((x) => x.id === task.id) || task;
    initial = JSON.stringify(rawFields());
    await store.updateTask(task.id, { ...data, isNew: false }, before);
    if (!cmtBox()?.value.trim()) draftClear(draftKey);
    if (!quiet) toast('Änderungen gespeichert', { label: 'Rückgängig', fn: () => { const { id, ...rest } = before; store.updateTask(task.id, rest, S.tasks.find((x) => x.id === task.id) || before); } });
    return true;
  };
  sheet._autosave = () => saveSilently({ quiet: true }).catch((e) => console.warn('Autospeichern:', e));
  sheetGuard = () => {
    if (task) { saveSilently().catch((e) => toast(fail(e))); return; }
    const raw = rawFields();
    if (dirty() && (raw.title?.trim() || raw.notes?.trim())) {
      const d = draftLoad();
      toast('Entwurf verworfen', { label: 'Wiederherstellen', fn: () => { if (d) restoreDraft(d); } });
    }
    draftClear(draftKey);
  };
  if (S.restoreDraft && S.restoreDraft.key === draftKey) {
    const d = S.restoreDraft; S.restoreDraft = null;
    for (const [k, v] of Object.entries(d.fields || {})) { const el = form.elements[k]; if (el && typeof el.value === 'string' && !(el instanceof RadioNodeList)) el.value = v; }
    if (d.fields?.notes?.trim() || d.fields?.leadDays || d.fields?.time) form.querySelector('details.more-fields')?.setAttribute('open', '');
    if (d.cmt && cmtBox()) cmtBox().value = d.cmt;
    upd();
    if (task) initial = ''; // wiederhergestellte Eingaben gelten als ungespeichert
    keepDraft();
    setTimeout(() => toast('Nicht gespeicherte Eingaben wiederhergestellt'), 350);
  }
  const markChips = () => sheet.querySelectorAll('[data-setdue]').forEach((b) => b.classList.toggle('on', b.dataset.setdue === (form.due.value || '')));
  sheet.querySelectorAll('[data-setdue]').forEach((b) => b.addEventListener('click', () => { form.due.value = b.dataset.setdue; markChips(); upd(); }));
  form.due.addEventListener('change', markChips); markChips();
  if (!task) setTimeout(() => form.title.focus(), 280);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = formData();
    if (!data.title) return;
    if (data.repeat && !data.due) { data.due = firstRepeatDue(data.repeat); data.repeatDay = parseISO(data.due).getDate(); }
    try {
      if (data.areaId && !S.areas.find((a) => a.id === data.areaId)) await ensureAreasStored();
      let id = task?.id;
      const twin = !task ? findSimilar(data.title, 0.8) : null;
      if (twin && confirm(`Es gibt schon eine ähnliche Aufgabe: „${twin.title}“. Zusammenführen statt doppelt anlegen?`)) {
        await bundleInto(twin, { text: `✍️ ${data.title}${data.notes ? ' – ' + data.notes : ''}`, due: data.due, time: data.time });
        draftClear(draftKey); closeSheet({ saved: true });
        if (pending.length) await uploadFiles(pending.map((p) => p.file), { taskId: twin.id, areaId: areaOf(twin).id });
        else toast(`Zu „${twin.title}“ hinzugefügt`);
        return;
      }
      if (!assignPatch(data, task)) return;
      if (task) await store.updateTask(task.id, { ...data, isNew: false }, S.tasks.find((x) => x.id === task.id) || task);
      else id = await store.addTask({ ...data, source: 'manual' });
      if (cmtBox()?.value.trim()) draftSave({ key: `task:${id}`, fields: {}, cmt: cmtBox().value, ts: Date.now() }); else draftClear(draftKey);
      if (!task) draftClear('task:new');
      closeSheet({ saved: true });
      if (pending.length) await uploadFiles(pending.map((p) => p.file), { taskId: id, areaId: data.areaId });
      else toast(data.assignNotify ? `${nameOf(data.assignee)} bekommt eine Nachricht` : task ? 'Gespeichert' : 'Aufgabe angelegt');
    } catch (err) { toast(fail(err)); }
  };
  wireAttach(sheet, () => ({ taskId: task?.id, areaId: form.areaId.value }), pending);
  if (task) wireThread(sheet, task.id);
  sheet.querySelector('[data-act="ics"]')?.addEventListener('click', () => downloadIcs({ ...task, ...formData(), id: task.id }));
  sheet.querySelector('[data-act="assign-ok"]')?.addEventListener('click', () => { closeSheet(); assignAccept(task.id); });
  sheet.querySelector('[data-act="assign-back"]')?.addEventListener('click', () => { closeSheet(); assignReturn(task.id); });
  sheet.querySelector('[data-act="mail"]')?.addEventListener('click', () => {
    const cur = { ...task, ...formData() };
    composeSheet({ task: cur, contact: cur.contactId ? contactById(cur.contactId) : null });
  });
  sheet.querySelector('[data-act="assess"]')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'MindSpace schätzt ein …';
    try {
      await assessList([S.tasks.find((x) => x.id === task.id) || task]);
      const fresh = S.tasks.find((x) => x.id === task.id);
      sheet.querySelector('[data-urg]').outerHTML = urgencyBox(fresh);
    } catch (err) { toast(fail(err)); e.target.disabled = false; e.target.textContent = 'Mit KI neu einschätzen'; }
  });
  sheet.querySelector('[data-act="done"]')?.addEventListener('click', async (e) => {
    const r = e.target.getBoundingClientRect();
    try { await saveSilently({ quiet: true }); } catch (err) { toast(fail(err)); return; }
    draftClear(draftKey); closeSheet({ saved: true }); toggleTask(task.id, r.left + 20, r.top + 10);
  });
  sheet.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
    if (!confirm('Aufgabe wirklich löschen?')) return;
    draftClear(draftKey); closeSheet({ saved: true });
    try { await store.deleteTask(task.id); toast('Gelöscht', { label: 'Rückgängig', fn: () => { const { id, ...rest } = task; store.addTask(rest); } }); } catch (err) { toast(fail(err)); }
  });
}

const CHEERS = ['Erledigt 🎉', 'Geschafft ✨', 'Ein Punkt weniger 🙌', 'Stark gemacht 💪', 'Weiter so 🌿', 'Abgehakt ☀️'];
async function toggleTask(id, x, y) {
  const t = S.tasks.find((k) => k.id === id); if (!t) return;
  const patch = t.done ? { done: false, doneAt: null, doneBy: null, nextId: null } : { done: true, doneAt: Date.now(), doneBy: S.me?.uid || null, isNew: false };
  if (!t.done && x != null) celebrate(x, y);
  try {
    let nextDue = null;
    if (!t.done && t.repeat) {
      nextDue = nextOccurrence(t);
      if (nextDue) patch.nextId = await store.addTask(repeatCopy(t, nextDue));
    }
    if (t.done && t.nextId) { const nx = S.tasks.find((k) => k.id === t.nextId); if (nx && !nx.done) await store.deleteTask(nx.id); }
    await store.updateTask(id, patch, t);
    if (!t.done) {
      const undo = { label: 'Rückgängig', fn: async () => {
        if (patch.nextId) await store.deleteTask(patch.nextId).catch(() => {});
        const cur = S.tasks.find((k) => k.id === id) || { ...t, ...patch };
        store.updateTask(id, { done: false, doneAt: null, doneBy: null, nextId: null }, cur);
      } };
      if (nextDue) { toast(`Erledigt ✓ Nächstes Mal: ${fmtDateY(nextDue)}`, undo); return; }
      const openLeft = S.tasks.filter((k) => !k.done && k.due && k.due <= todayISO()).length;
      toast(openLeft === 0 && t.due && t.due <= todayISO() ? 'Alles für heute geschafft ☀️' : pick(CHEERS), undo);
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
  const defBody = LANG === 'en' ? `Hello,\n\n\n\nKind regards\n${sender}` : `Guten Tag,\n\n\n\nMit freundlichen Grüßen\n${sender}`;
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
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> MindSpace schreibt …';
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
      if (cur) store.updateTask(cur.id, { notes: `${cur.notes ? cur.notes + '\n\n' : ''}${new Date().toLocaleDateString(LOC())}: E-Mail an ${recipient()?.name || to} – „${form.subject.value}“` }, cur).catch(() => {});
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
    <p class="hint" style="margin-top:0">MindSpace nutzt Claude von Anthropic. Dafür brauchst du einen eigenen API-Schlüssel aus der Anthropic Console (Anleitung, Stufe 4). Abgerechnet wird nach Verbrauch – eine E-Mail auszuwerten kostet meist 1–3 Cent.</p>
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
// Mit Abo: eigene Adresse über die Mail-Domain. Solange die fehlt, bleibt eine vorhandene Postboten-Adresse sichtbar.
const mailDomainReady = () => !!CFG.backend?.mailDomain;
const inboxAddr = () => (billing() && mailDomainReady() && S.project?.inboxAlias ? `${S.project.inboxAlias}@${CFG.backend.mailDomain}` : S.project?.inboxAddress || '');
function inboxSheet() {
  const addr = inboxAddr();
  const allowed = (S.project?.inboxAllowed || []).join('\n');
  const sheet = openSheet(`
    <div class="sheet-head"><h2>E-Mail-Eingang</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    ${addr ? `<div class="address-card" style="margin-bottom:16px"><p>Weiterleiten an</p><button class="address" type="button" data-act="copy">${esc(addr)} ${I.copy}</button></div>`
      : billing() && mailDomainReady() ? `<div class="note-card"><p>Noch keine Adresse. Tippe auf „Adresse anlegen“ – danach leitest du E-Mails einfach dorthin weiter.</p><button class="btn small" type="button" data-action="inbox-create" style="margin-top:8px">Adresse anlegen</button></div>`
      : billing() ? `<div class="note-card"><p>Der E-Mail-Eingang wird gerade eingerichtet. Bis dahin E-Mails einfach unter <strong>Eingang → Einfügen</strong> hineinkopieren.</p></div>`
      : `<div class="note-card"><p>Noch kein Postfach verbunden. Die Einrichtung (ca. 15 Minuten) steht in der Anleitung, Stufe 5.</p></div>`}
    ${billing() ? `<p class="hint">${esc(planOf(curPlan()).name)}: ${fmtLimit(lim('mails'))} E-Mails pro Monat, davon ${S.usage?.mails || 0} genutzt. Die KI liest je Mail bis zu ${lim('mailAttachments')} ${lim('mailAttachments') === 1 ? 'Anhang' : 'Anhänge'} mit.</p>` : ''}
    <form>
      <label class="field"><span>Erlaubte Absender (einer pro Zeile)</span><textarea name="allowed" rows="5" placeholder="z. B. @allkauf.de&#10;kita@beispiel.de">${esc(allowed)}</textarea></label>
      <p class="hint">Mails von euren eigenen Konto-Adressen${S.me?.email ? ` (z. B. ${esc(S.me.email)})` : ''} sind immer erlaubt – also alles, was ihr selbst weiterleitet. Ergänze hier Absender, die direkt an das Postfach schreiben oder automatisch weitergeleitet werden. Mit „@firma.de“ erlaubst du eine ganze Firma. Alles andere ignoriert MindSpace – so entstehen keine Aufgaben aus Werbung.</p>
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
      const hp = areaById('hausbau')?.phases || [];
      await store.addTasks(picked.map(([phase, title]) => ({ title: tr(title), phase: hp.includes(tr(phase)) ? tr(phase) : phase, areaId: 'hausbau', reminder: 'none', source: 'vorlage', notes: '' })));
      closeSheet(); toast(`${picked.length} Aufgaben hinzugefügt`);
    } catch (err) { toast(fail(err)); }
  };
}

async function inviteSheet() {
  if (store.mode !== 'cloud') {
    openSheet(`<div class="sheet-head"><h2>Gemeinsam planen</h2><button class="btn ghost" data-dismiss>Schließen</button></div>
      <p>Damit ihr zu zweit plant, braucht MindSpace einen Ort im Internet, an dem eure Daten zusammenkommen – dein eigenes, kostenloses Firebase-Projekt.</p>
      <p class="hint">Die Anleitung erklärt die Einrichtung Schritt für Schritt (ca. 30 Minuten am Computer). Bisherige Aufgaben werden übernommen.</p>`);
    return;
  }
  if (members().length >= lim('members')) { paywallSheet('members'); return; }
  const sheet = openSheet(`<div class="sheet-head"><h2>Einladen</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <p class="hint" style="margin-top:-4px">Wozu soll die Person Zugriff bekommen?</p>
    <form>
      <label class="choice"><input type="radio" name="scope" value="all" checked><span><strong>Alle Projekte</strong><small>Sieht und bearbeitet alles – wie du. Für Partnerin oder Partner.</small></span></label>
      <label class="choice"><input type="radio" name="scope" value="some"><span><strong>Nur bestimmte Projekte</strong><small>Z. B. Großeltern nur „Familie“ oder der Bauberater nur „Hausbau“. E-Mail-Ablage, KI-Schlüssel und Einstellungen bleiben verborgen.</small></span></label>
      <div class="scope-list" data-some hidden>${areas().map((a) => `<label class="opt"><input type="checkbox" name="area" value="${esc(a.id)}"> ${esc(a.emoji)} ${esc(a.name)}</label>`).join('')}</div>
      <button class="btn block" type="submit" style="margin-top:18px">Code erzeugen</button>
    </form>`);
  const form = sheet.querySelector('form');
  form.addEventListener('change', () => { sheet.querySelector('[data-some]').hidden = form.scope.value !== 'some'; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const scope = form.scope.value === 'all' ? 'all' : [...form.querySelectorAll('[name="area"]:checked')].map((x) => x.value);
    if (Array.isArray(scope) && !scope.length) { toast('Wähle mindestens ein Projekt.'); return; }
    const btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
    try {
      await ensureAreasStored();
      if (Array.isArray(scope)) await runBackfill();
      const code = await store.createInvite(scope);
      showInviteCode(code, scope);
    } catch (err) { toast(fail(err)); btn.disabled = false; }
  };
}
function showInviteCode(code, scope) {
  const pretty = code.slice(0, 3) + '-' + code.slice(3);
  const what = Array.isArray(scope) ? (LANG === 'en' ? `for: ${scopeLabel(scope)}` : `für: ${scopeLabel(scope)}`) : '';
  const text = LANG === 'en'
    ? `Let's plan together with MindSpace${what ? ' ' + what : ''}!\n1. Open ${location.origin + location.pathname} in Safari (iPhone) or Edge/Chrome (computer)\n2. iPhone: Share → “Add to Home Screen”\n3. Open the app, create an account, enter code: ${pretty}\n(The code is valid for 7 days.)`
    : `Lass uns zusammen mit MindSpace planen${what ? ' – ' + what : ''}!\n1. Öffne ${location.origin + location.pathname} in Safari (iPhone) oder Edge/Chrome (Computer)\n2. iPhone: Teilen → „Zum Home-Bildschirm“\n3. App öffnen, Konto erstellen, Code eingeben: ${pretty}\n(Der Code gilt 7 Tage.)`;
  const sheet = openSheet(`<div class="sheet-head"><h2>Einladen</h2><button class="btn ghost" data-dismiss>Fertig</button></div>
    <p class="hint">Schick diesen Code zusammen mit dem Link. Er gilt 7 Tage.</p>
    <div class="code">${esc(pretty)}</div>
    <p class="hint" style="text-align:center">Zugriff: <strong>${esc(scopeLabel(scope))}</strong></p>
    <button class="btn block" data-share>${I.share} Einladung senden</button>`);
  sheet.querySelector('[data-share]').onclick = async () => {
    try { if (navigator.share) await navigator.share({ title: 'MindSpace', text }); else copyText(text, 'Einladung kopiert'); } catch {}
  };
}
function memberSheet(uid) {
  const sc = S.project?.access?.[uid];
  const limited = Array.isArray(sc);
  const sheet = openSheet(`<div class="sheet-head"><h2>${esc(nameOf(uid))}</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <form>
      <label class="choice"><input type="radio" name="scope" value="all" ${limited ? '' : 'checked'}><span><strong>Alle Projekte</strong><small>Voller Zugriff wie du.</small></span></label>
      <label class="choice"><input type="radio" name="scope" value="some" ${limited ? 'checked' : ''}><span><strong>Nur bestimmte Projekte</strong></span></label>
      <div class="scope-list" data-some ${limited ? '' : 'hidden'}>${areas().map((a) => `<label class="opt"><input type="checkbox" name="area" value="${esc(a.id)}" ${limited && sc.includes(a.id) ? 'checked' : ''}> ${esc(a.emoji)} ${esc(a.name)}</label>`).join('')}</div>
      <button class="btn block" type="submit" style="margin-top:18px">Speichern</button>
      <button type="button" class="btn ghost block danger-text" data-remove style="margin-top:8px">Aus dem gemeinsamen Bereich entfernen</button>
    </form>`);
  const form = sheet.querySelector('form');
  form.addEventListener('change', () => { sheet.querySelector('[data-some]').hidden = form.scope.value !== 'some'; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const scope = form.scope.value === 'all' ? 'all' : [...form.querySelectorAll('[name="area"]:checked')].map((x) => x.value);
    if (Array.isArray(scope) && !scope.length) { toast('Wähle mindestens ein Projekt.'); return; }
    try { await ensureAreasStored(); if (Array.isArray(scope)) await runBackfill(); await store.setMemberAccess(uid, scope); closeSheet(); toast('Gespeichert'); } catch (err) { toast(fail(err)); }
  };
  sheet.querySelector('[data-remove]').onclick = async () => {
    if (!confirm(`${nameOf(uid)} entfernen? Die Person sieht danach nichts mehr.`)) return;
    try { await store.removeMember(uid); closeSheet(); toast('Entfernt'); } catch (err) { toast(fail(err)); }
  };
}
// Ältere Einträge ohne Bereich nachtragen (nötig, damit eingeschränkte Mitglieder sie sehen)
let backfillRun = null;
function runBackfill() {
  if (store.mode !== 'cloud' || !fullAccess() || !store.backfillAreas) return Promise.resolve(0);
  backfillRun ||= store.backfillAreas({ tasks: S.tasks, costs: S.costs, files: S.files, comments: S.comments }, (t) => areaOf(t).id, areaById('hausbau') ? 'hausbau' : areas()[0].id).catch((e) => { backfillRun = null; console.warn(e); return 0; });
  return backfillRun;
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
      const ex = (t.matchId && open.find((e) => e.id === t.matchId)) || open.find((e) => similarity(e.title, t.title) >= 0.75);
      return { ...t, ai: true, doneInThread: t.done, bundle: ex ? ex.id : null, bundleTitle: ex ? ex.title : null, selected: !t.done, notes: t.details, from: r.from, messageDate: r.date, subject: r.subject };
    });
    const payments = (r.payments || []).map((x) => {
      const ex = S.costs.find((c) => c.amount != null && x.amount != null && Math.abs(c.amount - x.amount) < 0.01 && similarity(c.title, x.title) >= 0.5);
      return { ...x, existing: ex ? ex.title : null, selected: !ex };
    });
    S.parsed = { ai: true, raw: text, summary: r.summary, tasks, contacts, payments, messages: [{ subject: r.subject, from: r.from, date: r.date }] };
  } catch (e) { toast(fail(e)); }
  S.aiBusy = false;
  render();
  if (S.parsed) setTimeout(() => app.querySelector('.ai-note, .group-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
async function commitImport() {
  const p = S.parsed; if (!p) return;
  let sel = p.tasks.filter((t) => t.selected && t.title.trim());
  const btn = app.querySelector('#commit-btn'); if (btn) btn.disabled = true;
  for (const x of p.payments || []) if (x.selected && x.amountText != null) x.amount = parseEur(x.amountText);
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
  let bundled = 0;
  try {
    if (sel.length) await ensureAreasStored();
    for (const t of sel.filter((x) => x.bundle)) {
      const ex = S.tasks.find((x) => x.id === t.bundle); if (!ex) { t.bundle = null; continue; }
      await bundleInto(ex, { text: `📬 ${t.subject || 'E-Mail'}: ${t.addition || t.notes || t.title}`, due: t.due, time: t.time });
      bundled++;
    }
    sel = sel.filter((x) => !x.bundle);
    if (sel.length) await store.addTasks(sel.map((t) => {
      const src = [t.from && `von ${t.from}`, t.messageDate && `vom ${fmtDate(t.messageDate, { day: 'numeric', month: 'numeric', year: 'numeric' })}`].filter(Boolean).join(' ');
      const notes = [t.notes, t.quote ? `„${t.quote}“` : '', t.leadReason ? `Vorlauf: ${t.leadReason}` : ''].filter(Boolean).join('\n\n');
      return {
        title: t.title.trim(), due: t.due || null, time: t.time || null, areaId: t.areaId, phase: t.phase || null,
        leadDays: t.leadDays ?? null, contactId: p.ai ? contactFor(t) : null, dueKind: t.dueKind || null,
        reminder: !t.due ? 'none' : dayDiff(t.due) <= 1 ? 'day0' : 'day1', notes: `${notes}${src ? `\n\nAus der E-Mail ${src}` : ''}${t.subject ? `\nBetreff: ${t.subject}` : ''}`, source: p.ai ? 'mail-ki' : 'mail',
      };
    }));
    const pays = (p.payments || []).filter((x) => x.selected && x.title.trim());
    if (pays.length) {
      if (!S.areas.length) await ensureAreasStored();
      const subj = p.messages?.[0]?.subject;
      await store.addCosts(pays.map((x) => ({ title: x.title.trim(), amount: x.amount ?? null, due: x.due || null, kind: x.kind || 'rechnung', areaId: x.areaId, paid: false,
        contactId: x.payee ? findContact({ name: x.payee })?.id || null : null, note: [x.payee && `Empfänger: ${x.payee}`, subj && `Aus der E-Mail „${subj}“`].filter(Boolean).join('\n'), source: 'mail-ki' })));
    }
    if (S.saveInfo) await saveInfoFromText(p);
    S.parsed = null; S.pasteText = ''; S.view = sel.length || bundled ? 'home' : pays.length ? 'costs' : (p.contacts || []).some((c) => c.selected) ? 'contacts' : 'home'; S.filter = 'open';
    if (S.view === 'costs') { S.prevView = 'inbox'; S.costArea = 'all'; }
    render();
    const nc = (p.contacts || []).filter((c) => c.selected).length;
    toast(commitLabel(sel.length, nc, pays.length).replace(' übernehmen', ' übernommen ✨').replace('Nichts ausgewählt', '') + (bundled ? ` ${bundled} gebündelt ↺` : ''));
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


// ================================================================== Verschieben & Gesten
function quickDates() {
  const t = todayISO();
  const dow = (parseISO(t).getDay() + 6) % 7; // Mo = 0
  const sat = addDays(t, dow <= 5 ? 5 - dow : 6);
  const nextMon = addDays(t, 7 - dow);
  return [
    ['Heute', t, '☀️'], ['Morgen', addDays(t, 1), '🌤️'], ['Wochenende', sat, '🛋️'],
    ['Nächste Woche', nextMon, '📅'], ['In einem Monat', (() => { const d = parseISO(t); d.setMonth(d.getMonth() + 1); return isoDate(d); })(), '🗓️'],
  ];
}
async function moveTask(t, due) {
  if (!t || t.due === due) return;
  const old = t.due;
  try {
    await store.updateTask(t.id, { due, isNew: false }, t);
    toast(due ? `Verschoben auf ${fmtDate(due)}` : 'Datum entfernt', { label: 'Rückgängig', fn: () => { const cur = S.tasks.find((x) => x.id === t.id); if (cur) store.updateTask(cur.id, { due: old }, cur); } });
  } catch (e) { toast(fail(e)); }
}
function whenSheet(t) {
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Wann?</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <p class="hint" style="margin-top:-4px">${esc(t.title)}</p>
    <div class="when-grid">${quickDates().map(([l, d, e]) => `<button class="when" data-d="${d}"><span>${e}</span><strong>${l}</strong><small>${esc(fmtDate(d))}</small></button>`).join('')}
      <button class="when" data-d=""><span>➖</span><strong>Ohne Datum</strong><small>irgendwann</small></button></div>
    <label class="field" style="margin-top:14px"><span>Oder Datum wählen</span><input type="date" class="input" data-pick value="${esc(t.due || '')}"></label>`);
  sheet.querySelectorAll('.when').forEach((b) => b.addEventListener('click', () => { closeSheet(); moveTask(t, b.dataset.d || null); }));
  sheet.querySelector('[data-pick]').addEventListener('change', (e) => { if (e.target.value) { closeSheet(); moveTask(t, e.target.value); } });
}

// Wischen: rechts = erledigt, links = verschieben. Gedrückt halten = auf einen Tag ziehen.
let G = null;
let suppressClick = false;
const dropAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop-day]');
app.addEventListener('pointerdown', (e) => {
  const rowEl = e.target.closest('.row[data-tid]');
  if (!rowEl || e.target.closest('.check, a, input, select, textarea') || (e.pointerType === 'mouse' && e.button !== 0)) return;
  G = { row: rowEl, id: rowEl.dataset.tid, x0: e.clientX, y0: e.clientY, mode: null, pid: e.pointerId };
  G.timer = setTimeout(() => startDrag(e.clientX, e.clientY), 420);
});
function startDrag(x, y) {
  if (!G || G.mode) return;
  G.mode = 'drag';
  const r = G.row.getBoundingClientRect();
  const ghost = G.row.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = r.width + 'px';
  ghost.style.left = r.left + 'px';
  ghost.style.top = r.top + 'px';
  G.dx = x - r.left; G.dy = y - r.top;
  document.body.appendChild(ghost);
  G.ghost = ghost;
  G.row.classList.add('dragging');
  document.body.classList.add('is-dragging');
  if (navigator.vibrate) navigator.vibrate(15);
}
app.addEventListener('pointermove', (e) => {
  if (!G || e.pointerId !== G.pid) return;
  const dx = e.clientX - G.x0, dy = e.clientY - G.y0;
  if (!G.mode) {
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) { G.mode = 'swipe'; clearTimeout(G.timer); G.row.classList.add('swiping'); }
    else if (Math.abs(dy) > 10 || Math.abs(dx) > 10) { clearTimeout(G.timer); G = null; return; }
    else return;
  }
  if (G.mode === 'swipe') {
    const x = Math.max(-140, Math.min(140, dx));
    G.row.style.setProperty('--sx', x + 'px');
    G.row.classList.toggle('sw-right', x > 70);
    G.row.classList.toggle('sw-left', x < -70);
  } else if (G.mode === 'drag') {
    G.ghost.style.left = (e.clientX - G.dx) + 'px';
    G.ghost.style.top = (e.clientY - G.dy) + 'px';
    const target = dropAt(e.clientX, e.clientY);
    document.querySelectorAll('.drop-hover').forEach((n) => n !== target && n.classList.remove('drop-hover'));
    if (target) target.classList.add('drop-hover');
    // am Rand automatisch scrollen
    if (e.clientY < 90) window.scrollBy(0, -12); else if (e.clientY > innerHeight - 110) window.scrollBy(0, 12);
  }
});
function endGesture(e, cancelled) {
  if (!G) return;
  clearTimeout(G.timer);
  const g = G; G = null;
  if (!g.mode) return;
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 350);
  const t = S.tasks.find((x) => x.id === g.id);
  if (g.mode === 'swipe') {
    const dx = (e?.clientX ?? g.x0) - g.x0;
    g.row.classList.remove('swiping', 'sw-right', 'sw-left');
    g.row.style.removeProperty('--sx');
    if (cancelled || !t) return;
    if (dx > 70) { const r = g.row.getBoundingClientRect(); toggleTask(t.id, r.left + 24, r.top + r.height / 2); }
    else if (dx < -70) whenSheet(t);
  } else if (g.mode === 'drag') {
    const target = !cancelled && e ? dropAt(e.clientX, e.clientY) : null;
    g.ghost.remove();
    g.row.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    document.querySelectorAll('.drop-hover').forEach((n) => n.classList.remove('drop-hover'));
    if (target && t) moveTask(t, target.dataset.dropDay);
  }
}
app.addEventListener('pointerup', (e) => endGesture(e, false));
app.addEventListener('pointercancel', (e) => endGesture(e, true));
// iOS: während des Ziehens nicht scrollen
document.addEventListener('touchmove', (e) => { if (G && (G.mode === 'drag' || G.mode === 'swipe')) e.preventDefault(); }, { passive: false });
app.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
app.addEventListener('contextmenu', (e) => { if (e.target.closest('.row[data-tid]')) e.preventDefault(); });

// ================================================================== Wiederkehrende Aufgaben
const REPEATS = [['', 'Nicht wiederholen'], ['daily', 'Jeden Tag'], ['weekdays', 'Werktags (Mo–Fr)'], ['weekly', 'Jede Woche'], ['biweekly', 'Alle 2 Wochen'], ['monthly', 'Jeden Monat'], ['quarterly', 'Alle 3 Monate'], ['yearly', 'Jedes Jahr']];
const REPEAT_SHORT = { daily: 'täglich', weekdays: 'werktags', weekly: 'wöchentlich', biweekly: '14-tägig', monthly: 'monatlich', quarterly: 'vierteljährlich', yearly: 'jährlich' };
function stepRepeat(iso, r, anchorDay) {
  const d = parseISO(iso);
  if (r === 'daily') d.setDate(d.getDate() + 1);
  else if (r === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
  else if (r === 'weekly') d.setDate(d.getDate() + 7);
  else if (r === 'biweekly') d.setDate(d.getDate() + 14);
  else if (r === 'monthly' || r === 'quarterly' || r === 'yearly') {
    const day = anchorDay || d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + (r === 'monthly' ? 1 : r === 'quarterly' ? 3 : 12));
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else return null;
  return isoDate(d);
}
// Nächster Termin nach dem Abhaken – immer in der Zukunft, auch wenn spät erledigt
function nextOccurrence(t) {
  const today = todayISO();
  let n = stepRepeat(t.due || today, t.repeat, t.repeatDay);
  for (let i = 0; n && n <= today && i < 3000; i++) n = stepRepeat(n, t.repeat, t.repeatDay);
  return n;
}
// Erster Termin, wenn eine Wiederholung ohne Datum angelegt wird
function firstRepeatDue(repeat) {
  let d = todayISO();
  if (repeat === 'weekdays') while ([0, 6].includes(parseISO(d).getDay())) d = addDays(d, 1);
  return d;
}
function repeatCopy(t, due) {
  const o = {};
  for (const k of ['title', 'areaId', 'phase', 'notes', 'reminder', 'time', 'leadDays', 'contactId', 'assignee', 'repeat', 'repeatDay', 'dueKind']) if (t[k] != null) o[k] = t[k];
  if (o.reminder === 'custom') o.reminder = 'day0';
  return { ...o, due, source: 'repeat', repeatOf: t.repeatOf || t.id };
}
const REPEAT_RX = [
  [/\s(?:jeden\s+tag|täglich)(?=\s)/i, 'daily'],
  [/\s(?:werktags|jeden\s+werktag|an\s+werktagen)(?=\s)/i, 'weekdays'],
  [/\s(?:alle\s+(?:2|zwei)\s+wochen|zweiwöchentlich|14-tägig|vierzehntägig)(?=\s)/i, 'biweekly'],
  [/\s(?:jede\s+woche|wöchentlich)(?=\s)/i, 'weekly'],
  [/\s(?:jedes\s+quartal|vierteljährlich|alle\s+(?:3|drei)\s+monate)(?=\s)/i, 'quarterly'],
  [/\s(?:jeden\s+monat|monatlich)(?=\s)/i, 'monthly'],
  [/\s(?:jedes\s+jahr|jährlich)(?=\s)/i, 'yearly'],
];
// „jeden Montag“ → wöchentlich, Wochentag bleibt für die Datumserkennung stehen
function takeRepeat(text) {
  let t = text;
  const wd = t.match(/\sjeden\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)(?=\s)/i);
  if (wd) return { text: t.replace(wd[0], ` am ${wd[1].toLowerCase()}`), repeat: 'weekly' };
  for (const [rx, r] of REPEAT_RX) { const m = t.match(rx); if (m) return { text: t.replace(m[0], ' '), repeat: r }; }
  return { text: t, repeat: null };
}

// ================================================================== Zähler (Kommentare, Dateien)
let CNT = null;
function counts() {
  if (CNT) return CNT;
  CNT = { c: new Map(), f: new Map(), cf: new Map() };
  const inc = (m, k) => k && m.set(k, (m.get(k) || 0) + 1);
  for (const c of S.comments) inc(CNT.c, c.taskId);
  for (const f of S.files) { inc(CNT.f, f.taskId); inc(CNT.cf, f.costId); }
  return CNT;
}
const filesFor = (kind, id) => S.files.filter((f) => (kind === 'task' ? f.taskId : f.costId) === id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const fileCount = (kind, id) => (kind === 'task' ? counts().f : counts().cf).get(id) || 0;

// ================================================================== Kosten & Zahlungsplan
const COST_KINDS = [['rate', 'Abschlag / Rate'], ['rechnung', 'Rechnung'], ['sonderwunsch', 'Sonderwunsch'], ['eigenleistung', 'Eigenleistung'], ['neben', 'Nebenkosten'], ['finanzierung', 'Finanzierung & Gebühren'], ['sonst', 'Sonstiges']];
const kindName = (k) => (COST_KINDS.find((x) => x[0] === k) || COST_KINDS[COST_KINDS.length - 1])[1];
const eur = (n) => (n == null || !isFinite(n) ? '–' : Number(n).toLocaleString(LOC(), { style: 'currency', currency: 'EUR', minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }));
const eurInput = (n) => (n == null || !isFinite(n) ? '' : Number(n).toLocaleString(LOC(), { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }));
function parseEur(s) {
  if (s == null) return null;
  let v = String(s).trim().replace(/[€\s]|eur(o)?/gi, '');
  if (!v) return null;
  if (LANG === 'en' && !/,\d{1,2}$/.test(v)) v = v.replace(/,/g, '');
  else if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}([.,]\d{3})+$/.test(v)) v = v.replace(/[.,]/g, '');
  else v = v.replace(',', '.');
  const n = parseFloat(v);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}
const costArea = (c) => (c.areaId && areaById(c.areaId) ? c.areaId : areaById('hausbau') ? 'hausbau' : areas()[0].id);
function costStats(areaId = 'all') {
  const today = todayISO();
  const list = S.costs.filter((c) => areaId === 'all' || costArea(c) === areaId);
  const sum = (xs) => xs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const planned = sum(list), paid = sum(list.filter((c) => c.paid));
  const budget = areaId === 'all' ? areas().reduce((s, a) => s + (Number(a.budget) || 0), 0) : Number(areaById(areaId)?.budget) || 0;
  const upcoming = list.filter((c) => !c.paid && c.due).sort((a, b) => a.due.localeCompare(b.due));
  return { list, planned, paid, open: planned - paid, budget, rest: budget ? budget - planned : null, upcoming, late: upcoming.filter((c) => c.due < today), unknown: list.filter((c) => c.amount == null).length };
}
function costBar(st) {
  const max = Math.max(st.budget || 0, st.planned, 1);
  const over = st.budget && st.planned > st.budget;
  return `<div class="cbar ${over ? 'over' : ''}" role="img" aria-label="Bezahlt ${esc(eur(st.paid))}, noch offen ${esc(eur(st.open))}${st.budget ? `, Budget ${esc(eur(st.budget))}` : ''}">
    <i class="c-paid" style="width:${(st.paid / max) * 100}%"></i><i class="c-open" style="width:${(Math.max(0, st.open) / max) * 100}%"></i>
    ${over ? `<b class="c-mark" style="left:${(st.budget / max) * 100}%"></b>` : ''}</div>`;
}
function costRow(c) {
  const a = areaById(costArea(c));
  const late = !c.paid && c.due && c.due < todayISO();
  const meta = [];
  if (c.isNew && !c.paid) meta.push('<span class="badge s-jetzt_starten">Neu aus E-Mail</span>');
  if (c.paid) meta.push(`<span>Bezahlt${c.paidAt ? ` am ${esc(fmtDate(c.paidAt, { day: 'numeric', month: 'short' }))}` : ''}</span>`);
  else if (c.due) meta.push(`<span class="${late ? 'late' : ''}">${late ? 'Überfällig seit' : 'Fällig'} ${esc(dueLabel({ due: c.due }).text)}</span>`);
  else meta.push('<span>Noch ohne Termin</span>');
  if (S.costArea === 'all' && areas().filter((x) => S.costs.some((k) => costArea(k) === x.id)).length > 1) meta.push(`<span class="area-tag" style="--area:${esc(a.color)}">${esc(a.emoji)} ${esc(a.name)}</span>`);
  const nf = fileCount('cost', c.id);
  if (nf) meta.push(`<span>📎 ${nf}</span>`);
  return `<div class="row cost-row ${c.paid ? 'done' : ''}" style="--area:${esc(a.color)}">
    <button class="check" data-action="cost-paid" data-id="${esc(c.id)}" aria-label="${c.paid ? 'Wieder als offen markieren' : 'Als bezahlt markieren'}: ${esc(c.title)}">${I.check}</button>
    <button class="row-main" data-action="cost-edit" data-id="${esc(c.id)}"><div class="row-title">${esc(c.title)}</div><div class="row-meta">${meta.join('')}</div></button>
    <span class="amt ${c.amount == null ? 'muted' : ''}">${c.amount == null ? 'Betrag?' : esc(eur(c.amount))}</span></div>`;
}
function homeCosts() {
  if (!S.costs.length) return '';
  const st = costStats('all');
  const nx = st.upcoming[0];
  return `<section class="card"><button class="card-link" data-action="open-costs">
    <div class="card-head"><h2>Kosten</h2><span class="link">Alle ›</span></div>
    <p class="cs-mini"><b>${esc(eur(st.paid))}</b> bezahlt von ${esc(eur(st.planned))}${st.budget ? ` · Budget ${esc(eur(st.budget))}` : ''}</p>
    ${costBar(st)}
    ${st.late.length ? `<p class="cs-next late">${st.late.length} ${st.late.length === 1 ? 'Zahlung ist' : 'Zahlungen sind'} überfällig</p>`
      : nx ? `<p class="cs-next">Nächste Zahlung: <strong>${esc(nx.title)}</strong> · ${esc(eur(nx.amount))} · ${esc(dueLabel({ due: nx.due }).text)}</p>` : ''}
  </button></section>`;
}
function viewCosts() {
  const ar = S.costArea && (S.costArea === 'all' || areaById(S.costArea)) ? S.costArea : 'all';
  S.costArea = ar;
  const st = costStats(ar);
  const area = ar !== 'all' ? areaById(ar) : null;
  const used = areas().filter((a) => S.costs.some((c) => costArea(c) === a.id) || a.id === ar);
  const chips = used.length > 1 || ar !== 'all' ? `<div class="chips" role="group" aria-label="Bereich">
      <button class="chip" data-action="cost-area" data-id="all" aria-pressed="${ar === 'all'}">Alle</button>
      ${used.map((a) => `<button class="chip" data-action="cost-area" data-id="${esc(a.id)}" aria-pressed="${ar === a.id}" style="--area:${esc(a.color)}">${esc(a.emoji)} ${esc(a.name)}</button>`).join('')}</div>` : '';
  const head = `<button class="back" data-action="back">‹ Zurück</button>
    <header class="page-head"><h1>Kosten${area ? ` · ${esc(area.name)}` : ''}</h1></header>${chips}`;
  if (!st.list.length) {
    return `<main class="view">${head}
      <div class="empty">${sunArt()}<strong>Noch keine Kosten erfasst</strong>Behalte Raten, Rechnungen und Sonderwünsche im Blick – mit Budget und Erinnerung vor jeder Zahlung.</div>
      <div class="btn-col">
        <button class="btn block" data-action="cost-template">Ratenplan aus Vorlage anlegen</button>
        <button class="btn block secondary" data-action="cost-new">Einzelne Kosten erfassen</button>
        ${st.budget ? '' : `<button class="btn block ghost" data-action="cost-budget">Budget festlegen</button>`}
      </div></main>`;
  }
  const summary = `<section class="card cost-card">
    <div class="cs-top"><div><span class="cs-label">Bereits bezahlt</span><b class="cs-big">${esc(eur(st.paid))}</b>
      <span class="cs-sub">von ${esc(eur(st.planned))} geplant${st.unknown ? ` · ${st.unknown} ohne Betrag` : ''}</span></div>
      ${ring(st.planned ? st.paid / st.planned : 0, 64, 8)}</div>
    ${costBar(st)}
    <div class="cs-legend"><span><i class="c-paid"></i>Bezahlt</span><span><i class="c-open"></i>Noch offen <b>${esc(eur(st.open))}</b></span>
      ${st.budget ? (st.rest >= 0 ? `<span><i class="c-rest"></i>Puffer <b>${esc(eur(st.rest))}</b></span>` : `<span class="late"><i class="c-over"></i><b>${esc(eur(-st.rest))} über Budget</b></span>`) : ''}</div>
    <button class="cs-budget" data-action="cost-budget">${st.budget ? `Budget${area ? '' : ' gesamt'}: <strong>${esc(eur(st.budget))}</strong> <span class="link inline">ändern</span>` : `${I.plus} Budget festlegen – dann siehst du, wie viel Puffer bleibt`}</button>
  </section>`;
  const today = todayISO();
  const tl = st.upcoming.slice(0, 5);
  const timeline = tl.length ? `<section class="card"><div class="card-head"><h2>Nächste Zahlungen</h2></div>
    <ol class="pay-tl">${tl.map((c) => { const d = parseISO(c.due); return `<li><button data-action="cost-edit" data-id="${esc(c.id)}" class="${c.due < today ? 'is-late' : ''}">
      <span class="pt-date"><b>${d.getDate()}</b>${esc(d.toLocaleDateString(LOC(), { month: 'short' }).replace('.', ''))}</span>
      <span class="pt-t"><strong>${esc(c.title)}</strong><small>${c.due < today ? 'überfällig' : esc(dueLabel({ due: c.due }).text)} · ${esc(kindName(c.kind))}</small></span>
      <span class="pt-a">${esc(c.amount == null ? 'Betrag?' : eur(c.amount))}</span></button></li>`; }).join('')}</ol></section>` : '';
  const sortRate = (a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.due || '9999').localeCompare(b.due || '9999') || (a.createdAt || 0) - (b.createdAt || 0);
  const sortOther = (a, b) => (a.paid - b.paid) || (a.due || '9999').localeCompare(b.due || '9999') || (a.createdAt || 0) - (b.createdAt || 0);
  const groups = COST_KINDS.map(([k, label]) => {
    const items = st.list.filter((c) => (COST_KINDS.some((x) => x[0] === c.kind) ? c.kind : 'sonst') === k).sort(k === 'rate' ? sortRate : sortOther);
    if (!items.length) return '';
    const sum = items.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const paid = items.filter((c) => c.paid).length;
    return `<div class="group-head"><h2>${esc(label)}</h2><span>${paid} von ${items.length} bezahlt · ${esc(eur(sum))}</span></div>
      <div class="list">${items.map(costRow).join('')}</div>`;
  }).join('');
  return `<main class="view">${head}
    ${st.late.length ? `<div class="note-card warn"><p><strong>${st.late.length} ${st.late.length === 1 ? 'Zahlung ist' : 'Zahlungen sind'} überfällig.</strong> Schon bezahlt? Dann einfach abhaken.</p></div>` : ''}
    ${summary}${timeline}${groups}
    <button class="add-line big" data-action="cost-new">${I.plus} Kosten oder Zahlung erfassen</button>
    <button class="add-line" data-action="cost-template">${I.plus} Ratenplan aus Vorlage</button>
    <p class="hint">Haken = bezahlt. Belege wie Rechnungen oder Überweisungsbestätigungen hängst du direkt an die Zahlung.</p>
  </main>`;
}
async function toggleCostPaid(id, x, y) {
  const c = S.costs.find((k) => k.id === id); if (!c) return;
  const patch = c.paid ? { paid: false, paidAt: null } : { paid: true, paidAt: todayISO(), isNew: false };
  if (!c.paid && x != null) celebrate(x, y);
  try {
    await store.updateCost(id, patch);
    if (!c.paid) toast(`Bezahlt ✓${c.amount != null ? ` ${eur(c.amount)}` : ''}`, { label: 'Rückgängig', fn: () => store.updateCost(id, { paid: false, paidAt: null }) });
  } catch (e) { toast(fail(e)); }
}
function costSheet(c, preset = {}) {
  const isNew = !c;
  const v = c || { title: '', amount: null, kind: 'rechnung', areaId: S.costArea && S.costArea !== 'all' ? S.costArea : (areaById('hausbau') ? 'hausbau' : areas()[0].id), due: '', paid: false, paidAt: null, contactId: null, note: '', ...preset };
  const pending = [];
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${isNew ? 'Neue Kosten' : 'Kosten'}</h2><button class="btn ghost" data-dismiss>${isNew ? 'Abbrechen' : 'Schließen'}</button></div>
    ${c?.isNew && !c.paid ? `<div class="note-card soft"><p>📬 Aus einer E-Mail erkannt. Speichern bestätigt den Eintrag.</p></div>` : ''}
    <form>
      <label class="field"><span>Wofür?</span><input name="title" required value="${esc(v.title)}" placeholder="z. B. 2. Abschlag Rohbau"></label>
      <div class="two">
        <label class="field"><span>Betrag (€)</span><input name="amount" inputmode="decimal" autocomplete="off" value="${esc(eurInput(v.amount))}" placeholder="z. B. 28.500"></label>
        <label class="field"><span>Art</span><select name="kind">${COST_KINDS.map(([k, l]) => `<option value="${k}" ${v.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="two">
        <label class="field"><span>Fällig am</span><input type="date" name="due" value="${esc(v.due || '')}"></label>
        <label class="field"><span>Bereich</span>${areaSelect('name="areaId"', costArea(v))}</label>
      </div>
      <label class="opt toggle-paid"><input type="checkbox" name="paid" ${v.paid ? 'checked' : ''}> Bereits bezahlt</label>
      <label class="field" data-paidat ${v.paid ? '' : 'hidden'} style="margin-top:12px"><span>Bezahlt am</span><input type="date" name="paidAt" value="${esc(v.paidAt || todayISO())}"></label>
      <label class="field" style="margin-top:14px"><span>Empfänger / Ansprechpartner</span><select name="contactId">${contactOptions(v.contactId)}</select></label>
      <label class="field"><span>Notiz</span><textarea name="note" rows="2" placeholder="z. B. Rechnungsnummer, Verwendungszweck">${esc(v.note || '')}</textarea></label>
      <div class="field"><span>Belege – Rechnung, Foto, PDF</span><div data-att-wrap>${attachBox({ costId: c?.id }, pending)}</div></div>
      <p class="hint">Für offene Zahlungen mit Datum erinnert MindSpace 3 Tage vorher und am Fälligkeitstag per Push.</p>
      <button class="btn block" type="submit">Speichern</button>
      ${!isNew ? `<div class="btn-row" style="justify-content:space-between;margin-top:10px">
        <button type="button" class="btn ghost" data-act="paid">${c.paid ? 'Wieder offen' : 'Als bezahlt markieren'}</button>
        <button type="button" class="btn ghost danger-text" data-act="delete">Löschen</button></div>` : ''}
    </form>`);
  const form = sheet.querySelector('form');
  form.paid.addEventListener('change', () => { sheet.querySelector('[data-paidat]').hidden = !form.paid.checked; });
  wireAttach(sheet, () => ({ costId: c?.id, areaId: form.areaId.value }), pending);
  if (isNew) setTimeout(() => form.title.focus(), 280);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const data = {
      title: f.title.trim(), amount: parseEur(f.amount), kind: f.kind, due: f.due || null, areaId: f.areaId,
      paid: !!f.paid, paidAt: f.paid ? (f.paidAt || todayISO()) : null, contactId: f.contactId || null, note: f.note.trim(), isNew: false,
    };
    if (!data.title) return;
    if (f.amount.trim() && data.amount == null) { toast('Der Betrag ist nicht lesbar, z. B. 1.250,50'); return; }
    try {
      if (!S.areas.length) await ensureAreasStored();
      let id = c?.id;
      if (c) await store.updateCost(c.id, data); else id = await store.addCost(data);
      closeSheet();
      if (pending.length) await uploadFiles(pending.map((p) => p.file), { costId: id, areaId: data.areaId });
      else toast(c ? 'Gespeichert' : 'Kosten erfasst');
    } catch (err) { toast(fail(err)); }
  };
  sheet.querySelector('[data-act="paid"]')?.addEventListener('click', (e) => { const r = e.target.getBoundingClientRect(); closeSheet(); toggleCostPaid(c.id, r.left + 20, r.top + 10); });
  sheet.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
    if (!confirm('Diesen Eintrag löschen?')) return;
    closeSheet();
    try { await store.deleteCost(c.id); toast('Gelöscht', { label: 'Rückgängig', fn: () => { const { id, ...rest } = c; store.addCost(rest); } }); } catch (err) { toast(fail(err)); }
  });
}
function budgetSheet() {
  const list = S.costArea && S.costArea !== 'all' ? [areaById(S.costArea)] : areas();
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Budget</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <p class="hint" style="margin-top:-4px">Wie viel wollt oder könnt ihr insgesamt ausgeben? Beim Hausbau z. B. Finanzierungssumme plus Eigenkapital. MindSpace zeigt dann, wie viel Puffer bleibt.</p>
    <form>
      ${list.map((a) => `<label class="field"><span>${esc(a.emoji)} ${esc(a.name)}</span><input inputmode="decimal" autocomplete="off" name="${esc(a.id)}" value="${esc(eurInput(a.budget))}" placeholder="kein Budget"></label>`).join('')}
      <button class="btn block" type="submit">Speichern</button>
    </form>`);
  sheet.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await ensureAreasStored();
      for (const a of list) {
        const v = parseEur(e.target[a.id].value);
        if ((v ?? null) !== (a.budget ?? null)) await store.setArea(a.id, { budget: v });
      }
      closeSheet(); toast('Budget gespeichert');
    } catch (err) { toast(fail(err)); }
  };
}
// Ratenplan nach Baufortschritt – Beispielwerte aus der Makler- und Bauträgerverordnung (§ 3 MaBV)
const RATE_PLAN = [['Beginn der Erdarbeiten', 30], ['Rohbau inkl. Zimmererarbeiten', 28], ['Dachflächen und Dachrinnen', 5.6], ['Rohinstallation Heizung', 2.1], ['Rohinstallation Sanitär', 2.1],
  ['Rohinstallation Elektro', 2.1], ['Fenstereinbau inkl. Verglasung', 7], ['Innenputz', 4.2], ['Estrich', 2.1], ['Fliesen im Sanitärbereich', 2.8], ['Bezugsfertigkeit / Übergabe', 8.4], ['Fassadenarbeiten', 2.1], ['Vollständige Fertigstellung', 3.5]];
const SIDE_COSTS = ['Notar und Grundbuch', 'Grunderwerbsteuer', 'Vermessung und Gebäudeeinmessung', 'Bodengutachten', 'Hausanschlüsse (Strom, Wasser, Abwasser, Internet)', 'Baustrom und Bauwasser',
  'Bauherrenhaftpflicht und Bauleistungsversicherung', 'Bodenplatte oder Keller (falls nicht im Vertrag)', 'Außenanlagen, Terrasse, Garage', 'Küche', 'Umzug'];
function rateSheet() {
  const defArea = S.costArea && S.costArea !== 'all' ? S.costArea : areaById('hausbau') ? 'hausbau' : areas()[0].id;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Ratenplan</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <div class="note-card soft"><p>Beispiel nach Baufortschritt (MaBV). Fertighausfirmen wie allkauf haben oft einen <strong>eigenen Zahlungsplan</strong> – übernimm Raten und Prozente einfach aus eurem Bauvertrag. Termine trägst du ein, sobald sie feststehen.</p></div>
    <form>
      <div class="two">
        <label class="field"><span>Gesamtpreis laut Vertrag (€)</span><input name="total" inputmode="decimal" autocomplete="off" placeholder="z. B. 380.000"></label>
        <label class="field"><span>Bereich</span>${areaSelect('name="areaId"', defArea)}</label>
      </div>
      <div class="rates">${RATE_PLAN.map(([n, p], i) => `<div class="rate"><input type="checkbox" name="on${i}" checked aria-label="Rate übernehmen">
        <input class="rate-n" name="n${i}" value="${esc(tr(n))}" aria-label="Bezeichnung"><span class="rate-p"><input name="p${i}" inputmode="decimal" value="${esc(String(p).replace('.', ','))}" aria-label="Prozent">%</span>
        <span class="rate-a" data-a="${i}"></span></div>`).join('')}</div>
      <p class="rate-sum" data-sum></p>
      <label class="opt"><input type="checkbox" name="side" checked> Typische Nebenkosten als Liste dazu (Notar, Grunderwerbsteuer, Anschlüsse, Küche …) – Beträge trägst du später ein</label>
      <button class="btn block" type="submit" style="margin-top:16px">Ratenplan anlegen</button>
    </form>`);
  const form = sheet.querySelector('form');
  const upd = () => {
    const total = parseEur(form.total.value);
    let sum = 0;
    RATE_PLAN.forEach((_, i) => {
      const on = form[`on${i}`].checked; const p = parseEur(form[`p${i}`].value) || 0;
      if (on) sum += p;
      sheet.querySelector(`[data-a="${i}"]`).textContent = on && total ? eur(Math.round(total * p) / 100) : '';
      form[`n${i}`].closest('.rate').classList.toggle('off', !on);
    });
    const s = Math.round(sum * 10) / 10;
    const el = sheet.querySelector('[data-sum]');
    el.textContent = `Summe: ${String(s).replace('.', ',')} %${Math.abs(s - 100) > 0.05 ? ' – sollte 100 % ergeben' : ' ✓'}`;
    el.classList.toggle('late', Math.abs(s - 100) > 0.05);
  };
  form.addEventListener('input', upd); upd();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const total = parseEur(form.total.value);
    const areaId = form.areaId.value;
    const list = [];
    let n = 0;
    RATE_PLAN.forEach((_, i) => {
      if (!form[`on${i}`].checked) return;
      const p = parseEur(form[`p${i}`].value) || 0;
      n++;
      list.push({ title: LANG === 'en' ? `Instalment ${n}: ${form[`n${i}`].value.trim()}` : `${n}. Rate: ${form[`n${i}`].value.trim()}`, amount: total ? Math.round(total * p) / 100 : null, kind: 'rate', areaId, due: null, order: n, note: LANG === 'en' ? `${p} % of the total price` : `${String(p).replace('.', ',')} % des Gesamtpreises` });
    });
    if (form.side.checked) SIDE_COSTS.map(tr).forEach((t, i) => { if (!S.costs.some((c) => c.title === t && costArea(c) === areaId)) list.push({ title: t, amount: null, kind: 'neben', areaId, due: null, order: 100 + i }); });
    if (!list.length) return;
    try {
      if (!S.areas.length) await ensureAreasStored();
      await store.addCosts(list);
      closeSheet();
      S.costArea = areaId; S.prevView = S.view === 'costs' ? S.prevView : S.view; S.view = 'costs'; render(); window.scrollTo(0, 0);
      toast(`${list.length} Einträge angelegt ✨`);
    } catch (err) { toast(fail(err)); }
  };
}

// ================================================================== Fotos & Dokumente
const MAX_FILE = 15 * 1024 * 1024;
const ACCEPT = 'image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
const extOf = (n) => ((String(n).match(/\.([a-z0-9]{1,5})$/i) || [])[1] || 'Datei').toUpperCase();
const fmtSize = (b) => (!b ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
function fileThumb(f) {
  return f.thumb ? `<img src="${esc(f.thumb)}" alt="" loading="lazy">` : `<span class="att-doc">${esc(extOf(f.name))}</span>`;
}
function attachBox(link, pending = []) {
  const files = link.taskId ? filesFor('task', link.taskId) : link.costId ? filesFor('cost', link.costId) : [];
  const items = files.map((f) => `<button type="button" class="att-item" data-file="${esc(f.id)}" aria-label="${esc(f.name)} öffnen">${fileThumb(f)}</button>`).join('')
    + pending.map((p, i) => `<span class="att-item pending">${p.url ? `<img src="${p.url}" alt="">` : `<span class="att-doc">${esc(extOf(p.file.name))}</span>`}<button type="button" class="att-x" data-unpend="${i}" aria-label="Entfernen">×</button></span>`).join('');
  return `<div class="att">${items}<label class="att-add">${I.camera}<span>Foto / Datei</span><input type="file" multiple accept="${ACCEPT}" data-attach></label></div>
    ${pending.length ? '<p class="hint" style="margin:6px 0 0">Wird beim Speichern hochgeladen.</p>' : ''}`;
}
function wireAttach(sheet, link, pending) {
  const wrap = sheet.querySelector('[data-att-wrap]'); if (!wrap) return;
  const redraw = () => { wrap.innerHTML = attachBox(link(), pending); };
  wrap.addFiles = async (files) => {
    const l = link();
    if (l.taskId || l.costId) await uploadFiles(files, l);
    else for (const f of files) pending.push({ file: f, url: /^image\/(jpeg|png|webp|gif)/.test(f.type) ? URL.createObjectURL(f) : null });
    redraw();
  };
  wrap.addEventListener('change', (e) => {
    if (!e.target.matches('[data-attach]') || !e.target.files.length) return;
    wrap.addFiles([...e.target.files]);
  });
  wrap.addEventListener('click', (e) => {
    const x = e.target.closest('[data-unpend]');
    if (x) { e.preventDefault(); pending.splice(+x.dataset.unpend, 1); redraw(); return; }
    const f = e.target.closest('[data-file]');
    if (f) openViewer(S.files.find((k) => k.id === f.dataset.file));
  });
  (sheet.refreshers ||= []).push(redraw);
}
async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}
function drawScaled(img, maxSide) {
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
// Fotos verkleinern (spart Speicher und Datenvolumen), Vorschaubild erzeugen
async function prepareFile(file) {
  const stamp = new Date().toLocaleString(LOC(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  let name = file.name && !/^image\.(jpe?g|png|heic)$/i.test(file.name) ? file.name : `Foto ${stamp}.jpg`;
  const meta = { name, type: file.type || 'application/octet-stream', thumb: null };
  if (/^image\//.test(file.type) && !/svg|gif/.test(file.type)) {
    try {
      const img = await loadImage(file);
      const big = drawScaled(img, 1800);
      const blob = await new Promise((ok) => big.toBlob(ok, 'image/jpeg', 0.8));
      meta.thumb = drawScaled(img, 260).toDataURL('image/jpeg', 0.62);
      meta.w = big.width; meta.h = big.height;
      if (blob && (blob.size < file.size || /heic|heif/i.test(file.type))) { meta.type = 'image/jpeg'; meta.name = name.replace(/\.(heic|heif|png|webp|jpeg)$/i, '.jpg'); return { blob, meta }; }
    } catch { /* Bild nicht lesbar – unverändert speichern */ }
  }
  return { blob: file, meta };
}
async function uploadFiles(files, link) {
  const l = { taskId: link.taskId || null, costId: link.costId || null, areaId: link.areaId || null };
  let ok = 0;
  if (billing()) {
    const need = files.reduce((n, f) => n + Math.min(f.size, MAX_FILE), 0);
    if ((S.project?.storageBytes || 0) + need * 0.6 > lim('storageMB') * 1048576) { paywallSheet('storage'); return; }
  }
  for (const [i, f] of files.entries()) {
    if (f.size > MAX_FILE) { toast(`„${f.name}“ ist zu groß (höchstens 15 MB).`); continue; }
    toast(files.length > 1 ? `Wird gespeichert … ${i + 1} von ${files.length}` : 'Wird gespeichert …');
    try {
      const { blob, meta } = await prepareFile(f);
      if (blob.size > MAX_FILE) { toast(`„${f.name}“ ist zu groß (höchstens 15 MB).`); continue; }
      await store.addFile({ ...meta, ...l }, blob);
      ok++;
    } catch (e) { toast(fail(e)); return ok; }
  }
  if (ok) toast(ok === 1 ? 'Gespeichert 📎' : `${ok} Dateien gespeichert 📎`);
  return ok;
}
const fileArea = (f) => {
  if (f.areaId && areaById(f.areaId)) return f.areaId;
  const t = f.taskId && S.tasks.find((x) => x.id === f.taskId); if (t) return areaOf(t).id;
  const c = f.costId && S.costs.find((x) => x.id === f.costId); if (c) return costArea(c);
  return null;
};
const blobCache = new Map();
async function openViewer(f) {
  if (!f) return;
  document.querySelector('.viewer')?.remove();
  const isImg = /^image\//.test(f.type), isPdf = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name);
  const task = f.taskId ? S.tasks.find((t) => t.id === f.taskId) : null;
  const cost = f.costId ? S.costs.find((c) => c.id === f.costId) : null;
  const v = document.createElement('div');
  v.className = 'viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-label', f.name);
  const info = [fmtStamp(f.createdAt), members().length > 1 && f.createdBy ? whoName(f.createdBy) : '', fmtSize(f.size)].filter(Boolean).join(' · ');
  v.innerHTML = `<div class="viewer-top"><span class="viewer-name">${esc(f.name)}</span><button class="viewer-x" data-v="close" aria-label="Schließen">×</button></div>
    <div class="viewer-body">${f.thumb ? `<img src="${esc(f.thumb)}" class="blur" alt="">` : ''}<span class="spin"></span></div>
    <div class="viewer-info">${esc(info)}${task ? `<button class="viewer-link" data-v="task">Aufgabe: ${esc(task.title)} ›</button>` : cost ? `<button class="viewer-link" data-v="cost">Kosten: ${esc(cost.title)} ›</button>` : ''}</div>
    <div class="viewer-bar"><button class="btn" data-v="share">${I.share} Öffnen / Sichern</button><button class="btn ghost light" data-v="delete">Löschen</button></div>`;
  document.body.appendChild(v);
  let blob = null, url = null;
  const close = () => { v.remove(); if (url) URL.revokeObjectURL(url); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  v.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    const k = b.dataset.v;
    if (k === 'close') close();
    else if (k === 'task') { close(); taskSheet(S.tasks.find((t) => t.id === f.taskId)); }
    else if (k === 'cost') { close(); costSheet(S.costs.find((c) => c.id === f.costId)); }
    else if (k === 'delete') {
      if (!confirm(`„${f.name}“ endgültig löschen?`)) return;
      close();
      try { await store.deleteFile(f); blobCache.delete(f.id); toast('Gelöscht'); } catch (err) { toast(fail(err)); }
    } else if (k === 'share' && blob) {
      if (native.isNative()) { try { await native.shareFile(blob, f.name); } catch (err) { if (!/cancel/i.test(String(err?.message))) toast(fail(err)); } return; }
      const file = new File([blob], f.name, { type: f.type || blob.type });
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: f.name }); return; } catch (err) { if (err.name === 'AbortError') return; } }
      const a = document.createElement('a'); a.href = url; a.download = f.name; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    }
  });
  try {
    blob = blobCache.get(f.id) || await store.getFileBlob(f);
    blobCache.set(f.id, blob); if (blobCache.size > 24) blobCache.delete(blobCache.keys().next().value);
    if (!v.isConnected) return;
    url = URL.createObjectURL(blob);
    v.querySelector('.viewer-body').innerHTML = isImg ? `<img src="${url}" alt="${esc(f.name)}">`
      : isPdf ? `<iframe src="${url}" title="${esc(f.name)}"></iframe>`
      : `<div class="viewer-doc"><span class="att-doc big">${esc(extOf(f.name))}</span><p>${esc(f.name)}</p><p class="muted">Zum Ansehen auf „Öffnen / Sichern“ tippen.</p></div>`;
  } catch (e) { if (v.isConnected) v.querySelector('.viewer-body').innerHTML = `<p class="viewer-err">${esc(fail(e))}</p>`; }
}
function viewDocs() {
  const ar = S.docsArea && (S.docsArea === 'all' || areaById(S.docsArea)) ? S.docsArea : 'all';
  S.docsArea = ar;
  const list = S.files.filter((f) => ar === 'all' || fileArea(f) === ar).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const used = areas().filter((a) => S.files.some((f) => fileArea(f) === a.id) || a.id === ar);
  const chips = used.length > 1 || ar !== 'all' ? `<div class="chips" role="group" aria-label="Bereich">
      <button class="chip" data-action="docs-area" data-id="all" aria-pressed="${ar === 'all'}">Alle</button>
      ${used.map((a) => `<button class="chip" data-action="docs-area" data-id="${esc(a.id)}" aria-pressed="${ar === a.id}" style="--area:${esc(a.color)}">${esc(a.emoji)} ${esc(a.name)}</button>`).join('')}</div>` : '';
  const upl = `<label class="btn block secondary upl">${I.camera} Foto oder Datei hinzufügen<input type="file" multiple accept="${ACCEPT}" data-action="docs-upload"></label>`;
  const months = new Map();
  for (const f of list) { const k = new Date(f.createdAt || Date.now()).toLocaleDateString(LOC(), { month: 'long', year: 'numeric' }); if (!months.has(k)) months.set(k, []); months.get(k).push(f); }
  const caption = (f) => { const t = f.taskId && S.tasks.find((x) => x.id === f.taskId); const c = f.costId && S.costs.find((x) => x.id === f.costId); return t ? t.title : c ? c.title : f.name; };
  const body = list.length ? [...months].map(([m, fs]) => `<h2 class="section-title">${esc(m)}</h2>
      <div class="gal">${fs.map((f) => `<button class="gal-item" data-action="file-open" data-id="${esc(f.id)}">${fileThumb(f)}<span class="gal-cap">${esc(caption(f))}</span></button>`).join('')}</div>`).join('')
    : `<div class="empty">${sunArt()}<strong>Noch keine Fotos oder Dokumente</strong>Halte den Baufortschritt fest und sammle Rechnungen, Angebote und Protokolle – hier oder direkt an der passenden Aufgabe.</div>`;
  return `<main class="view"><button class="back" data-action="back">‹ Zurück</button>
    <header class="page-head"><h1>Fotos & Dokumente</h1></header>${chips}${upl}${body}
    <p class="hint">Fotos werden automatisch verkleinert. Dateien bis 15 MB.</p></main>`;
}

// ================================================================== Kommentare & Verlauf
function fmtStamp(ms) {
  if (!ms) return '';
  const d = new Date(ms); const iso = isoDate(d); const diff = dayDiff(iso);
  const hm = d.toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
  return diff === 0 ? `heute ${hm}` : diff === -1 ? `gestern ${hm}` : `${fmtDate(iso, { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}, ${hm}`;
}
const isMine = (uid) => uid === 'local' || (uid && uid === S.me?.uid);
const whoName = (uid, fallback) => (uid === 'mindora' ? 'MindSpace' : isMine(uid) ? 'Du' : (S.project?.memberNames || {})[uid] || fallback || 'Jemand');
function threadList(t) {
  const ev = [];
  if (t.createdAt) ev.push({ at: t.createdAt, sys: true, by: t.createdBy, text: t.source === 'repeat' ? 'Als nächster Termin angelegt' : /mail/.test(t.source || '') ? `Aus einer E-Mail angelegt${t.mailSubject ? ` („${t.mailSubject}“)` : ''}` : 'Angelegt' });
  for (const c of S.comments) if (c.taskId === t.id) ev.push({ at: c.at || 0, text: c.text, by: c.by, byName: c.byName, id: c.id });
  if (t.done && t.doneAt) ev.push({ at: t.doneAt, sys: true, done: true, by: t.doneBy, text: 'Erledigt' });
  ev.sort((a, b) => a.at - b.at);
  const showWho = (by) => by && (members().length > 1 || by === 'mindora');
  return `<ol class="thread">${ev.map((e) => e.sys
    ? `<li class="ev sys ${e.done ? 'ok' : ''}"><span>${e.done ? '✓ ' : ''}${esc(e.text)}${showWho(e.by) ? ` · ${esc(whoName(e.by))}` : ''}</span><time>${esc(fmtStamp(e.at))}</time></li>`
    : `<li class="ev cmt ${isMine(e.by) ? 'mine' : ''}"><div class="bubble">${members().length > 1 || !isMine(e.by) ? `<b>${esc(whoName(e.by, e.byName))}</b>` : ''}<p translate="no">${esc(e.text)}</p></div>
        <time>${esc(fmtStamp(e.at))}${isMine(e.by) ? ` · <button type="button" class="link inline" data-delc="${esc(e.id)}">löschen</button>` : ''}</time></li>`).join('')}</ol>`;
}
function wireThread(sheet, taskId) {
  const wrap = sheet.querySelector('[data-thread]'); if (!wrap) return;
  const ta = wrap.querySelector('[data-cmt]');
  const btn = wrap.querySelector('[data-cmt-send]');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; btn.disabled = !ta.value.trim(); };
  ta.addEventListener('input', grow); grow();
  const send = async () => {
    const text = ta.value.trim(); if (!text) return;
    btn.disabled = true;
    try { const tk = S.tasks.find((x) => x.id === taskId); await store.addComment({ taskId, areaId: tk ? areaOf(tk).id : null, text }); ta.value = ''; grow(); ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { toast(fail(e)); btn.disabled = false; }
  };
  btn.addEventListener('click', send);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  wrap.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-delc]'); if (!d) return;
    if (!confirm('Kommentar löschen?')) return;
    try { await store.deleteComment(d.dataset.delc); } catch (err) { toast(fail(err)); }
  });
  const redraw = () => { const t = S.tasks.find((x) => x.id === taskId); if (t) wrap.querySelector('.thread').outerHTML = threadList(t); };
  (sheet.refreshers ||= []).push(redraw);
}
function refreshSheet() { sheetRoot.querySelector('.sheet')?.refreshers?.forEach((f) => { try { f(); } catch (e) { console.warn(e); } }); }

// ================================================================== Bündeln: ähnliche Aufgaben nicht doppelt anlegen
function findSimilar(title, min = 0.75) {
  let best = null, score = 0;
  for (const t of S.tasks) {
    if (t.done) continue;
    const s = similarity(t.title, title);
    if (s >= min && s > score) { best = t; score = s; }
  }
  return best;
}
async function bundleInto(ex, { text, due = null, time = null }) {
  await store.addComment({ taskId: ex.id, areaId: areaOf(ex).id, text: String(text).slice(0, 900) });
  if (due && (!ex.due || due < ex.due)) await store.updateTask(ex.id, { due, time: time || ex.time || null }, S.tasks.find((x) => x.id === ex.id) || ex);
}

// ================================================================== Spracheingabe
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
function listen({ onText, onEnd }) {
  if (!SR) return null;
  const rec = new SR();
  rec.lang = LANG === 'en' ? 'en-GB' : 'de-DE';
  rec.continuous = true; rec.interimResults = true;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript;
    }
    onText((finalText + interim).trim());
  };
  rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Mikrofon nicht erlaubt – bitte in den Einstellungen freigeben.'); };
  rec.onend = () => onEnd?.();
  try { rec.start(); } catch { return null; }
  return rec;
}
function micButton(attrs = '') {
  return `<button type="button" class="mic-btn" ${attrs} aria-label="Spracheingabe">${I.mic}</button>`;
}
function voiceSheet(preset = '') {
  let rec = null;
  let result = null;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Sprachnotiz</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <div class="voice">
      <button type="button" class="voice-mic" data-rec aria-label="Aufnahme starten">${I.mic}</button>
      <p class="voice-state" data-state>${SR ? 'Tippen und sprechen, z. B. „Morgen um 10 die Bank wegen der Zinsbindung anrufen“' : 'Tippe unten ins Feld und nutze das Mikrofon der Tastatur.'}</p>
    </div>
    <label class="field"><span>Was du gesagt hast</span><textarea data-voice rows="3" placeholder="Hier erscheint der Text – du kannst ihn auch bearbeiten.">${esc(preset)}</textarea></label>
    <button class="btn block" data-go>${S.ai ? `${I.spark} Mit KI auswerten` : 'Aufgabe erkennen'}</button>
    <div data-result></div>`);
  const ta = sheet.querySelector('[data-voice]');
  const recBtn = sheet.querySelector('[data-rec]');
  const state = sheet.querySelector('[data-state]');
  const stop = () => { try { rec?.stop(); } catch {} rec = null; recBtn.classList.remove('on'); };
  const start = () => {
    rec = listen({ onText: (t) => { ta.value = t; }, onEnd: () => { recBtn.classList.remove('on'); state.textContent = ta.value.trim() ? 'Fertig? Dann auswerten.' : 'Nichts verstanden – noch einmal versuchen.'; rec = null; } });
    if (!rec) { ta.focus(); state.textContent = 'Tippe ins Feld und nutze das Mikrofon der Tastatur.'; return; }
    recBtn.classList.add('on'); state.textContent = 'Ich höre zu … Tippe noch einmal, wenn du fertig bist.';
  };
  recBtn.addEventListener('click', () => (rec ? stop() : start()));
  sheet.querySelector('[data-dismiss]')?.addEventListener('click', stop);
  if (!preset && SR) setTimeout(start, 300);
  const out = sheet.querySelector('[data-result]');
  const draw = () => {
    if (!result) { out.innerHTML = ''; return; }
    if (!result.length) { out.innerHTML = `<p class="hint">Keine Aufgabe erkannt. Formuliere es etwas konkreter, z. B. „Bis Freitag Steuerunterlagen sortieren“.</p>`; return; }
    out.innerHTML = `<div class="group-head"><h2>${result.length === 1 ? 'Erkannt' : `${result.length} Aufgaben erkannt`}</h2></div>
      ${result.map((t, i) => `<label class="found ${t.selected ? '' : 'off'}"><input type="checkbox" data-pick="${i}" ${t.selected ? 'checked' : ''}>
        <div class="found-body"><div class="v-title" translate="no">${esc(t.title)}</div>
          <div class="found-src v-meta"><span>${esc(t.due ? fmtDateY(t.due) + (t.time ? `, ${t.time}` : '') : 'Ohne Datum')}</span><span>${esc(areaById(t.areaId)?.emoji || '')} ${esc(areaById(t.areaId)?.name || '')}</span>${t.repeat ? `<span>↻ ${esc(REPEAT_SHORT[t.repeat])}</span>` : ''}</div>
          ${t.bundleWith ? `<div class="bundle-note">↺ Wird mit „${esc(t.bundleWith.title)}“ gebündelt</div>` : ''}
          ${t.details ? `<div class="found-src">${esc(t.details)}</div>` : ''}</div></label>`).join('')}
      <button class="btn block" data-save>Übernehmen</button>`;
    out.querySelectorAll('[data-pick]').forEach((c) => c.addEventListener('change', () => { result[+c.dataset.pick].selected = c.checked; c.closest('.found').classList.toggle('off', !c.checked); }));
    out.querySelector('[data-save]').addEventListener('click', save);
  };
  sheet.querySelector('[data-go]').addEventListener('click', async (e) => {
    stop();
    const text = ta.value.trim(); if (!text) { toast('Sag oder schreib zuerst etwas.'); return; }
    const btn = e.currentTarget; btn.disabled = true; const label = btn.innerHTML; btn.innerHTML = '<span class="spin"></span> Wird ausgewertet …';
    try {
      if (S.ai) {
        const r = await extractFromText(aiCfg(), text, { source: 'voice', lang: LANG, me: { name: myName(), email: S.me?.email }, contacts: S.contacts, openTasks: S.tasks.filter((t) => !t.done), areas: areas() });
        result = r.tasks.filter((t) => !t.done).map((t) => {
          const ex = (t.matchId && S.tasks.find((x) => x.id === t.matchId)) || findSimilar(t.title);
          return { ...t, selected: true, bundleWith: ex || null };
        });
      } else {
        const q = parseQuick(text);
        result = q.title ? [{ ...q, details: '', selected: true, bundleWith: findSimilar(q.title) }] : [];
      }
      draw();
    } catch (err) { toast(fail(err)); }
    btn.disabled = false; btn.innerHTML = label;
  });
  async function save() {
    const pick = result.filter((t) => t.selected);
    if (!pick.length) { closeSheet(); return; }
    try {
      if (!S.areas.length) await ensureAreasStored();
      let created = 0, bundled = 0;
      for (const t of pick) {
        if (t.bundleWith) { await bundleInto(t.bundleWith, { text: `🎤 ${t.addition || t.details || t.title}`, due: t.due, time: t.time }); bundled++; continue; }
        const due = t.due || (t.repeat ? firstRepeatDue(t.repeat) : null);
        await store.addTask({ title: t.title, due, time: t.time || null, areaId: t.areaId, phase: t.phase || null, leadDays: t.leadDays ?? null, repeat: t.repeat || null, repeatDay: t.repeat && due ? parseISO(due).getDate() : null,
          reminder: !due ? 'none' : t.time ? 'hour1' : dayDiff(due) <= 1 ? 'day0' : 'day1', notes: t.details || '', source: 'voice' });
        created++;
      }
      closeSheet();
      toast([created && (created === 1 ? '1 Aufgabe angelegt' : `${created} Aufgaben angelegt`), bundled && (bundled === 1 ? '1 gebündelt' : `${bundled} gebündelt`)].filter(Boolean).join(' · ') + ' ✓');
    } catch (err) { toast(fail(err)); }
  }
  if (preset) sheet.querySelector('[data-go]').click();
}

// ================================================================== Suche
const fold = (s) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
function searchItems() {
  const out = [];
  const cmt = new Map();
  for (const c of S.comments) cmt.set(c.taskId, `${cmt.get(c.taskId) || ''} ${c.text}`);
  for (const t of S.tasks) {
    const a = areaOf(t);
    out.push({ k: 't', id: t.id, title: t.title, sub: [a.emoji + ' ' + a.name, phaseOf(t), t.due ? fmtDateY(t.due) : '', t.done ? '✓' : ''].filter(Boolean).join(' · '), text: `${t.title} ${t.notes || ''} ${phaseOf(t) || ''} ${a.name} ${cmt.get(t.id) || ''}`, done: t.done, area: a });
  }
  for (const f of S.files) {
    const t = f.taskId && S.tasks.find((x) => x.id === f.taskId); const c = f.costId && S.costs.find((x) => x.id === f.costId);
    const a = areaById(fileArea(f));
    out.push({ k: 'f', id: f.id, title: f.name, sub: [a ? a.emoji + ' ' + a.name : '', t ? `${tr('Aufgabe')}: ${t.title}` : c ? `${tr('Kosten')}: ${c.title}` : '', f.desc || ''].filter(Boolean).join(' › '), text: `${f.name} ${f.desc || ''} ${t?.title || ''} ${c?.title || ''} ${a?.name || ''} ${f.mailSubject || ''}`, file: f, area: a });
  }
  for (const c of S.costs) {
    const a = areaById(costArea(c));
    out.push({ k: 'k', id: c.id, title: c.title, sub: [eur(c.amount), kindName(c.kind), c.paid ? tr('Bezahlt') : c.due ? fmtDateY(c.due) : ''].filter(Boolean).join(' · '), text: `${c.title} ${c.note || ''} ${kindName(c.kind)} ${c.amount ?? ''} ${a?.name || ''}`, area: a });
  }
  for (const c of S.contacts) out.push({ k: 'c', id: c.id, title: c.name, sub: [c.role, c.company, c.email || c.phone].filter(Boolean).join(' · '), text: `${c.name} ${c.company || ''} ${c.role || ''} ${c.email || ''} ${c.phone || ''} ${c.notes || ''}` });
  for (const m of S.infos) out.push({ k: 'm', id: m.id, title: m.title || 'E-Mail', sub: [m.from, m.date ? fmtDateY(m.date) : ''].filter(Boolean).join(' · '), text: `${m.title || ''} ${m.from || ''} ${(m.text || '').slice(0, 4000)}` });
  return out;
}
function localSearch(q) {
  const words = fold(q).split(/[^a-z0-9@.€]+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const res = [];
  for (const it of searchItems()) {
    const hay = fold(it.text), tit = fold(it.title);
    if (!words.every((w) => hay.includes(w))) continue;
    let score = words.reduce((s, w) => s + (tit.includes(w) ? 3 : 1), 0) + (it.k === 'f' ? 1 : 0) - (it.done ? 1 : 0);
    if (tit.startsWith(words[0])) score += 2;
    res.push({ ...it, score });
  }
  return res.sort((a, b) => b.score - a.score).slice(0, 60);
}
const SEARCH_KIND = { t: ['Aufgaben', '✓'], f: ['Fotos & Dokumente', '📎'], k: ['Kosten', '💶'], c: ['Kontakte', '👤'], m: ['E-Mails', '✉️'] };
function searchRow(it, why) {
  const thumb = it.k === 'f' ? `<span class="s-thumb">${fileThumb(it.file)}</span>` : `<span class="s-ico">${SEARCH_KIND[it.k][1]}</span>`;
  return `<button class="s-row" data-action="search-open" data-k="${it.k}" data-id="${esc(it.id)}">${thumb}
    <span class="s-t"><strong translate="no">${esc(it.title)}</strong><small translate="no">${esc(it.sub || '')}</small>${why ? `<em>${esc(why)}</em>` : ''}</span>${I.chevron}</button>`;
}
function viewSearch() {
  const q = S.searchQ || '';
  const res = q.trim() ? localSearch(q) : [];
  const groups = Object.keys(SEARCH_KIND).map((k) => [k, res.filter((r) => r.k === k)]).filter(([, l]) => l.length);
  const ai = S.searchAI;
  let aiHtml = '';
  if (S.searchBusy) aiHtml = `<div class="ai-answer"><span class="spin"></span> MindSpace sucht …</div>`;
  else if (ai && ai.q === q) {
    const all = searchItems(); const byKey = new Map(all.map((x) => [`${x.k}:${x.id}`, x]));
    const hits = ai.hits.map((h) => ({ it: byKey.get(h.id), why: h.why })).filter((h) => h.it);
    aiHtml = `<div class="ai-answer">${I.spark}<div><p>${esc(ai.answer)}</p>${hits.length ? `<div class="s-list">${hits.map((h) => searchRow(h.it, h.why)).join('')}</div>` : ''}</div></div>`;
  }
  return `<main class="view">
    <header class="page-head"><h1>Suchen</h1></header>
    <form class="search-bar" data-form="search" autocomplete="off">
      <span class="s-mag">${I.search}</span>
      <input type="search" name="q" data-input="search" value="${esc(q)}" placeholder="${S.ai ? 'Was suchst du? z. B. „Wo ist der Bauvertrag?“' : 'Aufgaben, Dateien, Kosten, Kontakte …'}" enterkeyhint="search" aria-label="Suchen">
      ${micButton('data-action="search-mic"')}
    </form>
    ${S.ai && q.trim() && !(ai && ai.q === q) && !S.searchBusy ? `<button class="btn block secondary ask-ai" data-action="search-ai">${I.spark} MindSpace fragen: „${esc(q.trim().slice(0, 40))}“</button>` : ''}
    ${aiHtml}
    ${groups.map(([k, l]) => `<div class="group-head"><h2>${SEARCH_KIND[k][0]}</h2><span>${l.length}</span></div><div class="s-list">${l.slice(0, 12).map((it) => searchRow(it)).join('')}</div>`).join('')}
    ${q.trim() && !res.length && !ai && !S.searchBusy ? `<div class="empty"><strong>Nichts gefunden</strong>${S.ai ? 'Frag MindSpace – die KI versteht auch Umschreibungen.' : 'Versuch einen anderen Suchbegriff.'}</div>` : ''}
    ${!q.trim() ? `<p class="hint">Durchsucht Aufgaben, Kommentare, Fotos & Dokumente (auch Inhalte von Mail-Anhängen), Kosten, Kontakte und E-Mails.${S.ai ? ' Mit Enter oder dem Mikrofon fragst du die KI – z. B. „Wo liegt die Rechnung vom Vermesser?“' : ''}</p>` : ''}
  </main>`;
}
function searchIndex() {
  const lines = [];
  for (const it of searchItems()) {
    const extra = it.k === 't' ? (S.tasks.find((t) => t.id === it.id)?.notes || '').replace(/\s+/g, ' ').slice(0, 90) : it.k === 'm' ? (S.infos.find((m) => m.id === it.id)?.text || '').replace(/\s+/g, ' ').slice(0, 120) : '';
    lines.push(`${it.k === 'k' ? 'k' : it.k}:${it.id} | ${SEARCH_KIND[it.k][0]} | ${it.title} | ${it.sub}${extra ? ' | ' + extra : ''}`);
    if (lines.length >= 700) break;
  }
  return lines.join('\n').slice(0, 90000);
}
async function runSearchAI(q) {
  if (!S.ai || !q.trim()) return;
  S.searchBusy = true; S.searchAI = null; render();
  try {
    const r = await searchWithAI(aiCfg(), q.trim(), searchIndex(), { lang: LANG });
    S.searchAI = { q, answer: r.answer, hits: r.hits };
  } catch (e) { toast(fail(e)); }
  S.searchBusy = false; render();
}
function openSearchHit(k, id) {
  if (k === 't') { const t = S.tasks.find((x) => x.id === id); if (t) taskSheet(t); }
  else if (k === 'f') openViewer(S.files.find((x) => x.id === id));
  else if (k === 'k') { const c = S.costs.find((x) => x.id === id); if (c) costSheet(c); }
  else if (k === 'c') { const c = contactById(id); if (c) contactSheet(c); }
  else if (k === 'm') { S.prevView = 'search'; S.view = 'inbox'; S.inboxTab = 'archive'; S.openInfo = id; render(); setTimeout(() => app.querySelector(`[data-action="info-open"][data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }), 80); }
}
function startSearchVoice() {
  const inp = app.querySelector('[data-input="search"]');
  const btn = app.querySelector('[data-action="search-mic"]');
  if (!SR) { inp?.focus(); toast('Nutze das Mikrofon der Tastatur.'); return; }
  if (S.searchRec) { try { S.searchRec.stop(); } catch {} return; }
  btn?.classList.add('on');
  S.searchRec = listen({
    onText: (t) => { S.searchQ = t; if (inp) inp.value = t; },
    onEnd: () => { S.searchRec = null; btn?.classList.remove('on'); render(); if (S.searchQ?.trim() && S.ai) runSearchAI(S.searchQ); },
  });
}

// ================================================================== Entsperren mit Face ID / Touch ID / Windows Hello
// Nach der ersten Anmeldung mit Passwort sperrt MindSpace sich auf diesem Gerät; entsperrt wird biometrisch.
const LOCK_KEY = 'ms-lock';
const LOCK_AFTER = 2 * 60 * 1000;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const lockCfg = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); } catch { return null; } };
let bioAvailable = false;
let nativeBio = null; // { available, name } in der App aus dem Store
(async () => {
  if (native.isNative()) { nativeBio = await native.bioInfo(); bioAvailable = !!nativeBio.available; if (S.view === 'more') render(); return; }
  try { bioAvailable = !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch {} if (bioAvailable && S.view === 'more') render();
})();
const bioName = () => (nativeBio?.name ? nativeBio.name : isIOS ? 'Face ID / Touch ID' : /Windows/.test(navigator.userAgent) ? 'Windows Hello' : /Mac/.test(navigator.userAgent) ? 'Touch ID' : 'Fingerabdruck / Gesichtserkennung');
// Einrichten: zuerst erklären, dann Face ID / Touch ID – oder eine PIN, wenn das Gerät keinen Passkey anlegen kann
function lockSetupSheet() {
  if (native.isNative()) return nativeLockSetup();
  const sheet = openSheet(`<div class="sheet-head"><h2>App-Sperre</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <p class="hint" style="margin-top:-4px">MindSpace sperrt sich beim Öffnen und nach 2 Minuten im Hintergrund. Die Sperre gilt nur für dieses Gerät.</p>
    <div data-step>
      <p>${isIOS ? 'Gleich fragt dein iPhone: <strong>„Passkey für MindSpace sichern?“</strong> – bestätige mit Face ID bzw. Touch ID.' : 'Gleich fragt dein Gerät nach Fingerabdruck, Gesicht oder Windows Hello – einmal bestätigen.'}</p>
      <button class="btn block" data-bio style="margin-top:12px">${I.lock} ${esc(bioName())} einrichten</button>
      <button class="btn block secondary" data-pin style="margin-top:10px">Stattdessen PIN-Code verwenden</button>
    </div>`);
  const step = sheet.querySelector('[data-step]');
  const pinForm = () => {
    step.innerHTML = `<form><label class="field"><span>PIN (4–8 Ziffern)</span><input class="pin-input" name="p1" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="new-password" required></label>
      <label class="field"><span>PIN wiederholen</span><input class="pin-input" name="p2" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="new-password" required></label>
      <button class="btn block" type="submit">PIN speichern</button></form>`;
    const f = step.querySelector('form'); setTimeout(() => f.p1.focus(), 100);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const a = f.p1.value.trim(), b = f.p2.value.trim();
      if (!/^\d{4,8}$/.test(a)) { toast('Bitte 4 bis 8 Ziffern eingeben.'); return; }
      if (a !== b) { toast('Die beiden PINs stimmen nicht überein.'); return; }
      const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
      localStorage.setItem(LOCK_KEY, JSON.stringify({ type: 'pin', salt, hash: await pinHash(a, salt), at: Date.now() }));
      closeSheet(); toast('PIN-Sperre ist an 🔒'); render();
    };
  };
  sheet.querySelector('[data-pin]').onclick = pinForm;
  sheet.querySelector('[data-bio]').onclick = async () => {
    const r = await enableBio();
    if (r === true) { closeSheet(); toast(`Entsperren mit ${bioName()} ist an 🔒`); render(); return; }
    if (r === 'abort') return;
    step.innerHTML = `<div class="note-card warn"><p><strong>Das hat nicht geklappt.</strong> ${isIOS ? 'Auf dem iPhone braucht die Face-ID-Sperre den iCloud-Schlüsselbund – eine eigene Face-ID-Einstellung für MindSpace gibt es nicht.' : esc(r)}</p></div>
      ${isIOS ? `<ol class="help-steps">
        <li><strong>Einstellungen → [dein Name] → iCloud → Passwörter</strong> (bzw. „Passwörter und Schlüsselbund“) einschalten.</li>
        <li><strong>Einstellungen → Allgemein → Automatisch ausfüllen & Passwörter</strong>: „Passwörter und Passkeys automatisch ausfüllen“ einschalten.</li>
        <li>iOS 16 oder neuer und Face ID / Code eingerichtet.</li>
        <li>Beim Hinweis „Passkey sichern?“ auf <strong>Fortfahren</strong> tippen.</li></ol>` : ''}
      <button class="btn block" data-retry>Noch einmal versuchen</button>
      <button class="btn block secondary" data-pin2 style="margin-top:10px">Stattdessen PIN-Code verwenden</button>`;
    step.querySelector('[data-retry]').onclick = () => { closeSheet(); lockSetupSheet(); };
    step.querySelector('[data-pin2]').onclick = pinForm;
  };
}
// In der App: echtes Face ID / Touch ID / Fingerabdruck über das Betriebssystem
function nativeLockSetup() {
  const ok = !!nativeBio?.available;
  const sheet = openSheet(`<div class="sheet-head"><h2>App-Sperre</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <p class="hint" style="margin-top:-4px">MindSpace sperrt sich beim Öffnen und nach 2 Minuten im Hintergrund. Die Sperre gilt nur für dieses Gerät.</p>
    ${ok ? `<button class="btn block" data-nbio>${I.lock} ${esc(bioName())} einschalten</button>`
      : `<div class="note-card warn"><p>${esc(bioName())} ist auf diesem Gerät nicht eingerichtet${nativeBio?.reason ? ` (${esc(nativeBio.reason)})` : ''}. Richte es in den Einstellungen deines Handys ein – oder nutze eine PIN.</p></div>`}
    <button class="btn block secondary" data-npin style="margin-top:10px">PIN-Code verwenden</button>`);
  sheet.querySelector('[data-nbio]')?.addEventListener('click', async () => {
    try {
      if (await native.bioAuth('Sperre einschalten')) { localStorage.setItem(LOCK_KEY, JSON.stringify({ type: 'native', at: Date.now() })); closeSheet(); toast(`Entsperren mit ${bioName()} ist an 🔒`); render(); }
    } catch (e) { toast(fail(e)); }
  });
  sheet.querySelector('[data-npin]').addEventListener('click', () => { closeSheet(); nativeBio = { ...(nativeBio || {}), available: false }; webLockSheetPin(); });
}
function webLockSheetPin() {
  // PIN-Formular aus der Web-Einrichtung wiederverwenden
  const sheet = openSheet(`<div class="sheet-head"><h2>PIN-Code</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <form><label class="field"><span>PIN (4–8 Ziffern)</span><input class="pin-input" name="p1" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="new-password" required></label>
      <label class="field"><span>PIN wiederholen</span><input class="pin-input" name="p2" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="new-password" required></label>
      <button class="btn block" type="submit">PIN speichern</button></form>`);
  const f = sheet.querySelector('form'); setTimeout(() => f.p1.focus(), 100);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const a = f.p1.value.trim(), b = f.p2.value.trim();
    if (!/^\d{4,8}$/.test(a)) { toast('Bitte 4 bis 8 Ziffern eingeben.'); return; }
    if (a !== b) { toast('Die beiden PINs stimmen nicht überein.'); return; }
    const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(LOCK_KEY, JSON.stringify({ type: 'pin', salt, hash: await pinHash(a, salt), at: Date.now() }));
    closeSheet(); toast('PIN-Sperre ist an 🔒'); render();
  };
}
async function pinHash(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}:mindspace`));
  return b64u(buf);
}
// true = eingerichtet, 'abort' = abgebrochen, sonst Fehlermeldung
async function enableBio() {
  try {
    if (!window.PublicKeyCredential) return 'Dieses Gerät oder dieser Browser unterstützt die biometrische Sperre nicht.';
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'MindSpace' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: S.me?.email || 'mindspace', displayName: S.me?.name || 'MindSpace' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, attestation: 'none',
    } });
    if (!cred) return 'Kein Schlüssel erhalten.';
    localStorage.setItem(LOCK_KEY, JSON.stringify({ type: 'bio', id: b64u(cred.rawId), uid: S.me?.uid || 'local', at: Date.now() }));
    return true;
  } catch (e) {
    if (e.name === 'AbortError') return 'abort';
    return e.name === 'NotAllowedError' ? 'Abgebrochen oder auf diesem Gerät nicht erlaubt.' : e.name === 'NotSupportedError' || e.name === 'SecurityError' ? 'Dieses Gerät oder dieser Browser unterstützt die biometrische Sperre nicht.' : fail(e);
  }
}
function disableLock() { localStorage.removeItem(LOCK_KEY); toast('Sperre ausgeschaltet'); render(); }
let lockedSince = null;
let pinTries = 0;
function showLock() {
  const cfg = lockCfg();
  if (!cfg || document.getElementById('lock')) return;
  const pin = cfg.type === 'pin';
  const el = document.createElement('div');
  el.id = 'lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="lock-box"><img src="icons/logo.svg" alt="" class="lock-logo"><h1>MindSpace</h1><p>Gesperrt</p>
    ${pin ? `<form data-pinform><input class="pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" aria-label="PIN"><button class="btn block" type="submit">${I.lock} Entsperren</button></form>`
      : `<button class="btn block" data-unlock>${I.lock} Mit ${esc(bioName())} entsperren</button>`}
    ${store.mode === 'cloud' ? '<button class="link center" data-pw>Stattdessen mit Passwort anmelden</button>' : '<button class="link center" data-off>Sperre auf diesem Gerät aufheben</button>'}</div>`;
  document.body.appendChild(el);
  document.body.classList.add('is-locked');
  el.querySelector('[data-unlock]')?.addEventListener('click', unlock);
  if (cfg.type === 'native') setTimeout(unlock, 250); // Face ID gleich anbieten
  const pf = el.querySelector('[data-pinform]');
  if (pf) {
    setTimeout(() => pf.pin.focus(), 150);
    pf.onsubmit = async (e) => {
      e.preventDefault();
      if (await pinHash(pf.pin.value.trim(), cfg.salt) === cfg.hash) { pinTries = 0; hideLock(); return; }
      pinTries++; pf.pin.value = '';
      toast(pinTries >= 5 ? 'Zu oft falsch – bitte mit Passwort anmelden.' : 'PIN stimmt nicht.');
      if (pinTries >= 5 && store.mode === 'cloud') { hideLock(); localStorage.removeItem(LOCK_KEY); await store.signOut(); }
    };
  }
  el.querySelector('[data-pw]')?.addEventListener('click', async () => { hideLock(); await store.signOut(); });
  el.querySelector('[data-off]')?.addEventListener('click', () => { if (confirm('Sperre aufheben?')) { localStorage.removeItem(LOCK_KEY); hideLock(); } });
}
function hideLock() { document.getElementById('lock')?.remove(); document.body.classList.remove('is-locked'); lockedSince = null; }
async function unlock() {
  const cfg = lockCfg(); if (!cfg) { hideLock(); return; }
  if (cfg.type === 'native') {
    if (unlock.busy) return; unlock.busy = true;
    try { if (await native.bioAuth('MindSpace entsperren')) hideLock(); } catch (e) { toast(fail(e)); } finally { unlock.busy = false; }
    return;
  }
  try {
    const ok = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64u(cfg.id), transports: ['internal', 'hybrid'] }], userVerification: 'required', timeout: 60000 } });
    if (ok) hideLock();
  } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast(fail(e)); }
}
function onVisible(visible) {
  if (!lockCfg()) return;
  if (!visible) { if (!lockedSince) lockedSince = Date.now(); }
  else if (lockedSince && Date.now() - lockedSince > LOCK_AFTER) showLock();
  else if (visible) lockedSince = document.getElementById('lock') ? lockedSince : null;
}
document.addEventListener('visibilitychange', () => onVisible(!document.hidden));
native.onAppState((active) => onVisible(active));
if (lockCfg()) showLock();

// ================================================================== App aktualisieren
async function hardReload() {
  try { const regs = await navigator.serviceWorker?.getRegistrations?.() || []; await Promise.all(regs.map((r) => r.update().catch(() => {}))); } catch {}
  try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch {}
  location.replace(location.pathname + '?v=' + Date.now());
}

// ================================================================== Daten sichern
async function exportData() {
  const data = { app: 'mindspace', version: 3, exportedAt: new Date().toISOString(), project: S.project?.name, areas: S.areas, tasks: S.tasks, infos: S.infos, contacts: S.contacts, costs: S.costs, comments: S.comments };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const name = `mindspace-sicherung-${todayISO()}.json`;
  if (native.isNative()) { try { await native.shareFile(blob, name); } catch {} return; }
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tasks)) throw new Error('Das ist keine MindSpace-Sicherung.');
    for (const { id, ...a } of data.areas || []) if (id && !S.areas.find((x) => x.id === id)) await store.setArea(id, a);
    const tasks = data.tasks.map(({ id, ...t }) => t).filter((t) => !S.tasks.some((x) => x.title === t.title && x.due === t.due));
    if (tasks.length) await store.addTasks(tasks);
    for (const { id, ...i } of data.infos || []) if (!S.infos.some((x) => x.text === i.text)) await store.addInfo(i);
    for (const { id, ...c } of data.contacts || []) if (c.name && !findContact(c)) await store.addContact(c);
    const costs = (data.costs || []).map(({ id, ...c }) => c).filter((c) => !S.costs.some((x) => x.title === c.title && x.amount === c.amount));
    if (costs.length) await store.addCosts(costs);
    toast(`${tasks.length} Aufgaben eingespielt`);
  } catch (e) { toast(fail(e)); }
}

// ================================================================== Ereignisse
async function onAction(e) {
  const el = e.target.closest('[data-action]'); if (!el || el.tagName === 'INPUT') return;
  const a = el.dataset.action;
  switch (a) {
    case 'tab': if (el.dataset.tab === 'plan' && S.view === 'plan') { S.planArea = null; S.planWeek = 0; S.planMonth = 0; } S.view = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'filter': S.filter = el.dataset.filter; render(); break;
    case 'area': S.area = el.dataset.id; render(); break;
    case 'open-plan': S.planArea = el.dataset.id; S.planMode = 'projekte'; S.view = 'plan'; S.openStep = null; S.openStepArea = el.dataset.id; render(); window.scrollTo(0, 0); break;
    case 'plan-mode': S.planMode = el.dataset.m; S.planArea = null; S.view = 'plan'; render(); window.scrollTo(0, 0); break;
    case 'pweek': S.planWeek = +el.dataset.d === 0 ? 0 : (S.planWeek || 0) + +el.dataset.d; render(); break;
    case 'pmonth': S.planMonth = +el.dataset.d === 0 ? 0 : (S.planMonth || 0) + +el.dataset.d; S.monthPick = null; render(); break;
    case 'month-day': S.monthPick = el.dataset.d; render(); break;
    case 'goto-day': { const sec = document.getElementById('day-' + el.dataset.d); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); else { S.planMode = 'monat'; S.monthPick = el.dataset.d; render(); } break; }
    case 'new-on-day': taskSheet(null, { due: el.dataset.d }); break;
    case 'home-set': S.homeSet = el.dataset.k; render(); break;
    case 'all-today': {
      const late = S.tasks.filter((t) => !t.done && t.due && t.due < todayISO());
      for (const t of late) await store.updateTask(t.id, { due: todayISO() }, t).catch(() => {});
      toast(`${late.length} ${late.length === 1 ? 'Aufgabe' : 'Aufgaben'} auf heute verschoben`); S.homeSet = 'heute'; break;
    }
    case 'plan-back': S.planArea = null; render(); window.scrollTo(0, 0); break;
    case 'step': { const i = +el.dataset.i; const steps = roadmapSteps(areaById(S.planArea)); const isOpen = S.openStep === null ? steps[i].state === 'now' : S.openStep === i; S.openStep = isOpen ? -1 : i; render(); break; }
    case 'new-in-step': taskSheet(null, { areaId: S.planArea, phase: el.dataset.phase }); break;
    case 'week': S.weekOffset = +el.dataset.d === 0 ? 0 : (S.weekOffset || 0) + +el.dataset.d; S.dayPick = null; render(); break;
    case 'day': S.dayPick = el.dataset.d; render(); break;
    case 'open-contacts': S.view = 'contacts'; render(); window.scrollTo(0, 0); break;
    case 'open-costs': if (S.view !== 'costs') S.prevView = S.view; S.costArea = el.dataset.area || 'all'; S.view = 'costs'; render(); window.scrollTo(0, 0); break;
    case 'open-docs': if (S.view !== 'docs') S.prevView = S.view; S.docsArea = el.dataset.area || 'all'; S.view = 'docs'; render(); window.scrollTo(0, 0); break;
    case 'back': S.view = S.prevView && S.prevView !== S.view ? S.prevView : 'more'; S.prevView = null; render(); window.scrollTo(0, 0); break;
    case 'cost-area': S.costArea = el.dataset.id; render(); break;
    case 'docs-area': S.docsArea = el.dataset.id; render(); break;
    case 'cost-new': costSheet(null); break;
    case 'cost-edit': costSheet(S.costs.find((c) => c.id === el.dataset.id)); break;
    case 'cost-paid': { const r = el.getBoundingClientRect(); toggleCostPaid(el.dataset.id, r.left + r.width / 2, r.top + r.height / 2); break; }
    case 'cost-template': rateSheet(); break;
    case 'cost-budget': budgetSheet(); break;
    case 'file-open': openViewer(S.files.find((f) => f.id === el.dataset.id)); break;
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
    case 'copy-address': copyText(inboxAddr(), 'Adresse kopiert'); break;
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
    case 'area-new': if (ownProjects() >= lim('ownProjects')) paywallSheet('projects'); else areaSheet(null); break;
    case 'plan-open': paywallSheet(null); break;
    case 'plan-manage': manageSubscription(); break;
    case 'plan-restore': restorePurchases(); break;
    case 'ai-deep': if (curPlan() === 'pro') { await store.updateProject({ aiDeep: !S.project?.aiDeep }).catch((err) => toast(fail(err))); } else paywallSheet('deep'); break;
    case 'inbox-create': try { el.disabled = true; await store.inboxAddress(); if (el.closest('.sheet')) closeSheet(); toast('Adresse ist bereit'); } catch (err) { toast(fail(err)); el.disabled = false; } break;
    case 'delete-account': deleteAccountSheet(); break;
    case 'feedback': feedbackSheet(); break;
    case 'legal': native.openExternal(el.dataset.url); break;
    case 'inbox-settings': inboxSheet(); break;
    case 'ai-settings': aiSheet(); break;
    case 'assess-all': {
      S.aiBusy = true; render();
      try { const n = await assessList(S.tasks); toast(n ? `${n} Fristen eingeschätzt` : 'Keine offenen Aufgaben mit Frist'); } catch (err) { toast(fail(err)); }
      S.aiBusy = false; render(); break;
    }
    case 'invite': inviteSheet(); break;
    case 'assign-ok': assignAccept(el.dataset.id); break;
    case 'cal-settings': calAskSheet(true); break;
    case 'cal-setup': calSetupSheet(); break;
    case 'member': memberSheet(el.dataset.id); break;
    case 'join': {
      const c = prompt('Einladungscode eingeben');
      if (c) store.joinProject(c).then(() => toast('Willkommen!')).catch((err) => toast(fail(err)));
      break;
    }
    case 'push': {
      if (store.mode !== 'cloud') { inviteSheet(); break; }
      if (native.isNative()) {
        try { const r = await store.enablePush(); toast(r.ok ? 'Push-Nachrichten sind aktiv 🔔' : r.reason === 'denied' ? 'Nicht erlaubt. Ändern in den Einstellungen deines Handys → Mitteilungen → MindSpace.' : 'Push-Anmeldung fehlgeschlagen. Versuch es gleich noch einmal.'); }
        catch (err) { toast(fail(err)); }
        render(); break;
      }
      if (isIOS && !standalone) { toast('Öffne MindSpace zuerst über das Symbol auf dem Home-Bildschirm.'); break; }
      if (typeof Notification === 'undefined') { toast('Dieses Gerät unterstützt keine Push-Nachrichten (iPhone: ab iOS 16.4, vom Home-Bildschirm geöffnet).'); break; }
      // iOS zeigt die Abfrage nur, wenn sie direkt beim Antippen startet – also vor jedem „await“.
      const permP = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
      toast('Push-Nachrichten werden aktiviert …');
      try {
        const r = await store.enablePush(permP);
        const msg = { unsupported: 'Dieses Gerät unterstützt keine Push-Nachrichten im Browser (iPhone: ab iOS 16.4, vom Home-Bildschirm geöffnet).', denied: isIOS ? 'Nicht erlaubt. Ändern unter iPhone-Einstellungen → Mitteilungen → MindSpace.' : 'Nicht erlaubt. Klicke links neben der Adresse auf das Schloss-Symbol und erlaube Benachrichtigungen.', dismissed: 'Die Abfrage wurde geschlossen. Tippe noch einmal auf Aktivieren und wähle „Erlauben“.', novapid: 'In config.js fehlt der vapidKey (Schritt 2.6).', notoken: 'Push-Anmeldung fehlgeschlagen. Versuch es gleich noch einmal.' };
        toast(r.ok ? 'Push-Nachrichten sind aktiv 🔔' : msg[r.reason]);
      } catch (err) { toast(fail(err)); }
      render(); break;
    }
    case 'template': templateSheet(); break;
    case 'export': exportData(); break;
    case 'logout': if (confirm('Abmelden?')) store.signOut(); break;
    case 'hard-reload': hardReload(); break;
    case 'lock-on': lockSetupSheet(); break;
    case 'lock-off': if (confirm('Biometrische Sperre ausschalten?')) disableLock(); break;
    case 'voice': voiceSheet(); break;
    case 'open-search': if (S.view !== 'search') S.prevView = S.view; S.view = 'search'; render(); window.scrollTo(0, 0); setTimeout(() => app.querySelector('[data-input="search"]')?.focus(), 60); break;
    case 'search-ai': runSearchAI(S.searchQ || ''); break;
    case 'search-mic': startSearchVoice(); break;
    case 'search-open': openSearchHit(el.dataset.k, el.dataset.id); break;
    case 'install': if (installPrompt) { installPrompt.prompt(); const r = await installPrompt.userChoice.catch(() => null); if (r?.outcome === 'accepted') installPrompt = null; render(); } break;
    case 'auth-tab': S.authTab = el.dataset.tab; S.authError = ''; render(); break;
    case 'reset-pw': {
      const email = app.querySelector('input[name="email"]')?.value || prompt('Deine E-Mail-Adresse');
      if (email) store.resetPassword(email).then(() => toast('Link zum Zurücksetzen wurde gesendet.')).catch((err) => toast(fail(err)));
      break;
    }
  }
}
app.addEventListener('click', onAction);
// Knöpfe mit data-action gibt es auch in Fenstern (Sheets), die außerhalb von #app liegen
sheetRoot.addEventListener('click', onAction);

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
const searchAll = debounceSearch('search', 'searchQ');
app.addEventListener('input', (e) => {
  const el = e.target; const k = el.dataset.input;
  if (k === 'quick') {
    S.quick = el.value;
    const pv = app.querySelector('[data-quick-preview]'); if (pv) pv.innerHTML = quickPreview(el.value);
    const go = app.querySelector('.quick-go'); if (go) go.hidden = !el.value.trim();
    const mic = app.querySelector('.quick [data-action="voice"]'); if (mic) mic.hidden = !!el.value.trim();
    return;
  }
  if (k === 'paste') { S.pasteText = el.value; const b = app.querySelector('#parse-btn'); if (b) b.disabled = !el.value.trim(); }
  else if (k === 'info-q') searchInfo(el);
  else if (k === 'contact-q') searchContact(el);
  else if (k === 'task-q') searchTask(el);
  else if (k === 'search') { S.searchAI = null; searchAll(el); }
  else if (k?.startsWith('pay-')) {
    const x = S.parsed.payments[+el.dataset.i];
    if (k === 'pay-title') x.title = el.value;
    if (k === 'pay-amount') x.amountText = el.value;
    if (k === 'pay-due') x.due = el.value || null;
  }
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
  else if (a === 'set-theme') { try { localStorage.setItem('ms-theme', el.value); } catch {} applyTheme(el.value); }
  else if (a === 'set-lang') { setLang(el.value); store.setUserPref?.({ lang: el.value }).catch?.(() => {}); setTimeout(() => location.reload(), 150); }
  else if (a === 'pick-bundle') { const t = S.parsed.tasks[+el.dataset.i]; t.bundle = el.checked ? (S.tasks.find((x) => x.title === t.bundleTitle && !x.done)?.id || null) : null; }
  else if (a === 'pick-pay') { S.parsed.payments[+el.dataset.i].selected = el.checked; el.closest('.found').classList.toggle('off', !el.checked); updateCommitBtn(); }
  else if (a === 'docs-upload' && el.files.length) { const files = [...el.files]; el.value = ''; uploadFiles(files, { areaId: S.docsArea !== 'all' ? S.docsArea : null }); }
  else if (a === 'pick-contact') { S.parsed.contacts[+el.dataset.i].selected = el.checked; el.closest('.found').classList.toggle('off', !el.checked); updateCommitBtn(); }
  else if (a === 'save-info') S.saveInfo = el.checked;
  else if (a === 'ocr' && el.files[0]) ocr(el.files[0]);
  else if (a === 'import-file' && el.files[0]) importData(el.files[0]);
});
function updateCommitBtn() {
  const n = S.parsed.tasks.filter((x) => x.selected).length;
  const c = (S.parsed.contacts || []).filter((x) => x.selected).length;
  const z = (S.parsed.payments || []).filter((x) => x.selected).length;
  const b = app.querySelector('#commit-btn'); b.disabled = !n && !c && !z; b.textContent = commitLabel(n, c, z);
}
app.addEventListener('submit', async (e) => {
  const form = e.target; const kind = form.dataset.form; if (!kind) return;
  e.preventDefault();
  if (kind === 'quick') { const v = form.q.value; form.q.blur(); S.pendingRender = false; await submitQuick(v); return; }
  if (kind === 'search') { clearTimeout(S.qT); S.searchQ = form.q.value; form.q.blur(); S.pendingRender = false; if (S.ai) runSearchAI(S.searchQ); else render(); return; }
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

// ================================================================== Computer: Tastenkürzel, Dateien hineinziehen
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); closeSheet(); app.querySelector('[data-action="open-search"]')?.click(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  const t = e.target;
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
  if (sheetRoot.innerHTML || document.querySelector('.viewer') || document.getElementById('lock')) return;
  if (store.mode === 'cloud' && (!S.me || S.projectState !== 'ready')) return;
  const tabs = ['home', 'tasks', 'plan', 'inbox', 'more'];
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); if (S.view === 'costs') costSheet(null); else taskSheet(null); }
  else if (e.key === '/') {
    e.preventDefault();
    if (S.view !== 'home') { S.view = 'home'; render(); window.scrollTo(0, 0); }
    app.querySelector('[data-input="quick"]')?.focus();
  } else if (e.key === 's' || e.key === 'S') { e.preventDefault(); app.querySelector('[data-action="open-search"]')?.click(); }
  else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); voiceSheet(); }
  else if (/^[1-5]$/.test(e.key)) { S.view = tabs[+e.key - 1]; render(); window.scrollTo(0, 0); }
});
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  const zone = sheetRoot.querySelector('[data-att-wrap]') || (S.view === 'docs' ? app : null);
  if (!zone) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  document.body.classList.add('file-over');
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('file-over'); });
document.addEventListener('drop', (e) => {
  document.body.classList.remove('file-over');
  if (!hasFiles(e)) return;
  const files = [...e.dataTransfer.files];
  const wrap = sheetRoot.querySelector('[data-att-wrap]');
  if (wrap?.addFiles) { e.preventDefault(); wrap.addFiles(files); }
  else if (S.view === 'docs') { e.preventDefault(); uploadFiles(files, { areaId: S.docsArea !== 'all' ? S.docsArea : null }); }
});


// ================================================================== Zuständigkeit (v13)
// Wird jemand anderes als zuständig gewählt, bekommt er eine Push-Nachricht (Postbote/Hintergrunddienst)
// und bestätigt in der App mit „Übernehmen“ – oder gibt die Aufgabe zurück.
const canSee = (uid, areaId) => { const a = S.project?.access?.[uid]; return !Array.isArray(a) || a.includes(areaId); };
const forMe = () => S.tasks.filter((t) => !t.done && t.assignee && t.assignee === S.me?.uid && t.assignAck === false);
function assignPatch(data, task) {
  const prev = task?.assignee || 'all';
  const to = data.assignee || 'all';
  if (to === prev) return true;
  if (to !== 'all' && !canSee(to, data.areaId)) {
    alert(`${nameOf(to)} hat keinen Zugriff auf diesen Bereich. Gib ihn unter Mehr → Gemeinsam planen frei oder wähle jemand anderen.`);
    return false;
  }
  if (to !== 'all' && to !== S.me?.uid) Object.assign(data, { assignNotify: true, assignAck: false, assignBy: S.me?.uid || null, assignByName: S.me?.name || null, assignAt: Date.now(), assignReturned: false });
  else Object.assign(data, { assignNotify: false, assignAck: null });
  return true;
}
function assignNote(t) {
  if (t.done || !t.assignee || t.assignee === 'all' || store.mode !== 'cloud') return '';
  const from = whoName(t.assignBy, t.assignByName);
  if (t.assignee === S.me?.uid && t.assignAck === false) return `<div class="note-card assign-note"><p>📌 <strong>${esc(from)}</strong> ${t.assignReturned ? 'hat dir diese Aufgabe zurückgegeben' : 'bittet dich, diese Aufgabe zu übernehmen'}.</p>
    <div class="btn-row"><button type="button" class="btn small" data-act="assign-ok">Übernehmen</button><button type="button" class="btn small ghost" data-act="assign-back">Zurückgeben</button></div></div>`;
  if (t.assignee !== S.me?.uid && t.assignAck === false) return `<p class="hint assign-wait">⏳ Wartet auf Bestätigung von ${esc(nameOf(t.assignee))}.</p>`;
  if (t.assignee !== S.me?.uid && t.assignAck === true) return `<p class="hint assign-wait">✓ ${esc(nameOf(t.assignee))} hat die Aufgabe übernommen.</p>`;
  return '';
}
function assignCard() {
  if (store.mode !== 'cloud') return '';
  const list = forMe();
  if (!list.length) return '';
  return `<section class="card assign-card"><div class="card-head"><h2>📌 Für dich</h2></div>
    <p class="hint" style="margin:-6px 0 8px">${list.length === 1 ? 'Diese Aufgabe wurde dir übergeben.' : `${list.length} Aufgaben wurden dir übergeben.`}</p>
    ${list.slice(0, 5).map((t) => `<div class="assign-row st-${statusOf(t)}" style="--st:${ST_COLOR[statusOf(t)]}">
      <button class="grow assign-open" data-action="edit" data-id="${esc(t.id)}"><strong translate="no">${esc(t.title)}</strong><small>Von ${esc(whoName(t.assignBy, t.assignByName))}${t.due ? ` · fällig ${esc(fmtDate(t.due))}` : ''}</small></button>
      <button class="btn small" data-action="assign-ok" data-id="${esc(t.id)}">Übernehmen</button></div>`).join('')}
  </section>`;
}
async function assignAccept(id) {
  const t = S.tasks.find((x) => x.id === id); if (!t) return;
  try {
    await store.updateTask(id, { assignAck: true, assignNotify: false }, t);
    await store.addComment({ taskId: id, areaId: areaOf(t).id, text: '👍 Übernommen' }).catch(() => {});
    toast('Übernommen – die anderen sehen es');
  } catch (e) { toast(fail(e)); }
}
async function assignReturn(id) {
  const t = S.tasks.find((x) => x.id === id); if (!t) return;
  const why = prompt('Aufgabe zurückgeben – kurzer Grund (optional):', '');
  if (why === null) return;
  const back = t.assignBy && t.assignBy !== S.me?.uid && members().includes(t.assignBy) ? t.assignBy : 'all';
  const patch = back === 'all'
    ? { assignee: 'all', assignAck: null, assignNotify: false }
    : { assignee: back, assignAck: false, assignNotify: true, assignBy: S.me?.uid, assignByName: S.me?.name, assignAt: Date.now(), assignReturned: true };
  try {
    await store.updateTask(id, patch, t);
    await store.addComment({ taskId: id, areaId: areaOf(t).id, text: `↩️ Zurückgegeben${why.trim() ? ': ' + why.trim() : ''}` }).catch(() => {});
    toast(back === 'all' ? 'Zurückgegeben – wieder für alle' : `Zurück an ${nameOf(back)}`);
  } catch (e) { toast(fail(e)); }
}

// ================================================================== Kalender (v13)
// Jedes Mitglied wird einmal gefragt, ob es seine Aufgaben als Kalender-Abo „MindSpace“ im Handy-
// oder Computer-Kalender sehen möchte. Nichts wird ohne Zustimmung eingetragen. Das Abo liefert der
// MindSpace-Postbote (Google Apps Script, als Web-App bereitgestellt); jedes Mitglied hat einen
// eigenen geheimen Link, der nur Aufgaben aus seinen freigegebenen Bereichen enthält.
const calLaterKey = () => `ms-cal-later-${S.me?.uid || ''}`;
const calInfo = () => S.userDoc?.cal || null;
const calOn = () => ['all', 'mine'].includes(calInfo()?.choice) && !!calInfo()?.token;
// Kalender-Abo: mit Server-Diensten immer verfügbar (Funktion „calendar“), sonst über den Postboten (calUrl)
const calBase = () => S.project?.calUrl || (billing() ? store.calendarBase() : '');
const calCovers = (t) => calOn() && !!calBase() && (calInfo().choice === 'all' || !t.assignee || t.assignee === 'all' || t.assignee === S.me?.uid);
function feedUrl(tok = calInfo()?.token, webcal = false) {
  const u = calBase();
  if (!u || !tok) return '';
  const https = `${u}${u.includes('?') ? '&' : '?'}k=${tok}`;
  return webcal ? https.replace(/^https:/, 'webcal:') : https;
}
function newCalToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function calChoose(choice) {
  const cur = calInfo();
  if (choice === 'no') {
    if (cur?.token) await store.deleteCalFeed(cur.token).catch(() => {});
    await store.setUserPref({ cal: { choice: 'no', token: null, at: Date.now() } });
    return null;
  }
  const tok = cur?.token || newCalToken();
  await store.setCalFeed(tok, choice);
  await store.setUserPref({ cal: { choice, token: tok, at: Date.now() } });
  return tok;
}
function maybeAskCal() {
  if (store.mode !== 'cloud' || !calBase() || !S.userDoc || calInfo() || S.calAsked) return;
  try { if (Number(localStorage.getItem(calLaterKey()) || 0) > Date.now()) return; } catch {}
  S.calAsked = true;
  const tryOpen = (n) => {
    if (document.getElementById('lock') || sheetRoot.innerHTML.trim()) { if (n < 20) setTimeout(() => tryOpen(n + 1), 3000); return; }
    calAskSheet(false);
  };
  setTimeout(() => tryOpen(0), 1800);
}
function calSection(full) {
  if (!calBase()) {
    return `<h2 class="section-title">Kalender</h2><div class="settings">
      ${full ? `<button class="setting" data-action="cal-setup"><span class="area-dot" style="--area:#E2574C">📅</span><span class="grow">Aufgaben im Handy-Kalender<small>Einmal einrichten – danach wird jedes Mitglied gefragt</small></span><span class="end">Einrichten</span></button>`
        : `<div class="setting"><span class="area-dot" style="--area:#E2574C">📅</span><span class="grow">Aufgaben im Handy-Kalender<small>Noch nicht eingerichtet – das macht jemand mit vollem Zugriff</small></span></div>`}
    </div>`;
  }
  const c = calInfo();
  const st = c?.choice === 'all' ? 'An · alle Aufgaben' : c?.choice === 'mine' ? 'An · nur meine Aufgaben' : 'Aus';
  return `<h2 class="section-title">Kalender</h2><div class="settings">
    <button class="setting" data-action="cal-settings"><span class="status-dot ${calOn() ? 'on' : ''}"></span><span class="grow">Aufgaben im Kalender<small>${st}</small></span>${I.chevron}</button>
    ${full && !billing() ? `<button class="setting" data-action="cal-setup"><span class="grow">Kalender-Dienst<small>Verbunden mit dem MindSpace-Postboten</small></span>${I.chevron}</button>` : ''}
  </div>
  <p class="hint">Ein eigener Kalender „MindSpace“ auf deinem Handy oder Computer. Neue und geänderte Aufgaben kommen automatisch an.</p>`;
}
function calAskSheet(settings) {
  const c = calInfo();
  if (!settings) { try { localStorage.setItem(calLaterKey(), String(Date.now() + 3 * 864e5)); } catch {} }
  const opt = (v, label, sub, cls = '') => `<button class="cal-opt ${cls} ${settings && (c?.choice || 'no') === v ? 'on' : ''}" data-cal="${v}"><strong>${label}</strong><small>${sub}</small></button>`;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${settings ? 'Aufgaben im Kalender' : 'Aufgaben in deinen Kalender?'}</h2><button class="btn ghost" data-dismiss>${settings ? 'Schließen' : 'Später'}</button></div>
    ${settings ? '' : `<div class="cal-hero">${calIcon()}</div>`}
    <p>MindSpace kann deine Aufgaben als eigenen Kalender <strong>„MindSpace“</strong> in den Kalender deines Handys oder Computers eintragen. Neue und geänderte Aufgaben kommen dort von selbst an.</p>
    <p class="hint">Nur wenn du zustimmst – alle im Projekt entscheiden das für sich selbst. Ändern oder beenden kannst du es jederzeit unter Mehr → Kalender.</p>
    <div class="cal-opts">
      ${opt('all', 'Ja, alle Aufgaben', 'Alles, was du in MindSpace siehst')}
      ${opt('mine', 'Ja, nur meine Aufgaben', 'Wo du zuständig bist – plus gemeinsame')}
      ${opt('no', settings && calOn() ? 'Kalender-Abo beenden' : 'Nein, danke', settings && calOn() ? 'Der Link wird sofort ungültig' : 'Du wirst nicht erneut gefragt', 'ghosty')}
    </div>
    ${settings && calOn() ? `<div class="btn-row" style="margin-top:14px"><a class="btn secondary small" href="${esc(feedUrl(undefined, true))}">📅 Erneut abonnieren</a><button class="btn secondary small" data-copy>Adresse kopieren</button></div>` : ''}`);
  sheet.querySelector('[data-copy]')?.addEventListener('click', () => copyText(feedUrl(), 'Kalender-Adresse kopiert'));
  sheet.querySelectorAll('[data-cal]').forEach((b) => b.addEventListener('click', async () => {
    const v = b.dataset.cal, was = calOn();
    sheet.querySelectorAll('[data-cal]').forEach((x) => (x.disabled = true));
    try {
      const tok = await calChoose(v);
      try { localStorage.removeItem(calLaterKey()); } catch {}
      if (v === 'no') { closeSheet(); toast(was ? 'Kalender-Abo beendet. Lösche den Kalender „MindSpace“ noch im Handy.' : 'Alles klar – kein Kalender'); return; }
      if (was) { closeSheet(); toast('Geändert – dein Kalender aktualisiert sich von selbst'); return; }
      calSubscribeSheet(tok);
    } catch (e) { toast(fail(e)); sheet.querySelectorAll('[data-cal]').forEach((x) => (x.disabled = false)); }
  }));
}
function calIcon() {
  const d = new Date();
  return `<div class="cal-icon"><span>${esc(d.toLocaleDateString(LOC(), { weekday: 'short' }))}</span><b>${d.getDate()}</b></div>`;
}
function calSubscribeSheet(tok) {
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Kalender abonnieren</h2><button class="btn ghost" data-dismiss>Fertig</button></div>
    <p>Letzter Schritt: Tippe auf den Knopf. ${isIOS ? 'Das iPhone fragt „Kalenderabonnement hinzufügen?“ – tippe auf <strong>Abonnieren</strong> und dann auf <strong>Hinzufügen</strong>.' : 'Dein Kalender-Programm fragt, ob du den Kalender abonnieren möchtest.'}</p>
    <a class="btn block" href="${esc(feedUrl(tok, true))}" data-sub>📅 Jetzt abonnieren</a>
    <button class="btn block secondary" style="margin-top:10px" data-copy>Adresse kopieren</button>
    <ol class="help-steps">
      <li>Die Aufgaben erscheinen im Kalender <strong>„MindSpace“</strong>. Die Farbe kannst du im Kalender selbst ändern.</li>
      <li>Damit Änderungen schnell ankommen: iPhone-Einstellungen → (Apps →) Kalender → Accounts → <strong>Datenabgleich</strong> → „Alle 15 Minuten“.</li>
      <li>Outlook oder Google Kalender am Computer: Adresse kopieren und dort „Kalender aus dem Internet“ bzw. „Per URL hinzufügen“ wählen.</li>
      <li>Erledigtes steht mit ✅ im Kalender, Überfälliges mit 🔴. Erinnerungen bekommst du weiter als Push von MindSpace.</li>
    </ol>`);
  sheet.querySelector('[data-copy]').addEventListener('click', () => copyText(feedUrl(tok), 'Kalender-Adresse kopiert'));
}
function calSetupSheet() {
  const cur = S.project?.calUrl || '';
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Kalender einrichten</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <p>Das Kalender-Abo liefert der <strong>MindSpace-Postbote</strong> im E-Mail-Konto (Google Apps Script). Einmal bereitstellen, danach wird jedes Mitglied gefragt, ob es seine Aufgaben im Kalender sehen möchte.</p>
    <ol class="help-steps">
      <li>Am Computer script.google.com öffnen (mit dem MindSpace-Gmail-Konto) → Projekt „MindSpace-Postbote“.</li>
      <li>Den Code durch die neue Datei <strong>MindSpace-Postbote.gs</strong> ersetzen und speichern.</li>
      <li>Oben rechts <strong>Bereitstellen → Neue Bereitstellung</strong> → Zahnrad → <strong>Web-App</strong>.</li>
      <li>Ausführen als: <strong>Ich</strong> · Zugriff: <strong>Jeder</strong> → Bereitstellen → Zugriff erlauben.</li>
      <li>Die Web-App-URL (endet auf /exec) kopieren und hier einfügen.</li>
    </ol>
    <p class="hint">„Jeder“ ist nötig, damit Kalender-Apps den Link abrufen können. Ohne den geheimen Schlüssel jedes Mitglieds liefert der Link keine Aufgaben.</p>
    <form><label class="field"><span>Web-App-URL</span><input class="input" name="url" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(cur)}" required></label>
      <button class="btn block" type="submit">Prüfen & speichern</button>
      ${cur ? '<button class="btn block ghost danger-text" type="button" data-off style="margin-top:8px">Kalender-Dienst trennen</button>' : ''}</form>`);
  const form = sheet.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const url = form.url.value.trim().replace(/\?.*$/, '');
    if (!/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec$/.test(url)) { alert('Das ist keine Web-App-URL. Sie beginnt mit https://script.google.com/macros/s/ und endet auf /exec.'); return; }
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true; btn.textContent = 'Prüfe …';
    let ok = null;
    try { const r = await fetch(url + '?ping=1', { redirect: 'follow' }); ok = /MindSpace-Kalender/.test(await r.text()); } catch { ok = null; }
    if (ok === false && !confirm('Der Postbote antwortet nicht wie erwartet. Ist die neue Version bereitgestellt (Bereitstellen → Neue Bereitstellung)? Trotzdem speichern?')) { btn.disabled = false; btn.textContent = 'Prüfen & speichern'; return; }
    try {
      await store.updateProject({ calUrl: url, calAskSent: false, calSince: Date.now() });
      closeSheet();
      toast(cur ? 'Gespeichert' : 'Eingerichtet – alle Mitglieder werden jetzt gefragt');
    } catch (err) { toast(fail(err)); btn.disabled = false; btn.textContent = 'Prüfen & speichern'; }
  };
  sheet.querySelector('[data-off]')?.addEventListener('click', async () => {
    if (!confirm('Kalender-Dienst trennen? Die Kalender-Abos aller Mitglieder bekommen dann keine Aktualisierungen mehr.')) return;
    try { await store.updateProject({ calUrl: null }); closeSheet(); toast('Getrennt'); } catch (err) { toast(fail(err)); }
  });
}
// Einzelne Aufgabe als .ics-Datei (ohne Abo, z. B. am Computer für Outlook)
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) {
  const enc = new TextEncoder();
  let out = '', cur = '', n = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > 73) { out += cur + '\r\n '; cur = ''; n = 1; } cur += ch; n += b; }
  return out + cur;
}
const icsUtc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function downloadIcs(t) {
  if (!t.due) return;
  const ymd = t.due.replace(/-/g, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MindSpace//DE', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${t.id || Date.now()}@mindspace`, `DTSTAMP:${icsUtc(new Date())}`];
  if (t.time) { const s = new Date(`${t.due}T${t.time}`); L.push(`DTSTART:${icsUtc(s)}`, `DTEND:${icsUtc(new Date(s.getTime() + 3600e3))}`); }
  else L.push(`DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${addDays(t.due, 1).replace(/-/g, '')}`);
  const link = location.origin + location.pathname + (t.id ? `?aufgabe=${t.id}` : '');
  L.push(`SUMMARY:${icsEsc(t.title)}`, `DESCRIPTION:${icsEsc([areaOf(t).name, t.notes, 'MindSpace: ' + link].filter(Boolean).join('\n'))}`, `URL:${link}`, 'TRANSP:TRANSPARENT', 'END:VEVENT', 'END:VCALENDAR');
  const blob = new Blob([L.map(icsFold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (t.title || 'Aufgabe').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60).trim() + '.ics';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}


// ================================================================== Abo (Free · Daily Driver · Pro) – v14
// Gekauft wird in der App über App Store / Google Play (RevenueCat). Der Server trägt den Plan in den
// gemeinsamen Bereich ein; das beste Abo eines Mitglieds gilt für alle.
const STORE_URLS = { ios: 'https://apps.apple.com/account/subscriptions', android: 'https://play.google.com/store/account/subscriptions' };
let offersCache = null;
const eurFmt = (v) => (v == null ? '' : v.toLocaleString(LOC(), { style: 'currency', currency: 'EUR', minimumFractionDigits: v % 1 ? 2 : 0 }));
function meter(label, used, limit, fmt = (x) => x) {
  const inf = limit === Infinity;
  const pct = inf ? 4 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return `<div class="meter ${pct >= 90 ? 'hot' : pct >= 70 ? 'warm' : ''}"><div class="meter-top"><span>${label}</span><span>${fmt(used)} / ${inf ? '∞' : fmt(limit)}</span></div><div class="meter-bar"><i style="width:${pct}%"></i></div></div>`;
}
function planCard() {
  const id = curPlan(), plan = planOf(id), u = S.usage || {};
  const by = S.project?.planBy && S.project.planBy !== S.me?.uid ? nameOf(S.project.planBy) : null;
  const mb = (S.project?.storageBytes || 0) / 1048576;
  return `<section class="plan-card plan-${id}">
    <div class="plan-top"><div><span class="plan-kicker">Dein Abo${S.userDoc?.grantSource === 'beta' ? ' · Testphase' : ''}</span><h2>${esc(plan.name)}</h2>${by ? `<small>über ${esc(by)} – gilt für alle hier</small>` : `<small>${esc(plan.tagline)}</small>`}</div>
      <button class="btn small ${id === 'pro' ? 'secondary' : ''}" data-action="plan-open">${id === 'pro' ? 'Details' : 'Upgrade'}</button></div>
    ${meter('KI-Aktionen', u.ai || 0, plan.limits.aiActions)}
    ${meter('E-Mails auslesen', u.mails || 0, plan.limits.mails)}
    ${meter('Speicher', mb, plan.limits.storageMB, (x) => (x >= 1024 ? `${(x / 1024).toLocaleString(LOC(), { maximumFractionDigits: 1 })} GB` : `${Math.round(x)} MB`))}
    ${meter('Personen', members().length, plan.limits.members)}
    ${meter('Eigene Projekte', ownProjects(), plan.limits.ownProjects)}
    <p class="hint" style="margin:8px 0 0">Zähler starten am 1. jedes Monats neu.${id !== 'free' && !by ? ' <button class="link" data-action="plan-manage">Abo verwalten</button>' : ''}</p>
  </section>`;
}
const PAY_REASON = {
  ai: 'Die KI-Aktionen für diesen Monat sind aufgebraucht.',
  mails: 'Das E-Mail-Kontingent für diesen Monat ist aufgebraucht.',
  storage: 'Der Speicher für Fotos & Dokumente ist voll.',
  members: 'Mit deinem Abo können nicht mehr Personen mitplanen.',
  projects: 'Mit deinem Abo kannst du keine weiteren eigenen Projekte anlegen.',
  deep: 'Der Gründlich-Modus gehört zu Pro.',
};
function planFeatures(id) {
  const p = planOf(id), L = p.limits;
  const f = [
    L.ownProjects === Infinity ? 'Unbegrenzt viele eigene Projekte' : `${L.ownProjects} eigene${L.ownProjects === 1 ? 's' : ''} Projekt${L.ownProjects === 1 ? '' : 'e'} zusätzlich`,
    `Bis zu ${L.members} Personen`,
    `${L.aiActions} KI-Aktionen pro Monat`,
    `${L.mails} E-Mails pro Monat auslesen (je bis zu ${L.mailAttachments} ${L.mailAttachments === 1 ? 'Anhang' : 'Anhänge'})`,
    `${storageLabel(L.storageMB)} für Fotos & Dokumente`,
  ];
  if (p.features.dailyCheck) f.push('Tägliche KI-Fristenprüfung');
  if (p.features.bestModel) f.push('Gründlich-Modus mit dem stärksten KI-Modell');
  if (id === 'free') f.push('Face ID, Kalender, Push und Teilen inklusive');
  return f;
}
function paywallSheet(reason) {
  if (!billing()) return;
  let period = 'month';
  const cur = curPlan();
  const sheet = openSheet(`<div class="sheet-head"><h2>MindSpace-Abo</h2><button class="btn ghost" data-dismiss>Schließen</button></div>
    ${reason && PAY_REASON[reason] ? `<div class="note-card soft"><p>${esc(PAY_REASON[reason])} Mit einem größeren Abo geht es sofort weiter.</p></div>` : ''}
    <div class="period-toggle" role="tablist"><button data-per="month" class="on" role="tab">Monatlich</button><button data-per="year" role="tab">Jährlich <span class="save">−25 %</span></button></div>
    <div class="plan-list" data-plans></div>
    <p class="legal-small"><span>${native.isNative() ? (native.platform() === 'ios' ? 'Bezahlt wird über deinen Apple-Account. Abos verlängern sich automatisch um die gewählte Laufzeit, wenn du sie nicht spätestens 24 Stunden vor Ablauf in den Einstellungen deines Apple-Accounts kündigst.' : 'Bezahlt wird über deinen Google-Play-Account. Abos verlängern sich automatisch um die gewählte Laufzeit, wenn du sie nicht vor Ablauf in den Play-Store-Abos kündigst.') : 'Abos schließt du in der MindSpace-App auf deinem iPhone oder Android-Handy ab – sie gelten dann auch hier.'}</span>
      <span>Ein Abo gilt für alle Personen in eurem gemeinsamen Bereich.</span></p>
    <div class="legal-links">${legalLinks(true)}</div>
    ${native.isNative() ? '<button class="link center" data-action="plan-restore" style="margin-top:6px">Käufe wiederherstellen</button>' : ''}
    ${CFG.backend?.beta ? `<section class="beta-box"><h3>🧪 Testphase</h3><p>Probiere jede Stufe kostenlos aus – du brauchst nur den Test-Code, den du mit der Einladung bekommen hast.</p>
      <div class="beta-btns">${PLAN_ORDER.map((id) => `<button class="btn small ${id === cur ? '' : 'secondary'}" data-beta="${id}">${esc(planOf(id).name)}${id === cur ? ' ✓' : ''}</button>`).join('')}</div></section>` : ''}`);
  sheet.querySelectorAll('[data-beta]').forEach((b) => b.addEventListener('click', () => betaSwitch(b.dataset.beta, b)));
  const priceOf = (id, per) => {
    const o = offersCache?.[`${id}_${per === 'year' ? 'yearly' : 'monthly'}`];
    return o?.price || eurFmt(planOf(id).price[per]);
  };
  const draw = () => {
    sheet.querySelector('[data-plans]').innerHTML = PLAN_ORDER.map((id) => {
      const p = planOf(id), isCur = id === cur, lower = PLAN_ORDER.indexOf(id) < PLAN_ORDER.indexOf(cur);
      const price = id === 'free' ? eurFmt(0) : priceOf(id, period);
      const perMonth = id !== 'free' && period === 'year' ? `<small>entspricht ${eurFmt(Math.floor((p.price.year / 12) * 100) / 100)} / Monat</small>` : '';
      return `<article class="plan-tile ${isCur ? 'current' : ''} ${id === 'daily' ? 'featured' : ''}">
        <header><div><h3>${esc(p.name)}</h3><p>${esc(p.tagline)}</p></div>${isCur ? '<span class="plan-badge">Dein Abo</span>' : id === 'daily' ? '<span class="plan-badge soft">Beliebt</span>' : ''}</header>
        <div class="plan-price"><b>${esc(price)}</b>${id === 'free' ? '' : `<span>/ ${period === 'year' ? 'Jahr' : 'Monat'}</span>`}${perMonth}</div>
        <ul>${planFeatures(id).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${id === 'free' || isCur || lower ? '' : `<button class="btn block" data-buy="${id}" ${native.isNative() ? '' : 'disabled'}>${esc(p.name)} wählen</button>`}
      </article>`;
    }).join('');
    sheet.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => buyPlan(b.dataset.buy, period, b)));
  };
  sheet.querySelectorAll('[data-per]').forEach((b) => b.addEventListener('click', () => {
    period = b.dataset.per;
    sheet.querySelectorAll('[data-per]').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  draw();
  if (native.isNative() && !offersCache) native.offerings().then((o) => { offersCache = o; if (sheet.isConnected) draw(); }).catch((e) => console.warn('Angebote:', e));
}
async function buyPlan(id, period, btn) {
  if (!native.isNative()) { toast('Abos schließt du in der MindSpace-App auf deinem Handy ab.'); return; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Einen Moment …';
  try {
    const r = await native.buy(id, period);
    if (!r.ok) { btn.disabled = false; btn.textContent = label; return; }
    await store.refreshPlan().catch(() => {});
    closeSheet();
    celebrate(window.innerWidth / 2, window.innerHeight / 3);
    toast(`Willkommen bei ${planOf(id).name} 🎉`);
  } catch (e) { toast(fail(e)); btn.disabled = false; btn.textContent = label; }
}
async function betaSwitch(plan, btn) {
  let code = '';
  try { code = localStorage.getItem('ms-beta-code') || ''; } catch {}
  if (!code) code = (prompt('Test-Code eingeben (steht in deiner Einladung):') || '').trim();
  if (!code) return;
  btn.disabled = true;
  try {
    await store.betaPlan(plan, code);
    try { localStorage.setItem('ms-beta-code', code); } catch {}
    closeSheet();
    toast(`Testphase: ${planOf(plan).name} ist aktiv`);
  } catch (e) {
    if (e.code === 'beta-denied') { try { localStorage.removeItem('ms-beta-code'); } catch {} }
    toast(e.message || fail(e)); btn.disabled = false;
  }
}
// Feedback aus der Testphase
function feedbackSheet() {
  const sheet = openSheet(`<div class="sheet-head"><h2>Feedback</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <p class="hint" style="margin-top:-4px">Was ist dir aufgefallen? Jede Rückmeldung hilft – auch Kleinigkeiten.</p>
    <form>
      <div class="seg fb-kind" role="radiogroup">
        <label><input type="radio" name="kind" value="bug" checked><span>🐞 Fehler</span></label>
        <label><input type="radio" name="kind" value="idea"><span>💡 Idee</span></label>
        <label><input type="radio" name="kind" value="other"><span>💬 Sonstiges</span></label>
      </div>
      <label class="field"><span>Deine Nachricht</span><textarea name="text" rows="6" maxlength="4000" required placeholder="z. B. „Beim Anlegen einer Aufgabe mit Uhrzeit springt das Datum auf morgen.“"></textarea></label>
      <p class="hint">Mitgeschickt werden nur App-Version, Gerätetyp und die gerade offene Ansicht.</p>
      <button class="btn block" type="submit">Senden</button>
    </form>`);
  const form = sheet.querySelector('form');
  setTimeout(() => form.text.focus(), 250);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = form.text.value.trim(); if (!text) return;
    const b = form.querySelector('[type="submit"]'); b.disabled = true;
    try {
      await store.sendFeedback({ text, kind: form.kind.value, view: S.view, version: APP_VERSION, device: `${native.platform()} · ${standalone ? 'App' : 'Browser'} · ${navigator.userAgent.slice(0, 160)}`, plan: curPlan() || 'legacy' });
      closeSheet(); toast('Danke! Dein Feedback ist angekommen 🙏');
    } catch (err) { toast(fail(err)); b.disabled = false; }
  };
}
async function restorePurchases() {
  try {
    toast('Käufe werden geprüft …');
    await native.restore();
    const r = await store.refreshPlan();
    toast(r?.userPlan && r.userPlan !== 'free' ? `${planOf(r.userPlan).name} ist wieder aktiv` : 'Kein aktives Abo gefunden');
  } catch (e) { toast(fail(e)); }
}
async function manageSubscription() {
  if (!native.isNative()) { toast('Verwalte dein Abo in den Abo-Einstellungen deines Handys (App Store bzw. Google Play).'); return; }
  const url = (await native.manageUrl().catch(() => null)) || STORE_URLS[native.platform()];
  native.openExternal(url);
}
function legalLinks(inline) {
  const L = CFG.legal || {};
  const items = [['privacy', 'Datenschutz'], ['terms', 'Nutzungsbedingungen'], ['imprint', 'Impressum']].filter(([k]) => L[k]);
  if (inline) return items.map(([k, l]) => `<button class="link" data-action="legal" data-url="${esc(L[k])}">${l}</button>`).join(' · ');
  return items.map(([k, l]) => `<button class="setting" data-action="legal" data-url="${esc(L[k])}"><span class="grow">${l}</span>${I.chevron}</button>`).join('');
}
function deleteAccountSheet() {
  const last = members().length <= 1;
  const sheet = openSheet(`<div class="sheet-head"><h2>Konto löschen</h2><button class="btn ghost" data-dismiss>Abbrechen</button></div>
    <div class="note-card warn"><p>${last ? '<strong>Du bist die letzte Person in diesem Bereich.</strong> Alle Aufgaben, Kosten, Kontakte, Fotos und Dokumente werden endgültig gelöscht.' : 'Du wirst aus dem gemeinsamen Bereich entfernt. Die Daten bleiben für die anderen erhalten.'} Dein Konto und deine Einstellungen werden gelöscht. Das lässt sich nicht rückgängig machen.</p></div>
    ${curPlan() !== 'free' && S.project?.planBy === S.me?.uid ? `<p class="hint">Dein laufendes Abo wird dadurch <strong>nicht</strong> beendet. Kündige es vorher im ${native.platform() === 'android' ? 'Play Store' : 'App Store'} – <button class="link" data-action="plan-manage">Abo verwalten</button>.</p>` : ''}
    <form><label class="field"><span>Zum Bestätigen LÖSCHEN eingeben</span><input class="input" name="c" autocomplete="off" autocapitalize="characters"></label>
      <button class="btn block danger" type="submit">Konto endgültig löschen</button></form>`);
  sheet.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    if (!/^(LÖSCHEN|LOESCHEN|DELETE)$/i.test(e.target.c.value.trim())) { toast('Bitte LÖSCHEN eingeben.'); return; }
    const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Wird gelöscht …';
    try { await store.deleteAccount(); localStorage.removeItem(LOCK_KEY); closeSheet(); toast('Dein Konto wurde gelöscht.'); }
    catch (err) { toast(fail(err)); b.disabled = false; b.textContent = 'Konto endgültig löschen'; }
  };
}
// Links in der App: webcal:, mailto:, tel: und externe Seiten über das Betriebssystem öffnen
document.addEventListener('click', (e) => {
  if (!native.isNative()) return;
  const a = e.target.closest?.('a[href]'); if (!a) return;
  const href = a.getAttribute('href');
  if (/^(webcal|mailto|tel|sms|maps):/i.test(href) || (/^https?:/i.test(href) && !href.startsWith(location.origin))) { e.preventDefault(); native.openExternal(href); }
}, true);


// ================================================================== Entwürfe (v15)
// Schutz vor Datenverlust: iOS beendet Web-Apps im Hintergrund oft komplett (z. B. nach dem Sperren).
// Eingaben in einer offenen Aufgabe werden darum laufend auf dem Gerät gesichert und beim nächsten
// Öffnen wiederhergestellt; bestehende Aufgaben speichert MindSpace beim Wechsel in den Hintergrund.
const DRAFT_KEY = 'ms-draft';
function draftSave(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, uid: S.me?.uid || 'local' })); } catch {} }
function draftLoad() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } }
function draftClear(key) { try { const d = draftLoad(); if (!key || d?.key === key) localStorage.removeItem(DRAFT_KEY); } catch {} }
function restoreDraft(d) {
  if (!d) return false;
  if (d.key === 'task:new') { S.restoreDraft = d; taskSheet(null); return true; }
  const t = S.tasks.find((x) => x.id === d.key.slice(5));
  if (!t) return false;
  S.restoreDraft = d; taskSheet(t); return true;
}
function maybeRestoreDraft() {
  if (S.draftChecked) return;
  const d = draftLoad();
  if (!d) { S.draftChecked = true; return; }
  if (d.uid && S.me?.uid && d.uid !== S.me.uid) { S.draftChecked = true; return; }
  if (Date.now() - (d.ts || 0) > 7 * 864e5) { draftClear(); S.draftChecked = true; return; }
  if (d.key !== 'task:new' && !S.tasks.length) return; // Aufgaben noch nicht geladen
  S.draftChecked = true;
  if (sheetRoot.innerHTML.trim()) return;
  if (!restoreDraft(d)) draftClear();
}
function flushOpenSheet() {
  const sheet = sheetRoot.querySelector('.sheet');
  if (sheet?._autosave) sheet._autosave();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flushOpenSheet(); });
window.addEventListener('pagehide', flushOpenSheet);
native.onAppState((active) => { if (!active) flushOpenSheet(); });

// ================================================================== Start
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
startTranslator();
store.init({
  onAuth(me) {
    const changed = S.me?.uid !== me?.uid;
    S.me = me; S.authReady = true;
    setTimeout(() => native.hideSplash(), 60);
    if (me && store.mode === 'cloud' && changed) {
      S.projectState = 'loading'; store.resumePush(); store.setUserPref({ lang: LANG }).catch(() => {});
      if (store.backend && native.isNative()) native.purchasesInit(me.uid, CFG.backend?.revenuecat).then((ok) => ok && store.refreshPlan().catch(() => {}));
    }
    render();
  },
  onUserDoc(d) { S.userDoc = d; render(); maybeAskCal(); },
  onProject(p) {
    S.project = p; S.projectState = p ? 'ready' : 'none'; render(); maybeAskCal();
    if (p && Object.values(p.access || {}).some(Array.isArray)) setTimeout(() => { if (S.tasks.length || S.files.length) runBackfill(); }, 4000);
  },
  onTasks(list) {
    S.tasks = list; render();
    setTimeout(maybeRestoreDraft, 400);
    if (S.openNewOnReady) { S.openNewOnReady = false; setTimeout(() => taskSheet(null), 300); }
    if (S.openTaskOnReady) { const t = list.find((x) => x.id === S.openTaskOnReady); if (t) { S.openTaskOnReady = null; setTimeout(() => taskSheet(t), 300); } }
  },
  onInfos(list) { S.infos = list; render(); },
  onContacts(list) { S.contacts = list; render(); },
  onAreas(list) { S.areas = list; render(); },
  onCosts(list) { S.costs = list; render(); },
  onComments(list) { S.comments = list; CNT = null; render(); refreshSheet(); },
  onFiles(list) { S.files = list; CNT = null; render(); refreshSheet(); },
  onAi(cfg) { S.ai = cfg; render(); },
  onError(e) { toast(fail(e)); },
  onPush(n) {
    const tid = n?.data?.taskId;
    if (n?.tapped && tid) { const t = S.tasks.find((x) => x.id === tid); if (t) taskSheet(t); else S.openTaskOnReady = tid; return; }
    toast(`${n.title || 'Erinnerung'}${n.body ? ': ' + n.body : ''}`);
  },
  onUsage(u) { S.usage = u; if (S.view === 'more' || S.view === 'inbox') render(); },
}).catch((e) => { app.innerHTML = `<div class="boot">Start fehlgeschlagen: ${esc(fail(e))}<br><br>Prüfe die Internetverbindung und config.js.</div>`; });

// Verknüpfungen aus dem Programm-Symbol (Rechtsklick in der Taskleiste): ?ansicht=plan, ?neu=1
{
  const q = new URLSearchParams(location.search);
  const v = q.get('ansicht');
  if (v && ['home', 'tasks', 'plan', 'inbox', 'more', 'costs', 'docs'].includes(v)) S.view = v;
  if (q.get('neu')) S.openNewOnReady = true;
  if (q.get('aufgabe')) S.openTaskOnReady = q.get('aufgabe');
  if (v || q.get('neu') || q.get('aufgabe')) history.replaceState(null, '', location.pathname);
}
if (!native.isNative() && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
