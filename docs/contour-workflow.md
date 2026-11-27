# 2D-Kontur – Rechteckige Außen- und Innenkontur (Testfunktion)

**Status:** Echte numerische Werkzeugbahnberechnung im Rust-Kern für
rechteckige Konturen. Keine CAD-Konturerkennung, keine NC-/G-Code-Ausgabe und
**keine Freigabe für eine reale CNC-Bearbeitung**.

## Windows-Test

1. Das Windows-Test-ZIP herunterladen und vollständig entpacken.
2. `Start-Fertigungsstudio-Test.cmd` starten.
3. In **Setup → Rohteil und Material** X-, Y- und Z-Abmessungen festlegen.
4. In **Werkzeugliste** einen **Schaftfräser** mit Durchmesser und
   Schneidenlänge anlegen bzw. auswählen.
5. Über **Fräsen → Außenkontur** oder **Fräsen → Innenkontur** den neuen
   Kontur-Dialog öffnen.
6. Fräser, Konturseite, Abtragstiefe, Tiefenzustellung,
   Schnitt-/Eintauchvorschub und Sicherheitshöhe einstellen.
   Bei Innenkontur die **symmetrischen Randabstände X/Y** für das
   rechteckige Innenprofil eintragen. Außenkontur folgt immer dem
   rechteckigen *Rohteilrand*.
7. **Gleichlauf/Gegenlauf** sowie **M3/M4** auswählen. Der Rust-Kern
   kehrt abhängig von der gewählten Seite die Umlaufrichtung um.
8. **Werkzeugbahn berechnen**. Die berechnete Konturbahn wird in der
   isometrischen 3D-Ansicht angezeigt. **Bahnen · Draufsicht** ermöglicht
   die genaue Kontrolle der XY-Werkzeugmittelpunktbahn.
9. In **Sim → Bahn-JSON** lassen sich nur neutrale Bewegungsdaten exportieren.

## Berechnungsregeln

- Außen: Werkzeugmittelpunkt liegt auf jeder geraden Rechteckseite exakt
  **halben Werkzeugdurchmesser außerhalb** der gewählten Profilkante.
- Innen: Werkzeugmittelpunkt liegt entsprechend **innen**. Der
  Programmierbereich muss in X und Y jeweils breiter als das Werkzeug sein.
  Die inneren Ecken lassen sich mit einem runden Fräser nicht scharf fräsen.
- Pro Tiefenlage: Fahrt zum Startpunkt auf Sicherheitshöhe, senkrechtes
  Eintauchen mit Eintauchvorschub, vier Konturstrecken mit Schnittvorschub,
  Rückzug auf Sicherheitshöhe. Die Schritte wiederholen sich bis zur
  vorgegebenen Endtiefe. Die Startposition liegt in der unteren linken
  Ecke der **Werkzeugmittelpunktkontur**.
- M3 (von oben rechtsdrehend): für Außenkontur Gleichlauf = gegen den
  Uhrzeigersinn, für Innenkontur Gleichlauf = im Uhrzeigersinn.
  M4 bzw. Gegenlauf kehren jeweils die Bahnrichtung um. Dies ist die
  Einteilung am angegebenen Profilrand, keine Simulation der Spanbildung.
- Rohteilnullpunkt, G54–G59, XY-Achsdrehung und umgekehrte Z-Richtung werden
  wie beim Planfräsen **zusätzlich** in neutrale numerische
  Werkstückkoordinaten umgerechnet.

## Grenzen und Warnungen

- **Die Innenkontur beginnt mit einer senkrechten Zustellung an der
  Kontur.** Eine vorgefräste Tasche, passende Vorbohrung oder ein anderer
  sicherer freier Eintritt muss vorhanden sein. Weder Freigang noch
  Werkzeug-Eintauchfähigkeit werden im System geprüft.
- Auch bei der Außenkontur fehlen Spannmittel-, Werkstück- und
  Maschinenkollisionsprüfungen.
- Die Radiusversatzberechnung gilt nur für die **vier geraden Seiten eines
  achsparallelen Rechtecks**; sie ist kein allgemeiner Werkzeugradiusoffset
  von importierten CAD-Konturen und umfasst noch keine tangentialen
  Ein-/Ausfahrbögen oder Haltestege.
- Werkzeugwegdarstellung ist keine Materialabtragssimulation.
- Keine Maschinengrenzen oder Kinematikprüfung, kein Postprozessor.

Weitere Schritte: importierte/gezeichnete 2D-Geometrie, freie Kontur-Offsets,
Ein-/Ausfahrstrategien und Verifikation.
