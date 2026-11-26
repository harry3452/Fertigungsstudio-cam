# Fertigungsstudio CAM — gemeinsame Rust-Architektur

**Stand:** Ein eingeschränkter 3-Achs-Planfräsalgorithmus mit Live-Vorschau
existiert im Entwicklungszweig. Die Datentypen für 5-Achs-Fräsen, Drehen und
Laser sind vorbereitet, **aber dafür gibt es noch keine Werkzeugwegberechnung**.
Es existieren kein geprüfter NC-Export, keine Maschinenanbindung und keine
nachgewiesene SolidCraft-Integration. **Die Ausgabe darf keine Maschine steuern.**

## Gemeinsamer Kern

Rust-Workspace: `crates/cam-core` — ein Crate, keine parallelen CAM-Engines.

- `src/lib.rs`: vorhandene, begrenzte Rechteck-Planfräsberechnung;
  Startposition und neutrale Bewegungsfolge, noch kein G-Code.
- `src/tools.rs`: bestehende nummerierte Fräswerkzeugbibliothek der
  Live-Vorschau mit Werkzeugvorschüben und Schneidenlängen.
- `src/domain/machine.rs`: Maschinenklassen und Achsdefinitionen,
  X-Durchmesser-/Radiusmodus beim Drehen.
- `src/domain/motion.rs`: neutrale Werkzeuglage, Vorschub-Einheiten,
  Bewegungs- und Prozesszustände.
- `src/domain/operation.rs`: getrennte Fräs-, Dreh- und Laseroperationen.
- `src/domain/tool.rs`: allgemeine Werkzeugdefinitionen für alle
  Fertigungstechnologien, einschließlich Schneidengeometrie und Laser-Schnittfuge.
- `src/domain/setup.rs`: Werkstückkoordinaten, Rohmaterial und Aufspannungen.
- `src/domain/plan.rs`: Zuordnung Maschine → Aufspannung → Werkzeug →
  Operation; prüft Verweise und Technologiekompatibilität.
- `src/domain/bridge.rs`: **gemeinsame Nutzung des vorhandenen Planfräsers**
  statt einer zweiten Implementierung.

Die zwei Werkzeugmodelle haben unterschiedliche Aufgaben: `ToolDefinition`
beschreibt das prozessübergreifende Werkzeug, während `MillingTool` derzeit
die bereits implementierte UI-Werkzeugbibliothek einschließlich Vorschubwerten
trägt. Der Adapter verlangt Übereinstimmung von Werkzeugnummer, Durchmesser
und Schneidenlänge. Er erlaubt nur einen ausdrücklich mittenschneidenden
Flachfräser und rechteckiges Rohmaterial. Unterschiedliche Geometrien führen
zu einem Fehler statt zu einer stillen Übernahme.

## Fertigungsverfahren

| Bereich | Datenmodell | Berechnete Werkzeugwege |
| --- | --- | --- |
| 3-Achs-Fräsen | Maschine, Werkzeuge, Nullpunkte, Planen/Kontur/Tasche/Bohren | Nur eingeschränktes Rechteck-Planfräsen |
| 3+2-Indexfräsen | Werkzeuglage, zwei Rundachsen, eigene Operationskennung | Noch keine |
| 5-Achs-simultan | Werkzeugorientierung, getrennte Operationskennung | Noch keine |
| Drehen | X/Z-Achsen, Radius-/Durchmesser-Konvention, mm/Umdrehung, Drehwerkzeugtypen | Noch keine |
| Laser | Schneiden/Gravieren/Markieren, Schnittfuge, Laserleistungszustand | Noch keine |

**5-Achs-Datenfelder sind keine 5-Achs-Kinematik.** Maschinengeometrie,
Rundachsen-Konfiguration, TCP, Werkzeuglängenkorrektur, Achsgrenzen und
Kollisionsprüfung müssen noch umgesetzt werden. Drehen benötigt vor dem
Postprozessor eine geprüfte Werkzeugkorrektur- und Durchmesserlogik.
Bei Laserfahren müssen Übergänge mit ausgeschaltetem Strahl abgesichert werden.

## Berechnungsgrenzen

`domain::bridge::face_plan_operation(plan, library, operation_id,
clearance_z_mm, facing, cancelled)` prüft die Referenzen, verlangt eine
3-Achs-Planfräsoperation mit passendem mittenschneidenden Werkzeug und
übergibt an `MillingTool::face`, das den bereits vorhandenen
`face_with_cancel`-Algorithmus nutzt.

Die Rohteilkoordinaten werden als bereits im Werkstückkoordinatensystem
angegeben betrachtet. Es gibt keine CAD-Geometrietransformation und keine
automatische Sicherheitsfahrt. Der Aufrufer muss die explizite Startposition
gewährleisten. Die Abbruchanforderung verwirft nicht vollständig berechnete
Werkzeugwege. Das ist keine Maschinen-Not-Aus-Funktion.

Das neue `PlanDefinition` ist ein **In-Memory-Modell**; ein versioniertes
Projektdateiformat und die dauerhafte Speicherung sind noch nicht definiert.

## Geplanter Ausbau

1. Versioniertes Projekt-/Werkzeugformat und konsistente Werkzeugmetadaten.
2. Echte 3-Achs-Kontur-/Taschen-/Bohrbahnen und unabhängige Prüffälle.
3. Maschinenspezifische Kinematik und Werkzeug-/Halter-/Spannmittelprüfung.
4. Getrennter Dreh- und Laser-Bahnplaner.
5. Verifizierte, controllerabhängige Postprozessoren, später auch Mach4.
6. Eigenständige Desktop-Oberfläche, Mehrsprachigkeit über Sprachkataloge
   sowie optionale CAD-Host-Schnittstelle zu SolidCraft.

Der bestehende Planfräsalgorithmus, der lokale Vorschau-Server und die
Browserwerkzeugbibliothek bleiben erhalten.
