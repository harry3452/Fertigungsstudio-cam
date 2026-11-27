# STL-Kontur am 3D-Modell anklicken (Teststand)

Fertigungsstudio CAM importiert jetzt echte **ASCII- und Binär-STL-Meshes**
(maximal 8 MB und 20.000 Dreiecke). Aus den Dreiecken werden geschlossene
Kantenketten auf der **höchsten waagerechten Fläche** gebildet. Der Benutzer
kann diese Konturen direkt im 3D-Fenster anklicken und mit dem Rust-Kern
eine versetzte 2D-Werkzeugbahn dafür berechnen.

## Bedienung

1. Windows-ZIP entpacken, Start-Fertigungsstudio-Test.cmd starten.
2. **Datei → Bauteil laden**: eine STL-Datei importieren. Das aktuelle
   Rohteil wird **automatisch auf den geometrischen STL-Hüllkasten** gesetzt:
   X/Y/Z-Bauteilabmessungen, kein willkürliches Aufmaß.
3. **Setup → Rohteil und Material** öffnen. X/Y/Z-Rohteilmaße vergrößern
   oder verkleinern. Im selben Dialog die **Bauteillage X−, Y−, Z−**
   eintragen. Die eingebettete **isometrische 3D-Vorschau** zeigt das
   reale STL-Mesh in Blau und den Rohteilrahmen in Gelb. Die sechs
   Randabstände werden in Millimetern angezeigt.
   - **Passend umrahmen** setzt Rohteil und Bauteillage auf die STL-Hülle.
   - **In XY zentrieren · oben bündig** verteilt den Überstand in XY
     gleichmäßig und richtet die Modelloberkante an der Rohteiloberkante aus.
   - Bei unzulässigen Abmessungen/Positionen wird „Übernehmen“ gesperrt.
4. **Übernehmen** speichern. Die Rohteilposition wird im Projekt mitgespeichert,
   das STL-Mesh selbst nicht. Beim erneuten Import **derselben STL-Datei**
   wird die passende gespeicherte Rohteilposition wiederhergestellt.
5. Fräsen → Außenkontur oder Innenkontur wählen.
6. **Kontur im 3D-Modell anklicken**: Der Dialog schließt. Durch Ziehen
   das Modell drehen, mit dem Mausrad zoomen und eine hervorgehobene
   geschlossene Oberkantenkontur anklicken.
7. Im automatisch wieder geöffneten Konturdialog Schaftfräser,
   Gleich-/Gegenlauf, M3/M4, Tiefe, Vorschub und Sicherheitshöhe
   festlegen und **Werkzeugbahn berechnen** drücken.
8. Den berechneten Polygon-Werkzeugweg isometrisch oder über
   Bahnen · Draufsicht kontrollieren.

Das klassische manuelle Rechteck bleibt als alternative Konturquelle.

## Stand und Grenzen

- Es werden derzeit **nur Randketten der höchsten waagerechten
  STL-Fläche** gefunden; beliebige schräge oder tiefer liegende
  Modellkanten und STEP-/IGES-Dateien bleiben ununterstützt.
- Ein STL-Mesh enthält nur Dreiecke, keine analytisch exakten Radien
  oder Kreisbögen. Kurven werden als Polygonsegmente behandelt.
- Beim Import wird zuerst die Rohteilhülle des STL-Modells berechnet.
  Rohteil X/Y/Z und der Bauteil-Offset sind anschließend frei einstellbar,
  solange das Modell vollständig hineinpasst.
- Die gewählte Rohteilbox wird in der 3D-Ansicht sichtbar um das STL
  gezeichnet; der Rohteil-Dialog bietet zusätzlich eine 3D-Vorschau.
- **Für die 2D-Kontur am Modell muss die Modelloberkante mit der
  Rohteiloberseite bündig sein.** Anderenfalls ist die bisherige
  Tiefenberechnung nicht passend und die Bahnberechnung wird abgewiesen.
  Eine Frässtrategie für beliebige Z-Niveaus fehlt noch.
- Keine reale Aufspannungsprüfung.
- Der Werkzeugradiusversatz nutzt Schnittpunkte paralleler
  Liniensegmente; selbstschneidende, zu enge oder zu spitzwinklige
  Konturen können abgelehnt werden.
- **Innenkonturen starten mit einer senkrechten Zustellung**, deren
  Freiraum nicht geprüft ist. Eine bestehende freie Eintrittsstelle
  müsste gesondert nachgewiesen werden.
- Importierte STL-Meshes werden **nicht in die Projektdatei gespeichert**.
  Rohteilmaße, Modelllage und Dateiname/Abmessungen werden gespeichert.
  Nach einem Neustart dieselbe STL neu laden (Rohteillage wird
  wiederhergestellt) und Kontur erneut auswählen.
- Keine Maschinen-/Spannmittel-Kollisionsprüfung, keine Materialabtrags-
  simulation, keine Ausgabe von G-Code oder freigegebene Maschinenbahnen.

Nächste Ausbaustufe: STEP-/B-Rep-Geometrieimport, echte CAD-Kantenselektion,
beliebige Z-Niveaus sowie sichere Ein- und Ausfahrstrategien.
