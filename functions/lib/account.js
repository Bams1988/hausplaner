// Konto löschen (Pflicht im App Store): Person aus dem gemeinsamen Bereich entfernen,
// eigene Daten löschen; war sie die letzte Person, wird der ganze Bereich samt Dateien gelöscht.
import { recomputeProjectPlan } from './plan.js';

export async function deleteAccount({ db, auth, bucket, FieldValue }, uid) {
  const projects = await db.collection('projects').where('members', 'array-contains', uid).get();
  for (const p of projects.docs) {
    const members = (p.get('members') || []).filter((u) => u !== uid);
    if (!members.length) {
      await db.recursiveDelete(p.ref);
      if (bucket) await bucket.deleteFiles({ prefix: `projects/${p.id}/` }).catch((e) => console.warn('Dateien:', e.message));
    } else {
      await p.ref.update({ members: FieldValue.arrayRemove(uid), [`memberNames.${uid}`]: FieldValue.delete(), [`access.${uid}`]: FieldValue.delete() });
      await recomputeProjectPlan(db, p.id);
    }
  }
  const feeds = await db.collection('calFeeds').where('uid', '==', uid).get();
  for (const f of feeds.docs) await f.ref.delete();
  await db.doc(`users/${uid}`).delete().catch(() => {});
  if (auth) await auth.deleteUser(uid).catch((e) => { if (e.code !== 'auth/user-not-found') throw e; });
  return { ok: true, projects: projects.size };
}
