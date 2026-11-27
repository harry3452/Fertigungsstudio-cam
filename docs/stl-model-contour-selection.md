# STL-Kontur am 3D-Modell anklicken (Teststand)

Fertigungsstudio CAM importiert jetzt echte **ASCII- und Binär-STL-Meshes**
(maximal 8 MB und 20.000 Dreiecke). Aus den Dreiecken werden geschlossene
Kantenketten auf der **höchsten waagerechten Fläche** gebildet. Der Benutzer
kann diese Konturen direkt im 3D-Fenster anklicken und mit dem Rust-Kern
eine versetzte 2D-Werkzeugbahn dafür berechnen.

## Bedienung

1. Windows-ZIP entpacken, Start-Fertigungsstudio-Test.cmd starten.
2. Unter Setup → Rohteil die Abmessungen eintragen. Das Modell muss
   vollständig in das Rohteil passen. STL-Koordinaten gelten als Millimeter.
3. Datei → Bauteil laden → eine .stl-Datei öffnen.
4. Fräsen → Außenkontur oder Innenkontur wählen.
5. **Kontur im 3D-Modell anklicken**: Der Dialog schließt. Durch Ziehen
   das Modell drehen, mit dem Mausrad zoomen und eine hervorgehobene
   geschlossene Oberkantenkontur anklicken.
6. Im automatisch wieder geöffneten Konturdialog Schaftfräser,
   Gleich-/Gegenlauf, M3/M4, Tiefe, Vorschub und Sicherheitshöhe
   festlegen und **Werkzeugbahn berechnen** drücken.
7. Den berechneten Polygon-Werkzeugweg isometrisch oder über
   Bahnen · Draufsicht kontrollieren.

Das klassische manuelle Rechteck bleibt als alternative Konturquelle.

## Stand und Grenzen

- Es werden derzeit **nur Randketten der höchsten waagerechten
  STL-Fläche** gefunden; beliebige schräge oder tiefer liegende
  Modellkanten und STEP-/IGES-Dateien bleiben ununterstützt.
- Ein STL-Mesh enthält nur Dreiecke, keine analytisch exakten Radien
  oder Kreisbögen. Kurven werden als Polygonsegmente behandelt.
- Modellplatzierung: XY zentriert im aktuellen Rohteil, Oberkante
  auf Rohteil-Z-Oberseite. Keine reale Aufspannungsprüfung.
- Der Werkzeugradiusversatz nutzt Schnittpunkte paralleler
  Liniensegmente; selbstschneidende, zu enge oder zu spitzwinklige
  Konturen können abgelehnt werden.
- **Innenkonturen starten mit einer senkrechten Zustellung**, deren
  Freiraum nicht geprüft ist. Eine bestehende freie Eintrittsstelle
  müsste gesondert nachgewiesen werden.
- Importierte STL-Meshes werden **nicht in die Projektdatei gespeichert**.
  Nach einem Neustart STL neu laden und Kontur erneut auswählen.
- Keine Maschinen-/Spannmittel-Kollisionsprüfung, keine Materialabtrags-
  simulation, keine Ausgabe von G-Code oder freigegebene Maschinenbahnen.

Nächste Ausbaustufe: STEP-/B-Rep-Geometrieimport, echte CAD-Kantenselektion,
beliebige Z-Niveaus sowie sichere Ein- und Ausfahrstrategien.
