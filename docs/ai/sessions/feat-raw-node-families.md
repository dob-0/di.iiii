## 2026-08-18 — the node truth audit, and families for a palette that felt messy

- "Raw feels not real" — audited every one of the 39 placeable types: 8-agent code-truth
  pass (per family + palette/wiring plumbing) plus a real-browser pass placing each node
  one by one, screenshots looked at. Verdict: 33 REAL end to end, 6 PARTIAL, 0 true
  shells. The unreal FEELING was presentation: a flat 39-row palette in code-declaration
  order, families invisible (NODE_CATEGORIES' "used for palette grouping" comment was
  never implemented), wires that draw in full colour into anything, a "Code / Body"
  inspector box that stores-but-never-runs with no caveat, a complete timeline editor
  nothing could reach, and universe.space wearing an authoringOnly tag its working
  showChrome disproves.
- **Families.** Seven artist-facing families by task (bring in / make / numbers / the room
  / watch / send out / agents) — NODE_FAMILIES + FAMILY_BY_TYPE in the registry, additive,
  categories untouched underneath, coverage enforced both directions by test. The palette
  browse groups under sticky headers with counts and a family colour bar per row; any
  typed character dissolves to the flat ranked list; keyboard highlight skips headers;
  commands stay pinned first. Cards and the outliner dot wear the same family colour and
  label — a studio card no longer says "universe".
- **Honesty.** "authoring only" tag → "shell" (dimmed row); work.status/work.agent carry a
  registry devLocalOnly flag and a "local dev" tag; the inspector CODE section is labeled
  "Code — stored, not run"; wire-drag now lights every input that can take the wire and
  quiets every one that cannot (colour↔vec3 interchange included) — an incompatible drop
  used to be pure silence.
- **Quick reals from the audit:** timeline gets an add-clip button (the whole built editor
  — drag/trim/razor/ripple/retime — was unreachable: no way to create a clip existed);
  math.mix lerps two hex colours per RGB channel instead of hard-switching at t=0.5;
  value.boolean got its first test; view.text content edits in a textarea.
- Verified: lint 0 errors · 2171 tests · build clean · looked at on desktop 1440px and
  phone 393px, browse/scroll/query/wire-drag screenshots opened. Audit artifacts: family
  truth table in the PR description; per-node screenshots were session-local.
- Not done, deliberately: per-node port-level liveness marking on cards, ImagePanelWindow
  rendering a wired live texture, universe.desk.3d rendering its child scope — audit
  quickFixes recorded for a later pass.
