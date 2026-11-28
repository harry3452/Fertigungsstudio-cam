# Fertigungsstudio CAM – Entwicklungsstand 28.11.2026

## Quellen und Versionsstand

- Aktueller Oberflächen-Quellcode: `prototype/fertigungsstudio-kacheln.html`, übernommen aus dem zuletzt bereitgestellten **Zurück-zur-Bearbeitung-FIX**-Paket vom 28.11.2026.
- Zugehörige Entwicklungs-Module: `prototype/modules/`, 21 JS-/CJS-/Python-Dateien aus dem hochgeladenen Windows-Installationsstand `Fertigungsstudio CAM(2).zip`.
- Die Einzelmodule sind ein **früherer Quellcode-Snapshot** als die neueste HTML-Datei. Nicht behaupten, dass jede Moduldatei separat die nachfolgenden HTML-Hotfixes enthält.
- Windows-Binärdateien und mitgelieferte Python-/Open-CASCADE-/VTK-Laufzeiten wurden nicht kopiert. Der Quellcode-Snapshot ist **kein fertiges Windows-Release**.

## Erarbeitete Funktionen

- Windows-Desktopoberfläche und STEP-/STL-Bauteilimport im bisherigen lokalen Testablauf.
- Rohteil-Setup und Modellpositionierung.
- Planfräsen: grundlegende Werkzeugbahnen und Simulation.
- Außenkonturen und Innenkonturen: Auswahl direkt an Modellkonturen; STEP-CAD-Kanten statt ausschließlicher STL-Dreieckskanten.
- Auswahl einer Zielhöhe am Modell; Bezeichnung nicht mehr ausschließlich auf STL bezogen.
- Innenkontur-Z-Höhen: auf Auswahl bezogene Start- und Zielhöhe; Korrekturen an `bottom_z` und Variablengültigkeit (Fehler `cutting is not defined`).
- Werkzeugverwaltung einschließlich Fräserschaftdurchmesser und Schneidenlänge.
- Maussteuerung: links auswählen, rechts drehen, mittlere Taste verschieben, Mausrad zoomen.
- Simulation: Start/Pause/Stopp, Einzelschritte vorwärts und rückwärts.
- Materialabtragsvorschau: verbesserte Flächendarstellung und Beleuchtung, Qualitätseinstellungen.
- Schaltfläche **Zur Bearbeitung** zum Verlassen der Simulationsansicht.

## Bekannte Einschränkungen / offene Arbeiten

- Die Materialabtragsdarstellung arbeitet mit einem **2,5D-Höhenraster**; sie ist kein vollständiger 3D-Zerspanungs- oder Kollisionsnachweis.
- Die genaue Schaftfreiheit, Eintauchwege, Maschinen- und Spannmittelkollisionen müssen noch geprüft werden.
- Außen- und Innenkonturstrategien benötigen weitere geometrische und praktische Testfälle.
- Die korrekte Zuordnung von Z-Ebenen, Tiefenzustellungen und Rohteilbezug muss weiterhin anhand realer Referenzbauteile geprüft werden.
- Die neue Materialdarstellung und der Rückkehr-Button wurden vom Anwender nicht abschließend in allen Abläufen bestätigt.
- Kein freigegebener G-Code-Postprozessor und **keine Freigabe für reale Maschinenbearbeitung**.
- Windows-Installer, Build-Pipeline und Binärverteilung müssen getrennt vom Quellcode-Snapshot gepflegt und getestet werden.

## Entwicklungsregeln

1. Bereits funktionierende Maussteuerung, Konturauswahl und Werkzeugbahn-Berechnung nicht ohne gezielte Regressionstests verändern.
2. Vor Änderungen eine eindeutige Quellversion bestimmen; nicht mehrere veraltete Update-Pakete kombinieren.
3. Updates auf Basis der tatsächlich verwendeten Version erzeugen und Prüfsummen gegen diese Version kontrollieren.
4. Fehlerfälle ausdrücklich anzeigen; keine Sicherheitsprüfung ohne passende Geometrieprüfung abschalten.
5. Änderungen erst nach Tests als stabil bezeichnen.

## Teststatus

Der lokale Nutzer bestätigte die grundlegende Konturauswahl, Maussteuerung und vorläufig die Innenkontur nach den Z-Korrekturen. Ein systematischer Windows-Grafiktest, eine vollständige Regression und eine Maschinenfreigabe liegen nicht vor.
