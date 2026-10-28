// Sofort-Benachrichtigungen bei Änderungen in der Datenbank:
// neue Zuständigkeit, neuer Kommentar. (Ersetzen den Minuten-Takt von Postbote/GitHub.)
import { tokensFor, canSee } from './push.js';
import { T } from './util.js';

const fmtDue = (t, lang) => {
  if (!t.due) return '';
  const [y, m, d] = t.due.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return s + (t.time ? (lang === 'en' ? ` ${t.time}` : `, ${t.time} Uhr`) : '');
};

export async function onTaskWritten({ db, send, pid, tid, before, after }) {
  if (!after || after.assignNotify !== true) return 0;
  if (before && before.assignNotify === true && before.assignAt === after.assignAt) return 0; // schon gesehen
  await db.doc(`projects/${pid}/tasks/${tid}`).update({ assignNotify: false, assignNotifiedAt: Date.now() });
  if (!after.assignee || after.assignee === 'all' || after.done) return 0;
  const p = (await db.doc(`projects/${pid}`).get()).data() || {};
  if (!canSee(p, after.assignee, after.areaId)) return 0;
  const von = (l) => after.assignByName || T(l, 'Jemand', 'Someone');
  const due = (l) => (after.due ? T(l, ' – fällig ', ' – due ') + fmtDue(after, l) : '');
  return send(await tokensFor(db, [after.assignee]),
    (l) => (after.assignReturned ? T(l, '↩️ Aufgabe zurückgegeben', '↩️ Task handed back') : T(l, '📌 Neue Aufgabe für dich', '📌 New task for you')),
    (l) => (after.assignReturned ? T(l, `${von(l)} hat „${after.title}“ an dich zurückgegeben.`, `${von(l)} handed “${after.title}” back to you.`)
      : T(l, `${von(l)} bittet dich, „${after.title}“ zu übernehmen${due(l)}.`, `${von(l)} asks you to take over “${after.title}”${due(l)}.`)).replace(/\.\.$/, '.').slice(0, 220),
    'assign-' + tid, { taskId: tid });
}

export async function onCommentCreated({ db, send, pid, cid, c }) {
  if (!c || c.notified !== false) return 0;
  await db.doc(`projects/${pid}/comments/${cid}`).update({ notified: true });
  if (c.at && c.at < Date.now() - 864e5) return 0;
  const p = (await db.doc(`projects/${pid}`).get()).data() || {};
  const task = c.taskId ? (await db.doc(`projects/${pid}/tasks/${c.taskId}`).get()).data() : null;
  const who = (p.memberNames || {})[c.by] || c.byName || 'MindSpace';
  const area = c.areaId || task?.areaId;
  const to = (p.members || []).filter((u) => u !== c.by && canSee(p, u, area));
  return send(await tokensFor(db, to), (l) => `💬 ${who} ${T(l, 'zu', 'on')} „${task?.title || T(l, 'einer Aufgabe', 'a task')}“`.slice(0, 120), String(c.text || '').slice(0, 200), 'c-' + cid, { taskId: c.taskId || '' });
}

// Speicherverbrauch des Bereichs mitzählen (für das Speicherlimit)
export async function onFileChange({ db, FieldValue, pid, size, sign }) {
  if (!size) return;
  await db.doc(`projects/${pid}`).update({ storageBytes: FieldValue.increment(sign * size) }).catch(() => {});
}
