// =====================================================================
//  MUSTER für config.js – deine echte config.js NICHT überschreiben!
//  Neu ab Version 14 sind nur die Abschnitte „backend“ und „legal“.
//  Kopiere sie in deine bestehende config.js (unter vapidKey), sobald
//  die Server-Dienste laufen (VEROEFFENTLICHUNG.md, Schritt 4).
// =====================================================================
self.HAUS_CONFIG = {
  firebase: {
    apiKey: '…', authDomain: '…', projectId: '…', storageBucket: '…', messagingSenderId: '…', appId: '…',
  },
  vapidKey: '…',

  // Server-Dienste: Abos, KI über MindSpace, eigener E-Mail-Eingang, Dateien in Cloud Storage.
  // Solange enabled = false, läuft alles wie bisher (eigener KI-Schlüssel, Postbote, GitHub).
  backend: {
    enabled: false,
    region: 'europe-west3',
    mailDomain: '', // z. B. 'in.mindspace-app.de' (Schritt 5)
    beta: true, // Testphase: Tester wählen ihre Stufe mit Test-Code und schicken Feedback (TESTVERSION.md)
    // RevenueCat → Projekt → API keys → „Public app-specific API keys“
    revenuecat: { ios: 'appl_…', android: 'goog_…' },
  },

  // Pflichtangaben für den App Store / Google Play (eigene Webseiten, z. B. auf GitHub Pages)
  legal: {
    privacy: 'https://…/datenschutz.html',
    terms: 'https://…/nutzungsbedingungen.html',
    imprint: 'https://…/impressum.html',
  },
};
