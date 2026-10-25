// Datenhaltung: „lokal“ (nur dieses Gerät) oder „cloud“ (Firebase, geteilt + Push).

import { startByOf } from './ai.js';

const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const AI_LOCAL = 'hausplaner-ai';
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);
const uid6 = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined ? null : v]));
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Erinnerungszeitpunkt (ms) aus Fälligkeit und Voreinstellung berechnen.
export function computeRemindAt(t) {
  if (!t.due || !t.reminder || t.reminder === 'none') return t.reminder === 'custom' && t.remindCustom ? new Date(t.remindCustom).getTime() : null;
  if (t.reminder === 'custom') return t.remindCustom ? new Date(t.remindCustom).getTime() : null;
  const [y, m, d] = t.due.split('-').map(Number);
  const at = (offsetDays, h, min = 0) => new Date(y, m - 1, d + offsetDays, h, min).getTime();
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

function withReminder(task) {
  const remindAt = computeRemindAt(task);
  return { ...task, remindAt, reminded: remindAt === task.remindAt ? !!task.reminded : false, startBy: startByOf(task) };
}

// Dateien im lokalen Modus: Inhalte in IndexedDB (localStorage ist zu klein)
const IDB = { db: null };
function idb() {
  if (IDB.db) return IDB.db;
  IDB.db = new Promise((ok, no) => {
    const r = indexedDB.open('mindora-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
  return IDB.db;
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((ok, no) => { const tx = db.transaction('blobs', mode); const req = fn(tx.objectStore('blobs')); tx.oncomplete = () => ok(req?.result); tx.onerror = () => no(tx.error); });
}
export const PART_SIZE = 900 * 1024; // Firestore erlaubt max. 1 MiB je Dokument

export function createStore() {
  const cfg = self.HAUS_CONFIG || {};
  return cfg.firebase && cfg.firebase.apiKey ? new CloudStore(cfg) : new LocalStore();
}

// ---------------------------------------------------------------- lokal
class LocalStore {
  constructor() { this.mode = 'local'; this.key = 'hausplaner-v1'; }
  load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; }
  }
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { console.warn(e); }
    this.emit();
  }
  emit() {
    const d = this.data;
    this.h.onProject({ id: 'local', name: d.name || 'Mindora', members: ['local'], memberNames: { local: 'Ich' }, ...(d.settings || {}) });
    this.h.onTasks([...d.tasks]);
    this.h.onInfos([...d.infos]);
    this.h.onContacts([...d.contacts].sort((a, b) => a.name.localeCompare(b.name, 'de')));
    this.h.onAi(this.ai);
    this.h.onAreas([...(d.areas || [])]);
    this.h.onCosts?.([...(d.costs || [])]);
    this.h.onComments?.([...(d.comments || [])]);
    this.h.onFiles?.([...(d.files || [])]);
  }
  async init(h) {
    this.h = h;
    this.data = { name: 'Mindora', tasks: [], infos: [], contacts: [], areas: [], costs: [], comments: [], files: [], settings: {}, ...this.load() };
    for (const k of ['costs', 'comments', 'files']) this.data[k] = this.data[k] || [];
    try { this.ai = JSON.parse(localStorage.getItem(AI_LOCAL)) || null; } catch { this.ai = null; }
    this.me = { uid: 'local', name: 'Ich', email: null };
    h.onAuth(this.me);
    this.emit();
  }
  async addTask(t) {
    const task = withReminder({ id: uid6(), createdAt: Date.now(), createdBy: 'local', done: false, assignee: 'all', ...t });
    this.data.tasks.push(task); this.save(); return task.id;
  }
  async addTasks(list) { for (const t of list) this.data.tasks.push(withReminder({ id: uid6(), createdAt: Date.now(), createdBy: 'local', done: false, assignee: 'all', ...t })); this.save(); }
  async updateTask(id, patch) {
    const i = this.data.tasks.findIndex((t) => t.id === id); if (i < 0) return;
    this.data.tasks[i] = withReminder({ ...this.data.tasks[i], ...patch }); this.save();
  }
  async deleteTask(id) { this.data.tasks = this.data.tasks.filter((t) => t.id !== id); this.save(); }
  async addInfo(info) { this.data.infos.unshift({ id: uid6(), createdAt: Date.now(), createdBy: 'local', ...info }); this.save(); }
  async deleteInfo(id) { this.data.infos = this.data.infos.filter((x) => x.id !== id); this.save(); }
  async renameProject(name) { this.data.name = name; this.save(); }
  async addContact(c) { const id = uid6(); this.data.contacts.push({ id, createdAt: Date.now(), ...c }); this.save(); return id; }
  async updateContact(id, patch) {
    const i = this.data.contacts.findIndex((c) => c.id === id); if (i < 0) return;
    this.data.contacts[i] = { ...this.data.contacts[i], ...patch }; this.save();
  }
  async deleteContact(id) { this.data.contacts = this.data.contacts.filter((c) => c.id !== id); this.save(); }
  async setArea(id, data) {
    const i = this.data.areas.findIndex((a) => a.id === id);
    if (i < 0) this.data.areas.push({ id, ...data }); else this.data.areas[i] = { ...this.data.areas[i], ...data };
    this.save();
  }
  async deleteArea(id) { this.data.areas = this.data.areas.filter((a) => a.id !== id); this.save(); }
  async updateProject(patch) { this.data.settings = { ...(this.data.settings || {}), ...patch }; this.save(); }
  async setAi(settings) {
    this.ai = settings;
    try { settings ? localStorage.setItem(AI_LOCAL, JSON.stringify(settings)) : localStorage.removeItem(AI_LOCAL); } catch {}
    this.emit();
  }
  // --- Kosten
  async addCost(c) { const id = uid6(); this.data.costs.push({ id, createdAt: Date.now(), createdBy: 'local', paid: false, ...c }); this.save(); return id; }
  async addCosts(list) { for (const c of list) this.data.costs.push({ id: uid6(), createdAt: Date.now(), createdBy: 'local', paid: false, ...c }); this.save(); }
  async updateCost(id, patch) { const i = this.data.costs.findIndex((c) => c.id === id); if (i < 0) return; this.data.costs[i] = { ...this.data.costs[i], ...patch }; this.save(); }
  async deleteCost(id) { this.data.costs = this.data.costs.filter((c) => c.id !== id); this.save(); }
  // --- Kommentare
  async addComment(c) { this.data.comments.push({ id: uid6(), at: Date.now(), by: 'local', ...c }); this.save(); }
  async deleteComment(id) { this.data.comments = this.data.comments.filter((c) => c.id !== id); this.save(); }
  // --- Dateien
  async addFile(meta, blob) {
    const id = uid6();
    await idbDo('readwrite', (st) => st.put(blob, id));
    this.data.files.push({ id, createdAt: Date.now(), createdBy: 'local', ...meta });
    this.save(); return id;
  }
  async updateFile(id, patch) { const i = this.data.files.findIndex((f) => f.id === id); if (i < 0) return; this.data.files[i] = { ...this.data.files[i], ...patch }; this.save(); }
  async getFileBlob(meta) { const b = await idbDo('readonly', (st) => st.get(meta.id)); if (!b) throw new Error('Datei nicht gefunden.'); return b; }
  async deleteFile(meta) { await idbDo('readwrite', (st) => st.delete(meta.id)).catch(() => {}); this.data.files = this.data.files.filter((f) => f.id !== meta.id); this.save(); }
  exportLocal() { return this.data; }
}

// ---------------------------------------------------------------- Firebase
class CloudStore {
  constructor(cfg) { this.mode = 'cloud'; this.cfg = cfg; this.unsubs = []; }

  async init(h) {
    this.h = h;
    const [app, auth, fs] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
    ]);
    this.A = auth; this.F = fs;
    this.app = app.initializeApp(this.cfg.firebase);
    this.auth = auth.getAuth(this.app);
    try {
      this.db = fs.initializeFirestore(this.app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentSingleTabManager() }) });
    } catch { this.db = fs.getFirestore(this.app); }
    auth.onAuthStateChanged(this.auth, (user) => this.onUser(user));
  }

  stopListening() { this.unsubs.forEach((u) => u()); this.unsubs = []; }

  async onUser(user) {
    this.stopListening();
    if (!user) { this.me = null; this.h.onAuth(null); return; }
    const { doc, getDoc, onSnapshot } = this.F;
    const uref = doc(this.db, 'users', user.uid);
    let udata = {};
    try { udata = (await getDoc(uref)).data() || {}; } catch (e) { console.warn(e); }
    this.me = { uid: user.uid, name: udata.name || user.displayName || (user.email || '').split('@')[0], email: user.email };
    this.h.onAuth(this.me);
    this.unsubs.push(onSnapshot(uref, (s) => {
      const d = s.data() || {};
      if (d.projectId !== this.projectId) this.watchProject(d.projectId || null);
    }, (e) => this.h.onError(e)));
    if (!udata.projectId) this.h.onProject(null);
  }

  watchProject(pid) {
    this.unsubP?.forEach((u) => u());
    this.projectId = pid;
    if (!pid) { this.h.onProject(null); return; }
    const { doc, collection, onSnapshot } = this.F;
    const err = (e) => this.h.onError(e);
    this.unsubP = [
      onSnapshot(doc(this.db, 'projects', pid), (s) => this.h.onProject(s.exists() ? { id: pid, ...s.data() } : null), err),
      onSnapshot(collection(this.db, 'projects', pid, 'tasks'), (s) => this.h.onTasks(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err),
      onSnapshot(collection(this.db, 'projects', pid, 'infos'), (s) => this.h.onInfos(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt)), err),
      onSnapshot(collection(this.db, 'projects', pid, 'contacts'), (s) => this.h.onContacts(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))), err),
      onSnapshot(collection(this.db, 'projects', pid, 'areas'), (s) => this.h.onAreas(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err),
      onSnapshot(collection(this.db, 'projects', pid, 'costs'), (s) => this.h.onCosts?.(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err),
      onSnapshot(collection(this.db, 'projects', pid, 'comments'), (s) => this.h.onComments?.(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err),
      onSnapshot(collection(this.db, 'projects', pid, 'files'), (s) => this.h.onFiles?.(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err),
      onSnapshot(doc(this.db, 'projects', pid, 'private', 'ai'), (s) => this.h.onAi(s.exists() && s.data().apiKey ? s.data() : null), () => this.h.onAi(null)),
    ];
    this.unsubs.push(() => this.unsubP.forEach((u) => u()));
  }

  // --- Konto
  async signUp(name, email, pw) {
    const { createUserWithEmailAndPassword, updateProfile } = this.A;
    const cred = await createUserWithEmailAndPassword(this.auth, email, pw);
    await updateProfile(cred.user, { displayName: name });
    await this.F.setDoc(this.F.doc(this.db, 'users', cred.user.uid), { name, email }, { merge: true });
    this.me = { uid: cred.user.uid, name, email };
    this.h.onAuth(this.me);
  }
  signIn(email, pw) { return this.A.signInWithEmailAndPassword(this.auth, email, pw); }
  resetPassword(email) { return this.A.sendPasswordResetEmail(this.auth, email); }
  async signOut() {
    const tok = localStorage.getItem('hausplaner-push-token');
    if (tok && this.me) {
      try { await this.F.updateDoc(this.F.doc(this.db, 'users', this.me.uid), { tokens: this.F.arrayRemove(tok) }); } catch {}
      localStorage.removeItem('hausplaner-push-token');
    }
    this.watchProject(null);
    return this.A.signOut(this.auth);
  }

  // --- Projekt
  async createProject(name, seed) {
    const { doc, collection, setDoc, writeBatch } = this.F;
    const pref = doc(collection(this.db, 'projects'));
    await setDoc(pref, { name, members: [this.me.uid], memberNames: { [this.me.uid]: this.me.name }, createdBy: this.me.uid, createdAt: Date.now() });
    if (seed && (seed.tasks?.length || seed.infos?.length || seed.contacts?.length || seed.areas?.length)) {
      const batch = writeBatch(this.db);
      for (const t of seed.tasks || []) { const { id, ...rest } = t; batch.set(doc(collection(pref, 'tasks')), { ...rest, createdBy: this.me.uid }); }
      for (const i of seed.infos || []) { const { id, ...rest } = i; batch.set(doc(collection(pref, 'infos')), { ...rest, createdBy: this.me.uid }); }
      for (const c of seed.contacts || []) { const { id, ...rest } = c; batch.set(doc(collection(pref, 'contacts')), rest); }
      for (const a of seed.areas || []) { const { id, ...rest } = a; batch.set(doc(pref, 'areas', id), rest); }
      await batch.commit();
    }
    await setDoc(doc(this.db, 'users', this.me.uid), { projectId: pref.id, name: this.me.name }, { merge: true });
  }
  async createInvite() {
    const { doc, setDoc, Timestamp } = this.F;
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_CHARS[crypto.getRandomValues(new Uint32Array(1))[0] % CODE_CHARS.length];
    await setDoc(doc(this.db, 'invites', code), { projectId: this.projectId, createdBy: this.me.uid, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 864e5) });
    return code;
  }
  async joinProject(rawCode) {
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const { doc, getDoc, updateDoc, setDoc, arrayUnion } = this.F;
    const inv = await getDoc(doc(this.db, 'invites', code));
    if (!inv.exists()) throw new Error('Diesen Code gibt es nicht. Prüfe die Schreibweise.');
    const { projectId, expiresAt } = inv.data();
    if (expiresAt.toMillis() < Date.now()) throw new Error('Der Code ist abgelaufen. Lass dir einen neuen schicken.');
    await updateDoc(doc(this.db, 'projects', projectId), { members: arrayUnion(this.me.uid), [`memberNames.${this.me.uid}`]: this.me.name, joinCode: code });
    await setDoc(doc(this.db, 'users', this.me.uid), { projectId, name: this.me.name }, { merge: true });
  }
  renameProject(name) { return this.F.updateDoc(this.F.doc(this.db, 'projects', this.projectId), { name }); }

  // --- Aufgaben & Infos
  col(name) { return this.F.collection(this.db, 'projects', this.projectId, name); }
  async addTask(t) {
    const ref = await this.F.addDoc(this.col('tasks'), withReminder({ createdAt: Date.now(), createdBy: this.me.uid, done: false, assignee: 'all', ...t }));
    return ref.id;
  }
  async addTasks(list) {
    const batch = this.F.writeBatch(this.db);
    for (const t of list) batch.set(this.F.doc(this.col('tasks')), withReminder({ createdAt: Date.now(), createdBy: this.me.uid, done: false, assignee: 'all', ...t }));
    await batch.commit();
  }
  async updateTask(id, patch, current) {
    const merged = withReminder({ ...current, ...patch });
    const { id: _, ...data } = merged;
    for (const k of Object.keys(data)) if (data[k] === undefined) data[k] = null;
    await this.F.setDoc(this.F.doc(this.col('tasks'), id), data);
  }
  deleteTask(id) { return this.F.deleteDoc(this.F.doc(this.col('tasks'), id)); }
  addInfo(info) { return this.F.addDoc(this.col('infos'), { createdAt: Date.now(), createdBy: this.me.uid, ...info }); }
  deleteInfo(id) { return this.F.deleteDoc(this.F.doc(this.col('infos'), id)); }
  async addContact(c) { const ref = this.F.doc(this.col('contacts')); await this.F.setDoc(ref, { createdAt: Date.now(), createdBy: this.me.uid, ...clean(c) }); return ref.id; }
  updateContact(id, patch) { return this.F.updateDoc(this.F.doc(this.col('contacts'), id), clean(patch)); }
  deleteContact(id) { return this.F.deleteDoc(this.F.doc(this.col('contacts'), id)); }
  setArea(id, data) { return this.F.setDoc(this.F.doc(this.col('areas'), id), clean(data), { merge: true }); }
  deleteArea(id) { return this.F.deleteDoc(this.F.doc(this.col('areas'), id)); }
  updateProject(patch) { return this.F.updateDoc(this.F.doc(this.db, 'projects', this.projectId), clean(patch)); }
  // --- Kosten
  async addCost(c) { const ref = this.F.doc(this.col('costs')); await this.F.setDoc(ref, { createdAt: Date.now(), createdBy: this.me.uid, paid: false, ...clean(c) }); return ref.id; }
  async addCosts(list) {
    const batch = this.F.writeBatch(this.db);
    for (const c of list) batch.set(this.F.doc(this.col('costs')), { createdAt: Date.now(), createdBy: this.me.uid, paid: false, ...clean(c) });
    await batch.commit();
  }
  updateCost(id, patch) { return this.F.updateDoc(this.F.doc(this.col('costs'), id), clean(patch)); }
  deleteCost(id) { return this.F.deleteDoc(this.F.doc(this.col('costs'), id)); }
  // --- Kommentare (notified=false → der Hintergrunddienst schickt der anderen Person eine Push-Nachricht)
  addComment(c) { return this.F.addDoc(this.col('comments'), { at: Date.now(), by: this.me.uid, byName: this.me.name || '', notified: false, ...clean(c) }); }
  deleteComment(id) { return this.F.deleteDoc(this.F.doc(this.col('comments'), id)); }
  // --- Dateien: Inhalt in Teilen zu je max. 900 KB (Sammlung fileParts), Eckdaten + Vorschaubild in files
  async addFile(meta, blob) {
    const { doc, setDoc, Bytes } = this.F;
    const ref = doc(this.col('files'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    const parts = Math.max(1, Math.ceil(buf.length / PART_SIZE));
    for (let i = 0; i < parts; i++) {
      await setDoc(doc(this.col('fileParts'), `${ref.id}_${i}`), { fileId: ref.id, i, data: Bytes.fromUint8Array(buf.subarray(i * PART_SIZE, (i + 1) * PART_SIZE)) });
    }
    await setDoc(ref, { createdAt: Date.now(), createdBy: this.me.uid, ...clean(meta), parts, size: buf.length });
    return ref.id;
  }
  updateFile(id, patch) { return this.F.updateDoc(this.F.doc(this.col('files'), id), clean(patch)); }
  async getFileBlob(meta) {
    const { doc, getDoc } = this.F;
    const chunks = [];
    for (let i = 0; i < (meta.parts || 1); i++) {
      const s = await getDoc(doc(this.col('fileParts'), `${meta.id}_${i}`));
      if (!s.exists()) throw new Error('Datei ist unvollständig. Bitte erneut hochladen.');
      chunks.push(s.data().data.toUint8Array());
    }
    return new Blob(chunks, { type: meta.type || 'application/octet-stream' });
  }
  async deleteFile(meta) {
    const { doc, deleteDoc } = this.F;
    await deleteDoc(doc(this.col('files'), meta.id));
    for (let i = 0; i < (meta.parts || 1); i++) await deleteDoc(doc(this.col('fileParts'), `${meta.id}_${i}`)).catch(() => {});
  }
  setAi(settings) {
    const ref = this.F.doc(this.db, 'projects', this.projectId, 'private', 'ai');
    return settings ? this.F.setDoc(ref, { ...settings, updatedBy: this.me.uid, updatedAt: Date.now() }) : this.F.deleteDoc(ref);
  }

  // --- Push
  async enablePush(permP) {
    const perm = await (permP || Notification.requestPermission());
    if (perm === 'denied') return { ok: false, reason: 'denied' };
    if (perm !== 'granted') return { ok: false, reason: 'dismissed' };
    if (!this.cfg.vapidKey) return { ok: false, reason: 'novapid' };
    const m = await import(FB + 'firebase-messaging.js');
    if (!(await m.isSupported())) return { ok: false, reason: 'unsupported' };
    const reg = await withTimeout(navigator.serviceWorker.ready, 10000,
      'Der Hintergrunddienst der App läuft nicht. Schließe die App ganz (nach oben wegwischen) und öffne sie neu.');
    const messaging = m.getMessaging(this.app);
    const token = await withTimeout(m.getToken(messaging, { vapidKey: this.cfg.vapidKey, serviceWorkerRegistration: reg }), 20000,
      'Keine Antwort vom Push-Dienst. Prüfe die Internetverbindung und den vapidKey in config.js.');
    if (!token) return { ok: false, reason: 'notoken' };
    await this.F.setDoc(this.F.doc(this.db, 'users', this.me.uid), { tokens: this.F.arrayUnion(token) }, { merge: true });
    localStorage.setItem('hausplaner-push-token', token);
    this.listenForeground(m, messaging);
    return { ok: true };
  }
  async resumePush() {
    if (!localStorage.getItem('hausplaner-push-token') || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try { await this.enablePush(); } catch (e) { console.warn(e); }
  }
  listenForeground(m, messaging) {
    if (this.fgListening) return;
    this.fgListening = true;
    m.onMessage(messaging, (p) => this.h.onPush?.(p.notification || p.data || {}));
  }
}
