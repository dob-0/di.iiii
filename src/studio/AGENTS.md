# src/studio AGENTS

Short routing guide for AI agents working in `src/studio/`.

## What This Area Owns

- the main shipped Studio authoring lane
- Studio route selection between hub and project editor
- Studio shell, hub, editor, inspector, viewport, and presentation-surface UI
- Studio-only layout preferences and route helpers

## When To Edit Here

- edit here for shipped Studio UX, Studio-only routing, or Studio-specific shell behavior
- start elsewhere if the change should also affect `Beta` or the public viewer
- move to `src/project/` when the change is shared project sync, shared viewer logic, project presence, or shared project API behavior
- move to `src/shared/` when the change affects canonical project schema or shared runtime defaults

## Adjacent Systems To Check

- [../../AGENTS.md](../../AGENTS.md)
- [../../docs/ai/index.md](../../docs/ai/index.md)
- [../project/AGENTS.md](../project/AGENTS.md)
- [../shared/AGENTS.md](../shared/AGENTS.md)
- `../components/` and `../hooks/` when Studio composes older shared UI behavior

## Floating Panel Field Design System

All Studio floating panels (Inspector, World, and any future settings panel) share one field
vocabulary, defined once in `src/studio/styles/studio.css` (`.insp-*` classes) and consumed from
both `StudioInspector.jsx` and `StudioShellPanels.jsx`'s `ProjectPanel`. Do not invent a parallel
style (MUI components, ad-hoc inline styles, a new CSS class) for a field that already has an
equivalent below — copy the existing pattern instead.

| Field shape | Component / classes | When to use |
|---|---|---|
| Label above, full-width input | `.insp-field` + `.insp-label` + `.insp-input` | Any single named value: text, a lone number, a lone color. **This is the default — reach for it first.** |
| Toggle switch | `.insp-toggle*` (see `ToggleField` in `StudioShellPanels.jsx`, `InspField`'s checkbox branch in `StudioInspector.jsx`) | Booleans |
| Dropdown | `.insp-select` | Enum-style choice |
| Slider | `.insp-slider*` (see `SliderField`/`InspSlider`) | A number with both `min` and `max` defined — `StudioInspector.jsx`'s `isBoundedNumber()` auto-picks this over a plain number box |
| Compact 3-box row, colored labels | `.insp-vec3-row` + `.insp-field--compact` (see `MiniRow`/`groupVectorFields`) | **X/Y/Z axis triplets only** — Position/Rotation/Scale, Sun position. The labels are a single character so they never wrap. |
| Collapsible section | `.insp-section` + `.insp-section-btn` + `.insp-section-body` (see `CollapsibleSection`/`InspSection`) | Grouping fields under a header, matching Inspector's TRANSFORM/APPEARANCE pattern |

**The rule that matters most:** the compact side-by-side box (`insp-vec3-row`) is ONLY for short,
fixed, single-character axis labels. A multi-word label ("Section Thickness", "Fade Strength")
in that layout will wrap inside the box and misalign the row next to it — this exact bug shipped
once (grid/camera/DPR settings crammed two-per-row) and had to be reverted back to one full-width
`.insp-field` per row. When in doubt, stack — one field, one row, full width.

Scrollbars are themed globally in `src/styles/base.css` (`*::-webkit-scrollbar*` + `scrollbar-color`)
— never add a panel-specific scrollbar override.

## Do Not Assume

- do not duplicate shared project sync logic here if the change should live in `src/project/`
- do not treat `Studio` as the most node-native surface; that is still the experimental `Beta` lane
- do not move canonical schema decisions into Studio-only state or components

## Validation And Tests

- `npm run test`
- `npm run build`
- nearby tests:
  - `src/studio/components/StudioHub.test.jsx`
  - `src/studio/components/StudioPresentationSurface.test.jsx`
  - `src/studio/hooks/useStudioLayoutPrefs.test.js`
  - `src/studio/utils/studioRouting.test.js`

## One-Line Summary

Use `src/studio/` for the shipped main editor lane, but move shared document behavior down into `src/project/` and canonical schema/runtime behavior into `src/shared/`.
