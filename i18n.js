// Sprache der Oberfläche: Deutsch (Original) oder Englisch.
// Die Oberfläche wird auf Deutsch erzeugt; ist Englisch gewählt, übersetzt ein Beobachter
// alle sichtbaren Texte (auch Fenster, Hinweise, Meldungen) über dieses Wörterbuch.

const pickLang = () => {
  try { const s = localStorage.getItem('ms-lang'); if (s === 'de' || s === 'en') return s; } catch {}
  return /^de\b/i.test(navigator.language || 'de') ? 'de' : 'en';
};
export const LANG = pickLang();
export const LOC = () => (LANG === 'en' ? 'en-GB' : 'de-DE');
export function setLang(l) { try { localStorage.setItem('ms-lang', l); } catch {} }

const EN = {
  // --- Navigation & allgemein
  'Übersicht': 'Overview', 'Aufgaben': 'Tasks', 'Plan': 'Plan', 'Planer': 'Planner', 'Eingang': 'Inbox', 'Mehr': 'More',
  'Neue Aufgabe': 'New task', 'Aufgabe anlegen': 'Create task', 'Speichern': 'Save', 'Abbrechen': 'Cancel', 'Schließen': 'Close', 'Fertig': 'Done',
  'Löschen': 'Delete', 'Ändern': 'Change', 'ändern': 'change', 'Hinzufügen': 'Add', 'Übernehmen': 'Apply', 'Senden': 'Send', 'Einrichten': 'Set up', 'Aktivieren': 'Enable',
  'Alle': 'All', 'Alle ›': 'All ›', 'Heute': 'Today', 'Morgen': 'Tomorrow', 'Gestern': 'Yesterday', 'Wochenende': 'Weekend', 'Nächste Woche': 'Next week',
  'In einem Monat': 'In a month', 'Ohne': 'None', 'Ohne Datum': 'No date', 'ohne Datum': 'no date', 'irgendwann': 'someday', 'Überfällig': 'Overdue',
  'Nachholen': 'Overdue', 'Jetzt starten': 'Start now', 'Wird knapp': 'Getting tight', 'Frist klären': 'Clarify deadline', 'Im Plan': 'On track',
  '7 Tage': '7 days', '7 Tage weiter': 'Next 7 days', '7 Tage zurück': 'Previous 7 days', 'Monat': 'Month', 'Projekte': 'Projects', 'Woche': 'Week',
  'Voriger Monat': 'Previous month', 'Nächster Monat': 'Next month', 'Offen': 'Open', 'Erledigt': 'Done', 'Wieder öffnen': 'Reopen',
  '‹ Zurück': '‹ Back', '‹ Mehr': '‹ More', '‹ Alle Projekte': '‹ All projects', 'Filter': 'Filter', 'Ansicht': 'View', 'Lebensbereich': 'Area',
  'Mo': 'Mon', 'Di': 'Tue', 'Mi': 'Wed', 'Do': 'Thu', 'Fr': 'Fri', 'Sa': 'Sat', 'So': 'Sun',
  'Guten Morgen': 'Good morning', 'Hallo': 'Hello', 'Guten Abend': 'Good evening', 'Gute Nacht': 'Good night',
  'MindSpace wird geladen …': 'Loading MindSpace …', 'MindSpace · Planung darf leicht sein.': 'MindSpace · Planning can be easy.',
  // --- Übersicht
  'Die nächsten 7 Tage': 'The next 7 days', 'Wochenblick': 'Week at a glance', 'Alle auf heute': 'Move all to today', 'Aufgabe für diesen Tag': 'Task for this day',
  'Zurück zu heute': 'Back to today', 'Neues Projekt': 'New project', 'z. B. Urlaub, Auto': 'e.g. holiday, car', 'Heute ist nichts fällig.': 'Nothing due today.',
  'Nichts überfällig. Sehr gut!': 'Nothing overdue. Well done!', 'Nichts muss gerade angestoßen werden.': 'Nothing needs to be started right now.',
  'In den nächsten 7 Tagen ist nichts fällig.': 'Nothing due in the next 7 days.', 'aus E-Mails – kurz prüfen': 'from e-mails – take a quick look',
  'Tipp:': 'Tip:', 'Aufgabe nach': 'Swipe a task', 'rechts wischen': 'right', '= erledigt, nach': '= done,', 'links wischen': 'left', '= verschieben.': '= reschedule.',
  'Gedrückt halten': 'Press and hold', 'und auf einen Tag ziehen = neues Datum.': 'and drag onto a day = new date.', 'Tipp schließen': 'Close tip', 'Hinweis schließen': 'Close notice',
  'Als App installieren:': 'Install as an app:', 'In Safari auf': 'In Safari tap', 'tippen, dann „Zum Home-Bildschirm“. Danach klappen auch Push-Nachrichten.': 'then “Add to Home Screen”. Push notifications work after that.',
  'Checkliste Hausbau laden': 'Load house-building checklist', '#bereich ändert den Bereich': '#area changes the area',
  'Neue Aufgabe, z. B. „Bank anrufen morgen 10 Uhr“': 'New task, e.g. “Call bank tomorrow 10am”', 'Mindora als Programm nutzen:': 'Use MindSpace as a program:',
  'MindSpace als Programm nutzen:': 'Use MindSpace as a program:', 'eigenes Fenster, eigenes Symbol in der Taskleiste, startet wie jede App.': 'its own window and taskbar icon, starts like any app.',
  'Jetzt installieren': 'Install now', 'Nächste Zahlung:': 'Next payment:',
  // --- Aufgaben
  'Aufgabe': 'Task', 'Was ist zu tun?': 'What needs doing?', 'Wann?': 'When?', 'Fällig am': 'Due on', 'Bereich': 'Area', 'Erinnerung': 'Reminder', 'Erinnern am': 'Remind on',
  'Weitere Angaben': 'More details', 'Uhrzeit, Vorlauf, Abschnitt, Ansprechpartner, Notizen': 'Time, lead time, section, contact, notes', 'Uhrzeit': 'Time',
  'Vorlauf (Tage)': 'Lead time (days)', 'z. B. 14': 'e.g. 14', 'Abschnitt im Plan': 'Section in plan', 'Ansprechpartner': 'Contact', 'Zuständig': 'Assigned to', 'Beide': 'Both',
  'Notizen': 'Notes', 'Notiz': 'Note', 'Keine Erinnerung': 'No reminder', 'Am Tag selbst, 8 Uhr': 'On the day, 8 am', '1 Stunde vorher': '1 hour before',
  '1 Tag vorher, 18 Uhr': '1 day before, 6 pm', '3 Tage vorher, 18 Uhr': '3 days before, 6 pm', '1 Woche vorher, 18 Uhr': '1 week before, 6 pm', 'Eigener Zeitpunkt': 'Custom time',
  'z. B. Bank wegen Finanzierungsbestätigung anrufen': 'e.g. call the bank about the financing confirmation', '– keiner –': '– none –', '– ohne –': '– none –',
  'Wiederholen': 'Repeat', 'Nicht wiederholen': 'Does not repeat', 'Jeden Tag': 'Every day', 'Werktags (Mo–Fr)': 'Weekdays (Mon–Fri)', 'Jede Woche': 'Every week',
  'Alle 2 Wochen': 'Every 2 weeks', 'Jeden Monat': 'Every month', 'Alle 3 Monate': 'Every 3 months', 'Jedes Jahr': 'Every year',
  'täglich': 'daily', 'werktags': 'weekdays', 'wöchentlich': 'weekly', '14-tägig': 'every 2 weeks', 'monatlich': 'monthly', 'vierteljährlich': 'quarterly', 'jährlich': 'yearly',
  'Fotos & Dateien': 'Photos & files', 'Foto / Datei': 'Photo / file', 'Wird beim Speichern hochgeladen.': 'Will be uploaded when you save.',
  'Verlauf & Kommentare': 'History & comments', 'Angelegt': 'Created', 'Als nächster Termin angelegt': 'Created as the next occurrence', 'Aus einer E-Mail angelegt': 'Created from an e-mail',
  'Die anderen bekommen eine Push-Nachricht.': 'The others get a push notification.', 'Kommentar': 'Comment', 'löschen': 'delete', 'Du': 'You', 'Jemand': 'Someone',
  'Notiz zum Verlauf, z. B. „Bank hat zurückgerufen“': 'Note for the history, e.g. “Bank called back”', 'Kommentar für alle, z. B. „Bank hat zurückgerufen“': 'Comment for everyone, e.g. “Bank called back”',
  'Mit KI neu einschätzen': 'Re-assess with AI', 'MindSpace schätzt ein …': 'MindSpace is assessing …', 'KI-Einschätzung': 'AI assessment', 'Nächster Schritt:': 'Next step:',
  'E-Mail schreiben': 'Write e-mail', 'Anrufen': 'Call', 'Offene Aufgaben': 'Open tasks', 'Aufgaben durchsuchen': 'Search tasks', 'Nichts gefunden': 'Nothing found',
  'Versuch einen anderen Suchbegriff.': 'Try a different search term.', 'Alles erledigt.': 'All done.', 'Zeit für dich – oder für etwas Neues mit dem Plus.': 'Time for you – or for something new with the plus.',
  'Noch nichts erledigt': 'Nothing done yet', 'Abgehakte Aufgaben sammeln sich hier.': 'Completed tasks collect here.', 'Noch keine Aufgaben': 'No tasks yet',
  'Leg eine mit dem Plus an oder lies eine E-Mail ein.': 'Create one with the plus or import an e-mail.', 'Diese Woche': 'This week', 'Nächste Woche ': 'Next week',
  'Neu aus E-Mail': 'New from e-mail', 'Neu für dich': 'New for you',
  'Vorlauf = wie viele Tage vorher du anfangen musst, z. B. weil die Bank Zeit braucht. MindSpace erinnert dich dann rechtzeitig.': 'Lead time = how many days before the deadline you need to start, e.g. because the bank needs time. MindSpace reminds you in good time.',
  'Wann?': 'When?', 'Oder Datum wählen': 'Or pick a date', 'Ohne Datum ': 'No date',
  // --- Planer
  'Gerade dran': 'In progress', 'Gerade dran:': 'In progress:', 'Danach': 'After that', 'Noch keine Aufgaben ': 'No tasks yet', 'Als Nächstes': 'Next', 'Später': 'Later',
  'Schritt für Schritt': 'Step by step', 'Nach Monaten': 'By month', 'Fertig voraussichtlich:': 'Expected completion:', 'Nächste Frist:': 'Next deadline:',
  'Tippe auf einen Abschnitt, um seine Aufgaben zu sehen. Abschnitte änderst du unter Mehr → Lebensbereiche.': 'Tap a section to see its tasks. Change sections under More → Areas.',
  'Aufgabe gedrückt halten und auf einen Tag oben ziehen, um sie zu verschieben.': 'Press and hold a task and drag it onto a day at the top to move it.',
  'Neues Projekt / Lebensbereich': 'New project / area', 'Aufgabe hinzufügen': 'Add task', 'Noch keine Projekte': 'No projects yet',
  'Lege Aufgaben an – hier entsteht dann dein Plan.': 'Create tasks – your plan will appear here.', 'Alles erledigt 🎉': 'All done 🎉', 'Alle Abschnitte erledigt ✓': 'All sections done ✓',
  'Weitere Aufgaben': 'More tasks', 'In diesem Monat ist nichts offen.': 'Nothing open this month.',
  'Ohne eigene Abschnitte ordnet MindSpace nach Monaten. Abschnitte legst du unter Mehr → Lebensbereiche an.': 'Without sections, MindSpace groups by month. Create sections under More → Areas.',
  'Abschnitte änderst du unter Mehr → Lebensbereiche.': 'Change sections under More → Areas.', 'Zahlungsplan & Budget': 'Payment plan & budget',
  'Baufortschritt, Rechnungen, Protokolle': 'Building progress, invoices, reports', 'Belege und Unterlagen': 'Receipts and documents',
  // --- Bereiche (Standard)
  'Hausbau': 'House build', 'Familie': 'Family', 'Finanzen & Verträge': 'Finance & contracts', 'Gesundheit': 'Health', 'Alltag': 'Everyday',
  'Finanzierung': 'Financing', 'Pläne & Behörden': 'Plans & permits', 'Grundstück & Anschlüsse': 'Plot & utilities', 'Bemusterung': 'Fittings selection',
  'Versicherung': 'Insurance', 'Bau & Abnahme': 'Construction & handover', 'Allgemein': 'General',
  // --- Eingang
  'Neu': 'New', 'Ablage': 'Archive', 'Einfügen': 'Paste', 'Ablegen': 'Archive', 'Passt': 'Looks good', 'Weg damit': 'Discard', 'Alle passen': 'All look good',
  'Was per E-Mail reinkommt, wird hier zu Aufgaben.': 'Whatever arrives by e-mail turns into tasks here.', 'E-Mails weiterleiten': 'Forward e-mails',
  'Kopiere eine E-Mail, einen Verlauf oder einen Text aus einer anderen App hier hinein.': 'Paste an e-mail, a thread or text from another app here.',
  'Hier einfügen …': 'Paste here …', 'Aus Zwischenablage': 'From clipboard', 'Screenshot lesen': 'Read screenshot', 'Leeren': 'Clear',
  'Mit KI auswerten': 'Analyse with AI', 'Ohne KI auswerten': 'Analyse without AI', 'Aufgaben finden': 'Find tasks', 'MindSpace liest mit …': 'MindSpace is reading …',
  'Mit dem KI-Assistenten (Mehr → KI-Assistent) erkennt MindSpace auch Ansprechpartner, schätzt Vorlaufzeiten und versteht frei formulierte Texte.': 'With the AI assistant (More → AI assistant) MindSpace also recognises contacts, estimates lead times and understands free-form text.',
  'Vorschläge der KI. Passe an, was nicht stimmt, und wähle ab, was du nicht brauchst.': 'AI suggestions. Fix what is wrong and untick what you do not need.',
  'Häkchen setzen, Text und Datum bei Bedarf anpassen.': 'Tick, then adjust text and date if needed.', 'E-Mail zusätzlich in der Ablage speichern': 'Also keep the e-mail in the archive',
  'Keine Aufgaben erkannt': 'No tasks found', 'In diesem Text steht nichts, was nach einer Bitte oder Frist klingt.': 'Nothing in this text sounds like a request or deadline.',
  'Selbst anlegen': 'Create manually', 'Nur ablegen': 'Just archive', 'Nichts ausgewählt': 'Nothing selected', 'Frist': 'Deadline', 'Termin': 'Appointment',
  'Vorschlag der KI': 'AI suggestion', 'Laut Verlauf vermutlich schon erledigt': 'According to the thread probably already done', 'Neuer Kontakt': 'New contact',
  'Schon gespeichert': 'Already saved', 'Schon gespeichert – fehlende Angaben werden ergänzt': 'Already saved – missing details will be added',
  'Landet unter Kosten – mit Erinnerung vor dem Fälligkeitstag.': 'Goes to Costs – with a reminder before the due date.', 'Ablage durchsuchen': 'Search archive',
  'In der Ablage suchen': 'Search the archive', 'Noch kein Postfach verbunden. Die Einrichtung (ca. 15 Minuten) steht in der Anleitung, Stufe 5.': 'No mailbox connected yet. Setup (about 15 minutes) is in the guide, stage 5.',
  'Neu aus der E-Mail': 'New from the e-mail', 'Speichern bestätigt sie.': 'Saving confirms it.', 'Notiz abgelegt': 'Note archived', 'Erneut auswerten': 'Analyse again',
  'Aufgaben darin suchen': 'Find tasks in it', 'Text kopieren': 'Copy text', 'Neue Notiz': 'New note', 'Titel': 'Title', 'Text': 'Text',
  // --- Kontakte
  'Kontakte': 'Contacts', 'Kontakt anlegen': 'Create contact', 'Kontakt löschen': 'Delete contact', 'Name': 'Name', 'Firma': 'Company', 'Rolle': 'Role',
  'E-Mail': 'E-mail', 'Telefon': 'Phone', 'Mobil': 'Mobile', 'Adresse': 'Address', 'Alle Ansprechpartner an einem Ort – direkt anschreiben oder anrufen.': 'All contacts in one place – write or call directly.',
  'Kontakte durchsuchen': 'Search contacts', 'Noch keine Kontakte': 'No contacts yet', 'An': 'To', 'Betreff': 'Subject', 'In Mail-App öffnen': 'Open in mail app',
  'Mit KI formulieren': 'Draft with AI', 'Andere Adresse …': 'Other address …', 'Mail': 'Mail',
  'Die Mail öffnet sich fertig ausgefüllt in deiner Mail-App. Dort tippst du auf Senden – so geht sie von deiner eigenen Adresse raus.': 'The mail opens pre-filled in your mail app. Tap Send there – it goes out from your own address.',
  // --- Mehr / Einstellungen
  'Lebensbereiche': 'Areas', 'Bereich hinzufügen': 'Add area', 'Neuer Bereich': 'New area', 'Bereich löschen': 'Delete area', 'Symbol': 'Icon', 'Eigenes Symbol': 'Custom icon',
  'Farbe': 'Colour', 'Abschnitte im Plan (optional, einer pro Zeile)': 'Plan sections (optional, one per line)', 'z. B. Urlaub, Auto, Kinder': 'e.g. holiday, car, kids',
  'Gemeinsam planen': 'Plan together', 'Partnerin oder Partner einladen': 'Invite someone', 'Code erzeugen und per Nachricht schicken': 'Create a code and send it',
  'Mit Code beitreten': 'Join with code', 'Erinnerungen': 'Reminders', 'Push-Nachrichten': 'Push notifications', 'Aktiv auf diesem Gerät': 'Active on this device',
  'Noch nicht aktiviert': 'Not enabled yet', 'Braucht die Cloud-Einrichtung': 'Needs the cloud setup', 'Auf diesem Gerät nicht verfügbar': 'Not available on this device',
  'Erst zum Home-Bildschirm hinzufügen': 'Add to Home Screen first',
  'Zur eingestellten Zeit jeder Aufgabe, morgens ab 7 Uhr eine kurze Übersicht und ein Hinweis, wenn etwas jetzt starten sollte. Jedes Gerät einmal selbst aktivieren.': 'At each task’s reminder time, a short overview from 7 am and a note when something should start now. Enable once on every device.',
  'KI-Assistent': 'AI assistant', 'Claude von Anthropic': 'Claude by Anthropic', 'Nicht eingerichtet': 'Not set up', 'Alle Fristen jetzt prüfen': 'Check all deadlines now',
  'Was ist bis wann realistisch zu schaffen?': 'What is realistic by when?', 'Fristen werden geprüft …': 'Checking deadlines …', 'E-Mail-Eingang': 'E-mail inbox',
  'Erlaubte Absender verwalten': 'Manage allowed senders', 'Anleitung, Stufe 5': 'Guide, stage 5', 'Vorlagen': 'Templates', 'Checkliste Hausbau': 'House-building checklist',
  'Vom Bauantrag bis zur Abnahme': 'From planning application to handover', 'Daten': 'Data', 'Sicherung speichern': 'Save backup', 'Sicherung einspielen': 'Restore backup',
  'Aufgaben, Bereiche, Kontakte und Ablage als Datei': 'Tasks, areas, contacts and archive as a file', 'Konto': 'Account', 'Abmelden': 'Sign out', 'App': 'App',
  'Neueste Version laden': 'Load latest version', 'Als Programm installieren': 'Install as a program', 'Tastenkürzel': 'Keyboard shortcuts', 'Installieren': 'Install',
  'Eigenes Fenster und Symbol – auf diesem Computer oder Gerät': 'Own window and icon – on this computer or device',
  'N = neue Aufgabe · / = Schnelleingabe · 1–5 = Bereiche wechseln · Esc = schließen': 'N = new task · / = quick add · 1–5 = switch sections · Esc = close',
  'Kosten & Zahlungen': 'Costs & payments', 'Budget, Ratenplan, Rechnungen': 'Budget, instalment plan, invoices', 'Fotos & Dokumente': 'Photos & documents',
  'Baufortschritt, Belege, Protokolle': 'Building progress, receipts, reports', 'Lokaler Modus.': 'Local mode.',
  'Alles bleibt auf diesem Gerät. Für Teilen, Push-Nachrichten und den E-Mail-Eingang richte die Cloud ein (Anleitung, Stufe 2).': 'Everything stays on this device. For sharing, push notifications and the e-mail inbox, set up the cloud (guide, stage 2).',
  '1 Ansprechpartner – anrufen oder anschreiben': '1 contact – call or write',
  // --- KI-Einstellungen & Postfach
  'API-Schlüssel': 'API key', 'Modell': 'Model', 'Prüfen und speichern': 'Check and save', 'Der Schlüssel bleibt auf diesem Gerät.': 'The key stays on this device.',
  'KI ausschalten': 'Turn off AI', 'Claude Sonnet 5.5 – empfohlen': 'Claude Sonnet 5.5 – recommended', 'Claude Haiku 5.5 – günstiger, etwas ungenauer': 'Claude Haiku 5.5 – cheaper, a bit less accurate',
  'Claude Opus 5.5 – am gründlichsten, teurer': 'Claude Opus 5.5 – most thorough, more expensive',
  'MindSpace nutzt Claude von Anthropic. Dafür brauchst du einen eigenen API-Schlüssel aus der Anthropic Console (Anleitung, Stufe 4). Abgerechnet wird nach Verbrauch – eine E-Mail auszuwerten kostet meist 1–3 Cent.': 'MindSpace uses Claude by Anthropic. You need your own API key from the Anthropic Console (guide, stage 4). Billing is by usage – analysing an e-mail usually costs 1–3 cents.',
  'Erlaubte Absender (einer pro Zeile)': 'Allowed senders (one per line)', 'z. B. @allkauf.de\nkita@beispiel.de': 'e.g. @company.com\nschool@example.com',
  'Mails von euren eigenen Konto-Adressen sind immer erlaubt – also alles, was ihr selbst weiterleitet. Ergänze hier Absender, die direkt an das Postfach schreiben oder automatisch weitergeleitet werden. Mit „@firma.de“ erlaubst du eine ganze Firma. Alles andere ignoriert MindSpace – so entstehen keine Aufgaben aus Werbung.': 'Mails from your own account addresses are always allowed – i.e. everything you forward yourself. Add senders who write directly to the mailbox or are forwarded automatically. “@company.com” allows a whole company. MindSpace ignores everything else – so ads never become tasks.',
  'geht, sobald die Cloud eingerichtet ist (Anleitung, Stufe 2 und 5). Bis dahin: Text unter „Einfügen“ hineinkopieren.': 'works once the cloud is set up (guide, stages 2 and 5). Until then: paste text under “Paste”.',
  // --- Vorlage Hausbau
  'Typische Schritte beim Fertighausbau. Was nicht passt, einfach abwählen – Termine trägst du später ein.': 'Typical steps when building a prefab house. Untick what does not fit – add dates later.',
  'Ausgewählte hinzufügen': 'Add selected', 'schon vorhanden': 'already there',
  'Finanzierungszusage der Bank einholen': 'Get the bank’s financing commitment', 'Finanzierungsbestätigung der Bank an allkauf schicken': 'Send the bank’s financing confirmation to the builder',
  'Förderung (z. B. KfW) vor Baubeginn beantragen': 'Apply for subsidies (e.g. KfW) before construction starts', 'Zahlungsplan mit Bank und allkauf abgleichen': 'Align the payment plan with the bank and builder',
  'Bauantrag prüfen und unterschreiben': 'Review and sign the planning application', 'Entwässerungsantrag stellen': 'Submit the drainage application',
  'Baubeginn beim Bauamt anzeigen': 'Notify the building authority of the start of construction', 'Bodengutachten beauftragen': 'Commission a soil survey',
  'Hausanschlüsse beantragen (Strom, Wasser, Abwasser, Glasfaser)': 'Apply for utility connections (power, water, sewage, fibre)', 'Baustrom und Bauwasser organisieren': 'Arrange site power and water',
  'Erdarbeiten und Bodenplatte bzw. Keller beauftragen': 'Commission earthworks and slab or basement', 'Baustellenzufahrt und Lagerfläche klären': 'Clarify site access and storage area',
  'Bemusterungstermin vereinbaren': 'Book the fittings selection appointment', 'Fliesen, Sanitär und Bodenbeläge auswählen': 'Choose tiles, sanitary ware and flooring',
  'Elektroplan vorbereiten (Steckdosen, Licht, Netzwerk)': 'Prepare the electrical plan (sockets, lighting, network)', 'Küchenplanung mit Anschlussplan abstimmen': 'Coordinate kitchen planning with the connection plan',
  'Bauherrenhaftpflicht abschließen': 'Take out builder’s liability insurance', 'Bauleistungsversicherung prüfen': 'Check construction all-risk insurance',
  'Feuerrohbauversicherung abschließen': 'Take out shell-construction fire insurance', 'Unabhängigen Bausachverständigen beauftragen': 'Hire an independent building surveyor',
  'Bautagebuch mit Fotos führen': 'Keep a construction diary with photos', 'Jede Abschlagsrechnung gegen den Baufortschritt prüfen': 'Check every instalment invoice against progress',
  'Richtfest planen': 'Plan the topping-out party', 'Abnahme mit Sachverständigem und Mängelprotokoll': 'Handover with surveyor and defects report',
  'Zählerstände bei der Übergabe notieren': 'Note meter readings at handover', 'Umzug planen und Adresse ummelden': 'Plan the move and register the new address',
  // --- Kosten
  'Kosten': 'Costs', 'Neue Kosten': 'New cost', 'Kosten erfassen': 'Add cost', 'Kosten oder Zahlung erfassen': 'Add cost or payment', 'Ratenplan aus Vorlage': 'Instalment plan from template',
  'Ratenplan aus Vorlage anlegen': 'Create instalment plan from template', 'Einzelne Kosten erfassen': 'Add a single cost', 'Budget festlegen': 'Set budget', 'Budget': 'Budget',
  'Bereits bezahlt': 'Already paid', 'Bezahlt': 'Paid', 'Noch offen': 'Still open', 'Puffer': 'Buffer', 'Nächste Zahlungen': 'Upcoming payments', 'Wofür?': 'What for?',
  'Betrag (€)': 'Amount (€)', 'Art': 'Type', 'Bezahlt am': 'Paid on', 'Empfänger / Ansprechpartner': 'Payee / contact', 'Belege – Rechnung, Foto, PDF': 'Receipts – invoice, photo, PDF',
  'Abschlag / Rate': 'Instalment', 'Rechnung': 'Invoice', 'Sonderwunsch': 'Extra request', 'Eigenleistung': 'Own work', 'Nebenkosten': 'Additional costs',
  'Finanzierung & Gebühren': 'Financing & fees', 'Sonstiges': 'Other', 'Betrag?': 'Amount?', 'Noch ohne Termin': 'No date yet', 'Als bezahlt markieren': 'Mark as paid',
  'Wieder offen': 'Mark unpaid', 'Noch keine Kosten erfasst': 'No costs yet', 'kein Budget': 'no budget', 'Budget gespeichert': 'Budget saved', 'Kosten erfasst': 'Cost added',
  'Behalte Raten, Rechnungen und Sonderwünsche im Blick – mit Budget und Erinnerung vor jeder Zahlung.': 'Keep track of instalments, invoices and extras – with a budget and a reminder before every payment.',
  'Haken = bezahlt. Belege wie Rechnungen oder Überweisungsbestätigungen hängst du direkt an die Zahlung.': 'Tick = paid. Attach receipts such as invoices or transfer confirmations directly to the payment.',
  'Für offene Zahlungen mit Datum erinnert MindSpace 3 Tage vorher und am Fälligkeitstag per Push.': 'For open payments with a date, MindSpace reminds you by push 3 days before and on the due date.',
  'Schon bezahlt? Dann einfach abhaken.': 'Already paid? Just tick it off.', 'z. B. 2. Abschlag Rohbau': 'e.g. 2nd instalment shell', 'z. B. 28.500': 'e.g. 28,500',
  'z. B. Rechnungsnummer, Verwendungszweck': 'e.g. invoice number, payment reference', 'Ratenplan': 'Instalment plan', 'Ratenplan anlegen': 'Create instalment plan',
  'Gesamtpreis laut Vertrag (€)': 'Total price per contract (€)', 'z. B. 380.000': 'e.g. 380,000', 'Rate übernehmen': 'Include instalment', 'Bezeichnung': 'Label', 'Prozent': 'Percent',
  'Beispiel nach Baufortschritt (MaBV). Fertighausfirmen wie allkauf haben oft einen': 'Example based on construction progress (German MaBV). Prefab builders often have their',
  'eigenen Zahlungsplan': 'own payment plan', '– übernimm Raten und Prozente einfach aus eurem Bauvertrag. Termine trägst du ein, sobald sie feststehen.': '– simply copy instalments and percentages from your contract. Add dates once they are fixed.',
  'Typische Nebenkosten als Liste dazu (Notar, Grunderwerbsteuer, Anschlüsse, Küche …) – Beträge trägst du später ein': 'Add typical additional costs as a list (notary, transfer tax, utilities, kitchen …) – fill in amounts later',
  'Wie viel wollt oder könnt ihr insgesamt ausgeben? Beim Hausbau z. B. Finanzierungssumme plus Eigenkapital. MindSpace zeigt dann, wie viel Puffer bleibt.': 'How much do you want or can you spend in total? For a house build e.g. loan amount plus equity. MindSpace then shows how much buffer is left.',
  'Beginn der Erdarbeiten': 'Start of earthworks', 'Rohbau inkl. Zimmererarbeiten': 'Shell incl. carpentry', 'Dachflächen und Dachrinnen': 'Roofing and gutters',
  'Rohinstallation Heizung': 'Heating rough-in', 'Rohinstallation Sanitär': 'Plumbing rough-in', 'Rohinstallation Elektro': 'Electrical rough-in',
  'Fenstereinbau inkl. Verglasung': 'Windows incl. glazing', 'Innenputz': 'Interior plaster', 'Estrich': 'Screed', 'Fliesen im Sanitärbereich': 'Bathroom tiling',
  'Bezugsfertigkeit / Übergabe': 'Ready for occupancy / handover', 'Fassadenarbeiten': 'Facade work', 'Vollständige Fertigstellung': 'Full completion',
  'Notar und Grundbuch': 'Notary and land register', 'Grunderwerbsteuer': 'Property transfer tax', 'Vermessung und Gebäudeeinmessung': 'Surveying',
  'Bodengutachten': 'Soil survey', 'Hausanschlüsse (Strom, Wasser, Abwasser, Internet)': 'Utility connections (power, water, sewage, internet)',
  'Baustrom und Bauwasser': 'Site power and water', 'Bauherrenhaftpflicht und Bauleistungsversicherung': 'Builder’s liability and construction insurance',
  'Bodenplatte oder Keller (falls nicht im Vertrag)': 'Slab or basement (if not in contract)', 'Außenanlagen, Terrasse, Garage': 'Landscaping, terrace, garage', 'Küche': 'Kitchen', 'Umzug': 'Move',
  '📬 Aus einer E-Mail erkannt. Speichern bestätigt den Eintrag.': '📬 Detected in an e-mail. Saving confirms the entry.',
  // --- Fotos & Dokumente
  'Foto oder Datei hinzufügen': 'Add photo or file', 'Fotos werden automatisch verkleinert. Dateien bis 15 MB.': 'Photos are resized automatically. Files up to 15 MB.',
  'Noch keine Fotos oder Dokumente': 'No photos or documents yet', 'Öffnen / Sichern': 'Open / save', 'Zum Ansehen auf „Öffnen / Sichern“ tippen.': 'Tap “Open / save” to view.',
  'Halte den Baufortschritt fest und sammle Rechnungen, Angebote und Protokolle – hier oder direkt an der passenden Aufgabe.': 'Capture building progress and collect invoices, quotes and reports – here or directly on the matching task.',
  'Datei nicht gefunden.': 'File not found.', 'Datei ist unvollständig. Bitte erneut hochladen.': 'File is incomplete. Please upload again.', 'Gespeichert 📎': 'Saved 📎', 'Wird gespeichert …': 'Saving …',
  'Entfernen': 'Remove',
  // --- Anmeldung & Einrichtung
  'Anmelden': 'Sign in', 'Konto erstellen': 'Create account', 'Dein Vorname': 'Your first name', 'Passwort': 'Password', 'Passwort vergessen?': 'Forgot password?',
  'Dein persönlicher Assistent. Aufgaben, Fristen und E-Mails – leicht geplant.': 'Your personal assistant. Tasks, deadlines and e-mails – planned with ease.',
  'Anmelden oder registrieren': 'Sign in or register', 'Leg euren gemeinsamen Bereich an. Wenn deine Partnerin oder dein Partner schon einen hat, tritt mit dem Code bei.': 'Create your shared space. If someone already has one, join with their code.',
  'Loslegen': 'Get started', 'Ich habe einen Code': 'I have a code', 'Einladungscode': 'Invitation code', 'z. B. K7M-Q2P': 'e.g. K7M-Q2P', 'Beitreten': 'Join', 'Unser Zuhause': 'Our home',
  'Einladen': 'Invite', 'Schick diesen Code zusammen mit dem Link. Er gilt 7 Tage.': 'Send this code together with the link. It is valid for 7 days.', 'Einladung senden': 'Send invitation',
  'Damit ihr zu zweit plant, braucht MindSpace einen Ort im Internet, an dem eure Daten zusammenkommen – dein eigenes, kostenloses Firebase-Projekt.': 'To plan together, MindSpace needs a place online where your data comes together – your own free Firebase project.',
  'Die Anleitung erklärt die Einrichtung Schritt für Schritt (ca. 30 Minuten am Computer). Bisherige Aufgaben werden übernommen.': 'The guide explains the setup step by step (about 30 minutes at a computer). Existing tasks are kept.',
  // --- Meldungen
  'Gespeichert': 'Saved', 'Gelöscht': 'Deleted', 'Rückgängig': 'Undo', 'Aufgabe angelegt': 'Task created', 'Abgelegt': 'Archived', 'Verworfen': 'Discarded', 'Im Plan ✓': 'In the plan ✓',
  'Alles im Plan ✓': 'All in the plan ✓', 'Erledigt 🎉': 'Done 🎉', 'Geschafft ✨': 'Nailed it ✨', 'Ein Punkt weniger 🙌': 'One less thing 🙌', 'Stark gemacht 💪': 'Great job 💪',
  'Weiter so 🌿': 'Keep it up 🌿', 'Abgehakt ☀️': 'Ticked off ☀️', 'Alles für heute geschafft ☀️': 'All done for today ☀️', 'Datum entfernt': 'Date removed',
  'Bereich gelöscht': 'Area deleted', 'Kontakt gelöscht': 'Contact deleted', 'Willkommen!': 'Welcome!', 'KI-Assistent ist bereit ✨': 'AI assistant is ready ✨',
  'KI-Assistent ausgeschaltet': 'AI assistant turned off', 'Push-Nachrichten werden aktiviert …': 'Enabling push notifications …', 'Push-Nachrichten sind aktiv 🔔': 'Push notifications are on 🔔',
  'Die Zwischenablage ist leer.': 'The clipboard is empty.', 'Text erkannt – kurz prüfen und auswerten.': 'Text recognised – check briefly and analyse.',
  'Im Bild wurde kein Text erkannt.': 'No text found in the image.', 'Screenshot wird gelesen … (beim ersten Mal ca. 15 MB Download)': 'Reading screenshot … (first time about 15 MB download)',
  'Kein Zugriff – halte stattdessen lange ins Feld und wähle „Einsetzen“.': 'No access – long-press the field instead and choose “Paste”.',
  'Link zum Zurücksetzen wurde gesendet.': 'Reset link sent.', 'Die E-Mail-Adresse sieht nicht richtig aus.': 'The e-mail address does not look right.',
  'Schreib kurz, worum es gehen soll.': 'Briefly write what it is about.', 'Adresse kopiert': 'Address copied', 'Einladung kopiert': 'Invitation copied', 'Kopiert': 'Copied',
  'Erlaubt ✓ Leite die Mail einfach noch einmal weiter.': 'Allowed ✓ Just forward the mail again.', 'Der Betrag ist nicht lesbar, z. B. 1.250,50': 'The amount is not readable, e.g. 1,250.50',
  'Öffne MindSpace zuerst über das Symbol auf dem Home-Bildschirm.': 'Open MindSpace from the Home Screen icon first.',
  'Dieses Gerät unterstützt keine Push-Nachrichten (iPhone: ab iOS 16.4, vom Home-Bildschirm geöffnet).': 'This device does not support push notifications (iPhone: iOS 16.4+, opened from the Home Screen).',
  'Die Abfrage wurde geschlossen. Tippe noch einmal auf Aktivieren und wähle „Erlauben“.': 'The prompt was closed. Tap Enable again and choose “Allow”.',
  'In config.js fehlt der vapidKey (Schritt 2.6).': 'config.js is missing the vapidKey (step 2.6).', 'Push-Anmeldung fehlgeschlagen. Versuch es gleich noch einmal.': 'Push registration failed. Try again in a moment.',
  'Nicht erlaubt. Klicke links neben der Adresse auf das Schloss-Symbol und erlaube Benachrichtigungen.': 'Not allowed. Click the lock icon next to the address and allow notifications.',
  'Nicht erlaubt. Ändern unter iPhone-Einstellungen → Mitteilungen → MindSpace.': 'Not allowed. Change it in iPhone Settings → Notifications → MindSpace.',
  'MindSpace ist jetzt als Programm installiert ✨': 'MindSpace is now installed as a program ✨',
  'Aufgabe wirklich löschen?': 'Really delete this task?', 'Diesen Eintrag löschen?': 'Delete this entry?', 'Kommentar löschen?': 'Delete comment?', 'Abmelden?': 'Sign out?',
  'KI-Assistent ausschalten und Schlüssel löschen?': 'Turn off the AI assistant and delete the key?',
  'E-Mail oder Passwort stimmt nicht.': 'E-mail or password is incorrect.', 'Zu dieser E-Mail gibt es kein Konto.': 'There is no account for this e-mail.',
  'Mit dieser E-Mail gibt es schon ein Konto. Melde dich an.': 'An account with this e-mail already exists. Please sign in.', 'Das Passwort braucht mindestens 6 Zeichen.': 'The password needs at least 6 characters.',
  'Die E-Mail-Adresse ist ungültig.': 'The e-mail address is invalid.', 'Keine Internetverbindung.': 'No internet connection.', 'Unbekannter Fehler.': 'Unknown error.',
  'Keine Berechtigung. Sind die Firestore-Regeln veröffentlicht?': 'No permission. Are the Firestore rules published?',
  'Der API-Schlüssel ist ungültig. Prüfe ihn unter Mehr → KI-Assistent.': 'The API key is invalid. Check it under More → AI assistant.',
  'Die KI hat nicht rechtzeitig geantwortet. Versuch es noch einmal.': 'The AI did not answer in time. Please try again.', 'Keine Verbindung zur KI. Besteht eine Internetverbindung?': 'No connection to the AI. Are you online?',
  'Das Guthaben in der Anthropic Console ist aufgebraucht. Lade dort etwas Guthaben auf.': 'Your Anthropic Console credit is used up. Top it up there.',
  'Die KI ist gerade überlastet. Versuch es in ein paar Minuten noch einmal.': 'The AI is overloaded right now. Try again in a few minutes.',
  'Die KI hat keine verwertbare Antwort geliefert. Versuch es noch einmal.': 'The AI gave no usable answer. Please try again.',
  'Kein API-Schlüssel hinterlegt (Mehr → KI-Assistent).': 'No API key set (More → AI assistant).',
  'Der Text war zu lang für eine Auswertung. Füge weniger auf einmal ein (z. B. nur die neuesten Nachrichten).': 'The text was too long to analyse. Paste less at once (e.g. only the latest messages).',
  'Mitglieder': 'Members', 'Version': 'Version', 'Die Frist ist überschritten.': 'The deadline has passed.',
};

// Texte mit Zahlen, Namen oder Datum
const P = (re, fn) => [re, fn];
const PATTERNS = [
  P(/^(Guten Morgen|Hallo|Guten Abend|Gute Nacht), (.+)$/, (m, g, n) => `${EN[g]}, ${n}`),
  P(/^(\d+) offen$/, (m, n) => `${n} open`),
  P(/^(\d+) offen · (\d+) Abschnitte$/, (m, n, a) => `${n} open · ${a} sections`),
  P(/^(\d+) von (\d+) erledigt$/, (m, a, b) => `${a} of ${b} done`),
  P(/^(\d+) von (\d+) Aufgaben erledigt$/, (m, a, b) => `${a} of ${b} tasks done`),
  P(/^(\d+) von (\d+) erledigt · (.+)$/, (m, a, b, r) => `${a} of ${b} done · ${r.replace(/fertig ca\./, 'done approx.').replace(/jetzt starten/, 'start now')}`),
  P(/^(\d+) von (\d+) bezahlt · (.+)$/, (m, a, b, r) => `${a} of ${b} paid · ${r}`),
  P(/^(.+) von (.+) bezahlt$/, (m, a, b) => `${a} of ${b} paid`),
  P(/^von (.+) geplant(.*)$/, (m, a, r) => `of ${a} planned${r.replace(/(\d+) ohne Betrag/, '$1 without amount')}`),
  P(/^bezahlt von (.+)$/, (m, a) => `paid of ${a.replace('Budget', 'budget')}`),
  P(/^(\d+) jetzt starten$/, (m, n) => `${n} start now`),
  P(/^(\d+) (Aufgabe|Aufgaben) gefunden$/, (m, n) => `${n} ${n === '1' ? 'task' : 'tasks'} found`),
  P(/^(\d+) (neue Aufgabe|neue Aufgaben)$/, (m, n) => `${n} new ${n === '1' ? 'task' : 'tasks'}`),
  P(/^(\d+) (Datei|Dateien)$/, (m, n) => `${n} ${n === '1' ? 'file' : 'files'}`),
  P(/^(\d+) (Ansprechpartner) – anrufen oder anschreiben$/, (m, n) => `${n} contacts – call or write`),
  P(/^(\d+) offene Fristen in diesem Monat$/, (m, n) => `${n} open deadlines this month`),
  P(/^(\d+) (Zahlung ist|Zahlungen sind) überfällig\.?$/, (m, n) => `${n} ${n === '1' ? 'payment is' : 'payments are'} overdue`),
  P(/^Neu \((\d+)\)$/, (m, n) => `New (${n})`),
  P(/^Nächste Frist: (.+)$/, (m, d) => `Next deadline: ${d}`),
  P(/^Fällig (.+)$/, (m, d) => `Due ${d}`),
  P(/^Überfällig seit (.+)$/, (m, d) => `Overdue since ${d}`),
  P(/^Bezahlt am (.+)$/, (m, d) => `Paid on ${d}`),
  P(/^Bezahlt ✓ (.+)$/, (m, a) => `Paid ✓ ${a}`), P(/^Bezahlt ✓$/, () => 'Paid ✓'),
  P(/^(.+) · aus „(.+)“$/, (m, a, s) => `${tr(a)} · from “${s}”`),
  P(/^(.+) · schon vorhanden$/, (m, a) => `${tr(a)} · already there`),
  P(/^(.+), (\d+) offen$/, (m, d, n) => `${d}, ${n} open`), P(/^(.+), (\d+) Aufgaben$/, (m, d, n) => `${d}, ${n} tasks`),
  P(/^(.+): (\d+) offen, (\d+) erledigt$/, (m, d, a, b) => `${d}: ${a} open, ${b} done`),
  P(/^Als erledigt markieren: (.+)$/, (m, t) => `Mark as done: ${t}`), P(/^Wieder öffnen: (.+)$/, (m, t) => `Reopen: ${t}`),
  P(/^Als bezahlt markieren: (.+)$/, (m, t) => `Mark as paid: ${t}`), P(/^Wieder als offen markieren: (.+)$/, (m, t) => `Mark unpaid: ${t}`),
  P(/^(\d+) Tage Vorlauf – anfangen war bis (.+) nötig\.$/, (m, n, d) => `${n} days lead time – should have started by ${d}.`),
  P(/^(\d+) Tage Vorlauf – anfangen spätestens (.+)\.$/, (m, n, d) => `${n} days lead time – start by ${d}.`),
  P(/^Starten spätestens am (.+)\. Ab dann erinnert MindSpace dich\.$/, (m, d) => `Start by ${d}. MindSpace will remind you from then.`),
  P(/^Starten spätestens: (.+)$/, (m, d) => `Start by: ${d}`),
  P(/^Erinnerung: (.+?)( Uhr)?( – liegt in der Vergangenheit)?$/, (m, d, u, past) => `Reminder: ${d}${past ? ' – in the past' : ''}`),
  P(/^Beginnt (.+?)\. Nach dem Abhaken legt MindSpace den nächsten Termin automatisch an – nächstes Mal (.+)\.$/, (m, a, b) => `Starts ${a}. When you tick it off, MindSpace creates the next one automatically – next time ${b}.`),
  P(/^Nach dem Abhaken legt MindSpace den nächsten Termin automatisch an – nächstes Mal (.+)\.$/, (m, b) => `When you tick it off, MindSpace creates the next one automatically – next time ${b}.`),
  P(/^Erledigt ✓ Nächstes Mal: (.+)$/, (m, d) => `Done ✓ Next time: ${d}`),
  P(/^Angelegt für (.+) ✓$/, (m, d) => `Created for ${d} ✓`), P(/^Angelegt ✓$/, () => 'Created ✓'),
  P(/^Verschoben auf (.+)$/, (m, d) => `Moved to ${d}`),
  P(/^Summe: (.+) % ✓$/, (m, s) => `Total: ${s} % ✓`), P(/^Summe: (.+) % – sollte 100 % ergeben$/, (m, s) => `Total: ${s} % – should be 100 %`),
  P(/^(\d+)\. Rate: (.+)$/, (m, n, t) => `Instalment ${n}: ${tr(t)}`),
  P(/^(.+) % des Gesamtpreises$/, (m, p) => `${p} % of the total price`),
  P(/^Budget( gesamt)?:$/, (m, g) => (g ? 'Total budget:' : 'Budget:')),
  P(/^(.+) über Budget$/, (m, a) => `${a} over budget`),
  P(/^(\d+) Einträge angelegt ✨$/, (m, n) => `${n} entries created ✨`),
  P(/^(\d+) (Aufgabe|Aufgaben) auf heute verschoben$/, (m, n) => `${n} ${n === '1' ? 'task' : 'tasks'} moved to today`),
  P(/^(\d+) Aufgaben (hinzugefügt|eingespielt)$/, (m, n, w) => `${n} tasks ${w === 'hinzugefügt' ? 'added' : 'restored'}`),
  P(/^(\d+) Dateien gespeichert 📎$/, (m, n) => `${n} files saved 📎`),
  P(/^Wird gespeichert … (\d+) von (\d+)$/, (m, a, b) => `Saving … ${a} of ${b}`),
  P(/^„(.+)“ ist zu groß \(höchstens 15 MB\)\.$/, (m, n) => `“${n}” is too large (max. 15 MB).`),
  P(/^„(.+)“ endgültig löschen\?$/, (m, n) => `Permanently delete “${n}”?`),
  P(/^(.+) löschen\?$/, (m, n) => `Delete ${n}?`),
  P(/^Aufgabe: (.+)$/, (m, t) => `Task: ${t}`), P(/^Kosten: (.+)$/, (m, t) => `Cost: ${t}`),
  P(/^(.+) übernehmen$/, (m, a) => `Apply ${a.replace(/Aufgaben?/g, (x) => (x === 'Aufgabe' ? 'task' : 'tasks')).replace(/Zahlungen?/g, (x) => (x === 'Zahlung' ? 'payment' : 'payments')).replace(/Kontakte?/g, (x) => (x === 'Kontakt' ? 'contact' : 'contacts')).replace(/ und /g, ' and ')}`),
  P(/^(.+) übernommen ✨$/, (m, a) => `${a.replace(/Aufgaben?/g, (x) => (x === 'Aufgabe' ? 'task' : 'tasks')).replace(/Zahlungen?/g, (x) => (x === 'Zahlung' ? 'payment' : 'payments')).replace(/Kontakte?/g, (x) => (x === 'Kontakt' ? 'contact' : 'contacts')).replace(/ und /g, ' and ')} applied ✨`),
  P(/^Ähnliche Aufgabe gibt es schon: „(.+)“$/, (m, t) => `A similar task already exists: “${t}”`),
  P(/^Gibt es schon unter Kosten: „(.+)“$/, (m, t) => `Already in Costs: “${t}”`),
  P(/^Aus der Nachricht (von .+?)?( vom .+?)?( \(älter im Verlauf\))?$/, (m, v, d, o) => `From the message${v ? ' ' + v.replace(/^von/, 'from') : ''}${d ? ' ' + d.replace(/^ vom/, ' of').trim() : ''}${o ? ' (earlier in the thread)' : ''}`),
  P(/^Ansprechpartner: (.+)$/, (m, n) => `Contact: ${n}`), P(/^starten bis (.+)$/, (m, d) => `start by ${d}`),
  P(/^E-Mail an (.+)$/, (m, n) => `E-mail ${n}`), P(/^Angelegt von (.+)$/, (m, n) => `Created by ${n}`),
  P(/^Version (\S+) – Speicher leeren und neu starten$/, (m, v) => `Version ${v} – clear cache and restart`),
  P(/^Farbe (#\w+)$/, (m, c) => `Colour ${c}`),
  P(/^heute (\d\d:\d\d)$/, (m, t) => `today ${t}`), P(/^gestern (\d\d:\d\d)$/, (m, t) => `yesterday ${t}`),
  P(/^(\d+) Kommentare$/, (m, n) => `${n} comments`), P(/^(\d+) Dateien$/, (m, n) => `${n} files`),
  P(/^Hallo (.*)$/, (m, n) => `Hello ${n}`),
  P(/^überfällig · (.+)$/, (m, k) => `overdue · ${tr(k)}`),
  P(/^(.+) · (Abschlag \/ Rate|Rechnung|Sonderwunsch|Eigenleistung|Nebenkosten|Finanzierung & Gebühren|Sonstiges)$/, (m, a, k) => `${tr(a)} · ${EN[k]}`),
  P(/^(\d+) (Aufgabe|Aufgaben)$/, (m, n) => `${n} ${n === '1' ? 'task' : 'tasks'}`),
  P(/^Fertig: (.+)$/, (m, a) => `Done: ${a}`),
  P(/^KI-Fehler (\d+): (.+)$/, (m, c, t) => `AI error ${c}: ${t}`),
];


// --- Version 10: Sprache, Design, Suche, Spracheingabe, Bündeln, Freigaben, Sperre
Object.assign(EN, {
  'Darstellung': 'Appearance', 'Sprache': 'Language', 'Deutsch oder Englisch': 'German or English', 'Design': 'Theme',
  'Hell, dunkel oder wie das System': 'Light, dark or like the system', 'Automatisch': 'Automatic', 'Hell': 'Light', 'Dunkel': 'Dark',
  'Suchen': 'Search', 'Was suchst du? z. B. „Wo ist der Bauvertrag?“': 'What are you looking for? e.g. “Where is the building contract?”',
  'Aufgaben, Dateien, Kosten, Kontakte …': 'Tasks, files, costs, contacts …', 'MindSpace sucht …': 'MindSpace is searching …',
  'E-Mails': 'E-mails', 'Frag MindSpace – die KI versteht auch Umschreibungen.': 'Ask MindSpace – the AI also understands paraphrases.',
  'Durchsucht Aufgaben, Kommentare, Fotos & Dokumente (auch Inhalte von Mail-Anhängen), Kosten, Kontakte und E-Mails.': 'Searches tasks, comments, photos & documents (including mail attachment contents), costs, contacts and e-mails.',
  'Mit Enter oder dem Mikrofon fragst du die KI – z. B. „Wo liegt die Rechnung vom Vermesser?“': 'Press Enter or use the microphone to ask the AI – e.g. “Where is the surveyor’s invoice?”',
  'Spracheingabe': 'Voice input', 'Sprachnotiz': 'Voice note', 'Was du gesagt hast': 'What you said', 'Aufgabe erkennen': 'Detect task',
  'Hier erscheint der Text – du kannst ihn auch bearbeiten.': 'The text appears here – you can also edit it.', 'Aufnahme starten': 'Start recording',
  'Tippen und sprechen, z. B. „Morgen um 10 die Bank wegen der Zinsbindung anrufen“': 'Tap and speak, e.g. “Call the bank about the fixed rate tomorrow at 10”',
  'Tippe unten ins Feld und nutze das Mikrofon der Tastatur.': 'Tap the field below and use the keyboard microphone.', 'Tippe ins Feld und nutze das Mikrofon der Tastatur.': 'Tap the field and use the keyboard microphone.',
  'Ich höre zu … Tippe noch einmal, wenn du fertig bist.': 'Listening … Tap again when you are done.', 'Fertig? Dann auswerten.': 'Done? Then analyse.',
  'Nichts verstanden – noch einmal versuchen.': 'Didn’t catch that – try again.', 'Wird ausgewertet …': 'Analysing …', 'Erkannt': 'Detected',
  'Keine Aufgabe erkannt. Formuliere es etwas konkreter, z. B. „Bis Freitag Steuerunterlagen sortieren“.': 'No task detected. Be a bit more specific, e.g. “Sort tax documents by Friday”.',
  'Sag oder schreib zuerst etwas.': 'Say or type something first.', 'Mikrofon nicht erlaubt – bitte in den Einstellungen freigeben.': 'Microphone not allowed – please allow it in settings.',
  'Nutze das Mikrofon der Tastatur.': 'Use the keyboard microphone.', '1 Aufgabe angelegt': '1 task created', '1 gebündelt': '1 merged',
  'Doch neu': 'Create anyway', 'Jemanden einladen': 'Invite someone', 'Zu allen Projekten oder nur zu einzelnen': 'To all projects or only some',
  'Wozu soll die Person Zugriff bekommen?': 'What should this person get access to?', 'Alle Projekte': 'All projects', 'Nur bestimmte Projekte': 'Only some projects',
  'Sieht und bearbeitet alles – wie du. Für Partnerin oder Partner.': 'Sees and edits everything – like you. For your partner.',
  'Z. B. Großeltern nur „Familie“ oder der Bauberater nur „Hausbau“. E-Mail-Ablage, KI-Schlüssel und Einstellungen bleiben verborgen.': 'E.g. grandparents only “Family” or the building advisor only “House build”. E-mail archive, AI key and settings stay hidden.',
  'Code erzeugen': 'Create code', 'Wähle mindestens ein Projekt.': 'Choose at least one project.', 'Zugriff:': 'Access:', 'Voller Zugriff wie du.': 'Full access like you.',
  'Aus dem gemeinsamen Bereich entfernen': 'Remove from the shared space', 'Entfernt': 'Removed', 'Keine Projekte': 'No projects',
  'Sicherheit': 'Security', 'Einschalten': 'Turn on', 'Ausschalten': 'Turn off', 'Gesperrt': 'Locked', 'Stattdessen mit Passwort anmelden': 'Sign in with password instead',
  'Sperre auf diesem Gerät aufheben': 'Remove lock on this device', 'Sperre aufheben?': 'Remove the lock?', 'Sperre ausgeschaltet': 'Lock turned off',
  'Biometrische Sperre ausschalten?': 'Turn off biometric lock?', 'MindSpace beim Öffnen biometrisch entsperren': 'Unlock MindSpace biometrically when opening',
  'An – MindSpace sperrt sich nach 2 Minuten im Hintergrund': 'On – MindSpace locks after 2 minutes in the background', 'Fingerabdruck / Gesichtserkennung': 'Fingerprint / face recognition',
  'Wochenblick': 'Week at a glance',
  'Auf jedem Gerät einmal selbst einschalten': 'Turn on once on every device',
  'Überfällig': 'Overdue', 'Heute fällig': 'Due today', 'Im Plan': 'On track', 'Farblegende': 'Colour legend',
  'App-Sperre': 'App lock', 'App-Sperre mit PIN': 'App lock with PIN', 'Stattdessen PIN-Code verwenden': 'Use a PIN instead', 'PIN (4–8 Ziffern)': 'PIN (4–8 digits)',
  'PIN wiederholen': 'Repeat PIN', 'PIN speichern': 'Save PIN', 'Bitte 4 bis 8 Ziffern eingeben.': 'Please enter 4 to 8 digits.', 'Die beiden PINs stimmen nicht überein.': 'The two PINs do not match.',
  'PIN-Sperre ist an 🔒': 'PIN lock is on 🔒', 'PIN stimmt nicht.': 'Wrong PIN.', 'Zu oft falsch – bitte mit Passwort anmelden.': 'Too many attempts – please sign in with your password.',
  'Entsperren': 'Unlock', 'Noch einmal versuchen': 'Try again', 'Das hat nicht geklappt.': 'That did not work.',
  'Face ID, Touch ID oder PIN – auf jedem Gerät einmal einschalten': 'Face ID, Touch ID or PIN – turn on once on every device',
  'MindSpace sperrt sich beim Öffnen und nach 2 Minuten im Hintergrund. Die Sperre gilt nur für dieses Gerät.': 'MindSpace locks when opened and after 2 minutes in the background. The lock applies to this device only.',
  'Auf dem iPhone braucht die Face-ID-Sperre den iCloud-Schlüsselbund – eine eigene Face-ID-Einstellung für MindSpace gibt es nicht.': 'On iPhone the Face ID lock needs iCloud Keychain – there is no separate Face ID setting for MindSpace.',
  'Abgebrochen oder auf diesem Gerät nicht erlaubt.': 'Cancelled or not allowed on this device.', 'Kein Schlüssel erhalten.': 'No key received.',

  'Nicht eingeschaltet. Prüfe in den iPhone-Einstellungen unter „Face ID & Code“, dass Face ID bzw. ein Code eingerichtet ist, und versuch es noch einmal.': 'Not turned on. In iPhone Settings → “Face ID & Passcode”, check that Face ID or a passcode is set up, then try again.',
  'Nicht eingeschaltet – abgebrochen oder auf diesem Gerät ist keine Entsperrung per Fingerabdruck/Gesicht eingerichtet.': 'Not turned on – cancelled, or no fingerprint/face unlock is set up on this device.',
  'Dieses Gerät oder dieser Browser unterstützt die biometrische Sperre nicht.': 'This device or browser does not support the biometric lock.',
});
PATTERNS.push(
  P(/^(\d{1,2}:\d{2}) Uhr$/, (m, t) => t),
  P(/^Bezahlt (.+), noch offen (.+?)(, Budget (.+))?$/, (m, a, b, c, d) => `Paid ${a}, still open ${b}${d ? `, budget ${d}` : ''}`),
  P(/^Spätestens am (.+) anfangen\.$/, (m, d) => `Start by ${d}.`),
  P(/^MindSpace fragen: „(.+)“$/, (m, q) => `Ask MindSpace: “${q}”`),
  P(/^(\d+) Aufgaben erkannt$/, (m, n) => `${n} tasks detected`),
  P(/^(\d+) Aufgaben angelegt$/, (m, n) => `${n} tasks created`), P(/^(\d+) gebündelt$/, (m, n) => `${n} merged`),
  P(/^(.+) · (.+) ✓$/, (m, a, b) => `${tr(a)} · ${tr(b)} ✓`), P(/^(1 Aufgabe angelegt|\d+ Aufgaben angelegt|1 gebündelt|\d+ gebündelt) ✓$/, (m, a) => `${tr(a)} ✓`),
  P(/^↺ Wird mit „(.+)“ gebündelt$/, (m, t) => `↺ Will be merged with “${t}”`),
  P(/^↺ Mit „(.+)“ bündeln statt neu anlegen$/, (m, t) => `↺ Merge with “${t}” instead of creating a new one`),
  P(/^Gibt es schon – zu „(.+)“ hinzugefügt$/, (m, t) => `Already exists – added to “${t}”`),
  P(/^Zu „(.+)“ hinzugefügt$/, (m, t) => `Added to “${t}”`),
  P(/^Es gibt schon eine ähnliche Aufgabe: „(.+)“\. Zusammenführen statt doppelt anlegen\?$/, (m, t) => `A similar task already exists: “${t}”. Merge instead of creating a duplicate?`),
  P(/^(.+) übernommen ✨ (\d+) gebündelt ↺$/, (m, a, n) => `${tr(a + ' übernommen ✨')} ${n} merged ↺`),
  P(/^ ?(\d+) gebündelt ↺$/, (m, n) => `${n} merged ↺`),
  P(/^Du bist zu (.+) eingeladen\. Weitere Projekte kann dir jemand mit vollem Zugriff freigeben\.$/, (m, a) => `You were invited to ${a === 'Alle Projekte' ? 'all projects' : a}. Someone with full access can share more projects with you.`),
  P(/^(.+) entfernen\? Die Person sieht danach nichts mehr\.$/, (m, n) => `Remove ${n}? They will no longer see anything.`),
  P(/^(.+) einrichten$/, (m, n) => `Set up ${tr(n)}`),
  P(/^Mit (.+) entsperren$/, (m, n) => `Unlock with ${tr(n)}`),
  P(/^Entsperren mit (.+) ist an 🔒$/, (m, n) => `Unlock with ${tr(n)} is on 🔒`),
  P(/^Aufgabe: (.+)$/, (m, t) => `Task: ${t}`),
);

export function tr(s) {
  if (LANG === 'de' || s == null) return s;
  const str = String(s);
  const lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0], core = str.trim();
  if (!core) return str;
  const out = trCore(core);
  return out === core ? str : lead + out + trail;
}
function trCore(core) {
  if (Object.prototype.hasOwnProperty.call(EN, core)) return EN[core];
  for (const [re, fn] of PATTERNS) { const m = core.match(re); if (m) return fn(...m); }
  // Symbol davor („🏡 Hausbau“, „↻ Jede Woche“, „📅 ohne Datum“)
  const sym = core.match(/^([^\p{L}\p{N}„“"(#]+?)\s*(\p{L}.*)$/u);
  if (sym && sym[2] !== core) { const inner = trCore(sym[2]); if (inner !== sym[2]) return `${sym[1]} ${inner}`.replace(/\s+/, ' '); }
  // Endet mit „ ›“ oder Doppelpunkt
  const tail = core.match(/^(.+?)(\s*[›:…]|\s*✓)$/);
  if (tail) { const inner = trCore(tail[1]); if (inner !== tail[1]) return inner + tail[2]; }
  return core;
}

// ---------------------------------------------------------------- Übersetzer für die Oberfläche
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const skip = (el) => !el || el.closest('[translate="no"], textarea, script, style, code, pre');
function trNode(n) {
  if (n.nodeType === 3) {
    if (skip(n.parentElement)) return;
    const v = n.nodeValue, t = tr(v);
    if (t !== v) n.nodeValue = t;
  } else if (n.nodeType === 1) {
    if (n.closest('[translate="no"]')) return;
    for (const a of ATTRS) { const v = n.getAttribute(a); if (v) { const t = tr(v); if (t !== v) n.setAttribute(a, t); } }
  }
}
function trWalk(root) {
  if (root.nodeType === 1 && skip(root)) return;
  trNode(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n; while ((n = w.nextNode())) trNode(n);
}
export function startTranslator() {
  document.documentElement.lang = LANG;
  if (LANG === 'de') return;
  const _confirm = window.confirm.bind(window);
  window.confirm = (m) => _confirm(tr(m));
  trWalk(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') trNode(m.target);
      else if (m.type === 'attributes') trNode(m.target);
      else m.addedNodes.forEach((n) => (n.nodeType === 3 ? trNode(n) : n.nodeType === 1 && trWalk(n)));
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
