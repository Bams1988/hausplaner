// =====================================================================
//  EINSTELLUNGEN – hier trägst du deine Firebase-Daten ein
//  (Schritt für Schritt erklärt in der Anleitung).
//
//  Solange apiKey leer ist, läuft die App im „Lokalen Modus“:
//  alles funktioniert, aber nur auf diesem einen Gerät – ohne Teilen
//  mit deiner Frau und ohne Push-Nachrichten.
// =====================================================================
self.HAUS_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyDhSuCzhwKJex0ZRX8t1Gqdf9VmcJIt390',
    authDomain: 'hausplaner-41d33.firebaseapp.com',
    projectId: 'hausplaner-41d33',
    storageBucket: 'hausplaner-41d33.firebasestorage.app',
    messagingSenderId: '751051509232',
    appId: '1:751051509232:web:81149c295ba47ecec1e135',
  },
  // Firebase-Konsole → Projekteinstellungen → Cloud Messaging → Web-Push-Zertifikate
  vapidKey: 'BOdrrZ7vR0EROPIWFCfyDC9G3jBjZWBB9x-I7913kKQcEvxsuYcUgNmjY0SZzeGF6IhEiH1OkckWKnHlC_tCRtU',
    backend: {
    enabled: true,
    region: 'europe-west3',
    mailDomain: '',
    beta: true,
    revenuecat: { ios: '', android: '' },
  },
};
