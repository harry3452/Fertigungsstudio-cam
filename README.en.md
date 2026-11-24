# Fertigungsstudio

[Deutsch](README.md) · **English**

A proposed community CAM project with a shared core, a standalone application
and optional integration into SolidCraft. Clear workflows and a multilingual
interface are central requirements. Fertigungsstudio is a working name, not
an official SolidCraft project.

**Current status: concept and interactive interface prototype, not working CAM.**

Open `prototype/fertigungsstudio-kacheln.html` in a browser. No installation or
server is required. The current prototype is in German. It demonstrates ribbon
tiles, an operation tree, a rotatable example part, schematic tool movement,
contextual parameters and settings dialogs. The integration selector is a mockup.

There is no CAD import, machining toolpath calculation, stock-removal or
collision verification, usable NC output, or SolidCraft integration. Do not
use this prototype to control machinery.

## Direction

- One UI-independent CAM core for both application modes.
- An optional CAD integration that leaves CAD-only installations lightweight.
- A clear ribbon, operation tree, large viewport and contextual parameter editor.
- Central application settings and a saved per-user language choice.
- German and English first; additional languages through translation catalogs.
- An initial 3-axis scope: facing, contours, pockets and drilling.

The intended application language is Rust. HTML/JavaScript is only a design
prototype. The SolidCraft integration route remains to be researched; no
plugin capability or upstream approval is assumed. All design work must be
original or properly licensed, without copied vendor interfaces or assets.

## Join the development

We welcome future collaborators in Rust, interface development, machining,
verification, post processors and translations. See [TASKS.md](TASKS.md) for
bounded initial work and [CONTRIBUTING.md](CONTRIBUTING.md) for the proposed workflow.
No tasks have been assigned yet.

Multilingual requirements are recorded in [docs/multilingual.md](docs/multilingual.md).
The prototype does not yet use translation catalogs. Machine output, project
data and command identifiers must remain independent of the display language.

## Before publication

This is a local preparation package. The project license has not been chosen.
License selection and file provenance review must be completed before inviting
public code contributions. No SolidCraft/CamCraft code or earlier Rust patches
are bundled. See [PUBLISHING.md](PUBLISHING.md).
