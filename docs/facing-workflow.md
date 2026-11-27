# Planfräsen – erster durchgängiger Arbeitsablauf

**Status:** Experimentelle 3-Achs-Rust-Werkzeugbahnberechnung für einen rechteckigen
Rohblock. Keine NC-Ausgabe, keine Kollisions- oder Spannmittelprüfung.

## Start unter Windows

1. **Ohne Rust:** In den GitHub Actions den erfolgreichen Windows-Lauf öffnen,
   das Artefakt **Fertigungsstudio-CAM-Windows-Test** herunterladen,
   vollständig entpacken und `Start-Fertigungsstudio-Test.cmd` doppelt anklicken.
   **Mit Rust:** Stattdessen im Quellcode `Start-Fertigungsstudio.cmd` starten.
   Die reine HTML-Datei
   kann Parameter speichern, aber **keine** Werkzeugbahn berechnen.
2. Über **Setup → Rohteil und Material** Länge X, Breite Y und Höhe Z in mm eintragen.
3. In **Werkzeugliste** einen Schaft- oder Planfräser mit gültigem Durchmesser
   und Schneidenlänge anlegen. Optional zum Material Vc und fz eintragen.
4. **Fräsen → Planfräsen** wählen. Im Dialog Werkzeug wählen, die
   **Abtragstiefe**, **Tiefenzustellung**, **seitliche Zustellung**,
   **Sicherheitshöhe über Rohteil**, **Schnittvorschub** und
   **Eintauchvorschub** eintragen.
   Unter **Fräsrichtung** zwischen **Gleichlauf**, **Gegenlauf** und
   **Zickzack** wechseln. Die Spindelrichtung M3/M4 wird separat eingestellt.
   Bei Gleich-/Gegenlauf wird nach jeder Bahn auf die Sicherheitshöhe gefahren
   und im Eilgang direkt zum nächsten Startpunkt verfahren; bei Zickzack
   verbindet ein halbrunder Wendebogen die Bahnen auf Frästiefe. Die Auswahl
   wird pro Bearbeitung im Projekt gespeichert. Für die Zuordnung zu
   Gleich-/Gegenlauf wird Materialeingriff an der +Y-Werkzeugseite angenommen.
   Bei vollflächigem Eingriff ist die Bezeichnung nicht überall physikalisch
   eindeutig; eine CAM-Kollisionsprüfung existiert nicht.
5. **Werkzeugbahn berechnen**. Die Bahndaten kommen vom lokalen Rust-Kern,
   werden validiert und sofort als **Bahnen · Draufsicht** in kräftigem Grün (Schnitt),
   gestricheltem Rot (Eilgang) und Gelb (Eintauchen) angezeigt.
   Zwischen **Bahnen · Draufsicht** und **3D-Werkstück** wechseln;
   einzelne Tiefenlagen sind im Auswahlfeld getrennt sichtbar. **Sim** enthält die
   ein-/ausblendbaren Bewegungsarten, Werkzeug und Halter.
6. Unter **Sim → Bahn-JSON** können die neutralen numerischen
   Bewegungen als Datei gespeichert werden. Es handelt sich **nicht** um
   G-Code für Mach4 oder eine andere Steuerung.

Parameter in der Bedienoberfläche können unter **Datei → Speichern**
als Projekt-JSON gespeichert werden; die numerisch berechnete Werkzeugbahn
ist separat als Bahn-JSON exportierbar.

## Berechnungsannahmen

- Rechteckiger Rohblock von (0,0,0) bis (X,Y,Z), Z nach oben.
- Bahnzeilen parallel zur X-Achse von X = `-Werkzeugdurchmesser` bis
  `Rohteil-Länge + Werkzeugdurchmesser`, also mit deutlichem seitlichen
  Überlauf. Außerhalb der Rohteilgrenzen ist freier Raum angenommen.
- **Anheben:** Pro Querbahn auf sichere Z-Höhe fahren, mit Vorschub eintauchen,
  entlang X bearbeiten, am Ende auf Z-Sicherheitshöhe zurückziehen.
- **Halbrund:** Nur am Beginn jeder Tiefenlage eintauchen, dann abwechselnd
  in +X/-X bearbeiten und jede benachbarte Bahn mit einem tangentialen
  Halbkreis (Radius: halbe Querbahnabstandsbreite) verbinden. Die Kurve
  bleibt auf Schnitthöhe und wölbt sich außerhalb des Rohteils. Zum Schluss
  jeder Tiefenlage auf die Sicherheitshöhe zurückziehen; die nächste Lage
  beginnt wieder mit sicherem Anfahren. Die Kurve ist für den neutralen
  Rust-Werkzeugweg in kurze Vorschubsegmente mit höchstens 0,02 mm
  Sehnenabweichung aufgeteilt, also noch kein echter G2/G3-Kreis.
- Beim halbrunden Wenden ist zusätzlich zum bisherigen Fräserauslauf seitlich
  ausreichend Platz für den Wendebogen erforderlich. Spannmittel, Maschinen-
  grenzen und Freiraum bleiben ungeprüft.
- Das Verfahren braucht einen freien Verfahrweg links/rechts vom Rohteil.
  Spannmittel, Maschinenverfahrwege und Werkzeughalter werden nicht geprüft.
- Seitliche Zustellung maximal halber Werkzeugdurchmesser; die vollständige
  Breite wird durch gleichmäßig verteilte Querbahnen abgedeckt.
- Abtragstiefe maximal Rohteilhöhe und Schneidenlänge. Anzahl der
  Tiefenlagen durch `ceil(Abtragstiefe/Tiefenzustellung)`, wobei die
  letzte Lage exakt die Endhöhe erreicht.
- Ausgangsposition und berechnete Koordinaten sind rohteilbezogen.
  Ein gewählter Nullpunkt, XY-Achsendrehung (0/90/180/270 Grad) und
  Z-Umkehr werden in G54–G59-Werkstückkoordinaten umgerechnet,
  numerisch in der Simulation angezeigt und im neutralen Bahn-JSON mitgespeichert.
  Die 3D-Ansicht zeigt weiterhin die rohe Geometrie; Maschinenachsen und
  Spannmittel werden nicht überprüft.
- Drehzahl/Vorschub aus dem Materialprofil werden ausschließlich
  mathematisch berechnet. Maschine, Werkzeug und zulässige Schnittwerte
  müssen später gesondert validiert werden.

## Sicherheitsgrenzen

Diese Daten eignen sich ausschließlich zur Entwicklung und visuellen/
numerischen Prüfung. Sie dürfen **nicht zur Maschinensteuerung**
verwendet werden. Es gibt noch keine Maschinenkinematik, Werkzeugaufnahme-
Kollisionsprüfung, Materialabtragssimulation, Freifahrwegprüfung,
Anfahrsimulation aus tatsächlicher Maschinenposition oder geprüften
Mach4-Postprozessor.

## Wenn du die Bahn nicht erkennst

Nach **Werkzeugbahn berechnen** muss über der Ansicht **RUST-WERKZEUGBAHN**
und die Umschaltung **Bahnen · Draufsicht / 3D-Werkstück** erscheinen.
Die Draufsicht zeigt exakt die vom Rust-Kern gelieferten XY-Bewegungen.
**Alle Lagen** zeigt alle Tiefen gleichzeitig. Unter **Tiefenlage** kannst
 du einzelne Z-Höhen auswählen. In der 3D-Ansicht erscheint die Bahn
als kräftige Linie über dem Rohblock. Zum Vergleich stehen unten die
numerischen G54–G59-Koordinaten; ein Mauszeiger in der Draufsicht zeigt
rohteilbezogene X-/Y-Werte.

Fehlt die Umschaltung komplett, wurde keine gültige Rust-Werkzeugbahn geladen.
Bitte in diesem Fall die Fehlermeldung im Planfräsdialog bzw. unten im Fenster
kontrollieren und die **aktuelle Windows-Testversion** verwenden. Die reine HTML-
Demo zeigt lediglich illustrative Bahnen.
