# feat/ux-move2-pull-to-move — View | Edit: a new box stays in reach (2026-10-29)

Base `origin/dev` 42db10536 (rebased 2026-10-29). Worktree `~/work/di.iiii-move2`. Not pushed. Test copy the owner tried:
`http://move2-try-test.diiii.localhost/move2-try/studio` (di-dev stack `move2`, scratch data). The branch name is historical
(it began as a "Move 2" try-out); what ships is the Studio's **View | Edit** switch.

## Why

UX audit 2026-10-28, finding F030 (`~/work/agent-reports-2026-10-28/ux-audit/findings.json`; pictures `capture/flows/T5/desktop-08.png`
→ `desktop-10.png`): the child and the senior pulled the box they had just added; the Studio was in Navigate, the view turned and the
box left the screen. Plan slice S55 "a new box stays in reach". The owner tried a pull-to-move build, then said "look it can be the edit
mode and view mode"; the lead read it back and he said "yes"; after trying View | Edit on the test copy he said "fine".

## What View | Edit is

- **One switch** `ViewEditSwitch.jsx` (+ `styles/view-edit-switch.css`): square, Inter, house tokens, 44 px targets; top centre of
  the desk Studio and in the phone's top row (where the old Edit/Editing button was). Same state as the Tools window and the E key.
  In code View = the Navigate tool, Edit = the Edit tool (`viewportEditMode`).
- **View:** every pull turns the view; nothing can move by accident. Move 1, untouched.
- **Edit:** a left drag, or one finger, that starts on the ONE selected thing slides it on the horizontal plane through the grabbed point
  (three.js DragControls' ground-plane drag, `Ray.intersectPlane`): height never changes, the grabbed point stays under the pointer. A ray
  grazing that plane (slope under 0.1) uses the upright plane facing the camera and keeps only its sideways part; a floor hit farther
  than 20 grab distances is skipped. Release = one `onTransformCommit` = one `updateComponent` op = one undo step. Under 3 px it is a
  click. A cancelled pull (pointercancel, window blur) puts it back, nothing written.
- **Always the camera (Move 1), also in Edit:** a press anywhere but the one selected thing; Alt/Shift/Ctrl/Meta held; the middle or right
  button; a second finger; a press on a gizmo handle; two or more selected. The arrows (gizmo) stay for exact moves.
- **Never moves by a pull:** a locked or hidden thing, the place's own geometry (`isPlaceGeometry`: building / `viewRole: architecture`,
  `place-hall`, venue plan, steel, fixtures, rig pieces, beams), or anything inside one of those. Not on a visitor's page (no
  `onTransformCommit`), not in Walk, Fly or XR.
- **Adding** from Create (also the quick insert and a drop) switches to Edit (`StudioShell.jsx` wraps `onCreateEntity` /
  `onCreateFromAsset`); the new thing is already selected by `StudioEditor.jsx` `handleCreateEntity`.

## Files

- `src/studio/components/ViewEditSwitch.jsx`, `src/studio/styles/view-edit-switch.css` — new: the switch.
- `src/studio/navigation/pullToMove.js` — new: the pull (pure rules, `PULL_TOOLS = ['edit']`, `pullPressAllowed`, `createPull`, `usePullToMove`).
- `src/studio/navigation/useCameraNavigation.js` — takes `mode` (the Studio tool) and `pull`; the pull branch runs before Move 1's, only in Edit. Move 1's branch not edited.
- `src/studio/components/StudioShell.jsx` — the switch on desk and phone; Create switches to Edit.
- `src/studio/components/StudioViewport.jsx` — builds the pull; the gizmo registers itself; pose and selection box follow a pull.
- `src/studio/components/BoxSelect.jsx` — no box from a press that started a pull.
- `src/studio/utils/entityObjectRegistry.js` — `getEntityObject`.
- `src/studio/navigation/moves.js` — comment only. `useMoveSettings.js`, `StudioHelpDialog.jsx` — one mouse table "View and Edit (like Sketchfab)".
- `src/wiki/wikiContent.js` — the VIEW | EDIT paragraph, `updated: '2026-10-29'`. `docs/ai/vocabulary.md` — row "View | Edit".
- `docs/ai/known-fixes.md` — F030 entry. Tests: `src/studio/navigation/pullToMove.test.js` (new), `src/studio/components/StudioShell.test.jsx`.

## Decisions and readings (say if wrong)

- **Changed on purpose, then kept as a mode (S55V2, owner 2026-10-29 "i think we can have this as mode … what we have never lose"):**
  the Edit tool's mouse was "exactly like Blender" (left button only selects, middle orbits; 2026-10-12, `ed2c5290e`). The default in
  Edit is now Pull to move (camera = Move 1, plus the pull), and **Scene → Move → Mouse in Edit → Like Blender** brings back the
  2026-10-12 map exactly (`navigation/editMouse.js`; `editMouse.test.js` compares it with origin/dev's map).
- **Words:** `vocabulary.md` already uses **view** for a named camera a project keeps; the switch uses the owner's own word "View", and
  the new row writes both meanings down.
- No "Move 2" ships: `MOVES`, `DEFAULT_MOVE_ID` and `move1.golden.test.js` equal `origin/dev` (`preference.js` only gains the Edit
  mouse key). A browser that stored
  `move-2` during the try-out reads Move 1 (`normalizeMoveId`).
- "Rig of a place" = fixtures, rig pieces, beams and steel; a light added from Create is the person's own and pulls.
- With two or more selected a pull is the camera's; moving a whole selection by a pull is not built.

## Tests

See the commit and the round-3 result file `~/work/agent-reports-2026-10-28/ux-fix/round3b/S55V-work.json` for the runs after the
rebase (scoped vitest through `di-cool 85 900`, eslint on changed files, and the same tests run against `origin/dev`'s product files to
show they fail on the old code).

## Not done / limits

- Not pushed, no PR. `npm run build`, `start-check`, full `npm run test` not run (heat rule; scoped runs).
- Touch: a second finger during a pull is not a pinch (the first finger belongs to the pull). Snapping does not apply to a pull.
- Open PRs #1174 (Undo/Redo buttons) and #1176 were not on `origin/dev` at the rebase; whichever lands second rebases.

## Review (S55V, 2026-10-29)

- The switch now has the keys of a radio group (WAI-ARIA APG "Radio Group"): one Tab stop, the arrows flip it (`ViewEditSwitch.jsx`;
  test "the switch is one Tab stop…" in `StudioShell.test.jsx`, fails on the commit before).

## What this branch replaced, and where each one is kept (S55V2, 2026-10-29, rule "nothing we have is ever lost")

Read from `git diff origin/dev...HEAD` (every `-` line of the branch):

| Was on origin/dev | Now | Kept as |
|---|---|---|
| Edit's mouse = `blender` map (2026-10-12 "edit like Blender", `ed2c5290e`; StudioViewport `getNavigationPreset(editMode === 'edit' ? 'blender' : 'studio')`) | Edit default = `studio` map + pull | **Mode**: Scene → Move → Mouse in Edit → Like Blender (`editMouse.js`, key `di.studio.navigation.editMouse`); `editMouse.test.js` = origin/dev map |
| Blender's per-pixel turn speed in Edit (`viewportHeight / 900`) | unused with Pull to move | **Mode**: comes back with Like Blender (the same `preset.id === 'blender'` line, untouched) |
| Help → Shortcuts: two mouse tables, "Navigate (like Sketchfab)" and "Edit (like Blender)" | one table | **Back**: both tables, titled "View, and Edit with Pull to move" and "Edit with Like Blender" |
| Help note "The tool picks the mouse: Navigate moves like Sketchfab, Edit exactly like Blender." | `VIEW_EDIT_HELP_NOTE` | **Mode**: the note now names both Edit mice; the old sentence is true again with Like Blender |
| Phone top row: one toggle button "Edit" / "Editing" | View \| Edit switch (same state, same place) | **Tool**: the switch does the same toggle; the Tools window's Navigate / Edit and the E key are unchanged |
| `StudioShell` passed `onCreateEntity` / `onCreateFromAsset` straight through | wrapped: adding switches to Edit | added behaviour, nothing removed (with Like Blender the left button then only picks, as on 10-12) |
| `// eslint-disable-next-line react-hooks/exhaustive-deps` above `bindings` useMemo | removed | not a behaviour (the deps are complete) |

Not touched by the choice: View (Move 1, `move1.golden.test.js` unchanged), the Shift+? "Mouse navigation" preset (`NAVIGATION_STORAGE_KEY`,
read nowhere in StudioOrbit on origin/dev either), Walk/Fly.

## Review (S55V2, 2026-10-29)

Independent review of `45d8ec7f5` (Mouse in Edit). Like Blender gives Edit origin/dev's `blender` map and no pull (`presetForTool`,
`pullOnFor`; both the pull hook and the press branch are off). The new tests fail on `88b5e6624` (3 files, editMouse.js missing,
2 UI tests red) and pass here with the related suite (12 files, 193 tests). Reviewer fix: the stale header comment in
`useCameraNavigation.js` (said the Studio uses 'studio' in Edit always). The default stays Pull to move: the owner names it in the
merge window; Like Blender is one click away in Scene → Move.
