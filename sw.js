// Service Worker: Offline-Start und Push-Nachrichten.
const VERSION = 'mindspace-v16.1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'store.js', 'parser.js', 'ai.js', 'i18n.js', 'plans.js', 'native.js', 'config.js', 'icons/logo.svg', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

importScripts('config.js');
const cfg = self.HAUS_CONFIG || {};
if (cfg.firebase && cfg.firebase.apiKey) try {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
  firebase.initializeApp(cfg.firebase);
  const messaging = firebase.messaging();
  // Nachrichten ohne „notification“-Teil selbst anzeigen (mit Teil zeigt Firebase sie automatisch).
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const d = payload.data || {};
    return self.registration.showNotification(d.title || 'MindSpace', { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag, data: { link: d.link } });
  });
} catch (err) { console.warn('Firebase im Service Worker nicht geladen:', err); }

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'no-cache' })))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Eigene Dateien: erst Netz (damit Updates sofort ankommen), offline aus dem Speicher.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && (e.notification.data.link || (e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.notification && e.notification.data.FCM_MSG.notification.click_action))) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) return c.focus();
    return self.clients.openWindow(target);
  }));
});
