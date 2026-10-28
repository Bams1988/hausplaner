// Kalender-Abo: …/calendar?k=<geheimer Schlüssel> liefert die Aufgaben eines Mitglieds als iCalendar.
import { berlinIso, berlinMs } from './util.js';

const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utf8 = (ch) => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
function fold(line) {
  let out = '', cur = '', n = 0;
  for (const ch of line) { const b = utf8(ch); if (n + b > 73) { out += cur + '\r\n '; cur = ''; n = 1; } cur += ch; n += b; }
  return out + cur;
}
const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildIcs(name, events, now = Date.now()) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MindSpace//Kalender//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(name), 'X-WR-TIMEZONE:Europe/Berlin', 'X-APPLE-CALENDAR-COLOR:#2F9E77', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M'];
  const stamp = utc(now);
  for (const ev of events) {
    const [y, mo, d] = ev.due.split('-').map(Number);
    L.push('BEGIN:VEVENT', `UID:${ev.id}@mindspace`, 'DTSTAMP:' + stamp);
    if (ev.time && /^\d{1,2}:\d{2}$/.test(ev.time)) {
      const [h, mi] = ev.time.split(':').map(Number);
      const s = berlinMs(y, mo, d, h, mi);
      L.push('DTSTART:' + utc(s), 'DTEND:' + utc(s + 3600e3));
    } else {
      const nx = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '');
      L.push(`DTSTART;VALUE=DATE:${ev.due.replace(/-/g, '')}`, 'DTEND;VALUE=DATE:' + nx);
    }
    L.push('SUMMARY:' + esc(ev.title));
    if (ev.info) L.push('DESCRIPTION:' + esc(ev.info));
    if (ev.url) L.push('URL:' + ev.url);
    if (ev.cat) L.push('CATEGORIES:' + esc(ev.cat));
    L.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

export async function calendarFeed(db, k, { appUrl = '' } = {}) {
  const empty = () => buildIcs('MindSpace', []);
  if (!/^[A-Za-z0-9_-]{24,}$/.test(k || '')) return empty();
  const f = (await db.doc(`calFeeds/${k}`).get()).data();
  if (!f || !f.uid || !f.pid) return empty();
  const p = (await db.doc(`projects/${f.pid}`).get()).data();
  if (!p || !(p.members || []).includes(f.uid)) return empty();
  const acc = (p.access || {})[f.uid];
  const darf = (a) => !Array.isArray(acc) || acc.includes(a || 'hausbau');
  const u = (await db.doc(`users/${f.uid}`).get()).data() || {};
  const en = u.lang === 'en';
  const areas = {};
  for (const a of (await db.collection(`projects/${f.pid}/areas`).get()).docs) areas[a.id] = `${a.get('emoji') ? a.get('emoji') + ' ' : ''}${a.get('name') || ''}`.trim();
  const names = p.memberNames || {};
  const today = berlinIso();
  const from = berlinIso(new Date(Date.now() - 120 * 864e5));
  const link = (id) => (appUrl ? `${appUrl.replace(/\/?$/, '/')}?aufgabe=${id}` : '');
  const events = [];
  const tasks = await db.collection(`projects/${f.pid}/tasks`).where('due', '>=', from).get();
  for (const d of tasks.docs) {
    const t = d.data();
    if (!t.due || !darf(t.areaId)) continue;
    if (f.scope === 'mine' && t.assignee && t.assignee !== 'all' && t.assignee !== f.uid) continue;
    const who = t.assignee && t.assignee !== 'all' ? (t.assignee === f.uid ? (en ? 'you' : 'du') : names[t.assignee] || '') : '';
    events.push({
      id: d.id, due: t.due, time: t.time || '',
      title: (t.done ? '✅ ' : t.due < today ? '🔴 ' : '') + (t.title || ''),
      info: [areas[t.areaId || 'hausbau'] || '', who ? (en ? 'Responsible: ' : 'Zuständig: ') + who : '', t.notes || '', link(d.id) ? (en ? 'Open in MindSpace: ' : 'In MindSpace öffnen: ') + link(d.id) : ''].filter(Boolean).join('\n'),
      url: link(d.id), cat: areas[t.areaId || 'hausbau'] || '',
    });
  }
  return buildIcs(`MindSpace${p.name ? ' – ' + p.name : ''}`, events);
}
