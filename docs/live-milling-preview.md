# Live-Auswahl für Fräsbearbeitungen (experimentell)

Der lokale Rust-Vorschauserver zeigt jetzt **Planfräsen, rechteckige
Außenkontur, rechteckige Tasche und Bohren** in derselben 3D-Bahnansicht.
Über der 3D-Vorschau gibt es vier auffällige, direkt anklickbare Schaltflächen.
Sie öffnen bei laufendem Rust-Server sofort den passenden Berechnungsdialog.
Beim direkten Öffnen der HTML-Datei bleiben die Schaltflächen sichtbar,
wählen aber nur eine illustrative Beispielbahn; der Status zeigt ausdrücklich
»Demomodus · Rust-Server nicht verbunden«.

## Start

```text
cargo run --locked --offline --example preview_server
```

Alternativ unter Windows: `Start-Fertigungsstudio.cmd` starten und
die ausgegebene lokale Browseradresse öffnen. Im Bedienentwurf zuerst
die Bearbeitung auswählen, dann **Berechnen** oder **Live-Bearbeitung**.

## Eingaben

- **Planfräsen:** vorhandene Rohblockmaße, Abtrag, Fräser, Zustellungen,
  Werkzeugnummer, Schneidenlänge und Vorschübe.
- **Außenkontur:** Rohblockumrandung mit Werkzeugradiusversatz und
  Tiefenzustellungen. Der Freiraum außerhalb des Rohblocks ist nicht geprüft.
- **Tasche:** Rechteck innerhalb des Rohblocks, Randabstand X und Y,
  Zustelltiefe und seitliche Zustellung.
- **Bohren:** vier symmetrische XY-Punkte mit Randabstand X und Y.
  Bohrschritt `0` bedeutet ohne Zwischenrückzug, ein positiver Wert
  führt zu vollständigem Rückzug auf Freifahrhöhe nach jedem Schritt.

Die gespeicherte Browser-Werkzeugbibliothek enthält derzeit ausschließlich
Fräswerkzeuge; bei Bohrungen werden Werkzeugdaten separat eingegeben.
Ein tatsächlicher Werkzeugwechsel oder eine Steuerungszuordnung erfolgt nicht.

## Schnittstelle

`POST /api/facing` behält das bestehende 11-Zahlen-Format und liefert
`fertigungsstudio-facing-v1`.

`POST /api/contour` akzeptiert dieselben 11 Zahlen und liefert
`fertigungsstudio-toolpath-v1` mit `operation: contour`.

`POST /api/pocket` und `POST /api/drilling` akzeptieren die 11 Zahlen
plus zwei Randabstände X/Y und liefern das gemeinsame Bahnformat mit
`operation: pocket` bzw. `operation: drilling`.

Die ausgegebenen Bewegungen werden von `CamPathData.validate` vor
der Darstellung strukturell geprüft. Diese Prüfung ist **keine
Kollisionsprüfung** und keine sichere NC-Freigabe.

## Einschränkungen

- Kein CAD-Modellimport und keine freien Konturen.
- Keine Materialabtragsimulation, Spannmittel-/Halterprüfung oder
  maschinenspezifische Kinematik.
- Die vorgegebene Werkzeugstartposition muss bereits sicher erreicht sein.
- Keine G-Code-Ausgabe, keine Maschinenverbindung.
- Die Rust-Prozesse laufen nur auf `127.0.0.1`; bekannte Same-Origin-
  Prüfungen bleiben für alle neuen Endpunkte aktiv.
- Beim Abbrechen wird keine teilweise berechnete Bahn angezeigt.

Test: `cargo test --locked --offline --workspace --all-targets`
und `node prototype/test-live.cjs` nach dem Build des Servers.
