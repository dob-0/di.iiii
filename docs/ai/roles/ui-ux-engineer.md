# UI/UX Engineer — Role Card

**Code:** UX  
**Lane:** All visual surfaces — Raw, Studio, shared components

You own every pixel that the user sees. Your domain is CSS, layout, JSX render output, and the di.i visual identity. You do not touch server code, node logic, schema, or Three.js scene internals. You are the reason the UI does not break when someone fixes a bug.

---

## Owns

```
src/raw/styles/raw.css            ← primary Raw stylesheet
src/studio/styles/                ← Studio-specific stylesheets
src/styles/base.css               ← global CSS variables and base resets
src/styles/panels/                ← panel-level shared styles
src/styles/inspector/             ← inspector-specific styles
src/styles/                       ← all other shared style files
src/raw/components/*.jsx          ← visual/layout/render portions
src/studio/components/*.jsx       ← visual/layout/render portions
src/studio/components/StudioShell.jsx       ← Studio shell layout
src/studio/components/StudioShellPanels.jsx ← Studio panel arrangement
src/components/                   ← shared UI components
src/landing/landing.css           ← landing page styles
```

The boundary inside JSX files: you own the `return (...)` block and layout-related state (measured heights, scroll offsets). You do not own data-fetching logic, node operations, or runtime graph computations embedded in the same file.

---

## Must Never Touch

```
serverXR/                         ← absolute prohibition — no reads, no edits
src/project/nodeRegistry.js       ← node model is NSE territory
src/project/graph/nodeGraphRuntime.js← graph execution is NSE territory
src/project/graph/nodeInspectorSections.js
src/project/graph/nodeSurfaceFilters.js
shared/                           ← schema contracts — SPE territory
src/shared/                       ← schema contracts — SPE territory
```

If a task requires touching any of these files, stop, identify the correct role, and hand off.

---

## The di.i Visual Identity — Complete Spec

### CSS Custom Properties

**Do not copy the token table into this card.** It was duplicated here once and drifted:
the copy silently lost `--di-surface`, `--di-mono`, `--di-danger`, `--di-success` and
`--di-warning`, so agents reading only this card invented raw hex for states the system
already had names for.

- **Source of truth:** the `:root` block in `src/styles/base.css` — read it, do not
  reconstruct it. Every `--di-*` and `--ui-*` token is defined there and nowhere else.
- **Canonical documentation:** `docs/ai/ui-system.md` (full `--di-*` / `--ui-*` tables with
  intended use per token). `docs/ai/design-baseline.md` covers the landing page's subset only.

The one rule that does belong here: **prefer the `--ui-*` semantic aliases over raw `--di-*`
tokens in new component CSS.** The `--di-*` layer is the brand primitive; `--ui-*` is what
components consume, so a palette change stays a one-line edit in `base.css`.

If a token you want does not exist, add it to `base.css` and to `docs/ai/ui-system.md` in the
same change — never hardcode a hex value in a component stylesheet, and never invent a
`--di-*` name at the point of use. (`--di-accent`, `--di-bg`, `--di-dim` and `--di-line`
appear in Studio CSS but are **not defined anywhere** — each carries an inline fallback and
so silently renders it. They are left alone deliberately: repointing them at real tokens
would visibly restyle those surfaces, and defining them at their fallback values would
enshrine four off-palette hexes next to the canonical ones. Do not add more of these.
`--di-card` was a fifth, with **no** fallback, so it resolved to nothing; it was repointed to
`--di-surface` on 2026-08-11 and is now referenced nowhere.)

### Visual Language Rules

- **Corners:** small radii, not square — checked directly against `src/studio/styles/studio.css` (2026-07-17 audit): panels/buttons use a real scale (5px/6px/7px/3px, `50%` for circular controls), not `border-radius: 0`. Follow `docs/ai/ui-system.md`'s documented radius scale for the exact value per component family; this doc previously claimed "square everywhere," which was wrong.
- **Borders:** `1px solid var(--di-cyan-border)` at rest, `var(--di-cyan)` on hover/selected.
- **Backgrounds:** `#000` or `#0a0a0a` for cards. No grays, no gradients.
- **Typography:** monospace for labels, codes, identifiers (`'JetBrains Mono', 'Fira Code', monospace`). Sans-serif only for prose. Letter-spacing `0.08em` to `0.18em` for labels. Lowercase preferred.
- **Logo motif:** hollow square `□` — used in wordmarks and iconography.
- **Accent sparingly:** cyan is the only accent. One active state per view.
- **Selected glow:** `box-shadow: 0 0 0 1px var(--di-cyan)` — not a drop shadow.

---

## The Raw Layout System — Elite Knowledge

This is the most failure-prone area. Read all of it before touching Raw layout.

(The Beta lane was retired 2026-08-06 and `src/beta/` no longer exists. Its layout system was
absorbed into Raw — the same mechanism under `raw-` names. Any doc, comment or memory still
naming `BetaEditor` / `beta.css` / `DEFAULT_BETA_WORKSPACE_TOP` is describing code that is gone.)

### Topbar

Default height is **64px** — `DEFAULT_RAW_WORKSPACE_TOP` in `src/raw/utils/windowLayout.js`.
It is a default, not a constant to design against: the real value is measured (see below), and
the topbar grows when presence avatars are shown.

### Workspace Top Inset

`getWorkspaceTopInset({ topbarRect, padding = 8 })` in `src/raw/utils/windowLayout.js`:
```js
return bottom > 0 ? bottom + padding : DEFAULT_RAW_WORKSPACE_TOP
```
- takes an **options object**, not a bare number — `topbarRect` is
  `topbarRef.current?.getBoundingClientRect?.()`
- returns `DEFAULT_RAW_WORKSPACE_TOP` (64) only when there is no measurable topbar
- `RawEditor` re-measures on `resize` and via a `ResizeObserver` on the topbar, and re-runs
  when `presence.users.length` changes

`windowLayout.js` also exports `RAW_WINDOW_PADDING` (12), `RAW_WINDOW_BOTTOM_RESERVE` (120) and
`clampWindowFrame(frame, bounds)` — use `clampWindowFrame` to keep a floating window on screen
rather than writing your own bounds math.

### `workspaceTop`

`RawEditor.jsx` holds one layout number: **`workspaceTop`**, the measured topbar bottom.
That is the inset every surface gets, and it is what feeds `--raw-scaffold-top` on the
inspector.

There used to be a second number, `workflowHeight`, measured from a `workflowRef` on a
contextual workflow strip. **The strip was deliberately removed in May 2026** (commit
`9968ab00`, the move to a window-based workspace), but the ref, the ResizeObserver and
`src/raw/utils/surfaceWorkflow.js` survived unattached for three months — so
`workflowHeight` always resolved to its `workspaceTop` fallback and was an alias with an
extra render hop. All of it was deleted on 2026-08-11, verified as a pixel-identical no-op.

If you ever re-introduce a workflow strip, measure it with its own ref and feed the
scaffold from that — do not hardcode a height.

### Inspector (`.raw-selection-scaffold`)

The inspector is `position: fixed` on the right. Its top is supplied as a **CSS custom
property**, not an inline `top`:
```jsx
// CORRECT — RawEditor.jsx
<aside ref={scaffoldRef} className="raw-selection-scaffold"
       style={{ '--raw-scaffold-top': workflowHeight + 'px' }}>

// WRONG — an inline `top` cannot be overridden by a media query
<aside className="raw-selection-scaffold" style={{ top: workflowHeight + 'px' }}>
```
`raw.css` reads `top: var(--raw-scaffold-top, 64px)`. The custom property exists specifically
so the phone breakpoint can re-anchor the scaffold as a bottom sheet (`top: auto; bottom: 0`).
Converting this back to an inline `top` silently breaks the mobile layout. Do not do it.

### Surface Positioning

All surface containers must use:
```css
position: absolute;
inset: 0;
```

Never use `position: relative` on a surface container. This was the cause of a specific bug
where node cards became invisible because `position: absolute` children of a
`position: relative` container were not placed relative to the editor shell.

### Surface Layout Pattern (how RawEditor passes insets)

`RawEditor` passes `topInset` down; each surface applies it itself:
```jsx
// RawEditor.jsx
const graphTopInset = chromeVisible ? workspaceTop : 0   // zen mode collapses the chrome
<RawGraphSurface topInset={graphTopInset} ... />
<RawViewport topInset={workspaceTop} ... />
```

```jsx
// RawGraphSurface.jsx / RawViewport.jsx
<div style={{ top: `${topInset}px` }}>
```

**Rule:** never hardcode the inset, and never subtract `topInset` a second time inside a
surface. The surface is already positioned with `top: topInset`, so its own
`getBoundingClientRect()` already begins below the chrome — `RawGraphSurface` has an explicit
comment about this because subtracting twice is the recurring bug.

Floating windows are `DesktopWindow.jsx`, clamped with `clampWindowFrame({ minTop: workspaceTop })`.

---

## Component Patterns — What Not to Break

### Selection state is surface-scoped

`RawEditor` maintains selection per surface. Do not consolidate these into a single selection —
the surfaces are intentionally isolated so switching surfaces clears the inspector.

### Both legacy entities and nodes render

`RawViewport` renders `document.entities` (legacy) **and** `document.nodes` (node graph) in the
same scene. Any "is this document empty?" check must count both. Checking only
`entities.length` has been a real bug more than once.

### Asset picker filtering

The `view.image` node's asset picker should only show `type === 'image'` assets. The filter lives in `nodeInspectorSections.js` (NSE territory) — do not duplicate it in CSS or render logic.

---

## CSS Files — What Lives Where

| File | Owns |
|------|------|
| `src/styles/base.css` | CSS variables, body/html resets |
| `src/styles/workspace.css` | Editor shell structure |
| `src/styles/panels/base.css` | Panel chrome (header, body, border) |
| `src/styles/panels/inspector.css` | Inspector panel specifics |
| `src/styles/inspector/*.css` | Input controls (vector, inputs, overlays) |
| `src/styles/controls.css` | Button, input, select components |
| `src/styles/menu.css` | Dropdown menu components |
| `src/styles/layout-stack.css` | Stack layout |
| `src/styles/mobile-shell.css` | Phone/tablet shell overrides |
| `src/styles/preferences.css` | The `preferences-*` design system — canonical for admin/management views |
| `src/raw/styles/raw.css` | Raw-specific overrides and components |
| `src/studio/styles/` | Studio-specific stylesheets |

Add new Raw-specific rules to `raw.css`, Studio-specific rules under `src/studio/styles/`, and shared rules to the appropriate file under `src/styles/`.

Admin and management surfaces reuse the `preferences-*` system in `src/styles/preferences.css`. Do not invent a parallel styling for them.

---

## Done Criteria for Any UI Task

- `npm run lint` passes with 0 warnings
- `npm run test` passes (no new failures)
- No hardcoded pixel values for measurements that depend on runtime layout
- Visual identity preserved: black background, cyan accent only, radii matching `docs/ai/ui-system.md`'s scale, monospace labels
- Colors come from `--ui-*` / `--di-*` tokens in `src/styles/base.css` — no new hex literals
- No `position: relative` on surface containers
- Inspector top set via the `--raw-scaffold-top` custom property, not an inline `top`
- Layout insets passed down as props, not re-measured in child components
- Checked on a phone-width viewport at a real device pixel ratio, not only at DPR 1

---

## Common Failure Modes (do not repeat)

These were found in Beta and the mechanism carried into Raw unchanged — the names are the
current ones.

| What went wrong | Root cause | Fix |
|----------------|-----------|-----|
| Dead space below topbar | workspace-top default set to an old 168px value | Default is `DEFAULT_RAW_WORKSPACE_TOP` = 64, and the real value is measured |
| Viewport started at y=0 | `workflowHeight` fallback was `0` | Fallback is `workspaceTop` |
| Empty-state check wrong | only `entities.length` was counted | Count `nodes` too — both render in the same scene |
| Inspector overlapping the chrome | `top: 64px` hardcoded in CSS | `--raw-scaffold-top` custom property set from `RawEditor`, with `64px` only as the `var()` fallback |
| Inspector stuck at the top on phones | inline `top` beat the media query | Custom property instead of inline `top`, so the bottom-sheet breakpoint can win |
| Content offset twice | a surface subtracted `topInset` again after being positioned with it | Apply `topInset` once, at the surface container |
| Node cards invisible in graph | Surface container had `position: relative` | Changed to `position: absolute; inset: 0` |
