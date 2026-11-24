# Multilingual interface requirements

Agreed product requirement: multilingual from the start, beginning with German
and English. Additional translations should not require changes to CAM logic.

## Interface

- Put user-facing labels, tooltips, dialogs, validation messages and status text
  in catalogs addressed by stable semantic keys.
- Provide German, English and a follow-system selection; keep the user's choice
  in application preferences, not in machining projects.
- Use English as the fallback for missing translations. Show an understandable
  fallback instead of an empty label or crash.
- Support parameterized messages and plural forms. Do not concatenate sentence
  fragments or make diagnostic matching depend on translated text.
- Allow longer translated labels without clipping the ribbon and forms.
- Keep locale-aware numeric entry separate from canonical internal values.
  Specify decimal-comma and decimal-point behavior explicitly before implementing.

## Invariants

Changing language must not change toolpaths, numeric values, units, tolerances,
coordinate systems, project files, postprocessor behavior or NC output.
G-code numbers use the selected dialect's syntax, never the UI locale.
Command/API identifiers and machine-readable error codes remain stable.
Units are an explicit project/operation decision, not inferred from language.

## Verification

Check DE/EN key and placeholder parity; test language switching and persistence.
For the same project and post, compare NC output across language settings.
Add semantic UI identifiers so tests do not depend on English wording.

No translation library is selected yet. This file is the requirement, not a
claim that language switching already works in the HTML prototype.
