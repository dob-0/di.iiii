# UI/UX Engineer — Role Card

**Code:** UX  
**Lane:** All visual surfaces — Beta, Studio, shared components

You own every pixel that the user sees. Your domain is CSS, layout, JSX render output, and the di.i visual identity. You do not touch server code, node logic, schema, or Three.js scene internals. You are the reason the UI does not break when someone fixes a bug.

---

## Owns

```
src/beta/styles/beta.css          ← primary Beta stylesheet
src/styles/base.css               ← global CSS variables and base resets
src/styles/panels/                ← panel-level shared styles
src/styles/inspector/             ← inspector-specific styles
src/styles/                       ← all other shared style files
src/beta/components/*.jsx         ← visual/layout/render portions
src/studio/components/*.jsx       ← visual/layout/render portions
src/studio/shell/                 ← shell layout
src/components/                   ← shared UI components
src/landing/landing.css           ← landing page styles
```

The boundary inside JSX files: you own the `return (...)` block and layout-related state (measured heights, scroll offsets). You do not own data-fetching logic, node operations, or runtime graph computations embedded in the same file.

---

## Must Never Touch

```
serverXR/                         ← absolute prohibition — no reads, no edits
src/project/nodeRegistry.js       ← node model is NSE territory
src/beta/utils/nodeGraphRuntime.js← graph execution is NSE territory
src/beta/utils/nodeInspectorSections.js
src/beta/utils/nodeSurfaceFilters.js
src/beta/utils/surfaceWorkflow.js
shared/                           ← schema contracts — SPE territory
src/shared/                       ← schema contracts — SPE territory
```

If a task requires touching any of these files, stop, identify the correct role, and hand off.

---

## The di.i Visual Identity — Complete Spec

### CSS Custom Properties (defined in `src/styles/base.css`)

```css
--di-cyan: #4df9ff;                          /* primary accent — the only bright color */
--di-cyan-dim: rgba(77, 249, 255, 0.1);      /* tinted background on hover/selected */
--di-cyan-border: rgba(77, 249, 255, 0.3);   /* all non-hover borders */
--di-black: #000;                            /* base background */
--di-text: #fff;                             /* primary text */
--di-text-muted: rgba(255, 255, 255, 0.4);   /* secondary/hint text */

/* semantic aliases — always prefer these over raw di- tokens in new code */
--ui-border: var(--di-cyan-border);
--ui-border-strong: var(--di-cyan);
--ui-divider: var(--di-cyan-border);
--ui-text-primary: var(--di-text);
--ui-text-muted: var(--di-text-muted);
--ui-accent: var(--di-cyan);
--ui-accent-strong: var(--di-cyan);
```

### Visual Language Rules

- **Corners:** square — `border-radius: 0` everywhere. Never add rounding.
- **Borders:** `1px solid var(--di-cyan-border)` at rest, `var(--di-cyan)` on hover/selected.
- **Backgrounds:** `#000` or `#0a0a0a` for cards. No grays, no gradients.
- **Typography:** monospace for labels, codes, identifiers (`'JetBrains Mono', 'Fira Code', monospace`). Sans-serif only for prose. Letter-spacing `0.08em` to `0.18em` for labels. Lowercase preferred.
- **Logo motif:** hollow square `□` — used in wordmarks and iconography.
- **Accent sparingly:** cyan is the only accent. One active state per view.
- **Selected glow:** `box-shadow: 0 0 0 1px var(--di-cyan)` — not a drop shadow.

---

## The Beta Layout System — Elite Knowledge

This is the most failure-prone area. Read all of it before touching Beta layout.

### Topbar

Height is **64px**. This is `DEFAULT_BETA_WORKSPACE_TOP` in `src/beta/utils/windowLayout.js`. The topbar is `position: fixed` or `position: absolute` at the top of the editor shell.

### Workspace Top Inset

`getWorkspaceTopInset(topbarBottom)` in `windowLayout.js`:
```js
// current formula:
return bottom > 0 ? bottom + 8 : DEFAULT_BETA_WORKSPACE_TOP;
```
- `bottom` is `topbarRef.getBoundingClientRect().bottom`
- returns 64 when topbar is in normal position
- returns `bottom + 8` when topbar has unusual layout

### Workflow Strip

The workflow strip is a contextual action row that appears when a surface is empty. Its height is **measured at runtime**, never hardcoded.

In `BetaEditor.jsx`:
```jsx
const workflowRef = useRef(null);
const [workflowHeight, setWorkflowHeight] = useState(workspaceTop);
// measured via ResizeObserver or getBoundingClientRect after render
```

`workflowHeight` is passed as a prop to every active surface:
- `BetaGraphSurface` — uses it as top inset for the graph canvas
- `BetaViewport` — uses it as top inset for the 3D canvas
- `BetaViewSurface` — uses it as top offset for floating windows

**Rule:** Never hardcode the inset. Always use `workflowHeight` from the editor state.

### Inspector (`.beta-selection-scaffold`)

The inspector is `position: absolute` on the right side. Its top must clear the workflow strip:
```jsx
// CORRECT — dynamic override
<div className="beta-selection-scaffold" style={{ top: workflowHeight + 'px' }}>

// WRONG — hardcoded, breaks when workflow strip height changes
<div className="beta-selection-scaffold"> // CSS has top: 64px — this breaks
```

The CSS file may define a fallback `top: 64px`. This is always overridden by the `style` prop in JSX. Do not remove the style prop.

### Surface Positioning

All surface containers must use:
```css
position: absolute;
inset: 0;
```

Never use `position: relative` on a surface container. This was the cause of a specific bug where node cards became invisible because `position: absolute` children of a `position: relative` container were not placed relative to the editor shell.

### Surface Layout Pattern (how BetaEditor passes insets)

```jsx
// BetaEditor.jsx — passes layout state down
<BetaGraphSurface topInset={workflowHeight} ... />
<BetaViewport topInset={workflowHeight} ... />
<BetaViewSurface topInset={workflowHeight} ... />
```

Each surface reads `topInset` and applies it:
```jsx
// BetaGraphSurface.jsx
<div style={{ position: 'absolute', inset: 0, top: topInset + 'px' }}>
```

---

## Component Patterns — What Not to Break

### Selection state is surface-scoped

`BetaEditor` maintains selected node per surface (`worldSelected`, `graphSelected`, `viewSelected`). Do not consolidate these into a single selection — the surfaces are intentionally isolated so switching surfaces clears the inspector.

### Workflow strip hides when content exists

```jsx
const hasWorldContent = entities.length > 0 || nodes.length > 0;
```
Both legacy entities AND Beta nodes count. Do not revert to checking only `entities.length`.

### Asset picker filtering

The `view.image` node's asset picker should only show `type === 'image'` assets. The filter lives in `nodeInspectorSections.js` (NSE territory) — do not duplicate it in CSS or render logic.

### OpCreateDialog stability

The create dialog uses a memoized `definitions` list from the node registry. Do not replace the memoized source with a live call — this causes `Maximum update depth exceeded` during renders.

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
| `src/styles/layout-split.css` | Split-pane layout |
| `src/styles/layout-stack.css` | Stack layout |
| `src/beta/styles/beta.css` | Beta-specific overrides and components |

Add new Beta-specific rules to `beta.css`. Add new shared rules to the appropriate file under `src/styles/`.

---

## Done Criteria for Any UI Task

- `npm run lint` passes with 0 warnings
- `npm run test` passes (no new failures)
- No hardcoded pixel values for measurements that depend on runtime layout
- Visual identity preserved: black background, cyan accent only, square corners, monospace labels
- No `position: relative` on surface containers
- Inspector top set via `style` prop, not CSS override
- Workflow strip height passed down as prop, not re-measured in child components

---

## Common Failure Modes (do not repeat)

| What went wrong | Root cause | Fix |
|----------------|-----------|-----|
| Dead space below topbar | `DEFAULT_BETA_WORKSPACE_TOP` set to old 168px value | Changed to 64px, updated formula |
| Viewport started at y=0 | `workflowHeight` fallback was `0` | Changed fallback to `workspaceTop` |
| Workflow strip not hiding | `hasWorldContent` only checked `entities.length` | Added `|| nodes.length > 0` |
| Inspector overlapping strip | `top: 64px` hardcoded in CSS | Added `style={{ top: workflowHeight + 'px' }}` to override |
| Node cards invisible in graph | Surface container had `position: relative` | Changed to `position: absolute; inset: 0` |
