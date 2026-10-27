# MindSpace mit Bekannten testen – ohne App Store

Deine Tester installieren MindSpace als **Web-App** über „Zum Home-Bildschirm“. Das funktioniert auf iPhone, Android und am Computer, ohne App Store, ohne Apple-Konto und kostenlos. Sie bekommen alle Funktionen der echten App, nur Käufe gibt es nicht. Stattdessen wählt jeder Tester seine Stufe (Free, Daily Driver, Pro) mit einem **Test-Code** selbst.

> **Warum keine „richtige“ App ohne App Store?** Apple erlaubt das Installieren nativer Apps außerhalb des App Stores nur mit einem Apple-Entwicklerkonto (99 €/Jahr), z. B. über TestFlight. Die Web-App ist dafür der kostenlose Weg zum Testen. Dieselbe App kommt später unverändert in die Stores.

## Was du einmalig tust (ca. 1 Abend)

Deine Tester brauchen die **Server-Dienste**, damit die KI für sie funktioniert. Sie haben ja keinen eigenen KI-Schlüssel.

1. **Neue Dateien hochladen:** zu GitHub, wie in der ANLEITUNG unter „Update auf Version 15“.
2. **Server-Dienste einrichten:** Schritte 2 bis 4 aus **VEROEFFENTLICHUNG.md**: Firebase auf Blaze, Anthropic-Schlüssel, Bereitstellen in der Cloud Shell. Zusätzlich in `functions/.env` eintragen:
   ```
   BETA_CODE=HAUS2026        ← dein Test-Code, frei wählbar
   ADMIN_EMAIL=deine@mail.de ← deine MindSpace-Anmeldeadresse; du bekommst Feedback als Push
   ```
   Danach in der Cloud Shell: `firebase deploy --only functions,firestore:rules,storage`
3. **Testphase einschalten:** In deiner `config.js` bei GitHub den Abschnitt `backend` einfügen (Vorlage: `config.beispiel.js`), mit
   ```js
   enabled: true,
   beta: true,
   ```
4. **Kosten begrenzen:** In der Anthropic Console ein **monatliches Ausgabelimit** setzen, z. B. 20 €. Bei Firebase eine **Budget-Warnung** einrichten.
5. **Familie freischalten:** Für dich und deine Frau in Firestore → `users` → jeweils `grant` = `pro` eintragen.

**E-Mail weiterleiten (optional):** Das braucht die eigene Domain aus Schritt 5. Ohne sie können Tester E-Mails unter **Eingang → Einfügen** hineinkopieren.

## Tester einladen

Schick deinen Bekannten diese beiden Dinge, am besten persönlich, z. B. per WhatsApp:

1. Den Link zur Testseite: **https://bams1988.github.io/hausplaner/testen.html**. Dort steht Schritt für Schritt, wie man installiert, und was man ausprobieren kann.
2. Den **Test-Code** (`BETA_CODE`).

Jeder Tester bekommt seinen eigenen, privaten Bereich. Eure Familiendaten sieht niemand.

## Während des Tests

- **Feedback:** Tester schreiben unter **Mehr → Feedback zur Testversion**. Du bekommst eine Push-Nachricht, der volle Text steht in Firestore unter `feedback`.
- **Verbrauch:** Firestore → `projects` → Bereich → `usage`. Dort stehen die KI-Aktionen, E-Mails und Tokens je Monat.
- **Neue Version verteilen:** Dateien zu GitHub hochladen. Tester tippen auf **Mehr → Neueste Version laden**.
- **Testphase beenden:**
  - `BETA_CODE` in `functions/.env` leeren und neu bereitstellen.
  - `beta: true` aus der `config.js` entfernen.
  - Vergebene Teststufen bleiben bestehen, bis du `grant` bei den Testern löschst.
