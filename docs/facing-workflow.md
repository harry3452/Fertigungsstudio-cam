# Planfräsen – erster durchgängiger Arbeitsablauf

**Status:** Experimentelle 3-Achs-Rust-Werkzeugbahnberechnung für einen rechteckigen
Rohblock. Keine NC-Ausgabe, keine Kollisions- oder Spannmittelprüfung.

## Start unter Windows

1. Projekt mit Rust installiert öffnen, `Start-Fertigungsstudio.cmd` starten
   und die angezeigte lokale Browseradresse öffnen. Die reine HTML-Datei
   kann Parameter speichern, aber **keine** Werkzeugbahn berechnen.
2. Über **Setup → Rohteil und Material** Länge X, Breite Y und Höhe Z in mm eintragen.
3. In **Werkzeugliste** einen Schaft- oder Planfräser mit gültigem Durchmesser
   und Schneidenlänge anlegen. Optional zum Material Vc und fz eintragen.
4. **Fräsen → Planfräsen** wählen. Im Dialog Werkzeug wählen, die
   **Abtragstiefe**, **Tiefenzustellung**, **seitliche Zustellung**,
   **Sicherheitshöhe über Rohteil**, **Schnittvorschub** und
   **Eintauchvorschub** eintragen.
5. **Werkzeugbahn berechnen**. Die Bahndaten kommen vom lokalen Rust-Kern,
   werden validiert und in der 3D-Ansicht angezeigt. **Sim** enthält die
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
- Pro Querbahn auf sichere Z-Höhe fahren, mit Vorschub eintauchen,
  entlang X bearbeiten, am Ende auf Z-Sicherheitshöhe zurückziehen.
- Das Verfahren braucht einen freien Verfahrweg links/rechts vom Rohteil.
  Spannmittel, Maschinenverfahrwege und Werkzeughalter werden nicht geprüft.
- Seitliche Zustellung maximal halber Werkzeugdurchmesser; die vollständige
  Breite wird durch gleichmäßig verteilte Querbahnen abgedeckt.
- Abtragstiefe maximal Rohteilhöhe und Schneidenlänge. Anzahl der
  Tiefenlagen durch `ceil(Abtragstiefe/Tiefenzustellung)`, wobei die
  letzte Lage exakt die Endhöhe erreicht.
- Ausgangsposition und berechnete Koordinaten sind rohteilbezogen.
  **Ein im Setup gewählter Nullpunkt, gedrehte Achsen oder Z-Umkehr
  sind noch nicht in die Werkzeugbahnen transformiert.**
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
