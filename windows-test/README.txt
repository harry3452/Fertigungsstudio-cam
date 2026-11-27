FERTIGUNGSSTUDIO CAM - WINDOWS TESTVERSION
===========================================
1. Alle Dateien dieses Pakets in einen neuen Ordner entpacken.
2. Start-Fertigungsstudio-Test.cmd doppelt anklicken.
3. Die lokale Seite öffnet sich in deinem Standardbrowser.
4. Setup > Rohteil und Material: Größe auswählen.
5. Werkzeugliste: Schaft- oder Planfräser hinterlegen.
6. Fräsen > Planfräsen: Werkzeug wählen, Abtragstiefe,
   Tiefenzustellung, seitliche Zustellung, Sicherheitshöhe,
   Schnittvorschub und Eintauchvorschub eingeben.
7. Werkzeugbahn berechnen, danach in Sim ansehen.
   Die G54-G59-Arbeitskoordinaten erscheinen im Simulationsfeld.
8. Sim > Bahn-JSON speichert die neutralen lokalen und
   transformierten Werkstückkoordinaten als JSON (kein NC-Code).
9. Enter im Startfenster stoppt den lokalen Dienst.

Voraussetzungen: Windows 11 x64; kein Rust und kein Python erforderlich.
Serveradresse ist ausschließlich http://127.0.0.1:47631/ (lokal).
Wenn der Start scheitert, vorhandenes Vorschaufenster schließen
und erneut versuchen. Fehlermeldung im Konsolenfenster lesen.

WICHTIG: Experimentelle 3-Achs-Rechteck-Rohteilbearbeitung.
Keine Spannmittel-, Kollisions-, Maschinen- oder
Materialabtragsprüfung; niemals zur Steuerung einer CNC nutzen.
