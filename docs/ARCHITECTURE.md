# Fertigungsstudio CAM — modulare Rust-Grundstruktur

**Status:** Architektur und Datentypen, keine fertige CAM-Funktion.
Es gibt noch keine Werkzeugwegberechnung, Verifikation, G-Code-Ausgabe,
Maschinenanbindung oder funktionierende SolidCraft-Integration.
Diese Grundstruktur darf keine Maschine steuern.

## Zielbild

Ein gemeinsamer, von der Oberfläche unabhängiger CAM-Kern für:
- eigenständige Desktop-Anwendung;
- optionale SolidCraft-Einbindung, falls die Host-Schnittstellen das erlauben.

Drei Bearbeitungstechnologien werden getrennt modelliert:

| Verfahren | Startumfang | Später | Besondere Anforderungen |
| --- | --- | --- | --- |
| Fräsen | 3-Achs-Planen, Kontur, Tasche, Bohren | 3+2-Indexbearbeitung, simultane 5 Achsen | Werkzeuglage, Rundachsen, TCP, Kinematik, Kollisionen |
| Drehen | X/Z-Planen, Schruppen, Schlichten, Einstechen | Bohren, Gewinde, angetriebene Werkzeuge | X als Durchmesser/Radius, mm/Umdrehung, Werkzeugkorrektur |
| Laser | 2D-Schneiden, Gravieren | Mehrere Durchgänge, Markieren | Schnittfuge, Leistung, Ein-/Auslauf, Abschaltung bei Leerfahrt |

Die Definition von fünf Achsen ist noch keine fertige 5-Achs-Kinematik.
Achspunkte, -richtungen, Maschinengeometrie und Werkzeuglängen sind später
maschinenbezogen abzubilden. 3+2 und simultane 5-Achs-Bewegungen bleiben getrennt.

## Erste Rust-Dateien

- Cargo.toml: Workspace.
- crates/fertigungsstudio-cam-core/src/machine.rs: Maschinen- und Achstypen.
- crates/fertigungsstudio-cam-core/src/motion.rs: Posen, Vorschubarten, Bewegungen, Prozesszustände.
- crates/fertigungsstudio-cam-core/src/operation.rs: Fräs-, Dreh- und Laseroperationen.

Der Kern hat noch keine externen Rust-Abhängigkeiten. Zusätzliche Crates kommen
erst hinzu, wenn die jeweiligen Schnittstellen und Tests feststehen.

## Geplante Trennung (noch nicht implementiert)

1. Geometrieadapter: Modell, Rohmaterial und Spannmittel ohne feste CAD-Abhängigkeit.
2. Bahnplanung: Je Verfahren eigene Operationen, neutrale Werkzeugbahn.
3. Maschinenkinematik: Achsbewegungen und Grenzprüfung, einschließlich Rundachsen.
4. Verifikation: Geometrie, Werkzeug/Halter, Kollisions- und Schnellgangkontrolle.
5. Postprozessoren: Steuerungsspezifische NC-Ausgabe, später auch Mach4 Fräsen/Drehen.
6. Oberfläche: Desktop und optionale SolidCraft-Einbindung, Deutsch/Englisch per Katalog.

## Grenzen und Sicherheitsregeln

- Werkzeugwechsel benötigen eine geprüfte, maschinenbezogene Sicherheitsposition.
- Drehen benötigt einen ausdrücklich festgelegten X-Durchmesser-/Radiusmodus.
- 5-Achs-Programme benötigen TCP-/Längenkorrektur und Kinematikprüfung.
- Laser muss bei Verfahrbewegungen und Fehlerzuständen abgeschaltet sein.
- Datenvalidierung ist keine Kollisionsprüfung und keine sichere NC-Freigabe.

**Nächster Schritt:** Mit Issue #1 den ersten Umfang bestätigen, ein
versioniertes Aufspannungs-/Projektformat definieren und anschließend einen
analytisch prüfbaren 3-Achs-Planfräs-Vorgang implementieren.
