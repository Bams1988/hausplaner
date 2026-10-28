// Kleine Hilfen für die Server-Dienste (Zeit in Berlin, Textvergleich, IDs).
import crypto from 'node:crypto';
import { startByOf } from '../shared/ai.js';

export const TZ = 'Europe/Berlin';

export function berlinParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, iso: `${p.year}-${p.month}-${p.day}` };
}
export const berlinIso = (d = new Date()) => berlinParts(d).iso;

function offsetMin(ms) {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName')?.value || 'GMT';
  const m = v.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}
// Zeitpunkt (ms) für Datum/Uhrzeit in Berliner Zeit
export function berlinMs(y, mo, d, h = 0, min = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, min);
  return guess - offsetMin(guess) * 60e3;
}
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

// Erinnerungszeitpunkt wie in der App (store.js), aber sicher in Berliner Zeit
export function remindAtOf(t) {
  if (t.reminder === 'custom') return t.remindCustom ? new Date(t.remindCustom).getTime() : null;
  if (!t.due || !t.reminder || t.reminder === 'none') return null;
  const [y, m, d] = t.due.split('-').map(Number);
  const at = (od, h, min = 0) => berlinMs(y, m, d + od, h, min);
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
export function withReminder(t) {
  const remindAt = remindAtOf(t);
  return { ...t, remindAt, reminded: false, startBy: startByOf(t) };
}

export const normName = (s) => String(s || '').toLowerCase().replace(/\b(herr|frau|dr\.?)\s+/g, '').replace(/[^a-zäöüß]/g, '');
export function similar(a, b) {
  const w = (s) => new Set(String(s).toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').split(/\s+/).filter((x) => x.length > 3));
  const A = w(a), B = w(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}
export const newId = (n = 20) => crypto.randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n);
export const T = (lang, de, en) => (lang === 'en' ? en : de);
export const deDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

// Einheitlicher Fehler mit Code für die App (quota, forbidden, invalid, upstream)
export class AppError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
