# Hausplaner – Einrichtung

Der Hausplaner ist eine Web-App, die du auf dem iPhone zum Home-Bildschirm hinzufügst. Danach startet sie wie eine normale App: eigenes Symbol, Vollbild, Push-Nachrichten. Kein App Store, kein Mac, keine Kosten.

Die Einrichtung hat drei Stufen. Schon nach Stufe 1 kannst du die App benutzen.

| Stufe | Was du danach hast | Zeit |
|---|---|---|
| 1. Online stellen (GitHub) | App auf dem iPhone, Daten nur auf deinem Gerät | ca. 10 Min. |
| 2. Cloud (Firebase) | Teilen mit deiner Frau, Daten auf allen Geräten | ca. 15 Min. |
| 3. Erinnerungen | Push-Nachrichten zu Fristen und Morgen-Übersicht | ca. 10 Min. |

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

**Auf dem iPhone:** Adresse in **Safari** öffnen → unten auf **Teilen** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → **Hinzufügen**. Ab jetzt den Hausplaner immer über dieses Symbol öffnen.

Die App läuft jetzt im *lokalen Modus*: alles funktioniert, die Daten bleiben aber auf diesem iPhone.

---

## Stufe 2 – Cloud für das Teilen (Firebase)

Firebase ist ein Dienst von Google. Der kostenlose Tarif „Spark“ reicht für euch beide bei Weitem; eine Kreditkarte ist nicht nötig.

### 2.1 Projekt anlegen
1. **console.firebase.google.com** öffnen, mit einem Google-Konto anmelden.
2. **Projekt erstellen** → Name `hausplaner` → Google Analytics **ausschalten** → Erstellen.

### 2.2 Web-App registrieren
1. Auf der Projektübersicht das Symbol **`</>`** (Web) anklicken.
2. Spitzname `Hausplaner`, Hosting **nicht** anhaken → **App registrieren**.
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
1. Hausplaner auf dem iPhone schließen (in der App-Übersicht nach oben wischen) und neu öffnen. Es erscheint die Anmeldung.
2. **Konto erstellen** → **Bauprojekt anlegen**. Aufgaben aus dem lokalen Modus werden auf Wunsch übernommen.
3. **Mehr → Partner einladen** → **Einladung senden** (z. B. per WhatsApp an deine Frau).
4. Deine Frau öffnet den Link in Safari, fügt die App zum Home-Bildschirm hinzu, erstellt ein Konto und gibt den Code ein.

---

## Stufe 3 – Push-Erinnerungen

Ein kleines Programm in deinem GitHub-Repository schaut alle 15 Minuten nach fälligen Erinnerungen und schickt sie an eure iPhones. Das ist kostenlos.

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
1. Hausplaner vom Home-Bildschirm öffnen → **Mehr → Push-Nachrichten → Aktivieren** → **Erlauben**. (Deine Frau macht das auf ihrem iPhone genauso.)
2. GitHub → Reiter **Actions** → links **Erinnerungen** → **Run workflow** → Haken „Test-Nachricht“ lassen → **Run workflow**.
3. Nach etwa einer Minute kommt auf beiden iPhones „Test: Push-Nachrichten funktionieren.“

Ab jetzt läuft alles von selbst:
- **Erinnerungen** zur eingestellten Zeit jeder Aufgabe (Standard: 1 Tag vorher, 18 Uhr). GitHub startet den Zeitplan manchmal einige Minuten später.
- **Morgen-Übersicht** ab 7 Uhr, wenn etwas heute fällig oder überfällig ist.

---

## So benutzt du den Hausplaner

**E-Mails einlesen:** Im Mail-Programm den Text der Nachricht markieren und kopieren (gern der ganze Verlauf mit „Von:“, „Gesendet:“) → Reiter **Einlesen** → einfügen → **Aufgaben finden**. Die App erkennt Bitten („Bitte senden Sie…“, „Wir benötigen…“), Fragen an dich, Fristen („bis spätestens 06.11.“, „innerhalb von 14 Tagen“, „KW 47“) und Termine. Du prüfst die Vorschläge, passt sie an und übernimmst sie. Die E-Mail wird auf Wunsch unter **Infos** abgelegt.

**Allkauf-App:** Text dort markieren und einfügen – oder einen **Screenshot** machen und unter Einlesen **Screenshot lesen** wählen. Die Texterkennung läuft im iPhone selbst; beim ersten Mal lädt sie ca. 15 MB.

**Die Erkennung arbeitet mit festen Regeln, nicht mit KI.** Sie findet die typischen Formulierungen in geschäftlichen E-Mails zuverlässig, übersieht aber ungewöhnlich formulierte Aufgaben und schlägt gelegentlich etwas vor, das keine Aufgabe ist. Deshalb prüfst du die Liste vor dem Übernehmen.

**Checkliste:** Unter **Mehr → Typische Bauherren-Aufgaben** gibt es eine Startliste vom Bauantrag bis zur Abnahme.

**Sicherung:** Unter **Mehr → Sicherung speichern** alle paar Wochen eine Datei in iCloud ablegen.

---

## Warum keine direkte Verbindung zur Allkauf-App?

Allkauf bietet keine öffentliche Schnittstelle. Der Login ist mit Google Authenticator gesichert: Bei jeder Anmeldung wird ein neuer 6-stelliger Code verlangt. Eine automatische Verbindung ginge nur, wenn der geheime Authenticator-Schlüssel im Hausplaner gespeichert würde und das Programm die Allkauf-Seite wie ein Mensch bedient. Das ist unsicher (wer den Schlüssel hat, hat euren Zugang), bricht bei jeder Änderung der Allkauf-App und verstößt sehr wahrscheinlich gegen deren Nutzungsbedingungen. Kopieren oder Screenshot sind der sichere Weg. Frag Allkauf ruhig, ob es eine Exportfunktion oder E-Mail-Benachrichtigungen gibt – die kannst du dann direkt einlesen.

---

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Nach Änderungen an config.js passiert nichts | App komplett schließen und neu öffnen. Notfalls 2 Minuten warten (GitHub braucht kurz) und erneut öffnen. |
| „Diese Web-Adresse ist in Firebase noch nicht freigegeben“ | Schritt 2.4.3: `DEINNAME.github.io` bei den autorisierten Domains eintragen. |
| „Keine Berechtigung …“ | Schritt 2.5.3: Regeln aus `firestore.rules` veröffentlichen. |
| Push lässt sich nicht aktivieren | App muss vom **Home-Bildschirm** gestartet sein, iOS 16.4 oder neuer. Falls einmal abgelehnt: iPhone-Einstellungen → Mitteilungen → Hausplaner → Erlauben. |
| Test-Nachricht kommt nicht | GitHub → Actions → letzten Lauf öffnen und die rote Meldung lesen. Häufig: Secret nicht vollständig kopiert, oder Push auf dem iPhone noch nicht aktiviert. |
| Erinnerungen kommen gar nicht mehr | GitHub → Actions → „Erinnerungen“ → falls dort „disabled“ steht: **Enable workflow**. |

**Kosten:** GitHub Pages, GitHub Actions (öffentliches Repository) und Firebase Spark sind kostenlos. Für zwei Personen bleibt ihr weit unter allen Grenzen.
