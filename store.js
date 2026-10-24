// Datenhaltung: „lokal“ (nur dieses Gerät) oder „cloud“ (Firebase, geteilt + Push).

const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);
const uid6 = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
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
  return { ...task, remindAt, reminded: remindAt === task.remindAt ? !!task.reminded : false };
}

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
    this.h.onProject({ id: 'local', name: d.name || 'Unser Haus', members: ['local'], memberNames: { local: 'Ich' } });
    this.h.onTasks([...d.tasks]);
    this.h.onInfos([...d.infos]);
  }
  async init(h) {
    this.h = h;
    this.data = { name: 'Unser Haus', tasks: [], infos: [], ...this.load() };
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
    if (seed && (seed.tasks?.length || seed.infos?.length)) {
      const batch = writeBatch(this.db);
      for (const t of seed.tasks || []) { const { id, ...rest } = t; batch.set(doc(collection(pref, 'tasks')), { ...rest, createdBy: this.me.uid }); }
      for (const i of seed.infos || []) { const { id, ...rest } = i; batch.set(doc(collection(pref, 'infos')), { ...rest, createdBy: this.me.uid }); }
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
