// Regelbasierte Erkennung von Aufgaben in deutschen E-Mail-Verläufen.
// Läuft komplett im Browser, ohne KI-Dienst und ohne Kosten.

// JavaScript kennt Umlaute bei \b und \w nicht – U() ersetzt beides umlautfähig.
const WC = 'A-Za-z0-9_äöüÄÖÜß';
const U = (re) => new RegExp(re.source
  .replaceAll('\\b', `(?:(?<![${WC}])(?=[${WC}])|(?<=[${WC}])(?![${WC}]))`)
  .replaceAll('\\w', `[${WC}]`), re.flags);

const MONTHS = {
  januar: 1, jan: 1, februar: 2, feb: 2, märz: 3, maerz: 3, mär: 3, mrz: 3, april: 4, apr: 4,
  mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
};
const MONTH_RE = '(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mär|mrz|apr|jun|jul|aug|sept|sep|okt|nov|dez)\\.?';
const WEEKDAYS = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6 };

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const validDate = (y, m, d) => {
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? x : null;
};
const fridayOf = (d) => addDays(d, 4 - ((d.getDay() + 6) % 7)); // Freitag derselben Woche
function isoWeekFriday(year, week) {
  const jan4 = new Date(year, 0, 4);
  const monday = addDays(jan4, -((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return addDays(monday, 4);
}
function yearFor(month, day, ref) {
  let y = ref.getFullYear();
  const d = validDate(y, month, day);
  if (d && d < addDays(ref, -60)) y += 1; // „15.01.“ im Dezember meint das nächste Jahr
  return y;
}

// Liefert {date:'YYYY-MM-DD', time:'HH:MM'|null} für die wahrscheinlichste Frist im Text.
export function extractDate(text, ref = new Date()) {
  const t = ' ' + text.toLowerCase() + ' ';
  const cands = [];
  const push = (date, idx, base = 0) => {
    if (!date) return;
    const before = t.slice(Math.max(0, idx - 28), idx);
    let score = base;
    if (/(bis|spätestens|zum|am|ab|termin|frist|fällig|deadline|bis zum|bis spätestens|vor dem)\s*(dem\s*|den\s*)?$/.test(before)) score += 3;
    if (/(vom|seit|datiert|schreiben|rechnung|e-mail|mail|nachricht|angebot|vertrag)\s*(vom\s*)?$/.test(before)) score -= 4;
    cands.push({ date, idx, score });
  };
  let m;
  const reNum = /(?<![\d.])(\d{1,2})\.\s?(\d{1,2})\.(\d{4}|\d{2})?(?![\d])/g;
  while ((m = reNum.exec(t))) {
    const d = +m[1], mo = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    let y = m[3] ? +m[3] : yearFor(mo, d, ref);
    if (y < 100) y += 2000;
    push(validDate(y, mo, d), m.index, 3);
  }
  const reText = new RegExp(`(?<![\\d])(\\d{1,2})\\.\\s*${MONTH_RE}(?:\\s+(\\d{4}))?`, 'g');
  while ((m = reText.exec(t))) {
    const mo = MONTHS[m[2]]; const d = +m[1];
    push(validDate(m[3] ? +m[3] : yearFor(mo, d, ref), mo, d), m.index, 3);
  }
  const rePart = new RegExp(`(ende|anfang|mitte)\\s+(des\\s+monats|${MONTH_RE})(?:\\s+(\\d{4}))?`, 'g');
  while ((m = rePart.exec(t))) {
    let mo = m[2].startsWith('des') ? ref.getMonth() + 1 : MONTHS[m[3]];
    const y = m[4] ? +m[4] : yearFor(mo, 28, ref);
    const day = m[1] === 'anfang' ? 5 : m[1] === 'mitte' ? 15 : new Date(y, mo, 0).getDate();
    push(validDate(y, mo, day), m.index, 0);
  }
  const reKw = /(?:kw|kalenderwoche)\s*(\d{1,2})(?:\s*\/?\s*(\d{4}))?/g;
  while ((m = reKw.exec(t))) {
    let y = m[2] ? +m[2] : ref.getFullYear();
    if (!m[2] && +m[1] < 10 && ref.getMonth() >= 9) y += 1;
    push(isoWeekFriday(y, +m[1]), m.index, 1);
  }
  const rel = [
    [U(/\bübermorgen\b/g), () => addDays(ref, 2)],
    [U(/\bmorgen\b/g), () => addDays(ref, 1)],
    [U(/\bheute\b/g), () => ref],
    [U(/\b(?:in|innerhalb von|innerhalb|binnen)\s+(\d+|zwei|drei|vier|einer|einem)\s+(tag|tagen|woche|wochen|monat|monaten)\b/g), (mm) => {
      const words = { einer: 1, einem: 1, zwei: 2, drei: 3, vier: 4 };
      const n = words[mm[1]] ?? +mm[1];
      const unit = mm[2];
      if (unit.startsWith('tag')) return addDays(ref, n);
      if (unit.startsWith('woche')) return addDays(ref, n * 7);
      const x = new Date(ref); x.setMonth(x.getMonth() + n); return x;
    }],
    [U(/\b(?:am|übers|diesem|dieses)\s+wochenende\b/g), () => addDays(ref, ref.getDay() === 0 || ref.getDay() === 6 ? 0 : 6 - ref.getDay())],
    [U(/\b(?:nächste|nächsten|kommende|kommenden)\s+woche\b/g), () => addDays(fridayOf(ref), 7)],
    [U(/\b(?:diese|dieser)\s+woche\b|\bende\s+der\s+woche\b/g), () => fridayOf(ref)],
  ];
  for (const [re, fn] of rel) {
    while ((m = re.exec(t))) push(fn(m), m.index, 0);
  }
  const reWd = U(/\b(nächsten|kommenden|am|bis|bis zum|diesen)?\s*(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/g);
  while ((m = reWd.exec(t))) {
    const target = WEEKDAYS[m[2]];
    let diff = (target - ref.getDay() + 7) % 7 || 7;
    push(addDays(ref, diff), m.index + (m[1] ? m[1].length + 1 : 0), m[1] ? -1 : -2);
  }
  const best = cands.filter((c) => c.score > -2).sort((a, b) => b.score - a.score || a.idx - b.idx)[0];
  if (!best) return null;
  let time = null;
  const tm = /(?<![\d.])(\d{1,2})(?:[:.](\d{2}))?\s*uhr/.exec(t);
  if (tm && +tm[1] < 24) time = `${pad(+tm[1])}:${tm[2] || '00'}`;
  return { date: isoDate(best.date), time };
}

// ---------- Aufteilen in einzelne Nachrichten ----------
const HEADER_START = /^\s*(von|from)\s*:\s*\S/i;
const QUOTE_LINE = /^\s*am\s+.{4,90}schrieb.{0,80}:\s*$/i;
const ORIGINAL = /^\s*-{2,}\s*(ursprüngliche nachricht|original message|weitergeleitete nachricht|forwarded message)/i;
const SIGNOFF = U(/^\s*(mit\s+freundlichen\s+grüßen|mit\s+freundlichem\s+gruß|freundliche\s+grüße|freundlichen\s+gruß|viele\s+grüße|beste\s+grüße|liebe\s+grüße|herzliche\s+grüße|schöne\s+grüße|mfg|lg|vg|gruß|grüße|best regards|kind regards|regards)\b/i);

function parseHeaderDate(line, ref) {
  const d = extractDate(line, ref);
  return d ? d.date : null;
}

export function splitMessages(raw, ref = new Date()) {
  const lines = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n').map((l) => l.replace(/^\s*(>\s?)+/, ''));
  const msgs = [];
  let cur = { lines: [], date: null, subject: null, from: null };
  let inHeader = false;
  for (const line of lines) {
    if (HEADER_START.test(line) || ORIGINAL.test(line) || QUOTE_LINE.test(line)) {
      if (cur.lines.some((l) => l.trim())) msgs.push(cur);
      cur = { lines: [], date: null, subject: null, from: null };
      inHeader = !QUOTE_LINE.test(line);
      if (QUOTE_LINE.test(line)) {
        cur.date = parseHeaderDate(line, ref);
        const who = /schrieb\s+(.+?)\s*:/i.exec(line) || /\d{2}:\d{2}\s*(?:uhr)?\s*,?\s*(.+?)\s+schrieb/i.exec(line);
        cur.from = who ? who[1].replace(/<.*?>/g, '').trim() : null;
      }
      if (HEADER_START.test(line)) cur.from = line.split(':').slice(1).join(':').replace(/<.*?>/g, '').replace(/\[.*?\]/g, '').trim();
      continue;
    }
    if (inHeader) {
      const h = /^\s*(gesendet|datum|date|sent|an|to|cc|bcc|betreff|subject|von|from)\s*:\s*(.*)$/i.exec(line);
      if (h) {
        const key = h[1].toLowerCase();
        if (['gesendet', 'datum', 'date', 'sent'].includes(key)) cur.date = parseHeaderDate(h[2], ref);
        if (['betreff', 'subject'].includes(key)) cur.subject = h[2].replace(/^(aw|re|wg|fw|fwd)\s*:\s*/gi, '').trim();
        continue;
      }
      if (!line.trim()) continue;
      inHeader = false;
    }
    cur.lines.push(line);
  }
  if (cur.lines.some((l) => l.trim())) msgs.push(cur);
  // Betreff ganz oben (wenn ohne „Von:“ eingefügt)
  if (msgs[0] && !msgs[0].subject) {
    const first = msgs[0].lines.findIndex((l) => l.trim());
    const s = /^\s*(betreff|subject)\s*:\s*(.+)$/i.exec(msgs[0].lines[first] || '');
    if (s) { msgs[0].subject = s[2].trim(); msgs[0].lines.splice(first, 1); }
  }
  return msgs.map((m, i) => ({ ...m, index: i, body: cleanBody(m.lines) }));
}

function cleanBody(lines) {
  const out = [];
  for (const line of lines) {
    if (SIGNOFF.test(line)) break;
    if (/^\s*(gesendet von|sent from) (meinem|my) /i.test(line)) break;
    if (U(/^\s*(sehr geehrte|sehr geehrter|hallo|guten tag|liebe|lieber|hi|moin|servus)\b.{0,80},?\s*$/i).test(line) && line.trim().length < 90) continue;
    out.push(line);
  }
  return out;
}

// ---------- Sätze und Listenpunkte ----------
const ABBR = U(/(?:\bz\.\s?b|\bu\.\s?a|\bca|\bnr|\bhr|\bfr|\bstr|\bbzw|\bggf|\binkl|\bevtl|\bd\.\s?h|\busw|\betc|\btel|\bdipl|\bing|\bdr|\bvgl|\bmax|\bmin|\bzzgl|\bsog|\bgem|\bbzgl|\bu\.\s?u|\bo\.\s?ä|\bs|\babs|\bart)$/i);
function splitSentences(text) {
  const res = [];
  let start = 0;
  const re = /[.!?]+(?=\s+["„(]?[A-ZÄÖÜ0-9])/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(start, m.index);
    const after = text.slice(m.index + 1, m.index + 16).trim().toLowerCase();
    if (/\d$/.test(before) && m[0] === '.' && (new RegExp('^' + MONTH_RE).test(after) || /^\d/.test(after) || /^(stock|etage|og|obergeschoss)/.test(after))) continue; // 15. November
    if (ABBR.test(before.slice(-8))) continue;
    res.push(text.slice(start, m.index + m[0].length).trim());
    start = m.index + m[0].length;
  }
  const rest = text.slice(start).trim();
  if (rest) res.push(rest);
  return res;
}

const BULLET = /^\s*(?:[-–•*·▪►✓]|\d{1,2}[.)]|[a-z][.)])\s+(.+)$/i;
function segments(bodyLines) {
  const segs = [];
  let para = [];
  let lead = null;
  const flush = () => {
    if (para.length) {
      for (const s of splitSentences(para.join(' ').replace(/\s+/g, ' '))) segs.push({ text: s });
      para = [];
    }
  };
  for (const raw of bodyLines) {
    const line = raw.trim();
    const b = BULLET.exec(raw);
    if (!line) { flush(); lead = null; continue; }
    if (b) {
      if (para.length) {
        const last = para.join(' ');
        flush();
        lead = /:\s*$/.test(last) ? splitSentences(last.replace(/\s+/g, ' ')).pop() : null;
        if (lead && segs.length) segs[segs.length - 1].isLead = true;
      }
      segs.push({ text: b[1].trim(), bullet: true, lead });
      continue;
    }
    if (lead && /^\S/.test(line) && segs.length && segs[segs.length - 1].bullet && !/[.!?:]$/.test(segs[segs.length - 1].text) && line.length < 60) {
      segs[segs.length - 1].text += ' ' + line; // umbrochener Listenpunkt
      continue;
    }
    para.push(line);
  }
  flush();
  return segs;
}

// ---------- Bewertung ----------
const RULES = [
  [U(/\bbitte\b/i), 3],
  [U(/\bwir\s+(?:benötigen|brauchen|bitten|erbitten)\b|\b(?:benötigen|brauchen|bitten|erbitten)\s+wir\b/i), 3],
  [U(/\b(?:ist|sind)\b[^.]{0,80}\bzu\s+(?:über\w*|unter\w*|\w+en)\b(?!\s+(?:sehen|erkennen|finden))/i), 2],
  [U(/\b(?:senden|schicken|reichen|geben|teilen|lassen|übermitteln|nennen|bringen|füllen|unterschreiben|prüfen|wählen|überweisen|kontaktieren|vereinbaren|bestätigen|melden)\s+sie\b/i), 3],
  [U(/^(?:können|könnten|würden|wären|möchten|haben)\s+sie\b/i), 3],
  [U(/\b(?:müssen|müssten|sollten|sollen)\s+sie\b|\bwerden\s+sie\s+gebeten\b|\bsind\s+sie\s+(?:verpflichtet|gebeten)\b/i), 3],
  [U(/\b(?:bis\s+(?:zum|zur|spätestens|morgen|übermorgen|ende|anfang|mitte|nächste\w*|kommende\w*|\d|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|kw)|spätestens|frist|fristgerecht|deadline|zeitnah|umgehend|baldmöglichst|schnellstmöglich)\b/i), 2],
  [U(/\b(?:erforderlich|notwendig|benötigt|fehlt|fehlen|ausstehend|offen)\b/i), 2],
  [U(/\b(?:unterschreiben|unterzeichnen|zurücksenden|zurückschicken|ausfüllen|einreichen|überweisen|freigeben|freigabe|bestätigen|beauftragen|beantragen|vereinbaren|auswählen|entscheiden|abstimmen|nachreichen|mitbringen|zukommen\s+lassen|rückmeldung|rückantwort|mitteilen|zusenden|hochladen|vorlegen|einholen|kündigen|anmelden|abholen|bezahlen|begleichen)\b/i), 2],
  [U(/\btermin\b/i), 1],
  [U(/\b(?:ich|wir)\s+(?:werde|werden|schicke|schicken|sende|senden|melde|melden|kümmere|kümmern|kläre|klären|rufe|rufen|reiche|reichen)\b|\b(?:werde|werden|schicke|schicken|sende|senden|melde|melden|kümmere|kümmern|kläre|klären|rufe|rufen|reiche|reichen)\s+(?:ich|wir)\b/i), 2],
  [U(/\bbei\s+(?:fragen|rückfragen|unklarheiten)\b/i), -5],
  [U(/\b(?:stehe|stehen|steht)\s+(?:ich\s+|wir\s+)?(?:ihnen\s+)?(?:gerne|gern|jederzeit)\s+(?:zur\s+verfügung|bereit)/i), -5],
  [U(/\b(?:vielen\s+dank|herzlichen\s+dank|danke\s+(?:für|ihnen|schön))\b/i), -2],
  [U(/\b(?:haben\s+wir\s+erhalten|ist\s+(?:bei\s+uns\s+)?eingegangen|wurde\s+(?:bereits\s+)?(?:erledigt|überwiesen|versendet)|liegt\s+(?:uns\s+)?vor)\b/i), -3],
  [U(/\b(?:diese\s+e-?mail|vertraulich|empfänger|datenschutz|newsletter|abmelden\s+möchten|amtsgericht|hrb|geschäftsführ)/i), -6],
  [U(/\b(?:tel\.?|telefon|fax|mobil|www\.|https?:\/\/|@)\S*/i), -1],
];

function scoreText(text) {
  let s = 0;
  for (const [re, w] of RULES) if (re.test(text)) s += w;
  return s;
}

const PHASES = [
  ['Finanzierung', U(/\b(?:bank|kredit|finanzier|darlehen|bürgschaft|zahlung|rechnung|abschlag|überweis|kfw|förder|notar|grundbuch|kaufpreis|bezahl)/i)],
  ['Bemusterung', U(/\b(?:bemuster|fliese|sanitär|ausstattung|farbe|fenster|haustür|innentür|treppe|bodenbelag|elektroplan|steckdose|küche|dachziegel|fassade|putz|bad)/i)],
  ['Pläne & Behörden', U(/\b(?:bauantrag|baugenehmigung|genehmigung|statik|lageplan|vermess|bauamt|architekt|entwässerung|grundriss|bodengutachten|baugrund|bauvorlage|plan|zeichnung|energieausweis|wärmeschutz)/i)],
  ['Grundstück & Anschlüsse', U(/\b(?:hausanschluss|anschluss|strom|wasser|telekom|glasfaser|erdarbeit|keller|bodenplatte|baustrom|bauwasser|tiefbau|grundstück|zufahrt|kanal)/i)],
  ['Versicherung', U(/\b(?:versicherung|haftpflicht|bauleistung|feuerrohbau|police)/i)],
  ['Bau & Abnahme', U(/\b(?:montage|richtfest|abnahme|bauleit|mangel|mängel|übergabe|baustelle|aufbau|ausbau|estrich|einzug|schlüssel)/i)],
];
export function guessPhase(text) {
  for (const [name, re] of PHASES) if (re.test(text)) return name;
  return 'Allgemein';
}

function makeTitle(text) {
  let t = text.replace(/\s+/g, ' ').trim();
  t = t.replace(/^(?:und|außerdem|zudem|des weiteren|ferner|abschließend|zusätzlich|daher|deshalb|darüber hinaus|wichtig|hinweis|zur info|ps|p\.s\.)\s*[:,]?\s*/i, '');
  t = t.replace(/^(?:wir\s+bitten\s+sie(?:\s+(?:daher|deshalb|nun))?\s*,?\s*|wir\s+möchten\s+sie\s+bitten\s*,?\s*|bitte\s+|wir\s+benötigen\s+(?:von\s+ihnen\s+)?(?:noch\s+)?)/i, (m) => (/benötigen/i.test(m) ? 'Benötigt: ' : ''));
  t = t.replace(U(/\b(?:freundlicherweise|doch|gerne)\s+/gi), '');
  t = t.replace(/[\s,;:]+$/, '').replace(/[.!]+$/, '');
  if (t.length > 120) t = t.slice(0, 117).replace(/\s+\S*$/, '') + ' …';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const norm = (s) => s.toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
export function similarity(a, b) {
  const A = new Set(norm(a)), B = new Set(norm(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}

// Hauptfunktion: Text → Vorschläge
export function parseEmails(raw, { today = new Date(), existing = [] } = {}) {
  const msgs = splitMessages(raw, today);
  const found = [];
  for (const msg of msgs) {
    const ref = msg.date ? new Date(msg.date + 'T12:00:00') : today;
    const segs = segments(msg.body);
    segs.forEach((seg, si) => {
      const text = seg.text;
      if (seg.isLead || text.length < 12 || text.length > 500) return;
      let score = scoreText(text);
      let leadDate = null;
      if (seg.bullet && seg.lead) {
        const ls = scoreText(seg.lead);
        if (ls >= 3) score = Math.max(score, 3) + 1;
        leadDate = extractDate(seg.lead, ref);
      }
      let isTermin = false;
      let date = extractDate(text, ref) || leadDate;
      if (date) score += 1;
      if (date && U(/\btermin\b.{0,40}\b(?:am|um|ist|findet)\b|\bfindet\b.{0,140}\bstatt\b/i).test(text)) { score += 2; isTermin = true; }
      if (score < 3) return;
      const next = segs[si + 1];
      const prev = segs[si - 1];
      if (!date && prev && !prev.bullet) date = extractDate(prev.text, ref);
      if (!date && next && !next.bullet && scoreText(next.text) < 3) date = extractDate(next.text, ref);
      const full = seg.bullet && seg.lead ? `${seg.lead} ${text}` : text;
      found.push({
        title: (isTermin ? 'Termin: ' : '') + makeTitle(text.replace(U(/^.{0,40}\b(?:terminbestätigung|termin)\s*:\s*/i), '')),
        notes: full,
        due: date ? date.date : null,
        time: date ? date.time : null,
        phase: guessPhase(full + ' ' + (msg.subject || '')),
        score,
        messageIndex: msg.index,
        messageDate: msg.date,
        from: msg.from,
        subject: msg.subject,
      });
    });
  }
  // Duplikate entfernen (die neueste Nachricht steht oben und gewinnt)
  const unique = [];
  for (const f of found) {
    const dup = unique.find((u) => similarity(u.title, f.title) >= 0.75);
    if (dup) { if (!dup.due && f.due) { dup.due = f.due; dup.time = f.time; } continue; }
    unique.push(f);
  }
  for (const u of unique) {
    const ex = existing.find((e) => similarity(e.title, u.title) >= 0.75);
    u.existing = ex ? ex.title : null;
    u.selected = !u.existing && (u.messageIndex === 0 ? u.score >= 3 : u.score >= 5);
  }
  return { messages: msgs.map(({ index, date, subject, from }) => ({ index, date, subject, from })), tasks: unique };
}
