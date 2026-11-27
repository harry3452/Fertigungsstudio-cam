# Fertigungsstudio CAM

**Deutsch** · [English](README.en.md)

Ein gemeinschaftlich zu entwickelndes CAM mit zwei geplanten Zugängen: als
eigenständiges Programm und optional direkt in SolidCraft. Die Oberfläche soll
übersichtlich, mehrsprachig und auf den Arbeitsablauf in der Werkstatt ausgelegt sein.

**Status: Oberflächenprototyp und erster experimenteller Rust-Kern. Noch kein nutzbares CAM.**
Fertigungsstudio ist ein Arbeitsname und kein offizielles SolidCraft-Projekt.

![Fertigungsstudio CAM: deutsche Symbolkacheln, Bearbeitungsbaum und schematische Werkstückvorschau](docs/images/fertigungsstudio-preview.jpg)

*Das Bild zeigt den früheren Bedienentwurf vom 24. November 2026. Die aktuelle Oberfläche mit einreihiger Symbolleiste, Bearbeitungsbaum links und erweiterbarem Setup ist noch nicht abgebildet.*

## Vorschau starten

`prototype/fertigungsstudio-kacheln.html` im Browser öffnen. Keine Installation,
kein Server und keine zusätzlichen Pakete nötig. Die Anzeige ist derzeit deutsch.

**Neue Bedienoberfläche:** Ganz oben eine Symbolkachelreihe **Datei, Setup, Werkzeugliste, Fräsen, 3D Fräsen, Drehen, Laser, Sim, Post** sowie Hell/Dunkel. Links steht nur der Bearbeitungsbaum; rechts daneben die 3D-Werkstückansicht.

Im **Datei-Menü** lassen sich Demo-Projekte als JSON exportieren/importieren und »Programm beenden« auswählen (nur die Browseroberfläche wird geschlossen). **Setup** enthält Rohteilabmessungen, eigene Materialien, Aufspannung und einen interaktiven Nullpunktdialog: Ecken, Kantenmitten, freie XYZ-Werte, vertikale Z-Kanten, XY-Achsdrehung und Z-Umkehr. Alle Angaben sind Projekt-Einstellungen; die Achsentransformation wird noch nicht auf Werkzeugbahnen angewendet.

Die **Werkzeugliste** verwaltet Fräs- und Drehwerkzeugformen, Geometriedaten, frei benannte Halter und Materialprofile mit Schnittgeschwindigkeit, Vorschub und Zustellung. Die Drehzahl- und Vorschubberechnung ist informativ, nicht als Bearbeitungsempfehlung geprüft. Eine ausgewählte STEP/STL/IGES-Halter- oder Bauteildatei wird bisher **nur dem Namen nach vorgemerkt**; ein echter 3D-CAD-Import fehlt. Die Werkzeug-/Materialbibliothek wird – wenn Browser-Speicherung erlaubt ist – im Browser lokal gehalten und gehört auch zu exportierten Demo-Projekten.

**Windows-Test ohne Rust-Installation:** Auf der [Actions-Seite](https://github.com/harry3452/Fertigungsstudio-cam/actions/workflows/rust.yml) den letzten **erfolgreichen** Windows-Lauf öffnen und das Artefakt `Fertigungsstudio-CAM-Windows-Test` herunterladen. ZIP vollständig entpacken und `Start-Fertigungsstudio-Test.cmd` doppelt anklicken. Der lokale Vorschau-Server ist im Paket enthalten; kein Rust-Build auf dem Heimrechner nötig.

**Erstes funktionsfähiges Planfräsen:** Im lokalen Rust-Livebetrieb können jetzt Rohteil und ein geeignetes Werkzeug aus der neuen Oberfläche ausgewählt, Abtragstiefe, Zustellungen, freie Sicherheitshöhe und Vorschübe eingegeben sowie eine echte neutrale Planfräs-Werkzeugbahn berechnet werden. Ergebnis: Tiefenlagen, Bahnanzahl und Bewegungen in der Simulation, zusätzlich als **Bahn-JSON** exportierbar (kein NC-Code). Der gespeicherte freie Nullpunkt, G54–G59, XY-Achsdrehungen um 90° und eine umgekehrte Z-Richtung werden jetzt numerisch in der Bahn-JSON und Simulation berücksichtigt. Die ursprüngliche Rohteilgeometrie bleibt für die Darstellung unverändert; Maschinen-/Kollisionsprüfung fehlt. [Bedienung und Grenzen](docs/facing-workflow.md).

**Neu: 2D-Kontur – rechteckige Außen-/Innenkontur:** Im Studio über **Fräsen → Außenkontur** bzw. **Innenkontur** mit echtem Rust-Werkzeugweg, Werkzeugradiusversatz (Ø/2), M3/M4 und Gleich-/Gegenlauf, Tiefenzustellung, Sicherheitshöhe und numerischer 3D-/2D-Bahnkontrolle. Nur Rechtecke, keine frei importierten CAD-Konturen; insbesondere bei der Innenkontur ist ein freier Eintauchbereich **nicht geprüft**. [Testanleitung](docs/contour-workflow.md).

**Planfräsen mit Fräsrichtung und direkter Rückfahrt:** Gleichlauf/Gegenlauf (abhängig von M3/M4 und +Y-Eingriff) schneiden einseitig, heben nach jeder Bahn an und fahren auf direktem XY-Weg zur nächsten Bahn. Zickzack behält halbrunde Wendekurven auf Frästiefe. Die Zuordnung gilt nur unter der angegebenen Eingriffsannahme; keine Kollisions- oder Maschinenprüfung.

**Planfräsen mit wählbarem Bahnwechsel:** Im Planfräs-Dialog zwischen halbrundem Wendebogen auf Frästiefe (gegenläufige Bahnen, nur zwischen Tiefenlagen Rückzug) und klassischem Anheben nach jeder Bahn umschalten. Der Bogen wird als kurze Vorschubsegmente von Rust berechnet. Außerhalb des Rohteils ist ausreichend freier Raum erforderlich; keine Kollisionsprüfung.

**Deutliche berechnete Bahnansicht:** Nach dem Planfräsen öffnet sich automatisch die echte XY-Werkzeugbahn als Draufsicht. Alle Tiefenlagen oder einzelne Z-Lagen auswählbar, dazu ein Schalter zur 3D-Werkstückansicht. Grün = Vorschub/Schnitt, Rot gestrichelt = Eilgang, Gelb = Z-Eintauchen. [Anleitung](docs/facing-workflow.md).

**Sim** schaltet bei Rust-Bahndaten Schnitt-, Eilgang- und Z-An-/Abfahrbewegungen sowie Werkzeug-/Halterdarstellung ein und aus. Geometrie und Halter sind dabei nur schematisch; es gibt keinen geprüften Materialabtrag oder Kollisionsnachweis. Die ältere Bedienoberfläche bleibt intern als Fallback vorhanden.

Für eine reale Rust-Berechnung der vier unterstützten rechteckigen Verfahren die lokale Vorschau starten und oben **Fräsen → Planfräsen / Außenkontur / Taschenfräsen / Bohren** wählen. Beim Öffnen der HTML-Datei allein bleiben die Bahnen illustrativ.

Der erste Rust-Kern berechnet eingeschränkte Planfräsbahnen für rechteckige
Rohblöcke. Über „Rust-Demo“ zeigt die Vorschau einen berechneten Datensatz;
weitere Rust-Bahnen können als JSON-Datei geladen werden. Mit
`cargo run --locked --offline --example preview_server` startet eine lokale
Live-Vorschau: gedruckte Adresse öffnen und **direkt auf eine der vier
Bearbeitungsschaltflächen** klicken. Der passende Rust-Parameterdialog öffnet
sich. Der Status lautet dann »Rust-Livebetrieb · Berechnung bereit«.
Eine alte lokal gespeicherte HTML-Kopie muss nach dem Update ersetzt werden.
Unter Windows geht das auch per Doppelklick auf `Start-Fertigungsstudio.cmd`
(Rust und Build-Werkzeuge müssen installiert sein).
Eine Kollisionsprüfung ist noch nicht vorhanden.

**Experimenteller Rust-Kern:** Zusätzlich berechnet der Rust-Kern
jetzt einfache rechteckige Außenkonturen, Taschen und axiale Bohrungen mit
optionalem vollständigem Rückzug zwischen den Bohrschritten. Diese Funktionen
sind mit der gemeinsamen Auftragsstruktur verbunden und im lokalen Rust-Server
über **Live-Bearbeitung → Bearbeitungsart** auswählbar. Das Rust-Beispiel
`cargo run --locked --offline --example milling_ops` ist weiterhin verfügbar.
[Live-Bedienung](docs/live-milling-preview.md).
[Umfang und Grenzen](docs/milling-operations.md).
Aufbau, Prüfungen und Grenzen: [Erster Kernbaustein](docs/core-first-step.md).

Die modulare Rust-Erweiterung in PR #7 definiert Maschinen, Werkzeugtypen,
Aufspannungen sowie Fräs-, Dreh- und Laseroperationen. Ein Adapter verbindet
validierte 3-Achs-Planfräsaufträge mit der bestehenden Planfräsberechnung und
Werkzeugbibliothek. Andere Verfahren sind derzeit **nur Datenmodelle**.
Die Einzelheiten stehen in [Architektur](docs/ARCHITECTURE.md).

Nicht vorhanden: realer CAD-Import, allgemeine Werkzeugwegberechnung, Materialabtrags-
und Kollisionsprüfung, geprüfter NC-Export oder eine SolidCraft-Anbindung.
Der Entwurf darf nicht zur Steuerung einer Maschine verwendet werden.

## Was wir bauen möchten

- Einen gemeinsamen, von der Oberfläche unabhängigen CAM-Kern.
- Ein eigenständiges Programm und eine optionale SolidCraft-Anbindung.
- Eine große Modellansicht, einen Bearbeitungsbaum links und oben klar
  beschriftete Symbolkacheln in Funktionsgruppen.
- Einen zentralen Einstellungsdialog und gezielt einblendbare Bearbeitungsparameter.
- Mehrsprachigkeit von Beginn an: zunächst Deutsch und Englisch, weitere
  Sprachen über Übersetzungsdateien. Die Sprache ist eine Nutzereinstellung.
- Der Kern wird für **3-/5-Achs-Fräsen, Drehen und Laserschneiden** ausgelegt.
  Die erste vorhandene Berechnung ist das begrenzte **3-Achs-Planfräsen**.
  Konturen, Taschen, Bohren, Drehen, Laser und simultane 5-Achs-Bewegungen
  sind noch keine implementierten Werkzeugwegverfahren.

Der Integrationsweg muss noch untersucht werden. Weder ein funktionierendes
SolidCraft-Plugin noch eine Zustimmung der SolidCraft-Maintainer wird behauptet.
Die spätere Anwendung soll in Rust entstehen; HTML/JavaScript dienen hier nur
zum Erproben des Bedienkonzepts. Funktionen werden eigenständig gestaltet;
Herstellercode, Symbole oder Oberflächen anderer CAD-Produkte werden nicht kopiert.

## Mitentwickler gesucht

Wir möchten die Entwicklung gemeinsam tragen. Gesucht werden Menschen, die
Rust programmieren, Oberflächen entwickeln, CAM-Verfahren verstehen,
Postprozessoren prüfen oder Übersetzungen und Tests beitragen möchten.

Konkrete Einstiegspakete stehen in [TASKS.md](TASKS.md), die Zusammenarbeit in
[CONTRIBUTING.md](CONTRIBUTING.md). Noch keine Aufgaben sind vergeben.

## Mehrsprachigkeit

[docs/multilingual.md](docs/multilingual.md) hält die Anforderungen fest.
Die spätere Oberfläche darf Texte nicht fest im Programm verteilen.
G-Code, Projektformate und öffentliche Befehlskennungen bleiben sprachunabhängig.
Die Übersetzungsanbindung ist im Prototyp noch nicht implementiert.

## Lizenz und Veröffentlichung

Der eigene Code, die Dokumentation und die eigenen Symbole dieses Pakets stehen
unter der [Apache License 2.0](LICENSE). Hinweise zur Herkunft stehen in
[NOTICE](NOTICE). Die Lizenz erteilt keine Markenrechte am Projektnamen oder Logo.
Bereits unter Apache 2.0 veröffentlichte Bestandteile bleiben unter diesen
Bedingungen nutzbar; eine spätere andere Lizenz gilt nicht rückwirkend.
SolidCraft- oder CamCraft-Code und die bisherigen Rust-Patches sind hier nicht
enthalten. Deren Wiederverwendung muss separat geprüft werden.

Das [GitHub-Repository](https://github.com/harry3452/Fertigungsstudio-cam) ist
öffentlich. Interessierte können die [offenen Aufgaben](https://github.com/harry3452/Fertigungsstudio-cam/issues)
ansehen und sich dort zur Mitarbeit melden.
