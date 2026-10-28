// Brücke zu den nativen Funktionen, wenn MindSpace als App aus dem App Store / Google Play läuft.
// Die eigentlichen Plugins bündelt native/src/bridge.js zu window.MSNative (nur in der App vorhanden).
// Im Browser liefern alle Funktionen „nicht verfügbar“ – die App nutzt dann die Web-Wege wie bisher.

export const isNative = () => !!window.Capacitor?.isNativePlatform?.();
export const platform = () => (isNative() ? window.Capacitor.getPlatform() : 'web'); // 'ios' | 'android' | 'web'
const N = () => (isNative() ? window.MSNative || null : null);

// ---------- Face ID / Touch ID / Fingerabdruck
export async function bioInfo() {
  const n = N(); if (!n) return { available: false };
  try { return await n.bioInfo(); } catch { return { available: false }; }
}
// true = bestätigt, false = abgebrochen; wirft bei anderen Fehlern
export async function bioAuth(reason) {
  const n = N(); if (!n) throw new Error('Nicht verfügbar');
  return n.bioAuth(reason);
}

// ---------- Push (Firebase Cloud Messaging, nativ)
export async function nativePushToken(onMessage) {
  const n = N(); if (!n) return { ok: false, reason: 'unsupported' };
  return n.pushToken(onMessage);
}

// ---------- In-App-Käufe (RevenueCat → App Store / Google Play)
export async function purchasesInit(uid, keys) {
  const n = N(); if (!n || !uid) return false;
  const apiKey = platform() === 'ios' ? keys?.ios : keys?.android;
  if (!apiKey) return false;
  try { await n.purchasesInit(apiKey, uid); return true; } catch (e) { console.warn('Käufe:', e); return false; }
}
// Angebote: { daily: { month: {id, price}, year: {id, price} }, pro: {…} }
export async function offerings() { const n = N(); return n ? n.offerings() : null; }
export async function buy(planId, period) { const n = N(); if (!n) throw new Error('Käufe sind nur in der App möglich.'); return n.buy(planId, period); }
export async function restore() { const n = N(); if (!n) throw new Error('Nur in der App möglich.'); return n.restore(); }
export async function manageUrl() { const n = N(); return n ? n.manageUrl() : null; }

// ---------- Links, Dateien, Lebenszyklus
export async function openExternal(url) {
  const n = N();
  if (n) return n.openUrl(url);
  window.open(url, '_blank', 'noopener');
}
export async function shareFile(blob, name) {
  const n = N(); if (!n) return false;
  await n.shareFile(blob, name); return true;
}
export function onAppState(cb) { N()?.onAppState(cb); }
export function onDeepLink(cb) { N()?.onDeepLink(cb); }
export function hideSplash() { N()?.hideSplash?.(); }
