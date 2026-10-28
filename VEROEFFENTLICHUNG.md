# MindSpace als App veröffentlichen – mit Abos (Free · Daily Driver · Pro)

Dieser Leitfaden führt dich vom heutigen Stand (Web-App für deine Familie) zur App im **App Store** und bei **Google Play** mit drei Abo-Stufen. Alles lässt sich an einem privaten Computer im Browser erledigen. Du musst **nichts installieren**, und einen Mac brauchst du auch nicht: Gebaut werden die Apps automatisch bei GitHub.

> **Wichtig:** Ich bin kein Anwalt und kein Steuerberater. Die Abschnitte zu Gewerbe, Steuern und Rechtstexten sind Orientierung, keine Beratung. Lass sie vor dem Start von einer Fachperson prüfen.

---

## Überblick

### Die drei Abo-Stufen (eingestellt in `plans.js`)

| | **Free** | **Daily Driver** | **Pro** |
|---|---|---|---|
| Preis | 0 € | 6,99 € / Monat · 62,99 € / Jahr | 12,99 € / Monat · 116,99 € / Jahr |
| Eigene Projekte (zusätzlich zu den Standard-Bereichen) | 1 | 10 | unbegrenzt |
| Personen im gemeinsamen Bereich | 2 | 5 | 10 |
| KI-Aktionen pro Monat (Sprache, Suche, Entwürfe, Auswerten) | 20 | 150 | 400 |
| E-Mails pro Monat, die die KI liest | 10 | 40 | 120 |
| Anhänge, die die KI je Mail mitliest | 1 | 3 | 6 |
| Speicher für Fotos & Dokumente | 250 MB | 5 GB | 25 GB |
| Tägliche KI-Fristenprüfung | – | ✓ | ✓ |
| Gründlich-Modus (stärkstes Modell) | – | – | ✓ |
| Face ID, Kalender-Abo, Push, Teilen, Farben | ✓ | ✓ | ✓ |

- **Ein Abo gilt für die ganze Familie.** Hat eine Person im gemeinsamen Bereich Pro, nutzen alle Pro.
- **Zähler:** Die Monatszähler starten am 1. neu.
- **Große Anfragen zählen mehr:** Sehr große Anfragen (z. B. lange PDFs) zählen anteilig mehr Aktionen, damit einzelne Anfragen nicht teuer werden.
- **Grenzen ändern:** Alle Grenzen stehen in einer einzigen Datei, `plans.js`. Ändern, hochladen, Server-Dienste neu bereitstellen, fertig.

**Warum diese Grenzen?** Nach Mehrwertsteuer (19 %) und Store-Gebühr (15 % im Small-Business-Programm) bleiben dir von 6,99 € etwa **4,99 €**, von 12,99 € etwa **9,28 €**. KI-Auswertungen kosten pro Aufruf echtes Geld. Die Grenzen sind so gewählt, dass auch ein Vielnutzer, der alles ausschöpft, kein Verlustgeschäft wird. Die meisten Nutzer brauchen nur einen Bruchteil. Prüfe die aktuellen Preise der Claude-Modelle in der Anthropic Console. In der Datenbank siehst du pro Bereich und Monat die tatsächlich verbrauchten Tokens (`projects/…/usage/JJJJ-MM`).

### Was es kostet

| Posten | Kosten | Wofür |
|---|---|---|
| Apple Developer Program | 99 € / Jahr | App Store |
| Google Play Console | 25 $ einmalig | Google Play |
| Domain (z. B. bei Cloudflare) | ca. 10 € / Jahr | eigene E-Mail-Adressen für den Mail-Eingang |
| Firebase „Blaze“ | nach Verbrauch, am Anfang meist 0–5 € / Monat | Server-Dienste, Datenbank, Dateien |
| Anthropic (Claude) | nach Verbrauch | KI für alle Kunden |
| RevenueCat | kostenlos bis 2.500 $ Monatsumsatz, danach rund 1 % | Abo-Verwaltung für beide Stores |
| Cloudflare Email Routing | kostenlos | E-Mails an die Server-Dienste weiterleiten |
| Gewerbeanmeldung | je nach Gemeinde ca. 20–60 € | Pflicht für den Verkauf |

### Reihenfolge

| Schritt | Was | Dauer |
|---|---|---|
| 1 | Gewerbe, Rechtstexte | 1–2 Wochen (Behörden) |
| 2–4 | Firebase und Server-Dienste. Danach läuft eure Familien-App schon mit dem neuen System. | 1 Abend |
| 5 | Eigene Domain für den E-Mail-Eingang | 30 Min. |
| 6–8 | Apple, Google, RevenueCat (Konten, Abo-Produkte) | 1–3 Wochen, wegen Prüfungen und Bestätigungen |
| 9–10 | Apps bauen und testen (TestFlight, interner Test) | 1–2 Abende |
| 11–12 | Store-Einträge und Einreichung | 1 Abend + Prüfzeit |

> **Google-Besonderheit:** Neue private Entwicklerkonten müssen die App **14 Tage lang mit mindestens 12 Testern** in einem *geschlossenen Test* testen lassen, bevor sie veröffentlichen dürfen. Plane das früh ein. Familie, Freunde und Kollegen zählen.

---

## Schritt 1 – Gewerbe und Rechtliches

1. **Gewerbe anmelden:** beim Gewerbeamt deiner Gemeinde, meist online. Tätigkeit z. B. „Entwicklung und Vertrieb von Software/Apps“. Das Finanzamt schickt dir danach den Fragebogen zur steuerlichen Erfassung, darin entscheidest du über die Kleinunternehmerregelung.
2. **Arbeitgeber:** Als Angestellter brauchst du für eine Nebentätigkeit oft eine Zustimmung oder Anzeige. Sieh in deinem Arbeitsvertrag nach.
3. **Steuern:** Apple und Google verkaufen die Abos in eigenem Namen an die Kunden und zahlen dir deinen Anteil aus. Wie du das umsatzsteuerlich behandelst, klärst du am besten einmal mit einer Steuerberatung.
4. **Rechtstexte:** Im Ordner `rechtliches/` liegen Vorlagen für **Impressum, Datenschutzerklärung und Nutzungsbedingungen**. Sie beschreiben genau, was MindSpace technisch tut.
   - Gelb markierte Stellen ausfüllen, Texte prüfen lassen.
   - Die Seiten sind über GitHub Pages erreichbar, z. B. `https://bams1988.github.io/hausplaner/rechtliches/datenschutz.html`.
5. **Pflichtangaben in den Stores (EU, Digital Services Act):** Wer Abos verkauft, gilt als „Händler“. Apple und Google zeigen dann **Anschrift, Telefonnummer und E-Mail** öffentlich auf der App-Seite an. Bei Apple darfst du statt der Wohnanschrift ein Postfach angeben, mit Nachweis.

---

## Schritt 2 – Firebase vorbereiten

1. **Tarif:** console.firebase.google.com → dein Projekt → unten links **„Upgrade“ → Blaze**. Kreditkarte hinterlegen.
2. **Budget-Warnung:** Sofort eine einrichten, z. B. 20 €. Dazu Google Cloud Console → Abrechnung → Budgets & Benachrichtigungen.
3. **Speicher:** **Build → Storage → Jetzt starten.** Standort: dieselbe Region wie deine Datenbank (in Europa z. B. `europe-west3`). Die Sicherheitsregeln lädst du in Schritt 4 automatisch hoch.

## Schritt 3 – Anthropic-Konto für MindSpace

1. **Organisation:** console.anthropic.com → eine eigene Organisation „MindSpace“ anlegen. Getrennt von deinem privaten Schlüssel, damit du die Kosten sauber siehst.
2. **Guthaben und Grenze:** **Billing:** Guthaben aufladen und ein **monatliches Ausgabelimit** setzen.
3. **Schlüssel:** **API Keys → Create Key** („MindSpace-Server“) und kopieren. Du brauchst ihn in Schritt 4.

## Schritt 4 – Server-Dienste bereitstellen

Die Server-Dienste liegen im Ordner `functions/`. Bereitgestellt wird über die **Google Cloud Shell**, ein Terminal im Browser ohne Installation.

1. **Code hochladen:** Alle neuen Dateien zu GitHub hochladen, siehe „Update auf Version 14“ in der ANLEITUNG.
2. **Cloud Shell öffnen:** console.cloud.google.com → oben rechts das Symbol **„Cloud Shell aktivieren“** (`>_`).
3. **Befehle:** nacheinander eingeben (jeweils Enter):
   ```bash
   git clone https://github.com/bams1988/hausplaner.git
   cd hausplaner
   npm install -g firebase-tools        # falls „firebase“ noch fehlt
   firebase login --no-localhost        # Link öffnen, anmelden, Code zurückkopieren
   firebase use --add                   # dein Firebase-Projekt wählen, Alias: default
   cd functions && npm install && cp .env.beispiel .env && cd ..
   ```
4. **Einstellungen:** `nano functions/.env` öffnen. `APP_URL` steht schon drin, `MAIL_DOMAIN` erst nach Schritt 5 eintragen. Speichern mit Strg+O, Enter, Strg+X.
5. **Geheimnisse hinterlegen:** Jeder Befehl fragt nach dem Wert.
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY        # Schlüssel aus Schritt 3
   firebase functions:secrets:set REVENUECAT_SECRET_KEY    # erst mal „leer“ eingeben, echter Wert in Schritt 8
   firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH  # ein langes, frei erfundenes Passwort
   firebase functions:secrets:set INBOUND_SECRET           # ein zweites, anderes Passwort
   ```
6. **Bereitstellen:**
   ```bash
   firebase deploy --only functions,firestore:rules,storage
   ```
   Beim ersten Mal fragt Firebase, ob APIs aktiviert werden sollen: **ja**. Das dauert 5–10 Minuten.
7. **Datei-Freigabe (CORS):** damit die Apps Fotos und Dokumente laden dürfen. `<bucket>` steht in der Firebase-Konsole unter Storage, z. B. `dein-projekt.firebasestorage.app`.
   ```bash
   gsutil cors set storage-cors.json gs://<bucket>
   ```
8. **Dir und deiner Frau Pro schenken:** Firebase-Konsole → Firestore → `users` → dein Dokument → **Feld hinzufügen:** `grant` = `pro` (Text). Dasselbe bei deiner Frau. Der Server trägt das Abo danach automatisch in euren Bereich ein.
9. **Web-Version umschalten:** In deiner `config.js` bei GitHub den Abschnitt `backend` aus `config.beispiel.js` einfügen, `enabled: true` setzen und speichern.
   - Ab dann läuft die KI über den MindSpace-Server. Unter **Mehr** siehst du dein Abo und den Verbrauch.
   - Fotos landen im günstigeren Cloud Storage, alte Dateien bleiben lesbar.
10. **Alte Dienste abschalten:** Erinnerungen, Fristen-Check, Kommentare und Zuständigkeiten erledigen jetzt die Server-Dienste. Den **GitHub-Zeitplan** kannst du abschalten: Actions → „MindSpace“ → „…“ → **Disable workflow**. Er überspringt umgestellte Bereiche ohnehin. Den **Postboten** brauchst du erst nicht mehr, wenn Schritt 5 läuft.

## Schritt 5 – E-Mail-Eingang für alle (eigene Domain)

Jeder gemeinsame Bereich bekommt eine eigene Adresse wie `k7m2x9qa@in.deine-domain.de`. Dafür brauchst du eine Domain, z. B. bei Cloudflare für ca. 10 €/Jahr.

1. **Cloudflare:** Domain kaufen oder hinzufügen. Dann **Email → Email Routing → Aktivieren**. Cloudflare trägt die nötigen DNS-Einträge selbst ein. Für eine Unterdomain wie `in.deine-domain.de` dort „Subdomain hinzufügen“.
2. **Worker anlegen:** **Workers & Pages → Erstellen → Worker** „mindspace-mail“. Den Inhalt von `mail-worker/worker.js` einfügen → **Bereitstellen**.
3. **Worker-Variablen:** **Einstellungen → Variablen**
   - `FUNCTION_URL` = URL der Funktion **inboundMail**. Sie steht nach Schritt 4 in der Firebase-Konsole unter Functions, z. B. `https://inboundmail-xxxx-ey.a.run.app`.
   - `INBOUND_SECRET` = dasselbe Passwort wie in Schritt 4. Als **Secret** speichern.
4. **Catch-all-Regel:** **Email Routing → Routing-Regeln → Catch-all → Aktion „An Worker senden“ → mindspace-mail.**
5. **Firebase:** In der Cloud Shell `MAIL_DOMAIN=in.deine-domain.de` in `functions/.env` eintragen, `firebase deploy --only functions` ausführen. In deiner `config.js` dieselbe Domain bei `backend.mailDomain` eintragen.
6. **Testen:** In der App **Eingang → Adresse anlegen**, eine Mail dorthin weiterleiten. Nach wenigen Sekunden kommt die Push-Nachricht.
7. **Umstellen:** Funktioniert alles, leitet ihr künftig an die neue Adresse weiter und schaltet den Postboten ab: in script.google.com die Funktion `ausschalten` ausführen.

## Schritt 6 – Apple

1. **Apple Developer Program:** developer.apple.com/programs → **Enroll**, 99 €/Jahr.
   - Als Einzelperson steht dein Name als Anbieter im Store.
   - Für einen Firmennamen brauchst du eine eingetragene Firma (z. B. UG) und eine D-U-N-S-Nummer.
2. **Verträge:** App Store Connect → **Verträge, Steuern und Bankverbindung:** den Vertrag **„Kostenpflichtige Apps“** abschließen, Bankkonto und Steuerformulare ausfüllen. Ohne das funktionieren keine Käufe.
3. **Small Business Program:** beantragen (developer.apple.com/app-store/small-business-program). Dann 15 % statt 30 % Gebühr.
4. **App anlegen:** App Store Connect → **Apps → +**
   - Name „MindSpace“ (oder ein freier Name).
   - Sprache Deutsch.
   - Bundle-ID z. B. `de.deinname.mindspace`. Dieselbe kommt in GitHub als Variable `APP_ID`.
   - SKU frei wählbar.
5. **Abos anlegen:** In der App → **Abonnements → Abo-Gruppe „MindSpace“** anlegen, darin vier Abos mit genau diesen Produkt-IDs:

   | Produkt-ID | Laufzeit | Preis |
   |---|---|---|
   | `mindspace_daily_monthly` | 1 Monat | 6,99 € |
   | `mindspace_daily_yearly` | 1 Jahr | 62,99 € |
   | `mindspace_pro_monthly` | 1 Monat | 12,99 € |
   | `mindspace_pro_yearly` | 1 Jahr | 116,99 € |

   - **Rangfolge in der Gruppe:** Pro oben, Daily Driver darunter. So erkennt Apple Up- und Downgrades.
   - Jeweils deutschen und englischen Anzeigenamen und eine Beschreibung eintragen.
6. **Push-Schlüssel:** developer.apple.com → **Certificates, IDs & Profiles → Keys → +** → „Apple Push Notifications service (APNs)“ → Schlüssel (.p8) herunterladen. Dann Firebase-Konsole → Projekteinstellungen → **Cloud Messaging → Apple-App-Konfiguration → APNs-Authentifizierungsschlüssel hochladen**, mit Key-ID und Team-ID.
7. **Schlüssel für automatische Builds:** App Store Connect → **Benutzer und Zugriff → Integrationen → App Store Connect API → +**, Rolle **Admin**. Die **.p8-Datei** herunterladen, **Key-ID** und **Issuer-ID** notieren. Das ist für Schritt 9.
8. **Firebase-iOS-App:** Firebase-Konsole → Projekteinstellungen → **App hinzufügen → iOS** → Bundle-ID wie oben → **GoogleService-Info.plist** herunterladen.

## Schritt 7 – Google Play

1. **Konto:** play.google.com/console → Konto als **Privatperson** oder **Organisation** anlegen (25 $). Identität bestätigen, das dauert einige Tage.
2. **Zahlungen:** **Zahlungsprofil** einrichten. Bankverbindung und Steuerangaben sind nötig für Abos.
3. **App anlegen:** **App erstellen** → „MindSpace“, Deutsch, App, kostenlos (die Abos sind In-App-Käufe).
4. **Upload-Schlüssel erzeugen** (in der Cloud Shell, ohne Installation):
   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias mindspace -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 upload.jks; echo
   ```
   - Die lange Zeichenkette ist das GitHub-Secret `ANDROID_KEYSTORE`.
   - Passwort und Alias („mindspace“) gut aufbewahren.
   - `upload.jks` zusätzlich herunterladen und sicher speichern (Cloud Shell → ⋮ → Herunterladen).
5. **Abos anlegen:** **Monetarisieren → Abos:**
   - Abo `mindspace_daily` mit zwei **Basis-Abos**, `monthly` (6,99 €) und `yearly` (62,99 €).
   - Ebenso `mindspace_pro` mit `monthly` (12,99 €) und `yearly` (116,99 €).
6. **Firebase-Android-App:** Firebase-Konsole → **App hinzufügen → Android** → Paketname = `APP_ID` → **google-services.json** herunterladen.
7. **Für automatische Uploads (optional):**
   - Google Cloud Console → IAM → **Dienstkonto** anlegen → JSON-Schlüssel erzeugen.
   - In der Play Console → **Nutzer und Berechtigungen → Nutzer einladen**: die E-Mail des Dienstkontos, Rechte „Releases verwalten“.
   - Der JSON-Inhalt ist das Secret `PLAY_SERVICE_ACCOUNT_JSON`.
8. **Erster Upload:** Den **allerersten** Upload musst du von Hand machen. Die .aab-Datei aus Schritt 9 herunterladen und unter **Testen → Interner Test → Neuer Release** hochladen. Ab dann geht es automatisch.

## Schritt 8 – RevenueCat (Abo-Verwaltung für beide Stores)

1. **Projekt:** app.revenuecat.com → kostenloses Konto → **Projekt „MindSpace“**.
2. **Apps hinzufügen:**
   - **App Store:** Bundle-ID, dazu den In-App-Purchase-Schlüssel aus App Store Connect. RevenueCat erklärt im Assistenten genau, welchen.
   - **Play Store:** Paketname, dazu das Dienstkonto aus Schritt 7.7. Die Anleitung ist ebenfalls im Assistenten.
3. **Produkte:** die vier Abos importieren bzw. anlegen.
4. **Entitlements:** zwei Stück anlegen, `daily` und `pro`.
   - `daily` ← beide Daily-Driver-Produkte.
   - `pro` ← beide Pro-Produkte.
5. **Offering:** Ein Offering `default` anlegen (als „Current“ markiert) mit vier **Paketen**. Die Paket-IDs müssen genau so heißen:

   | Paket-ID | Produkt |
   |---|---|
   | `daily_monthly` | Daily Driver monatlich |
   | `daily_yearly` | Daily Driver jährlich |
   | `pro_monthly` | Pro monatlich |
   | `pro_yearly` | Pro jährlich |

6. **Webhook:** **Integrations → Webhooks**
   - URL = URL der Funktion **revenuecat** (Firebase-Konsole → Functions).
   - **Authorization header** = `Bearer <REVENUECAT_WEBHOOK_AUTH aus Schritt 4>`.
7. **API-Schlüssel:**
   - Die **öffentlichen** App-Schlüssel (`appl_…`, `goog_…`) in `config.js` unter `backend.revenuecat` eintragen.
   - Den **Secret API key (v1)** in der Cloud Shell hinterlegen und neu bereitstellen:
     ```bash
     firebase functions:secrets:set REVENUECAT_SECRET_KEY
     firebase deploy --only functions
     ```

## Schritt 9 – Apps automatisch bauen lassen (GitHub)

Bei GitHub: **Settings → Secrets and variables → Actions.**

**Secrets** (Tab „Secrets“):

| Name | Inhalt |
|---|---|
| `MINDSPACE_CONFIG` | Der **komplette Inhalt** deiner `config.js`, mit `backend` und `legal`. |
| `APPLE_TEAM_ID` | Team-ID (developer.apple.com → Mitgliedschaft) |
| `ASC_KEY_ID`, `ASC_ISSUER_ID` | aus Schritt 6.7 |
| `ASC_KEY_P8` | die .p8-Datei aus 6.7 als **Base64**, siehe unten |
| `GOOGLE_SERVICE_INFO_PLIST` | GoogleService-Info.plist als **Base64** |
| `GOOGLE_SERVICES_JSON` | google-services.json als **Base64** |
| `ANDROID_KEYSTORE` | Base64 aus Schritt 7.4 |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` | aus Schritt 7.4 |
| `PLAY_SERVICE_ACCOUNT_JSON` | optional, aus 7.7 (JSON als Text) |

**Variablen** (Tab „Variables“): `APP_ID` (z. B. `de.deinname.mindspace`) und `APP_VERSION_NAME` (z. B. `1.0`).

**Base64 ohne Installation:**
- **Cloud Shell:** Datei hochladen (⋮ → Hochladen), dann `base64 -w0 DATEINAME; echo`.
- **Windows-PowerShell** (ohne Admin-Rechte): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Pfad\DATEINAME"))`

**Bauen:**
- **Actions → „App iPhone (TestFlight)“ → Run workflow.** Nach ca. 20–30 Minuten ist die App in TestFlight. Auf dem iPhone die App **TestFlight** installieren, du bekommst eine Einladung.
- **Actions → „App Android (Google Play)“ → Run workflow.** Die .aab liegt danach unter „Artifacts“ (erster Upload von Hand, siehe 7.8).

Für jede neue Version einfach wieder „Run workflow“. Die Build-Nummer zählt automatisch hoch.

## Schritt 10 – Testen

- **Echte Käufe testen:**
  - **iPhone:** Mit einem Sandbox-Konto (App Store Connect → Benutzer und Zugriff → Sandbox) in TestFlight kaufen.
  - **Android:** Testkonten unter Play Console → Einstellungen → Lizenztests.
- **Prüfliste:**
  - Anmelden, Face ID einschalten, App schließen und öffnen.
  - Push aktivieren, Aufgabe mit Erinnerung in 2 Minuten anlegen.
  - E-Mail an die eigene Adresse weiterleiten.
  - Daily Driver kaufen: Die Abo-Karte zeigt es sofort, auch auf dem Gerät deiner Frau.
  - „Käufe wiederherstellen“ und „Konto löschen“ mit einem Testkonto ausprobieren.
- **Google:** den **geschlossenen Test** mit 12 Testern starten und 14 Tage laufen lassen.

## Schritt 11 – Store-Einträge

- **Texte:** Name, Untertitel, Beschreibung (Deutsch und Englisch), Schlüsselwörter, Support-URL, Datenschutz-URL.
- **Screenshots:** iPhone 6,9″ und 6,5″, Android-Telefon. Am einfachsten aus der TestFlight-App aufnehmen.
- **App-Datenschutz (Apple) bzw. Datensicherheit (Google):**
  - Kontaktdaten (Name, E-Mail) und Nutzerinhalte (Fotos, Dokumente, E-Mails, Kontakte), jeweils mit dir verknüpft, *kein* Tracking.
  - Kennungen: Nutzer-ID.
  - Kaufhistorie (über Apple/Google bzw. RevenueCat).
- **Altersfreigabe:** Fragebogen ausfüllen, ergibt in der Regel 4+ bzw. „USK ab 0“.
- **Prüfer-Zugang (Pflicht bei Apple):**
  - Ein **Demo-Konto** mit Beispieldaten anlegen und Zugangsdaten bei „App-Review-Informationen“ eintragen.
  - Erwähnen, dass KI-Funktionen echte Anfragen auslösen und die E-Mail-Adresse unter Eingang → „Adresse anlegen“ entsteht.

## Schritt 12 – Einreichen

- **Apple:** Build auswählen, die **Abos zur ersten Version hinzufügen** (sonst werden sie nicht geprüft) → **Zur Prüfung einreichen**. Die Prüfung dauert meist 1–3 Tage.
- **Google:** Nach dem 14-Tage-Test → **Produktionszugriff beantragen** → Release in „Produktion“.
- **Häufige Ablehnungsgründe und wie MindSpace sie erfüllt:**
  - Konto löschen in der App ✓
  - „Käufe wiederherstellen“-Knopf ✓
  - Preis, Laufzeit und Verlängerungshinweis auf der Abo-Seite ✓
  - Links zu Datenschutz und Nutzungsbedingungen ✓
  - Native Funktionen statt reiner Webseite (Face ID, Push, Käufe) ✓

---

## Betrieb

- **Kosten im Blick:**
  - Firebase-Budgetwarnung.
  - Anthropic-Ausgabelimit.
  - Verbrauch je Bereich in Firestore unter `projects/<id>/usage/<Monat>`. Dort steht die Zahl der KI-Aktionen und E-Mails sowie die Tokens je Modell.
- **Grenzen oder Preise ändern:**
  - Grenzen: `plans.js` anpassen → zu GitHub hochladen → in der Cloud Shell `git pull && firebase deploy --only functions` → Apps neu bauen.
  - Preise: in App Store Connect bzw. Play Console ändern. Die App zeigt automatisch die Store-Preise an.
- **Rechte von Hand vergeben** (Freunde, Tester): in Firestore beim Nutzer `grant` = `daily` oder `pro`, optional `grantUntil` als Zeitstempel in Millisekunden.
- **Bisheriger Betrieb:** Solange `backend.enabled` nicht `true` ist, verhält sich alles wie in Version 13, also mit eigenem KI-Schlüssel, Postbote und GitHub-Erinnerungen.

## Was noch offen ist

Gebaut und mit Nachbauten getestet sind:
- Server-Dienste und App-Oberfläche.
- Abo-Seite, Limits und Kauf-Ablauf (simuliert).
- Face ID, Push und Dateien in der App (simuliert).
- Die Vorbereitungs-Skripte für iOS und Android.

**Nicht** testen konnte ich ohne deine Konten:
- den echten Build bei Apple und Google,
- echte Käufe über die Stores und RevenueCat,
- den echten Mail-Empfang über Cloudflare.

Beim ersten Durchlauf von Schritt 9 können deshalb noch Kleinigkeiten auftauchen, etwa geänderte Paketversionen. Die Fehlermeldung aus dem GitHub-Protokoll genügt, um sie zu beheben.
