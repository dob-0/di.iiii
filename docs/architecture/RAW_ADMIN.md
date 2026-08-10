# The admin console, re-hosted as a Raw workspace

Status: **phase 0 and the first window of phase 1 are built.** Eight windows are
designed and not yet built. Design by the Fable session, 2026-08-10, read against
the real code; this file is the contract that survives the conversation.

## What is being replaced, and what is not

Two levels, and the rule is broken at exactly one of them:

- **the shell is replaced** — the topbar, the section rail, the single column.
  That is the override being issued, and all of it.
- **the atoms are preserved verbatim** — every window interior reuses
  `preferences-*` unchanged: `ModuleSection`, `MetricCard`, `InfoPair`, badges,
  tree rows, console lines. Each window is *today's section*, mounted.

This makes the work a **re-hosting, not a rewrite**: roughly 2,400 of the
console's 3,065 lines and all of its section tests survive untouched. A restyle
would need a second admin design language, which is the exact thing the
"canonical admin UI" rule exists to prevent.

Precedent: `AgentChatPanelWindow` already rides `raw-chat-*` 1:1 with a "no new
CSS" comment.

## The scope class

`preferences.css` turned out to be 198 portable rules out of 206. Only two things
were ever true *only inside the page*:

- the design tokens `--pref-border` and `--pref-border-active`, declared on
  `.preferences-page`
- seven `.toggle-button` rules, descendant-scoped to it

Both are now keyed off **`.preferences-scope`**, which the page carries and a
window puts on its body. That is the entire CSS cost of mounting a console
section anywhere. `AdminPanelWindow` applies it; nothing else needs to know.

## Two rules that make admin nodes not ordinary nodes

**1. No admin node declares an input port, ever.** An admin surface reachable
from graph evaluation is a delete wired to a signal — someone eventually connects
a clock to it to see what happens. There is no wire to make, and
`nodeRegistry.admin.test.js` fails if one appears. This is the single most
important sentence in the design, and it is a test rather than a comment because
a comment does not fail CI.

**2. `deletable: false` — admin windows close, they do not delete.** Otherwise
Backspace on a selected window removes the admin tool from the desk and the only
way back is knowing a palette command exists. Hiding (`frame.visible === false`)
is the affordance; deletion is not one. Enforced in `isNodeDeletable` and applied
at both of `RawEditor`'s delete paths.

`adminOnly` withholds the types from the palette for non-admins. **It protects
nothing** — `requireAdminAlways` on serverXR is the wall, and every admin surface
must stay useless without it. The flag exists so the palette does not offer a
door that will not open.

## Node inventory

Built:

| type | size | mounts |
|---|---|---|
| `admin.estate` | 900×640 | `EstateSection` — the private atlas map, admin-gated route |

Designed, not built: `admin.manage` (720×640, absorbs Inspect's space list, out
port `space`), `admin.opencall` (640×560), `admin.agents` (760×520, out `live`
signal), `admin.status` (420×520), `admin.console` (900×420), `admin.deck`
(520×440), `admin.scene` (860×620, in port `space` — the one earned wire),
`admin.topology` (860×520), `admin.env` (520×640).

Dies with the shell: `SectionNav`, the topbar metric cards (counts move to
`ModuleSection` subtitles), Overview as a section, the Operator Links panel
(becomes palette commands).

## Decisions worth not relitigating

- **The workspace doc stays local per device**, forever. A synced project doc
  would push one admin's window layout through the op-log to another's screen.
- **Not zen** — the admin workspace opens pre-laid, with the rest present but
  hidden, so the palette lists them as "open — admin.x".
- **The flat page survives as the mobile shell** below ~768px. Free-floating
  720px windows at 390px do not degrade, they fail. It doubles as the emergency
  fallback.
- **No destructive verb is ever a palette command.** Fuzzy-match plus Enter is
  how you delete a space you meant to open.
- **Danger is arm-then-commit, in-window**: the row expands in place, a space
  delete requires typing the space id, Enter never commits, and *while armed the
  window pins* — drag disabled, z-top, close disabled. Scoped to one window; no
  global freeze.

## Known weaknesses, stated rather than discovered later

- **Discoverability.** Tabs are self-evident; a canvas needs someone to know
  about `⌘K`. Mitigated by opening pre-laid rather than empty.
- **Mobile is a retreat**, not a design. Said openly.
- **`⌘Z` undoes window moves, not server data.** The help overlay must say so.
- **One admin, one desk.** This serves a single power user, which is exactly why
  it is acceptable here and why nothing else in di.iiii should follow it.
- A canvas *invites* wiring admin automation. That is why rule 1 exists.

## Phases

- **P0 — done.** CSS scope audit + `preferences-scope`, `adminOnly` and
  `deletable` flags, palette role filter, guards at both delete paths, tests.
- **P1 — first window done** (`admin.estate`), eight to go. Each is a thin
  wrapper mounting an existing section unchanged. `/admin` mounts `RawEditor`;
  `PreferencesPage` stays as the fallback.
- **P2** — extract the diagnostics JSX into shared components used by *both*
  shells; mobile breakpoint.
- **P3** — the danger idiom.
- **P4** — wires (`manage.space → scene.space`) . The estate route already
  exists and was built to this shape.
- **P5** — demote the page to mobile/fallback shell.
