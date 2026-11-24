# Gemeinsam entwickeln / Contributing

Contributions submitted for inclusion are provided under Apache License 2.0,
unless explicitly stated otherwise and agreed before inclusion. Contributors
retain their copyright. Do not submit material you have no right to license.
No copyright assignment or separate relicensing permission is requested.

1. Discuss a concrete problem in an issue before implementing a large change.
2. Agree on scope and claim the task in that issue to avoid duplicate work.
3. Use a branch or fork and submit a small, focused pull request.
4. Describe the resulting behavior, tests actually run, and remaining limitations.
5. Have another contributor review the change before merging.

German and English are welcome for discussions. Shared technical documentation
and code identifiers should use English; maintain German onboarding as well.
Never treat a translation as a substitute for a stable diagnostic identifier.

Keep the CAM core independent of the GUI and CAD host. UI work should use
mock data until the corresponding domain contracts exist. Changes affecting
machine output require independent expected results and explicit review.
Do not describe illustrative graphics as verified toolpaths or simulations.

Use only original or suitably licensed code and assets. Record source, license
and changes for imported material. Do not copy proprietary CAD icons, code or
post processors. Do not add another project's branded UI without checking its
license. Never upload customer parts, private machine configurations, keys or
personal files without permission.

The HTML prototype may be changed independently from the future Rust app.
Keep the reference snapshot intact. Document any new run/build steps.
