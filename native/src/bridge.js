// Native Brücke für MindSpace (wird beim App-Bau mit esbuild zu www/native-bridge.js gebündelt).
// Stellt window.MSNative bereit – die Web-App (native.js) ruft nur diese Funktionen auf.
import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { Browser } from '@capacitor/browser';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

const blobToBase64 = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
const bioName = (t) => ({ [BiometryType.faceId]: 'Face ID', [BiometryType.touchId]: 'Touch ID', [BiometryType.fingerprintAuthentication]: 'Fingerabdruck', [BiometryType.faceAuthentication]: 'Gesichtserkennung', [BiometryType.irisAuthentication]: 'Iris' }[t] || 'Biometrie');
let purchasesReady = false;

window.MSNative = {
  // ---------- Biometrie
  async bioInfo() {
    const r = await BiometricAuth.checkBiometry();
    return { available: !!r.isAvailable, name: bioName(r.biometryType), deviceSecure: !!r.deviceIsSecure, reason: r.reason || '' };
  },
  async bioAuth(reason) {
    try {
      await BiometricAuth.authenticate({ reason: reason || 'MindSpace entsperren', cancelTitle: 'Abbrechen', allowDeviceCredential: true, iosFallbackTitle: 'Code eingeben', androidTitle: 'MindSpace entsperren', androidSubtitle: reason || '' });
      return true;
    } catch (e) {
      if (/cancel/i.test(String(e?.code || ''))) return false;
      throw e;
    }
  },

  // ---------- Push
  async pushToken(onMessage) {
    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== 'granted') return { ok: false, reason: 'denied' };
    if (Capacitor.getPlatform() === 'android') await FirebaseMessaging.createChannel({ id: 'mindspace', name: 'MindSpace', description: 'Erinnerungen und Neuigkeiten', importance: 4, visibility: 1 }).catch(() => {});
    const { token } = await FirebaseMessaging.getToken();
    if (onMessage && !this._pushListening) {
      this._pushListening = true;
      FirebaseMessaging.addListener('notificationReceived', (e) => onMessage({ title: e.notification?.title, body: e.notification?.body, data: e.notification?.data }));
      FirebaseMessaging.addListener('notificationActionPerformed', (e) => onMessage({ ...e.notification, tapped: true }));
    }
    return token ? { ok: true, token } : { ok: false, reason: 'notoken' };
  },

  // ---------- In-App-Käufe (RevenueCat)
  async purchasesInit(apiKey, uid) {
    if (!purchasesReady) {
      await Purchases.setLogLevel({ level: LOG_LEVEL.WARN }).catch(() => {});
      await Purchases.configure({ apiKey, appUserID: uid });
      purchasesReady = true;
    } else {
      await Purchases.logIn({ appUserID: uid });
    }
  },
  // Pakete im RevenueCat-Angebot „default“: daily_monthly, daily_yearly, pro_monthly, pro_yearly
  async offerings() {
    const o = await Purchases.getOfferings();
    const cur = o.current || Object.values(o.all || {})[0];
    const out = {};
    for (const p of cur?.availablePackages || []) out[p.identifier] = { price: p.product?.priceString || '', amount: p.product?.price ?? null, currency: p.product?.currencyCode || '', productId: p.product?.identifier || '' };
    return out;
  },
  async buy(planId, period) {
    const o = await Purchases.getOfferings();
    const cur = o.current || Object.values(o.all || {})[0];
    const id = `${planId}_${period === 'year' ? 'yearly' : 'monthly'}`;
    const pkg = (cur?.availablePackages || []).find((p) => p.identifier === id);
    if (!pkg) throw new Error('Dieses Abo ist im Store noch nicht verfügbar.');
    try {
      const r = await Purchases.purchasePackage({ aPackage: pkg });
      return { ok: true, active: Object.keys(r.customerInfo?.entitlements?.active || {}) };
    } catch (e) {
      if (e?.userCancelled || String(e?.code) === '1' || /cancel/i.test(String(e?.message || ''))) return { ok: false, cancelled: true };
      throw e;
    }
  },
  async restore() {
    const r = await Purchases.restorePurchases();
    return { active: Object.keys(r.customerInfo?.entitlements?.active || {}) };
  },
  async manageUrl() {
    const r = await Purchases.getCustomerInfo();
    return r.customerInfo?.managementURL || null;
  },

  // ---------- Links, Dateien, Lebenszyklus
  async openUrl(url) {
    if (/^https?:/i.test(url)) await Browser.open({ url, presentationStyle: 'popover' });
    else await AppLauncher.openUrl({ url });
  },
  async shareFile(blob, name) {
    const safe = String(name || 'datei').replace(/[\\/:*?"<>|]+/g, '_');
    const { uri } = await Filesystem.writeFile({ path: safe, data: await blobToBase64(blob), directory: Directory.Cache });
    await Share.share({ title: safe, url: uri, dialogTitle: safe });
  },
  onAppState(cb) { App.addListener('appStateChange', ({ isActive }) => cb(isActive)); },
  onDeepLink(cb) { App.addListener('appUrlOpen', ({ url }) => cb(url)); },
  hideSplash() { SplashScreen.hide().catch(() => {}); },
};

StatusBar.setStyle({ style: Style.Default }).catch(() => {});
