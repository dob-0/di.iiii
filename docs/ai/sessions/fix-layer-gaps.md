## 2026-08-21 — the two layer gaps the doors audit left

Owner: *"we just need to fix layer gaps"*. Checked `dev` first this time, which retired
one of the three candidates before any code was written — `/{space}/raw` being called a
"hub" while rendering a blank canvas is **already fixed** on dev (`RAW_PAGE_CANVAS`,
`buildRawCanvasPath`, with a comment saying the old name "taught every caller the
opposite"). Two gaps were real.

**The way between the tools ran in one direction on a phone.** The node editor has
carried "Open in Studio" in its ⋯ menu since the doors audit, but Studio's return trip
lived only in the desktop floating cluster — so on a phone you could go node editor →
Studio and not back. Studio's mobile topbar gains **Nodes**, using the `onOpenNodeEditor`
prop dev already threaded through the shell. Verified by tapping it: `/atlas/studio/
projects/estate-map` → `/atlas/raw/projects/estate-map`, same project, other tool. The
bar reads `← · estate map · Nodes · Edit` at 390 with no overflow.

**Raw's chrome never named the space.** Studio's cluster header has always shown
`space · project`; Raw showed the project alone — and `@media (max-width: 1200px)` hid
even that, so on every phone AND most laptops nothing on screen said which space you were
editing in. It was recoverable only from the URL.

Now `open · Open Jam` above 1200px, and **`open` alone below it** — the title drops, the
space survives. A space id is short enough to afford at 390; a project title is not. Done
by folding into the existing `.raw-topbar-name` element rather than adding chrome, with
the project half in its own span so the narrow rule can drop exactly that.

Measured: `1440 "open · Open Jam" 106px · 1199 "open" 32px · 900 "open" · 390 "open"`.

**Toolbar overlap** re-checked at 1440 / 1201 / 1199 / 900 / 700 / 390 — 3 slots, zero
overlap at every width, including both sides of the breakpoint I introduced. Run with the
zen preference forced off (`dii.raw.zen.<projectId>` = `off`), because the repo's own
`check:toolbar-overlap` measures an empty bar and passes vacuously otherwise — see the
note on the previous branch.

**Still not done, and not for lack of trying:** the editor addresses still read
`/{space}/{tool}/projects/{id}` — tool above project. That is §7.1 of
`SPEC_url_architecture_and_tree_addressing.md`, unsigned since 2026-08-04. And
`/admin?space=` still demotes the space to a query parameter; `/{space}/admin` is free
(`admin` is already reserved on both axes) but it is another canonical address and did
not belong in a gap-closing pass.
