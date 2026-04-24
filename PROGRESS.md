# di.i Progress Log

Developer work journal. One entry per session, newest at top.
Read this before starting work. Update it before stopping.

---

## 2026-04-24 — Node Cards + di.i Visual Identity + Staging Sync

**Who:** Gevorg + Claude

### Done this session

- **di.i visual identity applied** across beta app
  - CSS variable `--di-cyan: #4df9ff` added to root — single source of truth for the brand color
  - All buttons, cards, topbar, graph surface now use black + cyan, square corners, no gradients
  - `--di-cyan-border`, `--di-cyan-dim` for hover/selection states
- **Graph node cards redesigned** (`src/beta/components/BetaGraphSurface.jsx` + `beta.css`)
  - di.i hollow square icon `□` in every card header (brand motif = node visual)
  - Black card, cyan 1px border, square corners
  - Selected state = cyan glow + double border ring
  - Port dots are now square (pixel motif), labels in monospace
- **BetaHub main page** (`src/beta/components/BetaHub.jsx`)
  - `□ □ □` wordmark at top, `di.i studio_` heading, cyan monospace tagline
  - All cards and buttons match new identity
- **Hidden node auto-surface switch** (`BetaEditor.jsx:419`)
  - Creating a `value.number` or any `render: 'hidden'` node now auto-switches to Graph surface so it's immediately visible
  - Previously the node was created but user saw nothing
- **Category colors added** to `NODE_CATEGORIES` in `src/project/nodeRegistry.js`
  - `getCategoryColor(categoryId)` helper exported
- **Staging updated** — `dev` merged and pushed to `origin/staging`

### Current state of node system (vs roadmap in `docs/architecture/RECURSIVE_NODE_CORE.md`)

| Step | Status |
|------|--------|
| 1. Stabilize blank workspace | ~80% — missing undo/redo + keyboard shortcuts |
| 2. Local asset core | Not started |
| 3. Nodes replace legacy entities | Not started |
| 4. Graph authoring (edges/ports) | Graph surface exists, wiring works, no undo |
| 5. View UI fully authored | Not started |
| 6. Runtime adapters | Not started |
| 7. Recursive containers | Not started |
| 8. Publish + collaboration | Schema only |

### Easy wins — pick any of these next

> These are small, self-contained tasks. Each one is a few hours max.

1. **Delete key in world/view surface** — `BetaEditor.jsx` has `handleDeleteSelected` but no `keydown` listener on the editor shell. `BetaGraphSurface` already handles it for graph. Copy the same pattern to the editor shell for world+view.

2. **Undo/redo for node ops** — `applyLocalOps` in `BetaEditor.jsx` (~line 280) applies ops to local state. Add a `history` array in the local reducer, push before each op, pop on `Ctrl+Z`. No server changes needed.

3. **Node count badge → outliner panel** — topbar already shows `{n} nodes` badge. Clicking it should open a simple sidebar list of all nodes (label + typeId + select on click). One new component, ~100 lines.

4. **`geom.plane` texture support** — `BetaViewport.jsx:149` renders the plane but ignores any texture input. Add a `textureUrl` port to `geom.plane` in the registry and load it with `useTexture` from drei.

5. **`world.background` node drive** — `BetaViewport.jsx:216` still reads background color from `worldState.backgroundColor` (legacy). There's a `world.background` node in the registry. Make the viewport read from the node if it exists, fall back to worldState.

---

## Rule for all developers

**Before stopping work:**
1. Add an entry here (date, what changed, easy wins at the bottom)
2. Commit `PROGRESS.md` with your changes
3. Easy wins = tasks that are fully isolated, no research needed, clear where to start

This file is the handoff. If it is not updated, the next developer starts cold.

---
