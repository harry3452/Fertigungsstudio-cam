# Erste Entwicklungspakete / Initial development tasks

These are proposed tasks, not claims or implementation promises. Agree on the
license before publishing them for contributors. Create one issue per task.

| Task | Work | Reviewable result | Dependency |
| --- | --- | --- | --- |
| 01 | Agree on the first release scope | Written supported workflows and explicit exclusions | None |
| 02 | Research SolidCraft integration | Versioned plugin/API evidence, limits, and a recommendation; distinguish plugin from custom build | 01 |
| 03 | Design shared Rust architecture | Small core/desktop/host-adapter boundaries and data contracts, no host dependency in core | 01 |
| 04 | Refine the interface prototype | User-reviewed ribbon, tree, contextual editor and central settings; original assets | 01 |
| 05 | Choose translation architecture | Catalog format, fallback, pluralization and numeric-entry rules; DE/EN example and parity check | 03 |
| 06 | Build a minimal Rust desktop shell | Startable shell with mock part and mock operations, documented build steps | 03, 04 |
| 07 | Add user preferences and language switching | DE/EN switch saved per user, independent of project data | 05, 06 |
| 08 | Define tools, setup and operation records | Validated units, coordinates, tools and versioned project contract | 03 |
| 09 | Implement one facing operation | Analytic fixture, validated path and independent expected-result tests; no machine claims | 08 |
| 10 | Plan verification and NC output | Explicit verification boundaries and one small output dialect with reviewed expectations | 08, 09 |

Contours, pockets and drilling follow the first end-to-end operation. Reuse of
the earlier CAM patches needs a separate technical and licensing review.
The user's existing Mach4 post is deferred; it is not bundled or assumed compatible.

Contributors can work on independent tasks in parallel after agreeing on contracts.
There are no schedule estimates yet; avoid recruiting against promised dates.
