// KI-Assistent (Claude API von Anthropic).
// Wird in der App UND im täglichen Erinnerungs-Programm (GitHub Actions) verwendet –
// deshalb nichts Browser-Spezifisches hier verwenden.

export const MODELS = [
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 – empfohlen'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 – günstiger, etwas ungenauer'],
  ['claude-opus-5-5', 'Claude Opus 5.5 – am gründlichsten, teurer'],
];
export const DEFAULT_MODEL = MODELS[0][0];
export const PHASES = ['Allgemein', 'Finanzierung', 'Pläne & Behörden', 'Grundstück & Anschlüsse', 'Bemusterung', 'Versicherung', 'Bau & Abnahme'];
export const STATUS = {
  im_plan: { label: 'Im Plan', rank: 0 },
  jetzt_starten: { label: 'Jetzt angehen', rank: 2 },
  kritisch: { label: 'Wird knapp', rank: 3 },
  unrealistisch: { label: 'Kaum zu schaffen', rank: 4 },
};

const API = 'https://api.anthropic.com/v1/messages';
const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const de = (s) => (s ? `${+s.slice(8, 10)}.${+s.slice(5, 7)}.${s.slice(0, 4)}` : '');
const todayLine = (d = new Date()) => `Heute ist ${WD[d.getDay()]}, der ${iso(d)}.`;

export class AiError extends Error {}

async function post(apiKey, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AiError(e.name === 'AbortError' ? 'Die KI hat nicht rechtzeitig geantwortet. Versuch es noch einmal.' : 'Keine Verbindung zur KI. Besteht eine Internetverbindung?');
  } finally { clearTimeout(timer); }

  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json())?.error?.message || ''; } catch {}
    if (res.status === 401) throw new AiError('Der API-Schlüssel ist ungültig. Prüfe ihn unter Mehr → KI-Assistent.');
    if (res.status === 403) throw new AiError('Der API-Schlüssel hat keine Berechtigung. Prüfe ihn in der Anthropic Console.');
    if (/credit balance|billing/i.test(msg)) throw new AiError('Das Guthaben in der Anthropic Console ist aufgebraucht. Lade dort etwas Guthaben auf.');
    if (res.status === 404 || /^model:|model.*(not found|does not exist|not available)/i.test(msg)) throw new AiError(`Das KI-Modell ist nicht verfügbar. Wähle unter Mehr → KI-Assistent ein anderes. (${msg})`);
    if (res.status === 429) throw new AiError('Zu viele Anfragen oder Ausgabelimit erreicht. Warte kurz oder prüfe die Limits in der Anthropic Console.');
    if (res.status >= 500) throw new AiError('Die KI ist gerade überlastet. Versuch es in ein paar Minuten noch einmal.');
    throw new AiError(`KI-Fehler ${res.status}: ${msg || 'unbekannt'}`);
  }
  return res.json();
}

// Antwort als JSON aus einem Textblock lesen (Rückfall, falls das Werkzeug nicht aufgerufen wurde)
function jsonFromText(content) {
  const text = (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// Ruft Claude auf und erwartet das Ergebnis als Aufruf des Werkzeugs `tool`.
// Neuere Modelle erlauben kein erzwungenes Werkzeug – deshalb „auto“ mit klarer Anweisung
// und notfalls eine Nachfrage.
async function call({ apiKey, model }, { system, user, tool, maxTokens = 4096, timeoutMs = 90000 }) {
  if (!apiKey) throw new AiError('Kein API-Schlüssel hinterlegt (Mehr → KI-Assistent).');
  const sys = `${system}\n\nGib dein Ergebnis ausschließlich über einen einzigen Aufruf des Werkzeugs „${tool.name}“ zurück – ohne Text davor oder danach.`;
  const messages = [{ role: 'user', content: user }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await post(apiKey, { model: model || DEFAULT_MODEL, max_tokens: maxTokens, system: sys, tools: [tool], messages }, timeoutMs);
    const block = (data.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
    if (block) return block.input;
    const parsed = jsonFromText(data.content);
    if (parsed && typeof parsed === 'object') return parsed;
    if (data.stop_reason === 'max_tokens') throw new AiError('Der Text war zu lang für eine Auswertung. Füge weniger auf einmal ein (z. B. nur die neuesten Nachrichten).');
    messages.push({ role: 'assistant', content: data.content && data.content.length ? data.content : [{ type: 'text', text: '…' }] });
    messages.push({ role: 'user', content: `Bitte gib das Ergebnis jetzt über das Werkzeug „${tool.name}“ zurück.` });
  }
  throw new AiError('Die KI hat keine verwertbare Antwort geliefert. Versuch es noch einmal.');
}

// Kurzer Verbindungstest (kostet weniger als 0,1 Cent)
export async function testConnection(cfg) {
  await call(cfg, {
    system: 'Antworte knapp.', user: 'Bestätige die Verbindung.', maxTokens: 1024, timeoutMs: 45000,
    tool: { name: 'bestaetigen', description: 'Bestätigt die Verbindung.', input_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } } },
  });
  return true;
}

// ------------------------------------------------------------------ 1. E-Mail auswerten
const EXTRACT_TOOL = {
  name: 'ergebnis_speichern',
  description: 'Speichert die aus dem Text abgeleiteten Aufgaben und Kontakte.',
  input_schema: {
    type: 'object',
    required: ['zusammenfassung', 'aufgaben', 'kontakte'],
    properties: {
      betreff: { type: ['string', 'null'], description: 'Betreff der neuesten Nachricht, sonst ein kurzer Titel für den Text.' },
      absender: { type: ['string', 'null'], description: 'Name des Absenders der neuesten Nachricht.' },
      datum: { type: ['string', 'null'], description: 'Datum der neuesten Nachricht als YYYY-MM-DD.' },
      zusammenfassung: { type: 'string', description: 'Worum es geht, in 1–2 Sätzen.' },
      aufgaben: {
        type: 'array',
        items: {
          type: 'object',
          required: ['titel', 'faellig', 'fristart', 'bereich', 'vorlauf_tage', 'vorlauf_grund', 'erledigt'],
          properties: {
            titel: { type: 'string', description: 'Kurze Handlungsanweisung im Infinitiv, max. 80 Zeichen, z. B. „Finanzierungsbestätigung an Allkauf senden“.' },
            details: { type: ['string', 'null'], description: 'Was genau zu tun oder mitzubringen ist, Beträge, Aktenzeichen, Orte. Max. 400 Zeichen.' },
            faellig: { type: ['string', 'null'], description: 'Frist oder Termin als YYYY-MM-DD. Relative Angaben vom Datum der jeweiligen Nachricht aus umrechnen.' },
            uhrzeit: { type: ['string', 'null'], description: 'HH:MM, nur bei Terminen mit Uhrzeit.' },
            fristart: { type: 'string', enum: ['frist', 'termin', 'geschaetzt', 'keine'], description: 'frist = ausdrückliche Deadline; termin = feste Verabredung; geschaetzt = keine Frist genannt, aber sinnvoll von dir vorgeschlagen (z. B. bei „zeitnah“); keine = kein Datum sinnvoll.' },
            bereich: { type: 'string', enum: PHASES },
            vorlauf_tage: { type: 'integer', minimum: 0, maximum: 120, description: 'Realistische Anzahl Kalendertage, die man VOR der Frist anfangen muss – inkl. Wartezeiten auf Dritte (Bank, Notar, Behörde, Vermesser, Handwerker), Post- und Bearbeitungszeiten.' },
            vorlauf_grund: { type: 'string', description: 'Ein kurzer Satz, warum dieser Vorlauf nötig ist.' },
            kontakt_email: { type: ['string', 'null'], description: 'E-Mail des zuständigen Ansprechpartners aus der Kontaktliste, falls zuordenbar.' },
            kontakt_name: { type: ['string', 'null'], description: 'Name des zuständigen Ansprechpartners, falls zuordenbar.' },
            zitat: { type: ['string', 'null'], description: 'Die entscheidende Textstelle wörtlich, max. 200 Zeichen.' },
            erledigt: { type: 'boolean', description: 'true, wenn der weitere Verlauf zeigt, dass es bereits erledigt ist.' },
          },
        },
      },
      kontakte: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', description: 'Vor- und Nachname, ohne Anrede.' },
            firma: { type: ['string', 'null'] },
            rolle: { type: ['string', 'null'], description: 'z. B. Bauberaterin, Bauleiter, Bemusterung, Sachbearbeiter Bank.' },
            email: { type: ['string', 'null'] },
            telefon: { type: ['string', 'null'] },
            mobil: { type: ['string', 'null'] },
            adresse: { type: ['string', 'null'] },
            notiz: { type: ['string', 'null'], description: 'z. B. Erreichbarkeit, Zuständigkeit.' },
          },
        },
      },
    },
  },
};

export async function extractFromText(cfg, text, { me = {}, contacts = [], openTasks = [], now = new Date() } = {}) {
  const system = `Du bist der Assistent einer Familie, die mit dem Fertighaus-Anbieter allkauf ein Haus baut. Du wertest E-Mails und Texte aus der allkauf-App aus und machst daraus eine verlässliche Aufgabenliste für die Bauherren.

${todayLine(now)}
Die Bauherren: ${[me.name, me.email].filter(Boolean).join(', ') || 'unbekannt'}${me.partner ? `, ${me.partner}` : ''}.

Regeln:
- Ein eingefügter Verlauf enthält oft mehrere Nachrichten; die neueste steht meist oben. Werte alle aus, aber prüfe, ob eine ältere Bitte später schon erledigt wurde.
- Erfasse nur Aufgaben, die die Bauherren selbst erledigen, entscheiden oder nachverfolgen müssen, sowie feste Termine, die sie wahrnehmen müssen. Was allkauf oder andere selbst erledigen, nur aufnehmen, wenn die Bauherren nachhaken sollten.
- Eine Liste von Unterlagen ist meist eine Aufgabe je Unterlage, wenn sie von verschiedenen Stellen kommen (Bank, Vermesser …), sonst eine Aufgabe mit den Unterlagen in den Details.
- Datumsangaben immer als echtes Datum berechnen: „innerhalb von 14 Tagen“ ab Datum der Nachricht, „KW 47“ = Freitag dieser Woche, „Ende November“ = letzter Tag des Monats.
- Vorlauf realistisch für Deutschland schätzen: Bankunterlagen 1–3 Wochen, Notar/Grundbuch 2–4 Wochen, Behörden 2–6 Wochen, Vermesser 2–4 Wochen, Handwerkerangebote 2–3 Wochen, eigene Unterschrift/Upload 1–2 Tage, Termin wahrnehmen 0–1 Tag (bei Vorbereitung wie Elektroplan mehr).
- Kontakte: nur echte Personen oder Stellen mit mindestens einer Kontaktangabe (aus Signaturen, Kopfzeilen, Text). Nicht die Bauherren selbst. Telefonnummern so übernehmen, wie sie dastehen.
- Erfinde nichts. Fehlt eine Angabe, setze null.`;

  const known = contacts.length ? `\n\nBereits gespeicherte Kontakte (für die Zuordnung):\n${contacts.slice(0, 80).map((c) => `- ${c.name}${c.company ? ` (${c.company})` : ''}${c.email ? ` <${c.email}>` : ''}`).join('\n')}` : '';
  const tasks = openTasks.length ? `\n\nBereits vorhandene offene Aufgaben (keine Dubletten anlegen; wenn sich eine Frist ändert, die Aufgabe trotzdem aufnehmen):\n${openTasks.slice(0, 80).map((t) => `- ${t.title}${t.due ? ` (fällig ${t.due})` : ''}`).join('\n')}` : '';
  const clipped = text.length > 60000 ? text.slice(0, 60000) + '\n[… gekürzt]' : text;
  const user = `Werte diesen Text aus:${known}${tasks}\n\n<text>\n${clipped}\n</text>`;
  const r = await call(cfg, { system, user, tool: EXTRACT_TOOL, maxTokens: 16000, timeoutMs: 150000 });
  return {
    subject: r.betreff || null,
    from: r.absender || null,
    date: validDate(r.datum),
    summary: r.zusammenfassung || '',
    tasks: (r.aufgaben || []).map((a) => ({
      title: String(a.titel || '').trim(),
      details: a.details || '',
      due: validDate(a.faellig),
      time: /^\d{2}:\d{2}$/.test(a.uhrzeit || '') ? a.uhrzeit : null,
      dueKind: a.fristart || 'keine',
      phase: PHASES.includes(a.bereich) ? a.bereich : 'Allgemein',
      leadDays: Number.isFinite(a.vorlauf_tage) ? Math.max(0, Math.min(120, Math.round(a.vorlauf_tage))) : null,
      leadReason: a.vorlauf_grund || '',
      contactEmail: a.kontakt_email || null,
      contactName: a.kontakt_name || null,
      quote: a.zitat || '',
      done: !!a.erledigt,
    })).filter((t) => t.title),
    contacts: (r.kontakte || []).map((k) => ({
      name: String(k.name || '').trim(), company: k.firma || '', role: k.rolle || '', email: (k.email || '').trim().toLowerCase(),
      phone: k.telefon || '', mobile: k.mobil || '', address: k.adresse || '', notes: k.notiz || '',
    })).filter((k) => k.name && (k.email || k.phone || k.mobile)),
  };
}
const validDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00')) ? s : null);

// ------------------------------------------------------------------ 2. E-Mail entwerfen
const DRAFT_TOOL = {
  name: 'entwurf_speichern',
  description: 'Speichert den E-Mail-Entwurf.',
  input_schema: {
    type: 'object', required: ['betreff', 'text'],
    properties: {
      betreff: { type: 'string' },
      text: { type: 'string', description: 'Vollständiger E-Mail-Text inkl. Anrede und Grußformel, ohne Betreffzeile.' },
    },
  },
};
export async function draftEmail(cfg, { task, contact, sender, project, instruction = '', now = new Date() }) {
  const system = `Du schreibst E-Mails für Bauherren, die mit allkauf ein Fertighaus bauen. ${todayLine(now)}
Schreibe auf Deutsch, höflich, sachlich und knapp (Sie-Form, außer die Vorlage duzt). Nenne konkrete Bezüge (Bauvorhaben, Unterlagen, Termine, Fristen), aber erfinde keine Fakten, Aktenzeichen oder Zusagen. Unterschreibe mit dem Namen des Absenders.`;
  const parts = [
    `Absender: ${sender || 'die Bauherren'}`,
    project ? `Bauvorhaben: ${project}` : '',
    contact ? `Empfänger: ${contact.name}${contact.role ? `, ${contact.role}` : ''}${contact.company ? `, ${contact.company}` : ''}` : '',
    task ? `Anlass (Aufgabe): ${task.title}${task.due ? `\nFrist: ${task.due}` : ''}${task.notes ? `\nHintergrund:\n${task.notes.slice(0, 2500)}` : ''}` : '',
    instruction ? `Wunsch des Absenders: ${instruction}` : (task ? 'Ziel: die Aufgabe voranbringen – z. B. Unterlagen senden, Termin abstimmen, nachfragen oder um Fristverlängerung bitten, je nachdem was passt.' : 'Ziel: kurze, freundliche Kontaktaufnahme.'),
  ].filter(Boolean).join('\n');
  const r = await call(cfg, { system, user: parts, tool: DRAFT_TOOL, maxTokens: 3000, timeoutMs: 60000 });
  return { subject: r.betreff || '', body: r.text || '' };
}

// ------------------------------------------------------------------ 3. Machbarkeit bewerten
const ASSESS_TOOL = {
  name: 'bewertung_speichern',
  description: 'Speichert die Einschätzung je Aufgabe.',
  input_schema: {
    type: 'object', required: ['bewertungen'],
    properties: {
      bewertungen: {
        type: 'array',
        items: {
          type: 'object', required: ['id', 'status', 'starten_bis', 'grund', 'naechster_schritt'],
          properties: {
            id: { type: 'string' },
            status: { type: 'string', enum: Object.keys(STATUS), description: 'im_plan = es reicht, später anzufangen; jetzt_starten = spätestens jetzt beginnen; kritisch = nur noch mit sofortigem Einsatz zu schaffen; unrealistisch = bis zur Frist kaum noch zu schaffen.' },
            starten_bis: { type: ['string', 'null'], description: 'Spätester sinnvoller Starttermin YYYY-MM-DD.' },
            grund: { type: 'string', description: 'Ein konkreter Satz, max. 140 Zeichen.' },
            naechster_schritt: { type: 'string', description: 'Der konkrete erste Handgriff, max. 120 Zeichen, z. B. „Bank anrufen und Bestätigung anfordern“. Bei unrealistisch: um Fristverlängerung bitten.' },
          },
        },
      },
    },
  },
};
export async function assessTasks(cfg, tasks, { now = new Date() } = {}) {
  if (!tasks.length) return [];
  const system = `Du bewertest für Bauherren eines allkauf-Fertighauses, ob offene Aufgaben bis zu ihrer Frist noch realistisch zu schaffen sind und ob man sie jetzt angehen muss. ${todayLine(now)}
Berücksichtige Wartezeiten auf Dritte (Bank, Notar, Behörden, Vermesser, Handwerker), Wochenenden und Feiertage, Postlaufzeiten und dass die Bauherren berufstätig sind. Sei realistisch, nicht ängstlich: „jetzt_starten“ nur, wenn ein späterer Beginn die Frist gefährdet. Bewerte jede Aufgabe genau einmal mit ihrer id.`;
  const list = tasks.map((t) => ({
    id: t.id, titel: t.title, faellig: t.due, uhrzeit: t.time || null, bereich: t.phase || 'Allgemein',
    vorlauf_tage_geschaetzt: t.leadDays ?? null, angelegt_am: t.createdAt ? iso(new Date(t.createdAt)) : null,
    notizen: (t.notes || '').slice(0, 600),
  }));
  const r = await call(cfg, { system, user: `Offene Aufgaben:\n${JSON.stringify(list, null, 1)}`, tool: ASSESS_TOOL, maxTokens: 12000, timeoutMs: 150000 });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return (r.bewertungen || []).filter((b) => byId.has(b.id) && STATUS[b.status]).map((b) => ({
    id: b.id, status: b.status, startBy: validDate(b.starten_bis), reason: b.grund || '', next: b.naechster_schritt || '',
  }));
}

// ------------------------------------------------------------------ Regel-Variante ohne KI
export function startByOf(t) {
  if (!t.due || t.leadDays == null || t.leadDays === '') return null;
  const [y, m, d] = t.due.split('-').map(Number);
  return iso(new Date(y, m - 1, d - Number(t.leadDays)));
}
// Einschätzung, die zur aktuellen Frist/Vorlauf passt (KI, sonst Regel)
export function urgencyOf(t, now = new Date()) {
  if (t.done || !t.due) return null;
  const key = `${t.due}|${t.leadDays ?? ''}`;
  if (t.aiStatus && t.aiFor === key && STATUS[t.aiStatus]) return { status: t.aiStatus, reason: t.aiReason || '', next: t.aiNext || '', startBy: t.aiStartBy || startByOf(t), ai: true };
  const today = iso(now);
  const sb = startByOf(t);
  if (t.due < today) return { status: 'kritisch', reason: 'Die Frist ist überschritten.', next: '', startBy: sb, ai: false };
  if (sb && sb <= today) return { status: 'jetzt_starten', reason: `${t.leadDays} Tage Vorlauf – anfangen war bis ${de(sb)} nötig.`, next: '', startBy: sb, ai: false };
  return { status: 'im_plan', reason: sb ? `Spätestens am ${de(sb)} anfangen.` : '', next: '', startBy: sb, ai: false };
}
export const aiKeyOf = (t) => `${t.due}|${t.leadDays ?? ''}`;
