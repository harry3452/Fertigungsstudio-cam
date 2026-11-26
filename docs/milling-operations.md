# First contour, pocket and drilling calculation

**Experimental and not safe for machine execution.** These are numerical
3-axis toolpath generators operating on fixed, axis-aligned work-coordinate
geometry in millimetres. The output is neutral `Toolpath` data, **not NC code**.

The established rectangular facing algorithm and its live preview remain
unchanged. The new calculation APIs are under `fertigungsstudio_cam_core::milling`.
They can also be called from the shared project via
`domain::bridge::milling_plan_operation`, using a validated matching
`OperationKind`, a rectangular stock setup, and a matching tool. Contour and
pocket use feeds from the existing `MillingTool` library. Drilling requires
`MillingToolKind::Drill` and an explicitly provided drilling feed.
The HTML frontend and persistence do **not** yet expose these three operations.

## Example

```text
cargo run --locked --offline --example milling_ops
cargo test --locked --offline --workspace --all-targets
```

The example prints the required start position and move counts for a
40 × 30 × 10 mm sample block, without sending anything to a machine.

## Initial supported geometries

- `outside_contour(setup, flat_tool, cut)`: complete external rectangular
  stock outline, offset outwards by one cutter radius. Each depth pass has a
  closed four-segment loop. The area outside stock is assumed unobstructed.
- `rectangular_pocket(setup, flat_tool, pocket)`: an axis-aligned rectangular
  XY pocket, within stock, with a zigzag raster and depth steps. The flat tool
  must be centre cutting. Tool-centre bounds are inset by the cutter radius.
  Inside corners are radiused; no finishing allowance, entry ramp, islands,
  pocket walls, or automatic topology extraction is implemented.
- `drill_points(setup, bit, drilling)`: a list of XY drill locations with a
  fixed bottom Z. Optional peck depth gives full retraction to the explicit
  clearance height **between every peck**. There is no G81/G83 cycle, no
  drilled-hole geometry, no tip-angle compensation, and no rapid return into
  a partially drilled bore.

All three reject non-finite coordinates, invalid tools, unsuitable depths,
invalid feeds, insufficient space, too many moves, and bad locations.
Each algorithm supports `*_with_cancel` and refuses to return a partial path
after cancellation. Paths always require a known initial position at clearance.

The `Toolpath.rows_per_pass` field is a legacy metadata field: it represents
raster rows for pocket, one loop for contour, and hole count for drilling.
This field is not part of any machine command.

## Technical limits

These algorithms do **not** check part/fixture collisions, drill break-through,
holder clearance, cutter engagement, tool wear, stock removal, machine travel,
rapid route clearance outside the stock, or tool orientation. Nor do they
simulate 5-axis kinematics, turning or laser cutting. Stepovers and feeds in
tests are **demonstration values, not machining recommendations**.

No G-code should be created from the experimental paths for machine use.
Before any machine output, independent verification, controller dialect,
fixture and holder modeling, safe travel, and operator review are required.
