# Fertigungsstudio CAM

[Deutsch](README.md) · **English**

A proposed community CAM project with a shared core, a standalone application
and optional integration into SolidCraft. Clear workflows and a multilingual
interface are central requirements. Fertigungsstudio is a working name, not
an official SolidCraft project.

**Current status: interface prototype and first experimental Rust core, not usable CAM.**

![Fertigungsstudio CAM: German ribbon tiles, operation tree and schematic part preview](docs/images/fertigungsstudio-preview.jpg)

*Interface concept, 24 November 2026. Paths are illustrative, not calculated
or verified machine movements.*

Open `prototype/fertigungsstudio-kacheln.html` in a browser. No installation or
server is required. The current prototype is in German. It demonstrates ribbon
tiles, an operation tree, a rotatable example part, schematic tool movement,
contextual parameters and settings dialogs. The integration selector is a mockup.

The initial Rust core calculates restricted facing paths for rectangular raw
blocks. The prototype's “Rust-Demo” button displays a calculated dataset, and
“Rust-Bahn laden” imports additional Rust-generated JSON paths. For live local
calculation run `cargo run --locked --offline --example preview_server`, open
the printed address and select “Live-Planfräsen”. There is no collision
verification. See
[the core contract and limitations](docs/core-first-step.md).

**Experimental development branch:** The Rust core additionally calculates
simple rectangular outer contours, pockets and axial drilling with optional
full-clearance retracts between pecks. These operations are now connected to
the shared machining plan, but are **not yet available in the live preview**.
Run `cargo run --locked --offline --example milling_ops` to inspect neutral
motion counts. [Scope and limitations](docs/milling-operations.md).

The modular Rust extension in PR #7 introduces machine, tool, setup and
operation records for milling, turning and laser. An explicit adapter validates
a 3-axis facing request and reuses the existing bounded facing planner and tool
library. Turning, laser and 5-axis operations remain **data contracts only**.
See the [architecture document](docs/ARCHITECTURE.md).

There is no CAD import, general machining toolpath calculation, stock-removal or
collision verification, usable NC output, or SolidCraft integration. Do not
use this prototype to control machinery.

## Direction

- One UI-independent CAM core for both application modes.
- An optional CAD integration that leaves CAD-only installations lightweight.
- A clear ribbon, operation tree, large viewport and contextual parameter editor.
- Central application settings and a saved per-user language choice.
- German and English first; additional languages through translation catalogs.
- The core is structured for **3-/5-axis milling, turning and laser cutting**.
  The first implemented calculation is restricted **3-axis facing**.
  Contours, pockets, drilling, turning, laser and simultaneous 5-axis
  toolpaths are not implemented yet.

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

## License and participation

The project's own code, documentation and symbols in this package are licensed
under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for provenance.
The license does not grant trademark rights in the project name or logo.
Material released under Apache 2.0 remains available under those terms; a later
license change cannot revoke those permissions.
No SolidCraft/CamCraft code or earlier Rust patches are bundled.
The [repository](https://github.com/harry3452/Fertigungsstudio-cam) is public.
Browse the [open issues](https://github.com/harry3452/Fertigungsstudio-cam/issues)
and join a task discussion if you would like to contribute.
