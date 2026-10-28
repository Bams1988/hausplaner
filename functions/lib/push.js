// Push-Nachrichten über Firebase Cloud Messaging – an App (iOS/Android) und Web-Version.
// title/body dürfen Funktionen (lang) => Text sein; dann wird je Sprache getrennt gesendet.
export async function tokensFor(db, uids) {
  const out = [];
  for (const uid of [...new Set(uids)]) {
    const s = await db.doc(`users/${uid}`).get();
    const lang = s.get('lang') || 'de';
    for (const token of s.get('tokens') || []) out.push({ uid, token, lang });
  }
  return out;
}

export function makeSender({ db, messaging, appUrl = '', FieldValue }) {
  async function send(targets, title, body, tag, data = {}) {
    if (!targets.length) return 0;
    if (typeof title === 'function' || typeof body === 'function') {
      let n = 0;
      for (const lang of ['de', 'en']) {
        const grp = targets.filter((t) => (t.lang || 'de') === lang);
        if (grp.length) n += await send(grp, typeof title === 'function' ? title(lang) : title, typeof body === 'function' ? body(lang) : body, tag, data);
      }
      return n;
    }
    const tokens = [...new Set(targets.map((t) => t.token))];
    let ok = 0;
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: Object.fromEntries(Object.entries({ tag: tag || '', ...data }).map(([k, v]) => [k, String(v)])),
        apns: { payload: { aps: { sound: 'default', 'thread-id': tag ? String(tag).split('-')[0] : 'mindspace' } } },
        android: { notification: { sound: 'default', tag: tag || undefined, channelId: 'mindspace' } },
        webpush: { notification: { title, body, tag, ...(appUrl ? { icon: appUrl + 'icons/icon-192.png' } : {}) }, ...(appUrl ? { fcmOptions: { link: appUrl } } : {}) },
      });
      ok += res.successCount;
      for (const [j, r] of res.responses.entries()) {
        if (r.success) continue;
        const code = r.error?.code || '';
        if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) {
          for (const t of targets.filter((x) => x.token === chunk[j])) await db.doc(`users/${t.uid}`).update({ tokens: FieldValue.arrayRemove(t.token) }).catch(() => {});
        } else console.warn('Push fehlgeschlagen:', code);
      }
    }
    return ok;
  }
  return send;
}

// Zugriff je Bereich: Mitglieder ohne Eintrag oder mit 'all' sehen alles
export const canSee = (project, uid, areaId) => {
  const a = (project.access || {})[uid];
  return !a || a === 'all' || (Array.isArray(a) && a.includes(areaId || 'hausbau'));
};
