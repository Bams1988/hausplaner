# Mindora – Einrichtung

Mindora ist dein persönlicher Assistent für alle Lebensbereiche: Aufgaben, Fristen, ein Projektplan, der von selbst wächst, und ein E-Mail-Eingang, aus dem die KI Aufgaben macht. Mindora ist eine Web-App, die du auf dem iPhone zum Home-Bildschirm hinzufügst. Danach startet sie wie eine normale App: eigenes Symbol, Vollbild, Push-Nachrichten. Kein App Store, kein Mac.

Die Einrichtung hat fünf Stufen. Schon nach Stufe 1 kannst du die App benutzen.

| Stufe | Was du danach hast | Zeit |
|---|---|---|
| 1. Online stellen (GitHub) | App auf dem iPhone, Daten nur auf deinem Gerät | ca. 10 Min. |
| 2. Cloud (Firebase) | Teilen mit deiner Frau, Daten auf allen Geräten | ca. 15 Min. |
| 3. Erinnerungen | Push-Nachrichten zu Fristen und Morgen-Übersicht | ca. 10 Min. |
| 4. KI-Assistent | E-Mails mit KI auswerten, Kontakte, Mail-Entwürfe, tägliche Fristprüfung | ca. 10 Min. |
| 5. E-Mail-Eingang | Mails einfach weiterleiten – Aufgaben entstehen automatisch | ca. 15 Min. |

> **Du hattest schon den Hausplaner eingerichtet?** Dann lies zuerst den Abschnitt **„Umstieg vom Hausplaner“** ganz unten. Stufe 1–4 musst du nicht wiederholen.

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

**Auf dem iPhone:** Adresse in **Safari** öffnen → unten auf **Teilen** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → **Hinzufügen**. Ab jetzt Mindora immer über dieses Symbol öffnen.

Die App läuft jetzt im *lokalen Modus*: alles funktioniert, die Daten bleiben aber auf diesem iPhone.

---

## Stufe 2 – Cloud für das Teilen (Firebase)

Firebase ist ein Dienst von Google. Der kostenlose Tarif „Spark“ reicht für euch beide bei Weitem; eine Kreditkarte ist nicht nötig.

### 2.1 Projekt anlegen
1. **console.firebase.google.com** öffnen, mit einem Google-Konto anmelden.
2. **Projekt erstellen** → Name `hausplaner` → Google Analytics **ausschalten** → Erstellen.

### 2.2 Web-App registrieren
1. Auf der Projektübersicht das Symbol **`</>`** (Web) anklicken.
2. Spitzname `Mindora`, Hosting **nicht** anhaken → **App registrieren**.
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
1. Mindora auf dem iPhone schließen (in der App-Übersicht nach oben wischen) und neu öffnen. Es erscheint die Anmeldung.
2. **Konto erstellen** → **Loslegen**. Aufgaben aus dem lokalen Modus werden auf Wunsch übernommen.
3. **Mehr → Partnerin oder Partner einladen** → **Einladung senden** (z. B. per WhatsApp an deine Frau).
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
1. Mindora vom Home-Bildschirm öffnen → **Mehr → Push-Nachrichten → Aktivieren** → **Erlauben**. (Deine Frau macht das auf ihrem iPhone genauso.)
2. GitHub → Reiter **Actions** → links **Mindora** → **Run workflow** → Haken „Test-Nachricht“ lassen → **Run workflow**.
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
4. Unter **API Keys** → **Create Key** → Name `Mindora` → Schlüssel kopieren. Er beginnt mit `sk-ant-` und wird nur **einmal** angezeigt.

### 4.2 In der App eintragen
1. Mindora öffnen → **Mehr → KI-Assistent → Einrichten**.
2. Schlüssel einfügen, Modell **Claude Sonnet 5.5** lassen → **Prüfen und speichern**.

Der Schlüssel wird in eurem Bauprojekt gespeichert. Deine Frau kann die KI damit ebenfalls nutzen, und die tägliche Fristprüfung (Stufe 3) verwendet ihn automatisch. An GitHub musst du dafür nichts ändern.

---

## Stufe 5 – E-Mail-Eingang (Gmail)

Mindora bekommt ein eigenes Postfach. Alles, was du dorthin weiterleitest, liest die KI alle 15 Minuten, legt die Aufgaben an (markiert als **neu**), ergänzt Kontakte, legt die Mail in der Ablage ab und schickt dir eine Push-Nachricht. Voraussetzung: Stufe 2, 3 und 4 sind eingerichtet.

### 5.1 Neues Gmail-Konto
1. Auf **accounts.google.com** ein neues Google-Konto anlegen, z. B. `mindora.deinname@gmail.com`. Nimm ein eigenes Konto nur für Mindora – nicht dein privates.
2. **Bestätigung in zwei Schritten** einschalten: myaccount.google.com → **Sicherheit** → **Bestätigung in zwei Schritten**. (Ohne sie gibt es kein App-Passwort.)

### 5.2 App-Passwort erzeugen
1. myaccount.google.com/apppasswords öffnen (oder in den Kontoeinstellungen nach „App-Passwörter“ suchen).
2. Name `Mindora` eingeben → **Erstellen**.
3. Google zeigt ein **16-stelliges Passwort** (vier Vierergruppen). Kopieren – es wird nur einmal angezeigt. Leerzeichen sind egal.

IMAP ist bei Gmail heute immer eingeschaltet. Falls die Gmail-Einstellungen unter **Weiterleitung und POP/IMAP** doch einen IMAP-Schalter zeigen, stell ihn auf **Aktivieren**.

### 5.3 Zugang bei GitHub hinterlegen
GitHub-Repository → **Settings → Secrets and variables → Actions → Secrets → New repository secret**, zweimal:

| Name | Inhalt |
|---|---|
| `INBOX_USER` | die neue Gmail-Adresse, z. B. `mindora.deinname@gmail.com` |
| `INBOX_PASSWORD` | das 16-stellige App-Passwort aus 5.2 |

### 5.4 Testen
1. Leite eine E-Mail an die neue Adresse weiter – **von der Adresse aus, mit der du dich bei Mindora angemeldet hast**. Nur so weiß Mindora, dass sie von dir kommt.
2. GitHub → **Actions → Mindora → Run workflow**, Haken „Test-Nachricht“ dabei **entfernen** → **Run workflow**. (Oder bis zu 15 Minuten warten.)
3. Nach etwa einer Minute kommt eine Push-Nachricht „📬 … neue Aufgaben“. In Mindora steht unter **Eingang → Neu** die Adresse und die neuen Aufgaben. Mit **Passt** übernimmst du sie, mit **Weg damit** verwirfst du sie.

**Wer darf an das Postfach schreiben?** Immer erlaubt sind die Adressen, mit denen ihr bei Mindora angemeldet seid. Willst du z. B. Mails von allkauf automatisch weiterleiten lassen (Weiterleitungsregel in deinem GMX-Postfach), trag unter **Mehr → E-Mail-Eingang** `@allkauf.de` ein. Alles andere ignoriert Mindora – so entstehen keine Aufgaben aus Werbung und es entstehen keine KI-Kosten.

---

## So benutzt du Mindora

**Heute:** Der Bogen oben zeigt, wie viel du diese Woche geschafft hast. Darunter steht, was als Nächstes dran ist – mit dem konkreten nächsten Schritt.

**Lebensbereiche:** Hausbau, Familie, Finanzen & Verträge, Gesundheit und Alltag sind vorbereitet. Unter **Mehr → Lebensbereiche** legst du eigene an (z. B. Urlaub, Auto, Kinder), mit Symbol, Farbe und optionalen Abschnitten für den Plan.

**Plan:** Der Reiter **Plan** zeigt alle Aufgaben mit Datum als Zeitstrahl, gruppiert nach Abschnitten (beim Hausbau: Finanzierung, Pläne & Behörden …). Jeder Balken reicht vom Starttermin (Frist minus Vorlauf) bis zur Frist, Termine sind Rauten, die gelbe Linie ist heute. Der Plan aktualisiert sich von selbst, sobald du Aufgaben anlegst, verschiebst oder abhakst. Mit **Wochen/Monate** zoomst du, seitlich wischen scrollt.

**E-Mails einlesen:** Weiterleiten an das Mindora-Postfach (Stufe 5) – oder im Mail-Programm den Text markieren und kopieren → **Eingang → Einfügen** → einfügen → auswerten. Die App erkennt Bitten („Bitte senden Sie…“, „Wir benötigen…“), Fragen an dich, Fristen („bis spätestens 06.11.“, „innerhalb von 14 Tagen“, „KW 47“) und Termine. Du prüfst die Vorschläge, passt sie an und übernimmst sie. Die E-Mail wird auf Wunsch unter **Eingang → Ablage** gespeichert.

**Allkauf-App:** Text dort markieren und einfügen – oder einen **Screenshot** machen und unter **Eingang → Einfügen → Screenshot lesen** wählen. Die Texterkennung läuft im iPhone selbst; beim ersten Mal lädt sie ca. 15 MB.

**Mit KI-Assistent** heißt der Knopf **Mit KI auswerten**. Die KI schlägt vor:
- Aufgaben mit Frist (oder einem eigenen Vorschlag, wenn nur „zeitnah“ dasteht) und **Vorlauf** – wie viele Tage du vor der Frist anfangen musst, z. B. weil die Bank zwei Wochen braucht,
- **Kontakte** aus den Signaturen (Name, Rolle, Firma, E-Mail, Telefon), die unter **Kontakte** landen und mit den Aufgaben verknüpft werden.

Du prüfst alles und tippst auf **Übernehmen**. Ohne KI-Assistent arbeitet die Erkennung mit festen Regeln. Sie findet typische Formulierungen zuverlässig, übersieht aber frei formulierte Aufgaben.

**Jetzt angehen:** Jede Aufgabe mit Frist und Vorlauf hat einen Starttermin. Ist der erreicht, steht sie oben auf dem gelben Schild und trägt ein Kennzeichen: **Jetzt angehen**, **Wird knapp** oder **Kaum zu schaffen**. Mit KI-Assistent schätzt Claude jeden Morgen alle Fristen neu ein (Wartezeiten, Wochenenden, Feiertage) und nennt den nächsten Schritt. Wird eine Aufgabe neu dringend, kommt eine Push-Nachricht. In jeder Aufgabe kannst du die Einschätzung mit **Mit KI neu einschätzen** sofort aktualisieren.

**E-Mails schreiben:** In einer Aufgabe auf **E-Mail an …** tippen, oder unter **Kontakte** auf das Briefsymbol. Mit **Mit KI formulieren** schreibt Claude einen passenden Entwurf, optional nach deiner Vorgabe („um Fristverlängerung bitten“). **In Mail-App öffnen** übergibt alles fertig ausgefüllt an deine Mail-App. Dort tippst du auf Senden, so geht die Mail von deiner eigenen Adresse raus. In der Aufgabe wird vermerkt, dass du geschrieben hast. Über das Telefonsymbol rufst du direkt an.

**Checkliste:** Unter **Mehr → Checkliste Hausbau** gibt es eine Startliste vom Bauantrag bis zur Abnahme.

**Sicherung:** Unter **Mehr → Sicherung speichern** alle paar Wochen eine Datei in iCloud ablegen.

---

## Warum keine direkte Verbindung zur Allkauf-App?

Allkauf bietet keine öffentliche Schnittstelle. Der Login ist mit Google Authenticator gesichert: Bei jeder Anmeldung wird ein neuer 6-stelliger Code verlangt. Eine automatische Verbindung ginge nur, wenn der geheime Authenticator-Schlüssel in Mindora gespeichert würde und das Programm die Allkauf-Seite wie ein Mensch bedient. Das ist unsicher (wer den Schlüssel hat, hat euren Zugang), bricht bei jeder Änderung der Allkauf-App und verstößt sehr wahrscheinlich gegen deren Nutzungsbedingungen. Kopieren oder Screenshot sind der sichere Weg. Frag Allkauf ruhig, ob es eine Exportfunktion oder E-Mail-Benachrichtigungen gibt – die kannst du dann direkt einlesen.

---

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Nach Änderungen an config.js passiert nichts | App komplett schließen und neu öffnen. Notfalls 2 Minuten warten (GitHub braucht kurz) und erneut öffnen. |
| „Diese Web-Adresse ist in Firebase noch nicht freigegeben“ | Schritt 2.4.3: `DEINNAME.github.io` bei den autorisierten Domains eintragen. |
| „Keine Berechtigung …“ | Schritt 2.5.3: Regeln aus `firestore.rules` veröffentlichen. |
| Push lässt sich nicht aktivieren | App muss vom **Home-Bildschirm** gestartet sein, iOS 16.4 oder neuer. Falls einmal abgelehnt: iPhone-Einstellungen → Mitteilungen → Mindora → Erlauben. |
| Test-Nachricht kommt nicht | GitHub → Actions → letzten Lauf öffnen und die rote Meldung lesen. Häufig: Secret nicht vollständig kopiert, oder Push auf dem iPhone noch nicht aktiviert. |
| „Der API-Schlüssel ist ungültig“ | Schlüssel in der Anthropic Console neu erzeugen und unter Mehr → KI-Assistent eintragen. |
| „Guthaben aufgebraucht“ | In der Anthropic Console unter Billing Guthaben aufladen. |
| Keine „Jetzt angehen“-Push | Kommt einmal morgens ab 7 Uhr und nur, wenn eine Aufgabe **neu** dringend wird. Die Aufgabe braucht Frist und Vorlauf. |
| Erinnerungen kommen gar nicht mehr | GitHub → Actions → „Mindora“ → falls dort „disabled“ steht: **Enable workflow**. |
| Weitergeleitete Mail ergibt keine Aufgabe | GitHub → Actions → letzten Lauf öffnen. „Absender nicht erlaubt“: von der Adresse weiterleiten, mit der du bei Mindora angemeldet bist, oder den Absender unter Mehr → E-Mail-Eingang erlauben. „Invalid credentials“: App-Passwort neu erzeugen (5.2) und `INBOX_PASSWORD` ersetzen. |
| „Mehrere Projekte gefunden“ | Mindora → Mehr: Es gibt mehr als einen gemeinsamen Bereich in Firebase. In Firebase → Firestore → `projects` die ID eures Bereichs kopieren und bei GitHub als **Variable** `INBOX_PROJECT` eintragen. |

**Kosten:** GitHub Pages, GitHub Actions (öffentliches Repository) und Firebase Spark sind kostenlos. Für zwei Personen bleibt ihr weit unter allen Grenzen. Nur der optionale KI-Assistent kostet etwas, siehe Stufe 4.

---

## Umstieg vom Hausplaner

Deine Daten, Konten, Firebase und die GitHub-Einstellungen bleiben, wie sie sind. Bisherige Aufgaben landen automatisch im Bereich **Hausbau**.

1. Entpacke `mindora-update.zip`.
2. GitHub-Repository → **Add file → Upload files** → alle Dateien und den Ordner **icons** aus dem Hauptordner der ZIP hineinziehen → **Commit changes**. Bestehende Dateien werden ersetzt. **`config.js` ist nicht dabei und bleibt unverändert.**
3. Den Ordner **scripts** öffnen → **Add file → Upload files** → die drei Dateien aus dem ZIP-Ordner `scripts` hochladen (`inbox.mjs` ist neu) → **Commit changes**.
4. Den Zeitplan ersetzen: Ordner `.github/workflows` öffnen → `reminders.yml` → Stift (Bearbeiten) → alles markieren und durch den Inhalt der neuen `reminders.yml` (Hauptordner der ZIP) ersetzen → **Commit changes**.
5. Auf dem iPhone (nur wenn die Cloud aus Stufe 2 läuft – im lokalen Modus vorher unter **Mehr → Sicherung speichern**): das alte Hausplaner-Symbol **löschen** (lange drücken → App entfernen) und die Adresse in Safari neu **zum Home-Bildschirm hinzufügen**. Nur so erscheinen der neue Name und das neue Symbol. Danach einmal anmelden und unter **Mehr → Push-Nachrichten** neu aktivieren. Deine Frau macht das genauso.
6. Für den E-Mail-Eingang: **Stufe 5**.
