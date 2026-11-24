# Fertigungsstudio

**Deutsch** · [English](README.en.md)

Ein gemeinschaftlich zu entwickelndes CAM mit zwei geplanten Zugängen: als
eigenständiges Programm und optional direkt in SolidCraft. Die Oberfläche soll
übersichtlich, mehrsprachig und auf den Arbeitsablauf in der Werkstatt ausgelegt sein.

**Status: Konzept und interaktiver Oberflächenprototyp. Noch kein nutzbares CAM.**
Fertigungsstudio ist ein Arbeitsname und kein offizielles SolidCraft-Projekt.

## Vorschau starten

`prototype/fertigungsstudio-kacheln.html` im Browser öffnen. Keine Installation,
kein Server und keine zusätzlichen Pakete nötig. Die Anzeige ist derzeit deutsch.

Ausprobierbar sind gruppierte Symbolkacheln, Bearbeitungsauswahl, eine drehbare
Beispielplatte, schematische Werkzeugbewegungen und Dialoge für Aufspannung,
Darstellung und Ausgabe. Die Ansicht kann zwischen integriertem und
eigenständigem Betrieb umgeschaltet werden; das ist nur eine Darstellung.

Nicht vorhanden: realer CAD-Import, echte Werkzeugwegberechnung, Materialabtrags-
und Kollisionsprüfung, geprüfter NC-Export oder eine SolidCraft-Anbindung.
Der Entwurf darf nicht zur Steuerung einer Maschine verwendet werden.

## Was wir bauen möchten

- Einen gemeinsamen, von der Oberfläche unabhängigen CAM-Kern.
- Ein eigenständiges Programm und eine optionale SolidCraft-Anbindung.
- Eine große Modellansicht, einen Bearbeitungsbaum links und oben klar
  beschriftete Symbolkacheln in Funktionsgruppen.
- Einen zentralen Einstellungsdialog und gezielt einblendbare Bearbeitungsparameter.
- Mehrsprachigkeit von Beginn an: zunächst Deutsch und Englisch, weitere
  Sprachen über Übersetzungsdateien. Die Sprache ist eine Nutzereinstellung.
- Als ersten Bearbeitungsumfang 3-Achs-Planen, Konturen, Taschen und Bohren.

Der Integrationsweg muss noch untersucht werden. Weder ein funktionierendes
SolidCraft-Plugin noch eine Zustimmung der SolidCraft-Maintainer wird behauptet.
Die spätere Anwendung soll in Rust entstehen; HTML/JavaScript dienen hier nur
zum Erproben des Bedienkonzepts. Funktionen werden eigenständig gestaltet;
Herstellercode, Symbole oder Oberflächen anderer CAD-Produkte werden nicht kopiert.

## Mitentwickler gesucht

Wir möchten die Entwicklung gemeinsam tragen. Gesucht werden Menschen, die
Rust programmieren, Oberflächen entwickeln, CAM-Verfahren verstehen,
Postprozessoren prüfen oder Übersetzungen und Tests beitragen möchten.

Konkrete Einstiegspakete stehen in [TASKS.md](TASKS.md), die Zusammenarbeit in
[CONTRIBUTING.md](CONTRIBUTING.md). Noch keine Aufgaben sind vergeben.

## Mehrsprachigkeit

[docs/multilingual.md](docs/multilingual.md) hält die Anforderungen fest.
Die spätere Oberfläche darf Texte nicht fest im Programm verteilen.
G-Code, Projektformate und öffentliche Befehlskennungen bleiben sprachunabhängig.
Die Übersetzungsanbindung ist im Prototyp noch nicht implementiert.

## Lizenz und Veröffentlichung

Dieses Paket ist eine lokale Veröffentlichungsvorbereitung. Die Projektlizenz
ist noch nicht festgelegt. Vor einer öffentlichen Einladung zu Codebeiträgen
müssen Lizenz und Herkunft der enthaltenen Dateien geklärt sein.
SolidCraft- oder CamCraft-Code und die bisherigen Rust-Patches sind hier nicht
enthalten. Deren Wiederverwendung muss separat geprüft werden.

Siehe [PUBLISHING.md](PUBLISHING.md). Es wurde noch kein Repository veröffentlicht.
