# MindSpace – Einrichtung

MindSpace ist dein persönlicher Assistent für alle Lebensbereiche: Aufgaben, Fristen, ein Projektplan, der von selbst wächst, und ein E-Mail-Eingang, aus dem die KI Aufgaben macht. MindSpace ist eine Web-App, die du auf dem iPhone zum Home-Bildschirm hinzufügst. Danach startet sie wie eine normale App: eigenes Symbol, Vollbild, Push-Nachrichten. Kein App Store, kein Mac.

Die Einrichtung hat fünf Stufen. Schon nach Stufe 1 kannst du die App benutzen.

| Stufe | Was du danach hast | Zeit |
|---|---|---|
| 1. Online stellen (GitHub) | App auf dem iPhone, Daten nur auf deinem Gerät | ca. 10 Min. |
| 2. Cloud (Firebase) | Teilen mit deiner Frau, Daten auf allen Geräten | ca. 15 Min. |
| 3. Erinnerungen | Push-Nachrichten zu Fristen und Morgen-Übersicht | ca. 10 Min. |
| 4. KI-Assistent | E-Mails mit KI auswerten, Kontakte, Mail-Entwürfe, tägliche Fristprüfung | ca. 10 Min. |
| 5. E-Mail-Eingang | Mails einfach weiterleiten – Aufgaben entstehen innerhalb von 1–2 Minuten | ca. 15 Min. |

> **Du hattest schon den Hausplaner eingerichtet?** Dann lies zuerst den Abschnitt **„Umstieg vom Hausplaner“** ganz unten. Stufe 1–4 musst du nicht wiederholen.

> **Update auf Version 16 (aufgeräumt: Plus mit Diktat, Assistent, neues „Mehr“, Tour)**
> 1. **GitHub → Add file → Upload files:** `app.js`, `ai.js`, `plans.js`, `i18n.js`, `styles.css`, `sw.js`, `testen.html`, `TESTVERSION.md` und `ANLEITUNG.md`. `config.js` nicht anfassen.
> 2. Auf jedem Gerät **Mehr → App & Darstellung → Neueste Version laden** (Version 16). Beim ersten Öffnen bietet MindSpace die Tour an.
> 3. Mit Server-Diensten (optional, für bessere Assistenten-Antworten): in der Cloud Shell `cd ~/hausplaner && git pull && firebase deploy --only functions`.

> **Update auf Version 15 (Schutz vor verlorenen Eingaben + Testphase)**
> 1. **GitHub → Add file → Upload files:** `app.js`, `store.js`, `i18n.js`, `styles.css`, `sw.js`, `firestore.rules`, `config.beispiel.js`, `testen.html` (neu), `TESTVERSION.md` (neu) und `ANLEITUNG.md`; aus dem Ordner `functions` die Dateien `index.js` und `.env.beispiel`. `config.js` nicht anfassen.
> 2. **Firebase → Firestore → Regeln:** Inhalt der neuen `firestore.rules` einfügen → **Veröffentlichen**.
> 3. Auf jedem Gerät **Mehr → App & Darstellung → Neueste Version laden** (Version 15).
> 4. Bekannte testen lassen: siehe **TESTVERSION.md**.

> **Update auf Version 14 (vorbereitet für App Store, Google Play und Abos)** – für euren bisherigen Betrieb ändert sich nichts, bis du die Server-Dienste einschaltest:
> 1. **GitHub → Add file → Upload files:** `app.js`, `store.js`, `ai.js`, `i18n.js`, `plans.js` (neu), `native.js` (neu), `styles.css`, `sw.js`, `firestore.rules`, `storage.rules` (neu), `storage-cors.json` (neu), `firebase.json` (neu), `config.beispiel.js` (neu), `reminders-core.js` (neu), `ANLEITUNG.md`, `VEROEFFENTLICHUNG.md` (neu) an die gewohnte Stelle; `send-reminders.mjs` in `scripts`; die Ordner `functions`, `native`, `mail-worker` und `rechtliches` komplett; `reminders.yml`, `app-ios.yml` und `app-android.yml` in `.github/workflows`. `config.js` nicht anfassen.
> 2. **Firebase → Firestore → Regeln:** Inhalt der neuen `firestore.rules` einfügen → **Veröffentlichen**.
> 3. **Postbote:** Code durch die neue `MindSpace-Postbote.gs` ersetzen (kleine Korrektur im Kalender-Abo).
> 4. Auf jedem Gerät **Mehr → App & Darstellung → Neueste Version laden** (Version 14).
> 5. Alles Weitere – Server-Dienste, Abos, Store-Veröffentlichung – steht Schritt für Schritt in **VEROEFFENTLICHUNG.md**.

> **Update auf Version 13 (Zuständigkeit & Kalender)** – wenn MindSpace bei dir schon läuft:
> 1. **GitHub → Add file → Upload files:** `app.js`, `store.js`, `i18n.js`, `styles.css`, `sw.js`, `firestore.rules`, `ANLEITUNG.md` an die gewohnte Stelle und `send-reminders.mjs` in den Ordner `scripts`. `config.js` nicht anfassen. → **Commit changes**.
> 2. **Firebase → Firestore Database → Regeln:** alles löschen, Inhalt der neuen `firestore.rules` einfügen → **Veröffentlichen**. (Ohne diesen Schritt kann niemand den Kalender abonnieren.)
> 3. **Postbote:** in script.google.com den gesamten Code löschen, Inhalt von `MindSpace-Postbote.gs` einfügen, speichern. Danach einmal **Bereitstellen → Neue Bereitstellung** wie in Stufe 6 beschrieben.
> 4. Auf jedem Gerät **Mehr → App & Darstellung → Neueste Version laden** (bis dort **Version 13** steht).
> 5. In der App **Mehr → Erinnerungen & Kalender → Kalender → Einrichten** und die Web-App-Adresse einfügen. Danach wird jedes Mitglied gefragt.

> **Update auf Version 10 (MindSpace)** – wenn MindSpace/Mindora bei dir schon läuft, reichen diese Schritte:
> 1. **GitHub → Add file → Upload files:** `app.js`, `store.js`, `ai.js`, `i18n.js` (neu), `styles.css`, `sw.js`, `index.html`, `manifest.webmanifest`, `firestore.rules`, `ANLEITUNG.md` an die gewohnte Stelle, dazu den Ordner-Inhalt `icons/` (alle 5 Dateien, auch `logo.svg`) in den Ordner `icons` und `send-reminders.mjs` in den Ordner `scripts`. `config.js` nicht anfassen. → **Commit changes**.
> 2. **Firebase → Firestore Database → Regeln:** alles löschen, Inhalt der neuen `firestore.rules` einfügen → **Veröffentlichen**. (Wichtig für das Einladen zu einzelnen Projekten.)
> 3. **Postbote:** in script.google.com den gesamten Code löschen, Inhalt von `MindSpace-Postbote.gs` einfügen, speichern. Fragt Google beim nächsten Ausführen nach Berechtigungen, **zulassen**.
> 4. Auf jedem Gerät unter **Mehr → App & Darstellung → Neueste Version laden**. Dort steht dann **Version 10**. Damit das neue Symbol erscheint: MindSpace vom Home-Bildschirm löschen und neu hinzufügen (Daten bleiben erhalten).

Am besten machst du das an einem privaten Computer (Windows oder Mac), mit einem Browser – installieren musst du nichts.

---

## Stufe 1 – App online stellen

1. Konto anlegen auf **github.com** (kostenlos).
2. Oben rechts **+ → New repository**.
   - Repository name: `hausplaner`
   - **Public** auswählen (nötig für das kostenlose Hosting; deine Daten liegen dort *nicht*, nur der Programmcode)
   - **Create repository**
3. Auf der neuen Seite den Link **uploading an existing file** anklicken.
4. Die ZIP-Datei entpacken und **alle Dateien und Ordner außer dem Ordner `.github`** in das Browserfenster ziehen (also `index.html`, `app.js`, `icons`, `scripts` usw.). Unten **Commit changes**.
   > Den Ordner `.github` richtest du in Stufe 3 ein – er ist oft unsichtbar und lässt sich nicht hineinziehen.
5. **Settings → Pages**. Bei *Branch* `main` und `/ (root)` wählen, **Save**.
6. Nach 1–2 Minuten steht oben die Adresse, z. B. `https://DEINNAME.github.io/hausplaner/`.

**Auf dem iPhone:** Adresse in **Safari** öffnen → unten auf **Teilen** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → **Hinzufügen**. Ab jetzt MindSpace immer über dieses Symbol öffnen.

Die App läuft jetzt im *lokalen Modus*: alles funktioniert, die Daten bleiben aber auf diesem iPhone.

---

## Stufe 2 – Cloud für das Teilen (Firebase)

Firebase ist ein Dienst von Google. Der kostenlose Tarif „Spark“ reicht für euch beide bei Weitem; eine Kreditkarte ist nicht nötig.

### 2.1 Projekt anlegen
1. **console.firebase.google.com** öffnen, mit einem Google-Konto anmelden.
2. **Projekt erstellen** → Name `hausplaner` → Google Analytics **ausschalten** → Erstellen.

### 2.2 Web-App registrieren
1. Auf der Projektübersicht das Symbol **`</>`** (Web) anklicken.
2. Spitzname `MindSpace`, Hosting **nicht** anhaken → **App registrieren**.
3. Es erscheint ein Code-Block mit `const firebaseConfig = { apiKey: "...", ... }`. Diese Werte brauchst du gleich.

### 2.3 Werte in `config.js` eintragen
1. Auf GitHub in deinem Repository die Datei **config.js** öffnen → Stift-Symbol (Bearbeiten).
2. Die sechs Werte aus Firebase zwischen die Anführungszeichen setzen, z. B.
   ```js
   apiKey: 'AIzaSyB…',
   authDomain: 'hausplaner-1234.firebaseapp.com',
   projectId: 'hausplaner-1234',
   storageBucket: 'hausplaner-1234.firebasestorage.app',
   messagingSenderId: '1234567890',
   appId: '1:1234567890:web:abc123',
   ```
3. Noch nicht speichern – in 2.6 kommt der `vapidKey` dazu. (Oder jetzt speichern und später noch einmal bearbeiten.)

> Diese Werte sind keine Geheimnisse – jede Firebase-Web-App zeigt sie öffentlich. Geschützt sind eure Daten durch Anmeldung und die Sicherheitsregeln aus 2.5.

### 2.4 Anmeldung einschalten
1. Linkes Menü **Build → Authentication → Loslegen**.
2. Reiter **Anmeldemethode** → **E-Mail-Adresse/Passwort** → Aktivieren → Speichern.
3. Reiter **Einstellungen → Autorisierte Domains → Domain hinzufügen** → `DEINNAME.github.io` (ohne https und ohne /hausplaner).

### 2.5 Datenbank anlegen
1. **Build → Firestore Database → Datenbank erstellen**.
2. Standort **europe-west3 (Frankfurt)** → **Im Produktionsmodus starten** → Erstellen.
3. Reiter **Regeln**: alles löschen, den kompletten Inhalt der Datei **firestore.rules** hineinkopieren → **Veröffentlichen**.

### 2.6 Schlüssel für Push-Nachrichten
1. Zahnrad oben links → **Projekteinstellungen → Cloud Messaging**.
2. Unten bei **Web-Push-Zertifikate → Schlüsselpaar generieren**.
3. Den langen Schlüssel kopieren und in `config.js` bei `vapidKey: ''` einsetzen.
4. Auf GitHub **Commit changes**.

### 2.7 Loslegen
1. MindSpace auf dem iPhone schließen (in der App-Übersicht nach oben wischen) und neu öffnen. Es erscheint die Anmeldung.
2. **Konto erstellen** → **Loslegen**. Aufgaben aus dem lokalen Modus werden auf Wunsch übernommen.
3. **Mehr → Familie & Teilen → Jemanden einladen** → **Einladung senden** (z. B. per WhatsApp an deine Frau).
4. Deine Frau öffnet den Link in Safari, fügt die App zum Home-Bildschirm hinzu, erstellt ein Konto und gibt den Code ein.

---

## Stufe 3 – Push-Erinnerungen

Ein kleines Programm in deinem GitHub-Repository schaut alle 5 Minuten nach fälligen Erinnerungen und schickt sie an eure iPhones. Das ist kostenlos.

### 3.1 Zugangsschlüssel aus Firebase holen
1. Firebase → **Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel generieren**.
2. Es wird eine `.json`-Datei heruntergeladen.
   > **Diese Datei ist geheim.** Nicht weitergeben, nicht ins Repository hochladen. Nach Schritt 3.2 kannst du sie löschen.

### 3.2 Schlüssel bei GitHub hinterlegen
1. GitHub-Repository → **Settings → Secrets and variables → Actions**.
2. Reiter **Secrets** → **New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: die `.json`-Datei mit einem Texteditor öffnen und den **gesamten Inhalt** hineinkopieren → **Add secret**.
3. Reiter **Variables** → **New repository variable**
   - Name: `APP_URL`
   - Value: deine App-Adresse mit Schrägstrich am Ende, z. B. `https://DEINNAME.github.io/hausplaner/`

### 3.3 Zeitplan anlegen
1. Repository-Startseite → **Add file → Create new file**.
2. Als Dateiname genau eintippen: `.github/workflows/reminders.yml` (GitHub legt die Ordner beim Tippen der Schrägstriche an).
3. Den Inhalt der Datei `reminders.yml` (liegt im Hauptordner der ZIP) hineinkopieren → **Commit changes**.

### 3.4 Push auf dem iPhone aktivieren und testen
1. MindSpace vom Home-Bildschirm öffnen → **Mehr → Erinnerungen & Kalender → Push-Nachrichten → Aktivieren** → **Erlauben**. (Deine Frau macht das auf ihrem iPhone genauso.)
2. GitHub → Reiter **Actions** → links **MindSpace** → **Run workflow** → Haken „Test-Nachricht“ lassen → **Run workflow**.
3. Nach etwa einer Minute kommt auf beiden iPhones „Test: Push-Nachrichten funktionieren.“

Ab jetzt läuft alles von selbst:
- **Erinnerungen** zur eingestellten Zeit jeder Aufgabe (Standard: 1 Tag vorher, 18 Uhr). GitHub startet den Zeitplan manchmal einige Minuten später.
- **Morgen-Übersicht** ab 7 Uhr, wenn etwas heute fällig oder überfällig ist.

---

## Stufe 4 – KI-Assistent

Der KI-Assistent nutzt **Claude von Anthropic**. Er liest eingefügte E-Mails und macht daraus Aufgaben mit Fristen und Vorlaufzeit, legt Ansprechpartner mit Kontaktdaten an, schreibt Mail-Entwürfe und prüft jeden Morgen, ob die offenen Aufgaben bis zur Frist noch zu schaffen sind.

**Kosten:** Abgerechnet wird nach Verbrauch über ein Guthaben, das du vorher auflädst. Eine E-Mail auswerten oder eine Mail entwerfen kostet meist 1–3 Cent, die tägliche Fristprüfung etwa 1 Cent pro Tag. Mit 5 € Guthaben kommt ihr in der Regel mehrere Monate aus.

**Datenschutz:** Die eingefügten Texte werden zur Auswertung an Anthropic geschickt. Laut Anthropic werden über die API gesendete Daten standardmäßig nicht zum Trainieren der KI verwendet.

### 4.1 API-Schlüssel besorgen
1. **console.anthropic.com** öffnen und ein Konto anlegen.
2. Unter **Billing** (Abrechnung) Guthaben aufladen, z. B. 5 $.
3. Unter **Limits** ein monatliches Ausgabelimit setzen, z. B. 5 $. So kann nie mehr verbraucht werden.
4. Unter **API Keys** → **Create Key** → Name `MindSpace` → Schlüssel kopieren. Er beginnt mit `sk-ant-` und wird nur **einmal** angezeigt.

### 4.2 In der App eintragen
1. MindSpace öffnen → **Mehr → KI & E-Mail-Eingang → Einrichten**.
2. Schlüssel einfügen, Modell **Claude Sonnet 5.5** lassen → **Prüfen und speichern**.

Der Schlüssel wird in eurem Bauprojekt gespeichert. Deine Frau kann die KI damit ebenfalls nutzen, und die tägliche Fristprüfung (Stufe 3) verwendet ihn automatisch. An GitHub musst du dafür nichts ändern.

---

## Stufe 5 – E-Mail-Eingang (Gmail, jede Minute)

MindSpace bekommt ein eigenes Gmail-Postfach. Ein kleines Programm – der **MindSpace-Postbote** – läuft direkt in diesem Gmail-Konto bei Google und schaut **jede Minute** nach neuen Mails. Es lässt sie von der KI auswerten, legt Aufgaben (markiert als **neu**) und Kontakte an, speichert die Mail in der Ablage und schickt dir eine Push-Nachricht. Kostenlos, ohne App-Passwort. Voraussetzung: Stufe 2, 3 und 4 sind eingerichtet.

### 5.1 Neues Gmail-Konto
Auf **accounts.google.com** ein neues Google-Konto anlegen, z. B. `mindora.deinname@gmail.com` – nur für MindSpace, nicht dein privates.

### 5.2 Postbote anlegen
1. Mit dem **MindSpace-Gmail-Konto** angemeldet **script.google.com** öffnen (oben rechts prüfen, dass das richtige Konto aktiv ist).
2. **Neues Projekt**. Oben links auf „Unbenanntes Projekt“ klicken → Name `MindSpace Postbote` → **Umbenennen**.
3. Im Editor den vorhandenen Text (`function myFunction() …`) komplett löschen.
4. Die Datei **`MindSpace-Postbote.gs`** mit einem Texteditor öffnen, **alles** kopieren und einfügen. Mit dem Disketten-Symbol (oder Strg+S) speichern.

### 5.3 Zugang zu Firebase hinterlegen
1. Links auf das **Zahnrad (Projekteinstellungen)**.
2. Ganz unten **Skripteigenschaften → Skripteigenschaft hinzufügen**:
   - Eigenschaft: `FIREBASE_SERVICE_ACCOUNT`
   - Wert: der **gesamte Inhalt** der Firebase-`.json`-Datei aus Schritt 3.1. (Hast du sie gelöscht: in Firebase unter Projekteinstellungen → Dienstkonten einfach einen neuen privaten Schlüssel erzeugen.)
3. **Skripteigenschaft hinzufügen** → Eigenschaft `APP_URL`, Wert: deine App-Adresse, z. B. `https://DEINNAME.github.io/hausplaner/`
4. **Skripteigenschaften speichern**.

### 5.4 Einschalten
1. Links auf **Editor** (Symbol `< >`).
2. Oben in der Leiste im Auswahlfeld neben „Ausführen“ die Funktion **`einrichten`** wählen → **Ausführen**.
3. Google fragt nach Berechtigungen: **Berechtigungen prüfen** → MindSpace-Konto wählen → es erscheint „Google hat diese App nicht überprüft“. Das ist normal, weil es dein eigenes Programm ist: **Erweitert** → **Zu MindSpace Postbote (unsicher) wechseln** → **Zulassen**.
4. Unten im **Ausführungsprotokoll** erscheinen grüne Häkchen:
   „✓ Firebase-Zugang gefunden“, „✓ Gemeinsamer Bereich …“, „✓ Zeitplan eingerichtet …“.

Ab jetzt läuft der Postbote von selbst jede Minute – auch wenn der Computer aus ist.

### 5.5 Alten GitHub-Abruf abschalten
Falls du vorher `INBOX_USER` und `INBOX_PASSWORD` bei GitHub eingetragen hast: unter **Settings → Secrets and variables → Actions** beide **löschen** (Mülleimer). Sonst lesen zwei Programme dasselbe Postfach.

### 5.6 Testen
1. Eine E-Mail an die MindSpace-Adresse weiterleiten – **von der Adresse, mit der du bei MindSpace angemeldet bist**.
2. Nach 1–2 Minuten kommt „📬 … neue Aufgaben“. In MindSpace steht sie unter **Eingang → Neu**.

**Was passiert mit anderen Absendern?** MindSpace liest nur Mails von euren eigenen Adressen und von erlaubten Absendern. Kommt etwas von einem anderen Absender (z. B. weil du bei GMX eine automatische Weiterleitung für allkauf eingerichtet hast), zeigt MindSpace unter **Eingang** „Nicht gelesen: …“ mit einem Knopf **Erlauben**. Danach die Mail einmal neu weiterleiten.

**Nachsehen, was der Postbote macht:** script.google.com → MindSpace Postbote → links **Ausführungen**. Jede Minute steht dort ein Lauf; bei verarbeiteten Mails steht im Protokoll z. B. „Verarbeitet: „Bauvorhaben“ – 2 neue Aufgaben“ oder „Ignoriert: … Absender ist nicht erlaubt“. In Gmail bekommen verarbeitete Mails das Label **MindSpace**.

---

## Stufe 6 – Aufgaben im Handy-Kalender (optional)

Jedes Mitglied kann seine Aufgaben als eigenen Kalender **„MindSpace“** im iPhone-, Android-, Outlook- oder Google-Kalender sehen. Nichts wird automatisch eingetragen: Nach der Einrichtung fragt MindSpace **jedes Mitglied einzeln** (in der App und per Push), ob es das möchte – „alle Aufgaben“, „nur meine Aufgaben“ oder „nein“. Neue und geänderte Aufgaben kommen danach von selbst im Kalender an. Den Kalender liefert der Postbote aus Stufe 5.

### 6.1 Postbote als Web-App bereitstellen
1. Am Computer **script.google.com** öffnen (mit dem MindSpace-Gmail-Konto) → Projekt **MindSpace-Postbote**. Der Code muss Version 13 sein (siehe Update-Kasten oben).
2. Oben rechts **Bereitstellen → Neue Bereitstellung**. Beim Zahnrad neben „Typ auswählen“ **Web-App** wählen.
3. Beschreibung: `Kalender` · Ausführen als: **Ich** · Wer hat Zugriff: **Jeder** → **Bereitstellen**. Fragt Google nach Berechtigungen → **Zugriff erlauben**.
4. Die **Web-App-URL** kopieren (beginnt mit `https://script.google.com/macros/s/` und endet auf `/exec`).

> „Jeder“ heißt nur: Kalender-Apps dürfen den Link ohne Google-Anmeldung abrufen. Ohne den persönlichen geheimen Schlüssel eines Mitglieds liefert die Adresse keine einzige Aufgabe. Ein Mitglied mit eingeschränktem Zugriff sieht auch im Kalender nur seine freigegebenen Projekte.

### 6.2 In MindSpace eintragen
**Mehr → Erinnerungen & Kalender → Kalender → Einrichten** → URL einfügen → **Prüfen & speichern**. Ab jetzt wird jedes Mitglied beim nächsten Öffnen gefragt.

### 6.3 Was jedes Mitglied tut
1. Bei der Frage „Aufgaben in deinen Kalender?“ **Ja, alle Aufgaben** oder **Ja, nur meine Aufgaben** wählen.
2. **Jetzt abonnieren** tippen → das iPhone fragt „Kalenderabonnement hinzufügen?“ → **Abonnieren** → **Hinzufügen**.
3. Für schnelle Aktualisierung: iPhone-Einstellungen → (Apps →) Kalender → Accounts → **Datenabgleich** → „Alle 15 Minuten“.
4. Am Computer (Outlook, Google Kalender): **Mehr → Erinnerungen & Kalender → Kalender → Adresse kopieren** und dort „Kalender aus dem Internet abonnieren“ bzw. „Per URL hinzufügen“.

Ändern oder beenden: **Mehr → Erinnerungen & Kalender → Kalender**. Beim Beenden wird der Link sofort ungültig; den Kalender „MindSpace“ dann noch im Handy löschen (Kalender-App → Kalender → ⓘ → Kalender löschen).

> **Hinweis:** Das Abo ist eine Ansicht – Termine, die du im Handy-Kalender verschiebst, ändern die Aufgabe in MindSpace nicht. Erledigte Aufgaben erscheinen mit ✅, überfällige mit 🔴. Ohne Abo gibt es in jeder Aufgabe den Knopf **📅 In Kalender** für einen einmaligen Eintrag (am besten am Computer).

---

## MindSpace am Computer

MindSpace läuft auch auf Windows-PC und Mac als eigenes Programm – mit eigenem Fenster und Symbol in Taskleiste oder Dock. Es ist dieselbe App wie auf dem iPhone, alle Daten sind sofort überall gleich. Eine Installation mit Admin-Rechten ist nicht nötig.

**Windows mit Microsoft Edge (empfohlen)**
1. In Edge deine MindSpace-Adresse öffnen (z. B. `https://bams1988.github.io/hausplaner/`) und anmelden.
2. Oben rechts auf **…** → **Apps** → **Diese Website als App installieren** → **Installieren**.
3. Im Fenster, das danach kommt, **An Taskleiste anheften** und **Desktopverknüpfung erstellen** anhaken.

**Windows oder Mac mit Google Chrome**
In der Adresszeile rechts auf das Symbol **Installieren** klicken (Bildschirm mit Pfeil) – oder Menü **⋮** → **Streamen, speichern und teilen** → **Seite als App installieren**.

**Mac mit Safari**
Menü **Ablage** → **Zum Dock hinzufügen**.

Alternativ in MindSpace unter **Mehr → App & Darstellung → Als Programm installieren** (Edge und Chrome).

**Am Computer gibt es zusätzlich:**
- Seitenleiste links statt Leiste unten, breite Übersicht in zwei Spalten, Monatskalender mit Aufgabentiteln.
- Tastenkürzel: **N** = neue Aufgabe, **M** = diktieren, **A** = Assistent, **S** = suchen, **1–5** = Übersicht, Aufgaben, Plan, Eingang, Mehr, **Esc** = schließen.
- Dateien (PDF, Fotos) einfach mit der Maus in eine geöffnete Aufgabe, Zahlung oder in „Fotos & Dokumente“ ziehen.
- Rechtsklick auf das MindSpace-Symbol in der Taskleiste: **Neue Aufgabe**, **Planer**, **Eingang**, **Kosten**.
- Push-Nachrichten: unter **Mehr → Erinnerungen & Kalender → Push-Nachrichten → Aktivieren** – auf jedem Computer einmal.

**Hinweis Firmen-PC:** Manche Firmen sperren das Installieren von Web-Apps oder Benachrichtigungen. Dann MindSpace einfach als Lesezeichen im Browser nutzen – funktioniert genauso, nur im Browser-Tab.

## So benutzt du MindSpace

**Suchen:** Lupe oben rechts (am Computer links in der Seitenleiste oder **Strg+K**). Tippen findet sofort Aufgaben, Kommentare, Fotos & Dokumente, Kosten, Kontakte und E-Mails. Mit **Enter** oder dem **Mikrofon** fragst du die KI, z. B. „Wo ist nochmal der Bauvertrag?“ – sie zeigt, in welchem Projekt und an welcher Aufgabe die Datei liegt, und du öffnest sie direkt.

**Neue Aufgabe:** Plus unten rechts (am Computer Taste **N**). Schreiben oder **Diktieren** antippen (am Computer Taste **M**), z. B. „Zahnarzt Dienstag 9 Uhr #familie“ – Datum, Uhrzeit und Bereich siehst du sofort, **Anlegen** tippen. Viel Text oder mehrere Dinge auf einmal („Morgen die Bank anrufen und jeden Dienstag Müll rausbringen“)? **Mit KI erkennen** macht daraus mehrere Aufgaben. Klappt das Mitschreiben nicht, nutze das Mikrofon der iPhone-Tastatur.

**Assistent:** Oben **✨ Assistent** (am Computer Taste **A**). Er kennt eure Aufgaben, Projekte, Kosten und Kontakte und beantwortet Fragen wie „Was steht diese Woche an?“ oder „Fass das Projekt Hausbau zusammen“. In einer Aufgabe gibt **✨ Assistent** Rat genau dazu, im Projekt fasst **✨ Zusammenfassung** den Stand zusammen. Jede Frage zählt als eine KI-Aktion.

**Tour und Anleitung:** **Mehr → Hilfe → Tour durch die App** zeigt die wichtigsten Stellen direkt in der App. **Mehr → Hilfe → Anleitung** erklärt jede Funktion – mit Knöpfen, die dich direkt hinführen.

**Bündeln statt doppelt:** Passt etwas Neues zu einer offenen Aufgabe (gleicher Vorgang), legt MindSpace keine zweite an. Die neue Info landet als Eintrag im **Verlauf** der vorhandenen Aufgabe, eine frühere Frist wird übernommen. Das gilt für das Plus (schreiben oder diktieren), eingefügte E-Mails und den E-Mail-Eingang. Beim Einfügen kannst du das Bündeln je Aufgabe abwählen; beim Plus hilft „Doch neu“.

**Anhänge aus E-Mails:** Der Postbote liest PDFs und Bilder im Anhang mit (z. B. Unterlagenlisten, Rechnungen, Bescheide). Wichtige Angaben fließen in Aufgaben und Zahlungen ein, die Anhänge werden an der passenden Aufgabe bzw. Zahlung abgelegt und gehören damit zum Projekt. Jede Datei bekommt eine kurze Beschreibung – so findet die Suche auch Inhalte.

**Einladen – zu allem oder zu einzelnen Projekten:** **Mehr → Familie & Teilen → Jemanden einladen**. „Alle Projekte“ für deine Partnerin, „Nur bestimmte Projekte“ z. B. für Großeltern (nur Familie) oder einen Bauberater (nur Hausbau). Eingeschränkte Mitglieder sehen nur Aufgaben, Kosten, Dateien und Kommentare ihrer Projekte – keine E-Mail-Ablage, keinen KI-Schlüssel, keine Einstellungen – und bekommen nur dazu Push-Nachrichten. Unter **Mehr → Familie & Teilen** tippst du auf eine Person, um ihren Zugriff zu ändern oder sie zu entfernen.

**Sprache & Design:** **Mehr → App & Darstellung**: Deutsch oder Englisch, Hell, Dunkel oder Automatisch (wie das System). Die KI antwortet und Push-Nachrichten kommen in der gewählten Sprache.

**Face ID / Fingerabdruck:** **Mehr → App & Darstellung → Sicherheit → Einschalten**. Danach ist MindSpace beim Öffnen (und nach 2 Minuten im Hintergrund) gesperrt und wird mit Face ID, Touch ID oder Windows Hello entsperrt. Die erste Anmeldung pro Gerät bleibt mit E-Mail und Passwort; „Stattdessen mit Passwort anmelden“ hilft, falls die Biometrie mal nicht klappt.


**Übersicht:** Oben Suche und Assistent. Darunter vier Kacheln (Heute, Überfällig, Jetzt starten, 7 Tage) – antippen zeigt die passenden Aufgaben. Dazu Wochenblick, Projekte und Kosten.

**Gesten:** Aufgabe nach rechts wischen = erledigt, nach links = verschieben, gedrückt halten und auf einen Tag ziehen = neues Datum.

**Lebensbereiche:** Hausbau, Familie, Finanzen & Verträge, Gesundheit und Alltag sind vorbereitet. Unter **Mehr → Lebensbereiche** legst du eigene an (z. B. Urlaub, Auto, Kinder), mit Symbol, Farbe und optionalen Abschnitten für den Plan.

**Plan:** **7 Tage** (jeder Tag ein Abschnitt), **Monat** (Kalender mit Punkten) und **Projekte** (Fortschritt Schritt für Schritt, dazu Kosten und Fotos des Projekts).

**Wiederkehrende Aufgaben:** In der Aufgabe unter **Wiederholen** (täglich, werktags, wöchentlich, alle 2 Wochen, monatlich, vierteljährlich, jährlich) – oder direkt beim Plus: „jeden Montag“, „monatlich“, „jährlich“. Beim Abhaken legt MindSpace den nächsten Termin automatisch an.

**Kosten & Zahlungen:** **Mehr → Kosten** (oder im Projekt Hausbau). Mit **Ratenplan aus Vorlage** legst du die Abschläge nach Baufortschritt an – Gesamtpreis eintragen, Prozente aus eurem allkauf-Vertrag übernehmen. Dazu kommen Rechnungen, Sonderwünsche und Nebenkosten. Mit **Budget festlegen** siehst du, wie viel Puffer bleibt. Haken = bezahlt. Für offene Zahlungen mit Datum kommt 3 Tage vorher und am Fälligkeitstag eine Push-Nachricht. Rechnungen in E-Mails erkennt die KI und legt sie hier an.

**Fotos & Dokumente:** In jeder Aufgabe und jeder Zahlung unter **Fotos & Dateien** – Foto aufnehmen oder Datei/PDF wählen. Alles zusammen unter **Mehr → Dokumente**. Fotos werden automatisch verkleinert, Dateien bis 15 MB. **Öffnen / Sichern** gibt die Datei an andere Apps weiter (z. B. „In Dateien sichern“).

**Kommentare:** Unten in jeder Aufgabe steht der **Verlauf** (angelegt, erledigt von wem) und darunter das Kommentarfeld. Die anderen bekommen eine Push-Nachricht. In der Liste zeigen 💬 und 📎, wo es Kommentare oder Dateien gibt.

**E-Mails einlesen:** Weiterleiten an das MindSpace-Postfach (Stufe 5) – oder im Mail-Programm den Text markieren und kopieren → **Eingang → Einfügen** → einfügen → auswerten. Die App erkennt Bitten („Bitte senden Sie…“, „Wir benötigen…“), Fragen an dich, Fristen („bis spätestens 06.11.“, „innerhalb von 14 Tagen“, „KW 47“) und Termine. Du prüfst die Vorschläge, passt sie an und übernimmst sie. Die E-Mail wird auf Wunsch unter **Eingang → Ablage** gespeichert.

**Allkauf-App:** Text dort markieren und einfügen – oder einen **Screenshot** machen und unter **Eingang → Einfügen → Screenshot lesen** wählen. Die Texterkennung läuft im iPhone selbst; beim ersten Mal lädt sie ca. 15 MB.

**Mit KI-Assistent** heißt der Knopf **Mit KI auswerten**. Die KI schlägt vor:
- Aufgaben mit Frist (oder einem eigenen Vorschlag, wenn nur „zeitnah“ dasteht) und **Vorlauf** – wie viele Tage du vor der Frist anfangen musst, z. B. weil die Bank zwei Wochen braucht,
- **Kontakte** aus den Signaturen (Name, Rolle, Firma, E-Mail, Telefon), die unter **Kontakte** landen und mit den Aufgaben verknüpft werden.

Du prüfst alles und tippst auf **Übernehmen**. Ohne KI-Assistent arbeitet die Erkennung mit festen Regeln. Sie findet typische Formulierungen zuverlässig, übersieht aber frei formulierte Aufgaben.

**Jetzt angehen:** Jede Aufgabe mit Frist und Vorlauf hat einen Starttermin. Ist der erreicht, steht sie oben auf dem gelben Schild und trägt ein Kennzeichen: **Jetzt angehen**, **Wird knapp** oder **Kaum zu schaffen**. Mit KI-Assistent schätzt Claude jeden Morgen alle Fristen neu ein (Wartezeiten, Wochenenden, Feiertage) und nennt den nächsten Schritt. Wird eine Aufgabe neu dringend, kommt eine Push-Nachricht. In jeder Aufgabe kannst du die Einschätzung mit **Mit KI neu einschätzen** sofort aktualisieren.

**E-Mails schreiben:** In einer Aufgabe auf **E-Mail an …** tippen, oder unter **Kontakte** auf das Briefsymbol. Mit **Mit KI formulieren** schreibt Claude einen passenden Entwurf, optional nach deiner Vorgabe („um Fristverlängerung bitten“). **In Mail-App öffnen** übergibt alles fertig ausgefüllt an deine Mail-App. Dort tippst du auf Senden, so geht die Mail von deiner eigenen Adresse raus. In der Aufgabe wird vermerkt, dass du geschrieben hast. Über das Telefonsymbol rufst du direkt an.

**Checkliste:** Unter **Mehr → Lebensbereiche → Checkliste Hausbau** gibt es eine Startliste vom Bauantrag bis zur Abnahme.

**Sicherung:** Unter **Mehr → Konto & Daten → Sicherung speichern** alle paar Wochen eine Datei in iCloud ablegen.

---

### Zuständigkeit übergeben
In einer Aufgabe unter **Weitere Angaben → Zuständig** eine Person wählen. Sie bekommt sofort eine Push-Nachricht („📌 Neue Aufgabe für dich“) und sieht die Aufgabe auf der Übersicht unter **Für dich**. Mit **Übernehmen** bestätigt sie (alle sehen im Verlauf „👍 Übernommen“), mit **Zurückgeben** geht die Aufgabe mit kurzem Grund an dich zurück. Solange nicht bestätigt ist, hat das Namenskürzel in der Liste einen orangen Ring.

## Warum keine direkte Verbindung zur Allkauf-App?

Allkauf bietet keine öffentliche Schnittstelle. Der Login ist mit Google Authenticator gesichert: Bei jeder Anmeldung wird ein neuer 6-stelliger Code verlangt. Eine automatische Verbindung ginge nur, wenn der geheime Authenticator-Schlüssel in MindSpace gespeichert würde und das Programm die Allkauf-Seite wie ein Mensch bedient. Das ist unsicher (wer den Schlüssel hat, hat euren Zugang), bricht bei jeder Änderung der Allkauf-App und verstößt sehr wahrscheinlich gegen deren Nutzungsbedingungen. Kopieren oder Screenshot sind der sichere Weg. Frag Allkauf ruhig, ob es eine Exportfunktion oder E-Mail-Benachrichtigungen gibt – die kannst du dann direkt einlesen.

---

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Nach Änderungen an config.js passiert nichts | App komplett schließen und neu öffnen. Notfalls 2 Minuten warten (GitHub braucht kurz) und erneut öffnen. |
| „Diese Web-Adresse ist in Firebase noch nicht freigegeben“ | Schritt 2.4.3: `DEINNAME.github.io` bei den autorisierten Domains eintragen. |
| „Keine Berechtigung …“ | Schritt 2.5.3: Regeln aus `firestore.rules` veröffentlichen. |
| Push lässt sich nicht aktivieren | App muss vom **Home-Bildschirm** gestartet sein, iOS 16.4 oder neuer. Falls einmal abgelehnt: iPhone-Einstellungen → Mitteilungen → MindSpace → Erlauben. |
| Test-Nachricht kommt nicht | GitHub → Actions → letzten Lauf öffnen und die rote Meldung lesen. Häufig: Secret nicht vollständig kopiert, oder Push auf dem iPhone noch nicht aktiviert. |
| „Der API-Schlüssel ist ungültig“ | Schlüssel in der Anthropic Console neu erzeugen und unter Mehr → KI & E-Mail-Eingang eintragen. |
| „Guthaben aufgebraucht“ | In der Anthropic Console unter Billing Guthaben aufladen. |
| Keine „Jetzt angehen“-Push | Kommt einmal morgens ab 7 Uhr und nur, wenn eine Aufgabe **neu** dringend wird. Die Aufgabe braucht Frist und Vorlauf. |
| Erinnerungen kommen gar nicht mehr | GitHub → Actions → „MindSpace“ → falls dort „disabled“ steht: **Enable workflow**. |
| Weitergeleitete Mail ergibt keine Aufgabe | script.google.com → MindSpace Postbote → **Ausführungen** → letzten Lauf öffnen und die Meldung lesen. „Ignoriert“: von deiner MindSpace-Login-Adresse weiterleiten oder den Absender in der App erlauben. |
| „Es gibt mehrere gemeinsame Bereiche“ | Die Meldung nennt die IDs. Die richtige im Postboten unter Projekteinstellungen → Skripteigenschaften als `PROJEKT_ID` eintragen. |

**Kosten:** GitHub Pages, GitHub Actions (öffentliches Repository) und Firebase Spark sind kostenlos. Für zwei Personen bleibt ihr weit unter allen Grenzen. Nur der optionale KI-Assistent kostet etwas, siehe Stufe 4.

---

## Umstieg vom Hausplaner

Deine Daten, Konten, Firebase und die GitHub-Einstellungen bleiben, wie sie sind. Bisherige Aufgaben landen automatisch im Bereich **Hausbau**.

1. Entpacke `mindora-update.zip`.
2. GitHub-Repository → **Add file → Upload files** → alle Dateien und den Ordner **icons** aus dem Hauptordner der ZIP hineinziehen → **Commit changes**. Bestehende Dateien werden ersetzt. **`config.js` ist nicht dabei und bleibt unverändert.**
3. Den Ordner **scripts** öffnen → **Add file → Upload files** → die drei Dateien aus dem ZIP-Ordner `scripts` hochladen (`inbox.mjs` ist neu) → **Commit changes**.
4. Den Zeitplan ersetzen: Ordner `.github/workflows` öffnen → `reminders.yml` → Stift (Bearbeiten) → alles markieren und durch den Inhalt der neuen `reminders.yml` (Hauptordner der ZIP) ersetzen → **Commit changes**.
5. Auf dem iPhone (nur wenn die Cloud aus Stufe 2 läuft – im lokalen Modus vorher unter **Mehr → Konto & Daten → Sicherung speichern**): das alte Hausplaner-Symbol **löschen** (lange drücken → App entfernen) und die Adresse in Safari neu **zum Home-Bildschirm hinzufügen**. Nur so erscheinen der neue Name und das neue Symbol. Danach einmal anmelden und unter **Mehr → Erinnerungen & Kalender → Push-Nachrichten** neu aktivieren. Deine Frau macht das genauso.
6. Für den E-Mail-Eingang: **Stufe 5**.
