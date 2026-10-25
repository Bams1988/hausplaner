# Mindora – Einrichtung

Mindora ist dein persönlicher Assistent für alle Lebensbereiche: Aufgaben, Fristen, ein Projektplan, der von selbst wächst, und ein E-Mail-Eingang, aus dem die KI Aufgaben macht. Mindora ist eine Web-App, die du auf dem iPhone zum Home-Bildschirm hinzufügst. Danach startet sie wie eine normale App: eigenes Symbol, Vollbild, Push-Nachrichten. Kein App Store, kein Mac.

Die Einrichtung hat fünf Stufen. Schon nach Stufe 1 kannst du die App benutzen.

| Stufe | Was du danach hast | Zeit |
|---|---|---|
| 1. Online stellen (GitHub) | App auf dem iPhone, Daten nur auf deinem Gerät | ca. 10 Min. |
| 2. Cloud (Firebase) | Teilen mit deiner Frau, Daten auf allen Geräten | ca. 15 Min. |
| 3. Erinnerungen | Push-Nachrichten zu Fristen und Morgen-Übersicht | ca. 10 Min. |
| 4. KI-Assistent | E-Mails mit KI auswerten, Kontakte, Mail-Entwürfe, tägliche Fristprüfung | ca. 10 Min. |
| 5. E-Mail-Eingang | Mails einfach weiterleiten – Aufgaben entstehen innerhalb von 1–2 Minuten | ca. 15 Min. |

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

## Stufe 5 – E-Mail-Eingang (Gmail, jede Minute)

Mindora bekommt ein eigenes Gmail-Postfach. Ein kleines Programm – der **Mindora-Postbote** – läuft direkt in diesem Gmail-Konto bei Google und schaut **jede Minute** nach neuen Mails. Es lässt sie von der KI auswerten, legt Aufgaben (markiert als **neu**) und Kontakte an, speichert die Mail in der Ablage und schickt dir eine Push-Nachricht. Kostenlos, ohne App-Passwort. Voraussetzung: Stufe 2, 3 und 4 sind eingerichtet.

### 5.1 Neues Gmail-Konto
Auf **accounts.google.com** ein neues Google-Konto anlegen, z. B. `mindora.deinname@gmail.com` – nur für Mindora, nicht dein privates.

### 5.2 Postbote anlegen
1. Mit dem **Mindora-Gmail-Konto** angemeldet **script.google.com** öffnen (oben rechts prüfen, dass das richtige Konto aktiv ist).
2. **Neues Projekt**. Oben links auf „Unbenanntes Projekt“ klicken → Name `Mindora Postbote` → **Umbenennen**.
3. Im Editor den vorhandenen Text (`function myFunction() …`) komplett löschen.
4. Die Datei **`Mindora-Postbote.gs`** mit einem Texteditor öffnen, **alles** kopieren und einfügen. Mit dem Disketten-Symbol (oder Strg+S) speichern.

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
3. Google fragt nach Berechtigungen: **Berechtigungen prüfen** → Mindora-Konto wählen → es erscheint „Google hat diese App nicht überprüft“. Das ist normal, weil es dein eigenes Programm ist: **Erweitert** → **Zu Mindora Postbote (unsicher) wechseln** → **Zulassen**.
4. Unten im **Ausführungsprotokoll** erscheinen grüne Häkchen:
   „✓ Firebase-Zugang gefunden“, „✓ Gemeinsamer Bereich …“, „✓ Zeitplan eingerichtet …“.

Ab jetzt läuft der Postbote von selbst jede Minute – auch wenn der Computer aus ist.

### 5.5 Alten GitHub-Abruf abschalten
Falls du vorher `INBOX_USER` und `INBOX_PASSWORD` bei GitHub eingetragen hast: unter **Settings → Secrets and variables → Actions** beide **löschen** (Mülleimer). Sonst lesen zwei Programme dasselbe Postfach.

### 5.6 Testen
1. Eine E-Mail an die Mindora-Adresse weiterleiten – **von der Adresse, mit der du bei Mindora angemeldet bist**.
2. Nach 1–2 Minuten kommt „📬 … neue Aufgaben“. In Mindora steht sie unter **Eingang → Neu**.

**Was passiert mit anderen Absendern?** Mindora liest nur Mails von euren eigenen Adressen und von erlaubten Absendern. Kommt etwas von einem anderen Absender (z. B. weil du bei GMX eine automatische Weiterleitung für allkauf eingerichtet hast), zeigt Mindora unter **Eingang** „Nicht gelesen: …“ mit einem Knopf **Erlauben**. Danach die Mail einmal neu weiterleiten.

**Nachsehen, was der Postbote macht:** script.google.com → Mindora Postbote → links **Ausführungen**. Jede Minute steht dort ein Lauf; bei verarbeiteten Mails steht im Protokoll z. B. „Verarbeitet: „Bauvorhaben“ – 2 neue Aufgaben“ oder „Ignoriert: … Absender ist nicht erlaubt“. In Gmail bekommen verarbeitete Mails das Label **Mindora**.

---

## Mindora am Computer

Mindora läuft auch auf Windows-PC und Mac als eigenes Programm – mit eigenem Fenster und Symbol in Taskleiste oder Dock. Es ist dieselbe App wie auf dem iPhone, alle Daten sind sofort überall gleich. Eine Installation mit Admin-Rechten ist nicht nötig.

**Windows mit Microsoft Edge (empfohlen)**
1. In Edge deine Mindora-Adresse öffnen (z. B. `https://bams1988.github.io/hausplaner/`) und anmelden.
2. Oben rechts auf **…** → **Apps** → **Diese Website als App installieren** → **Installieren**.
3. Im Fenster, das danach kommt, **An Taskleiste anheften** und **Desktopverknüpfung erstellen** anhaken.

**Windows oder Mac mit Google Chrome**
In der Adresszeile rechts auf das Symbol **Installieren** klicken (Bildschirm mit Pfeil) – oder Menü **⋮** → **Streamen, speichern und teilen** → **Seite als App installieren**.

**Mac mit Safari**
Menü **Ablage** → **Zum Dock hinzufügen**.

Alternativ in Mindora unter **Mehr → App → Als Programm installieren** (Edge und Chrome).

**Am Computer gibt es zusätzlich:**
- Seitenleiste links statt Leiste unten, breite Übersicht in zwei Spalten, Monatskalender mit Aufgabentiteln.
- Tastenkürzel: **N** = neue Aufgabe, **/** = Schnelleingabe, **1–5** = Übersicht, Aufgaben, Plan, Eingang, Mehr, **Esc** = schließen.
- Dateien (PDF, Fotos) einfach mit der Maus in eine geöffnete Aufgabe, Zahlung oder in „Fotos & Dokumente“ ziehen.
- Rechtsklick auf das Mindora-Symbol in der Taskleiste: **Neue Aufgabe**, **Planer**, **Eingang**, **Kosten**.
- Push-Nachrichten: unter **Mehr → Push-Nachrichten → Aktivieren** – auf jedem Computer einmal.

**Hinweis Firmen-PC:** Manche Firmen sperren das Installieren von Web-Apps oder Benachrichtigungen. Dann Mindora einfach als Lesezeichen im Browser nutzen – funktioniert genauso, nur im Browser-Tab.

## So benutzt du Mindora

**Übersicht:** Oben die Schnelleingabe („Bank anrufen morgen 10 Uhr #hausbau“, „Müll rausbringen jeden Dienstag“). Darunter vier Kacheln (Heute, Überfällig, Jetzt starten, 7 Tage) – antippen zeigt die passenden Aufgaben. Dazu Wochenblick, Kosten und Projekte.

**Gesten:** Aufgabe nach rechts wischen = erledigt, nach links = verschieben, gedrückt halten und auf einen Tag ziehen = neues Datum.

**Lebensbereiche:** Hausbau, Familie, Finanzen & Verträge, Gesundheit und Alltag sind vorbereitet. Unter **Mehr → Lebensbereiche** legst du eigene an (z. B. Urlaub, Auto, Kinder), mit Symbol, Farbe und optionalen Abschnitten für den Plan.

**Plan:** **7 Tage** (jeder Tag ein Abschnitt), **Monat** (Kalender mit Punkten) und **Projekte** (Fortschritt Schritt für Schritt, dazu Kosten und Fotos des Projekts).

**Wiederkehrende Aufgaben:** In der Aufgabe unter **Wiederholen** (täglich, werktags, wöchentlich, alle 2 Wochen, monatlich, vierteljährlich, jährlich) – oder direkt in der Schnelleingabe: „jeden Montag“, „monatlich“, „jährlich“. Beim Abhaken legt Mindora den nächsten Termin automatisch an.

**Kosten & Zahlungen:** **Mehr → Kosten & Zahlungen** (oder im Projekt Hausbau). Mit **Ratenplan aus Vorlage** legst du die Abschläge nach Baufortschritt an – Gesamtpreis eintragen, Prozente aus eurem allkauf-Vertrag übernehmen. Dazu kommen Rechnungen, Sonderwünsche und Nebenkosten. Mit **Budget festlegen** siehst du, wie viel Puffer bleibt. Haken = bezahlt. Für offene Zahlungen mit Datum kommt 3 Tage vorher und am Fälligkeitstag eine Push-Nachricht. Rechnungen in E-Mails erkennt die KI und legt sie hier an.

**Fotos & Dokumente:** In jeder Aufgabe und jeder Zahlung unter **Fotos & Dateien** – Foto aufnehmen oder Datei/PDF wählen. Alles zusammen unter **Mehr → Fotos & Dokumente**. Fotos werden automatisch verkleinert, Dateien bis 15 MB. **Öffnen / Sichern** gibt die Datei an andere Apps weiter (z. B. „In Dateien sichern“).

**Kommentare:** Unten in jeder Aufgabe steht der **Verlauf** (angelegt, erledigt von wem) und darunter das Kommentarfeld. Die anderen bekommen eine Push-Nachricht. In der Liste zeigen 💬 und 📎, wo es Kommentare oder Dateien gibt.

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
| Weitergeleitete Mail ergibt keine Aufgabe | script.google.com → Mindora Postbote → **Ausführungen** → letzten Lauf öffnen und die Meldung lesen. „Ignoriert“: von deiner Mindora-Login-Adresse weiterleiten oder den Absender in der App erlauben. |
| „Es gibt mehrere gemeinsame Bereiche“ | Die Meldung nennt die IDs. Die richtige im Postboten unter Projekteinstellungen → Skripteigenschaften als `PROJEKT_ID` eintragen. |

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
