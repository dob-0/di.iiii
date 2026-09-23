## 2026-09-23 — batch landing: one project across every layer (Wave 1 + the first of Wave 2)

Six green PRs landed as one batch, per `feedback_batch_land_behind_prs`, after both live peer
sessions (dob-8b, dob-6a) confirmed they held nothing in di.iiii. Plan:
`di-atlas/decisions/2026-09-23-connect-everything.md`. Each PR's own session note rides in
this batch; this note is for the batch branch itself.

| PR | Branch | What |
|---|---|---|
| #536 | `fix/one-name-per-tool` | Raw → Nodes on /tools, the local home and the landing; Carry panel says Projection; the landing's 18-card wiki grid becomes one "Open the Wiki →" link; `copyVocabulary.test.js` guards "Raw" as a label |
| #537 | `feat/desk-returns-to-project` | `/light/?space=&project=&label=`: the desk shows `← <project>` plus Studio · Nodes · Projection, kept in sessionStorage across its tabs; `lightingDeskPath({ spaceId, projectId, label })`; Projection's Light link passes the project |
| #538 | `docs/sentences-that-lie` | wiki host → diiii.xyz (both `/get` files identical, neither redirects); no `di install --docker`; `di sync` writes nothing; follow carries a project's files; algovrithm told true; "Moves to the trash for 30 days"; Solo · screen |
| #539 | `feat/one-project-list` | `/{space}/raw/projects` keeps its address and renders `StudioHub openIn="nodes"`; RawHub and its cards retired; `← Projects` returns to the Nodes list |
| #540 | `fix/first-room-traps` | Headset entry Off writes `'off'`; admin-mode chord and 4-finger hold need a signed-in admin; F with nothing selected frames the room; "+ new project" says why it failed |
| #541 | `feat/bar-carries-project` | SurfaceBar carries `space · project`, names Projection, lists Light on every tier (hosted → the card, client-side); mounted on the Studio editor, the Nodes project canvas and the Projection desk; `--sbar-h` corrected |

Found on the owner's install after packing the batch: an EMPTY Nodes project opens in the zen
nobody chose (stored `auto-on`), and #541 hid the bar with the rest of the chrome, so a
newcomer's first Nodes screen was a dead end again. Fixed on the batch: `isAutoZen()` in
`src/raw/utils/zenMode.js`; `RawEditor` keeps the bar for an automatic zen and still hides
it for a chosen one (tests in `zenMode.test.js` and `surfaceBar.embed.test.jsx`).

One merge conflict, `src/tools/ToolsRoom.test.jsx` (added by both #540 and #541): the two
files were combined into one, with a SurfaceBar mock that also exports `navigateInApp`.

Still the owner's: walking the bar on local.thedi.studio and the S24; the nine decisions
in the plan (old editor, where the light show lives, the one file, Light/Lamp/Rig, retiring
the tools' own jump buttons, "Lights on" machine, the S24 on the desk, "Save current view"
vs the auto-framed shot, promotion).
