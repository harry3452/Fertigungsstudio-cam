# Fertigungsstudio CAM

[Deutsch](README.md) · **English**

A proposed community CAM project with a shared core, a standalone application
and optional integration into SolidCraft. Clear workflows and a multilingual
interface are central requirements. Fertigungsstudio is a working name, not
an official SolidCraft project.

**Current status: interface prototype and first experimental Rust core, not usable CAM.**

![Fertigungsstudio CAM: German ribbon tiles, operation tree and schematic part preview](docs/images/fertigungsstudio-preview.jpg)

*Earlier interface concept, 24 November 2026. The current one-row ribbon and left-side operation tree are not yet reflected in this screenshot.*

Open `prototype/fertigungsstudio-kacheln.html` directly in a browser (offline interface prototype, no installation). The German UI now has a single icon ribbon for **File / Setup / Tools / Milling / 3D Milling / Turning / Laser / Simulation / Post**, a left-side operation tree, a large rotatable 3D viewport, and dark/light controls. File includes JSON project save/open and a browser-only exit action.

**Setup** supports stock size, workpiece material, a material library, origin-point selection at stock corners, edges or free XYZ coordinates, and XY-axis rotation/Z reversal. The **tool library** holds milling/turning tool geometry, editable holder associations and material-dependent feed/speed settings with numerical RPM/feed previews. STEP/STL/IGES uploads are currently only filename references, **not imported CAD geometry**. Saved JSON projects are editor data, not real machining programs. In **Simulation**, neutral Rust paths can be filtered by rapid/feed/Z-entry movement with illustrative scaled tool/holder display. No axis transformation, material removal, collision detection or NC output is implemented.

The initial Rust core calculates restricted facing paths for rectangular raw
blocks.
The updated UI has prominent cards for facing, contouring, pocketing and drilling,
which open the corresponding calculation form when served locally by Rust.
When opened as a standalone HTML file, they show only illustrative paths. The prototype's “Rust-Demo” button displays a calculated dataset, and
“Rust-Bahn laden” imports additional Rust-generated JSON paths. For live local
calculation run `cargo run --locked --offline --example preview_server`, open
the printed address and select “Live-Planfräsen”. There is no collision
verification. See
[the core contract and limitations](docs/core-first-step.md).

**Experimental development branch:** The Rust core additionally calculates
simple rectangular outer contours, pockets and axial drilling with optional
full-clearance retracts between pecks. These operations are connected to the
shared machining plan and are available in the local Rust preview under
**Live-Bearbeitung → Bearbeitungsart**. This is experimental neutral motion,
not machine output. Run `cargo run --locked --offline --example milling_ops`
to inspect motion counts. See [live UI](docs/live-milling-preview.md). [Scope and limitations](docs/milling-operations.md).

The modular Rust extension in PR #7 introduces machine, tool, setup and
operation records for milling, turning and laser. An explicit adapter validates
a 3-axis facing request and reuses the existing bounded facing planner and tool
library. Turning, laser and 5-axis operations remain **data contracts only**.
See the [architecture document](docs/ARCHITECTURE.md).

**Facing feed-direction control:** Facing now offers one-way climb or conventional passes with a direct XY rapid return only after a safety-Z retract, as well as semicircular zigzag turns at cutting depth. The climb/conventional classification is conditional on M3/M4 and material engagement at the +Y tool edge, not automatically proven for full-width face milling.

**Facing turnaround choice:** The facing editor lets you select continuous semicircular row-to-row turns at cutting depth or the previous safe retract after each row. The Rust path is a bounded chord-error segmented curve, with retracts retained between depth levels. Unchecked clearance outside stock is required.

**Visible real toolpaths:** Calculated Rust facing paths now open in a dedicated high-contrast XY plan view with individual depth layers and a toggle back to the 3D stock. Green marks feed cuts, dashed red rapid traverses, yellow entries. The 2D view uses the actual numeric Rust moves, not schematic mock paths.

**Initial end-to-end facing workflow:** With the local Rust preview server, choose rectangular stock and a flat milling tool from the new studio setup, set depth/stepdown/stepover/clearance and manual or material-derived feeds, then calculate and inspect a **neutral facing path**. Export the path as JSON for numerical inspection, not as NC/G-code. Custom work origins and rotations are still not applied to the path. [Workflow (German)](docs/facing-workflow.md).

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
