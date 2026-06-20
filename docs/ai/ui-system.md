# UI System — Visual Rules

The single source of truth for every visual decision in the Studio editor and all adjacent surfaces.
Read this before touching any color, spacing, radius, blur, or shadow. Do not derive values from
inspection — copy them from this table. The goal is a single visual family across every surface.

---

## The Two Surface Families

Everything in the UI belongs to one of two families. Mixing them is the most common drift error.

### 1. Panel family — heavy, anchored

Used for: floating panels (Library, Inspector, etc.), control cluster, hotkey dialog.

| Property | Value |
|----------|-------|
| Background | `rgba(4, 6, 9, 0.92)` |
| Backdrop blur | `blur(16px)` + `-webkit-backdrop-filter: blur(16px)` |
| Border | `1px solid rgba(255, 255, 255, 0.1)` |
| Border radius | `6px` (panels) / `7px` (cluster outer, dialogs) |
| Box shadow | `0 12px 40px rgba(0, 0, 0, 0.55)` |

### 2. Viewport button family — light, translucent

Used for: `?`, fullscreen, account button, pane split controls (H/V/×).

| Property | Value |
|----------|-------|
| Background | `rgba(15, 23, 34, 0.55)` |
| Backdrop blur | `blur(6px)` |
| Border | `1px solid rgba(255, 255, 255, 0.1)` |
| Border radius | `6px` |
| Color (resting) | `rgba(255, 255, 255, 0.55)` |
| Size | `30 × 30 px` |
| Hover bg | `rgba(15, 23, 34, 0.82)` |
| Hover border | `rgba(255, 255, 255, 0.35)` |
| Hover color | `#fff` |

**Rule:** Never use a panel-family background on a viewport button, or vice versa.
The difference is intentional — panels feel solid and persistent; buttons feel embedded in the scene.

---

## Colors

All tokens are in `src/styles/base.css`.

### `--di-*` — brand primitives
| Token | Value | Use |
|-------|-------|-----|
| `--di-cyan` | `#4df9ff` | accent: active states, borders, labels |
| `--di-cyan-dim` | `rgba(77,249,255,0.1)` | hover background (cyan) |
| `--di-cyan-border` | `rgba(77,249,255,0.3)` | accent borders and dividers |
| `--di-black` | `#000` | page background |
| `--di-surface` | `#0a0a0a` | deepest surface |
| `--di-text` | `#fff` | primary text |
| `--di-text-muted` | `rgba(255,255,255,0.4)` | secondary/disabled text |
| `--di-danger` | `#f25f5c` | errors, destructive actions |
| `--di-success` | `#4df9c0` | connected state, success |
| `--di-warning` | `#ffb347` | degraded state, caution |

### `--ui-*` — component aliases (map to `--di-*`)
Use `--ui-*` tokens in components, never hardcode the raw `rgba` unless the component is in `studio.css` and the token doesn't exist.

---

## Interactive States

### White-tinted (buttons with no semantic meaning)
| State | Background | Border | Color |
|-------|-----------|--------|-------|
| Resting | `rgba(255,255,255,0.0)` or family bg | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.55)` |
| Hover | `rgba(255,255,255,0.08–0.10)` | `rgba(255,255,255,0.2)` | `rgba(255,255,255,0.85)` |
| Active/selected | `rgba(255,255,255,0.12–0.15)` | `rgba(255,255,255,0.25)` | `#fff` |

### Cyan-tinted (active mode, selected panel, toggled-on)
| State | Background | Border/accent |
|-------|-----------|---------------|
| Active | `rgba(77,249,255,0.10–0.12)` | `rgba(77,249,255,0.3)` |
| Active strong | `rgba(77,249,255,0.20)` | `var(--di-cyan)` |

### Danger (delete, error, destructive hover)
| State | Background | Border | Color |
|-------|-----------|--------|-------|
| Hover | `rgba(242,95,92,0.08)` | `rgba(242,95,92,0.2)` | `rgba(242,95,92,0.9)` |

---

## Typography

| Role | Size | Weight | Case | Color |
|------|------|--------|------|-------|
| Panel section label | `10px` | 700 | UPPERCASE | `rgba(77,249,255,0.55)` |
| Panel title | `10px` | 700 | UPPERCASE | `rgba(77,249,255,0.55)` |
| Button label | `11px` | 500–600 | sentence | `rgba(255,255,255,0.7–0.85)` |
| Field label | `10px` | 600 | UPPERCASE, spaced | `rgba(255,255,255,0.45)` |
| Field value | `12px` | 400 | — | `rgba(255,255,255,0.9)` |
| Mono (code, HUD) | `12px` | 400 | — | `#eaf2f8` / `var(--di-mono)` |
| Presence initial | `9–11px` | 700 | UPPER | `#07111b` on cyan bg |

**Never use `font-size` below `10px`** — the design system minimum is 10px. Anything smaller is illegible at the panel scale.

---

## Spacing and Sizing

### Radius scale
| Context | Value |
|---------|-------|
| Viewport buttons, panels, inline inputs | `6px` |
| Cluster outer, dialogs | `7px` |
| Inspector fields, pane controls, scc buttons | `4px` |
| Small inline (collapse, close, tag) | `3px` |
| Color swatch | `2px` |
| Circular (presence dot, toggle thumb) | `50%` |

**Rule:** Do not add a new radius value. Map to the nearest entry in this table.

### Button sizing
| Context | Size |
|---------|------|
| Viewport corner buttons (`?`, fullscreen, account) | `30 × 30 px` |
| Pane control buttons (H, V, ×) | `auto` (padding `2px 7px`) |
| Cluster section buttons (`scc-btn`) | `auto` (padding `3px 10px`) |
| Panel close `×` | `auto` (font `16px`, padding `0 4px`) |
| Collapse `▸/▾` | `auto` (font `11px`, padding `2px 4px`) |

---

## Viewport Corner Layout

The studio viewport has two fixed corners. Do not add elements outside these zones.

### Top-right — gizmo only
```
top: 10px, right: 10px
```
Axis gizmo (`position: absolute` inside `.svl-pane`). Nothing else goes here.

### Bottom-right stack — three viewport buttons
All `position: absolute` inside `.studio-viewport-shell`, `right: 14px`:

```
bottom: 86px  →  Account / sign-in    (30×30, same style as siblings)
bottom: 48px  →  ? (shortcuts)        (30×30)
bottom: 14px  →  Fullscreen           (30×30)
```

Gap between buttons: 4px (48−14−30 = 4, 86−48−30 = 8).

**Rule:** If a new viewport corner button is needed, extend this stack upward (bottom: 124px, etc.) using the same 8px gap. Never put a button in the top-right corner — that corner belongs to the gizmo only.

---

## Panel Internal Anatomy

```
.sfp-shell  ← the draggable card
  .sfp-header  ← drag handle, title, × close
  .sfp-content ← scrollable body (max-height: 70vh)
  .sfp-resizer ← bottom-right corner resize handle
```

Header padding: `7px 8px 7px 12px`. Divider: `1px solid rgba(255,255,255,0.07)`.
Content padding: set by the child component, not the panel shell.
Close button `×`: `font-size: 16px`, no background at rest, `rgba(255,255,255,0.08)` on hover.

---

## Dividers and Separators

| Context | Value |
|---------|-------|
| Panel internal section divider | `border-bottom: 1px solid rgba(255,255,255,0.07)` |
| Cluster section divider | `border-bottom: 1px solid rgba(255,255,255,0.05)` |
| Inspector section divider | `border-bottom: 1px solid rgba(255,255,255,0.05)` |

Use opacity, not color. Never use `#` hex values for dividers.

---

## MUI Override Rules

MUI components (Button, Avatar, TextField, Select, etc.) must be restyled to match the system above. The default MUI theme is NOT compatible.

**Required overrides for any MUI Button used inside the studio:**
- `boxShadow: 'none !important'`
- Background and border colors must use `rgba(...)` values from this document
- `borderRadius` must be one of the values in the Radius scale table above

**Required overrides for MUI TextField / Select:**
- Remove default MUI box shadows (`box-shadow: none !important`)
- Use `rgba(255,255,255,0.03–0.05)` background, `rgba(255,255,255,0.1)` border
- Active/focus border: `rgba(77,249,255,0.5)` (or `var(--di-cyan-border)`)

**Never** use MUI default colors (`primary`, `secondary`) in studio components — they use the wrong palette.

---

## Animation and Transition

Standard transition for color/background/border changes: `0.12–0.15s` linear or ease.
No spring animations except where explicitly implemented (drag, panel mount).

```css
transition: color 0.12s, background 0.12s, border-color 0.12s;
```

Longer transitions (opacity fades for overlays, panel entrance): `0.15s`.
No transitions above `0.2s` in the editor — the studio must feel immediate.

---

## What Breaks the Visual System

These are the patterns that introduce drift. If you see them, fix them.

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Button with wrong radius (e.g. `50%` when `6px` is correct) | Copied from MUI default or old code | Match radius table |
| Dark background with wrong base (`#111` or `rgba(0,0,0,x)` instead of `rgba(4,6,9,x)`) | Hardcoded hex instead of system value | Use `rgba(4,6,9,0.92)` for panels |
| Viewport button with panel opacity (opaque, no scene showing through) | Wrong surface family | Use `rgba(15,23,34,0.55)` family |
| Cyan text label lowercase | Not inheriting section-label pattern | `font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.14em` |
| Box shadow on an input field | MUI default leaking through | `box-shadow: none !important` |
| Missing `-webkit-backdrop-filter` on a panel | Copied only standard property | Always pair both prefixed and standard |

---

## Files

| What | Where |
|------|-------|
| Token definitions | `src/styles/base.css` (`:root` block) |
| Studio panel CSS | `src/studio/styles/studio.css` |
| Inspector / field CSS | `src/studio/styles/studio.css` (`.insp-*`) |
| Cluster CSS | `src/studio/styles/studio.css` (`.scc-*`) |
| Panel shell CSS | `src/studio/styles/studio.css` (`.sfp-*`) |
| Account button | `src/components/AccountButton.jsx` |
| Viewport buttons (? + fullscreen) | `src/studio/components/StudioViewport.jsx` |
| Axis gizmo position | `src/studio/styles/studio.css` (`.svl-gizmo-wrap`) |
| Landing page style | `src/landing/landing.css` + `docs/ai/design-baseline.md` |
