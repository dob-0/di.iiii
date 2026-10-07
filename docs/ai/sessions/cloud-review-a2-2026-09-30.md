## 2026-09-30 — cloud review, routine A, areas A3 / A4 / A5 (read-only)

Scope: `docs/ai/sessions/docs-moxir-review-scope-2026-09-30.md` (A1 and A2 were reviewed elsewhere).
Read-only: no code changed. Claims were proved with small node scripts run in a scratch worktree
(outside the repo) against the named ref; nothing here was seen on a screen, so there are no visual claims.

### A3 — Scene deck layer 1 (ref `origin/feat/scene-deck-model`)

`npx vitest run src/rigbuild/sceneDeck` at the ref: 22/22 pass.

**Findings**

1. **medium — the laser sign-off is self-asserted by the data it guards, and matched as a substring.**
   `src/rigbuild/sceneDeck/model.js:175` — `requiresLaserSignOff: String(look.intent || '').includes(SIGN_OFF_MARKER)`.
   The flag is free text in `look.intent`, the same field a carried bundle (`bundle.js:293`, 480 chars) or the
   other organizer's copy brings in. Scenario (proved): export minimal-ground, set `Red room`'s
   `levels["truss-top/up-la40wf"] = 1` and append `requiresLaserSignOff` to its intent, re-hash, `parseBundle`
   → `compareScenes` → `planSync` (changedThere, default takeTheirs) → `sceneOps` → `guardSceneChange`: passes,
   the laser level here is `1`. Without the word it is refused (`laser-sign-off`), so the guard works only as
   long as nobody types the word; an intent such as "no requiresLaserSignOff yet" also counts as signed off.
   Smallest fix: never accept a sign-off from the other side — in `guardSceneChange`, when a laser group goes
   from 0 to lit, require that the look already carried the marker BEFORE the ops (`before` scene), and match
   the marker as a token, not a substring.

2. **medium — keep both never records a common base, so every later sync asks again and adds another copy.**
   `src/rigbuild/sceneDeck/sync.js:174` — `return [{ kind: 'restorePoint', id }, { kind: 'addCopy', id, scene: labelledCopy(status.there, label) }]`
   (no `setBase`), and `copyOps` (`sync.js:191`) only de-duplicates the id, never the content. Scenario (proved):
   a changedBoth scene, keepBoth three times against the same "there" → `changedBoth` each time, looks
   `gs-red-room-there`, `-there-2`, `-there-3`. Repeated syncs grow the look list until `too-many-looks` (50)
   refuses the whole sync. Smallest fix: keepBoth also emits a base that records the decision (or `copyOps`
   returns `[]` when an identical look already exists).

3. **medium — undo reverts other people's later edits to OTHER looks.**
   `src/rigbuild/sceneDeck/history.js:55` — `const inverse = invertProjectOps(action.document, action.ops)`, and
   a look op writes the whole list (`model.js:166`). The inverse is the entire `rigLooks.looks` as it was
   before the change. Scenario (proved): intensity 0.5 on `Red room` (recorded), then a colleague's colour
   `#123456` on another scene (not recorded here), then undo → the other scene is back to `#eef3ff`, the
   colleague's colour is gone. §21 states last-writer-wins for simultaneous edits on one install; it does not
   state that undo/restore-last-good silently discard any later edit to any look. Smallest fix: build the
   undo op against the CURRENT document (re-apply only the recorded scene's fields onto the list as it is now),
   or refuse undo when the list changed since the step (compare `canonicalJson` of the other looks).

4. **low — take theirs writes a fade longer than its hold (and up to 3600 s), which the speed control refuses.**
   `bundle.js:287` accepts `fade`/`hold` 0-3600; `sync.js:218` writes `fade: theirs.fade`; `guardSceneChange`
   (`model.js:223-245`) checks laser, aims and loop length but not fade ≤ hold or fade ≤ 60 (`speedOps`,
   `model.js:289-290`, does). Scenario (proved): bundle `Red room` fade 40 → after take + guard: fade 40, hold 12,
   loop still 79 s. Smallest fix: move the fade rules into `guardSceneChange` for every in-loop scene that
   changed.

5. **low — a deeply nested bundle throws an untyped `RangeError`, not a `bundle-*` error.**
   `bundle.js:267-270` — `walkFinite` recurses over the raw parse result before `exactKeys` rejects unknown
   fields (line 312). Scenario (proved): `{"format":"di.scenes/1","x":[[[…20000…]]]}` (≈40 KB, under the
   512 KiB cap) → `RangeError: Maximum call stack size exceeded`. A caller that branches on `SceneDeckError`
   gets an unexpected type. Smallest fix: run `exactKeys(b, …)` before `walkFinite`, or bound the depth.

6. **low — numbers above ~1.8e302 hash as `null`.** `hash.js:70` — `Math.round(n * 1e6) / 1e6` overflows to
   `Infinity` for finite `n`, and `JSON.stringify(Infinity)` is `null`: `canonicalJson({a: 1e303})` =
   `{"a":null}`, so two different huge aim values hash alike. Only reachable through unbounded aim numbers in
   a bundle (`bundle.js:294` checks `typeof n === 'number'` only). Smallest fix: refuse `|n| > 1e9` in
   `normaliseNumber` (and bound aim values in `checkScene`).

**Refuted**

- A cue with no `fade`/`hold` makes `sceneContent` hash NaN and throw — the schema always writes both (`projectSchema.js:1548-1549`).
- A laser lit through take theirs WITHOUT the marker — `guardSceneChange` refuses it (`laser-sign-off`, proved).
- Take theirs / keep both writing before a restore point — `planSync` puts `restorePoint` first in both (`sync.js:168-174`); the ORDER of execution belongs to layer 2 (A4).
- Keep both changing the loop length — the copy has no cue (`labelledCopy`, `sync.js:150`).
- A reorder not detected by the compare — true (proved: 0 states differ), but stated in §21 "Limits".
- `__proto__` / `constructor` in `lastSync` — `JSON.parse` makes an own property; lookups read own keys; no prototype write in layer 1 (layer-2 ledger checked in A4).
- Duplicate ids, non-finite numbers, oversize, hash mismatch, non-canonical scene — all refused by `parseBundle`.
- Timestamps / documentVersion deciding which side is newer — neither is read by `hash.js` or `sync.js`.
- `stateOf` matrix — every combination of here/there/base (present, absent, equal) maps to one of the six states; delete-vs-change is `changedBoth`.

**Not read**

- `src/shared/projectSchema.js` beyond the cue normalisation lines and `invertProjectOps`' callers; `showClock.js` (loop length taken as the tests assert it); `scripts/rigbuild/looks.mjs`, `show-loop.mjs` (used only to build the probe documents).

### A4 — Scene deck screens A and B, layer 2 (ref `origin/preview/rigbuilder-13-2026-09-30`)

Layer 1 (`src/rigbuild/sceneDeck/{hash,model,history,sync,bundle}.js`) is byte-identical to `feat/scene-deck-model`,
so the A3 findings hold on this ref too (A3 #1, the self-asserted laser sign-off, is reachable from SYNC FROM A FILE).
`npx vitest run src/rigbuild/ScenesDeck.test.jsx`: 29/29 pass.

**Findings**

1. **medium — RESTORE LAST GOOD (and UNDO) write the whole old snapshot, unguarded, over everyone's later work.**
   `ScenesDeck.jsx:353-361` sends `step({ type: 'restoreGood', document: doc })` straight to `applyOps` with no
   `guardSceneChange`; `history.js:29` — `for (const c of from.cues) if (!wanted.has(c.id)) ops.push({ type: 'deleteMappingCue', … })`.
   The default snapshot is "as opened" (`ScenesDeck.jsx:320-324`). Scenario (proved in node): open the page,
   a colleague adds cue `cue-colleague` (hold 5 s), press RESTORE LAST GOOD → ops `["deleteMappingCue:cue-colleague"]`,
   loop 84 → 79 s; any change the colleague made to any look is reverted too (the looks list is written whole).
   Smallest fix: compute restore/undo only over the scenes this page wrote, and run `guardSceneChange` on the
   result; refuse with words when the document changed elsewhere since the snapshot.

2. **medium — the sync ledger says "synced" before, and whether or not, the write reaches the server.**
   `ScenesDeck.jsx:463-467` — `applyOps(ops)` then `setBases(…)` at once; `applyOps` is `applyLocalOps`
   (`useProjectDocumentSync.js:385-405`): optimistic, the queue lives in memory, and on a 401 it only keeps the
   batch queued (`:260-277`). `ScenesSurface.jsx` renders no pending-sync error. Scenario: session expired, TAKE
   THEIRS → the page shows theirs, `localStorage` holds base = their hash, no error on this page; close the tab →
   the queued op is gone; reopen → here = old, base = theirs → `changedHere`, "CHANGED HERE (waiting to send)",
   default keep mine: the take is silently undone and the OLD scene is offered to the other copy. (Reasoned from
   the code; not run against a server.) Smallest fix: show the store's `pending-sync-error` on this page and
   write bases only once the op is acknowledged (or re-derive them on load).

3. **medium — the restore point before a take is one in-memory slot: each take overwrites the last one.**
   `ScenesDeck.jsx:459-461` — `step({ type: 'markGood', document: doc })` on every take; `history.js:68-69`
   keeps a single `good`. Scenario (proved in node): take (or change) scene 1, then scene 2, RESTORE LAST GOOD →
   scene 2 is back, scene 1 keeps the change; the owner's own MARK THIS AS GOOD is also replaced by the first
   take. The point also disappears on reload while the ledger (persistent) says the sync happened. House rule:
   "no write to the owner's data without a restore point" — it exists, but only for the latest write of a
   session. Smallest fix: mark good once per file read (in `onFile`), not per take, and say so in the message.

4. **medium — lost updates: the deck never checks a document version, and every look write is the whole list.**
   `ScenesDeck.jsx:326-331` (`write`) and `model.js:166` (`looksOp` patches `rigLooks.looks` whole). On a 409
   the sync hook catches up and RESUBMITS the same batch on top (`useProjectDocumentSync.js:279-330`), so a
   colleague's change to a DIFFERENT look that landed first is replaced by this page's stale copy of it. §21 names
   last-writer-wins only for two edits "on the same install"; this is across installs. (Reasoned; not run
   against a server.) Smallest fix: a per-look op (owed per §21), or rebuild the looks op from the current
   document at flush time.

5. **low — B at 390 px: ten cues cannot fit.** `scenes.css:91` — `.rigscenes-cue { flex: 1 1 0; min-width: 44px }`
   in `.rigscenes-tl { display: flex }` (`:90`, no wrap, no overflow rule). full-ground has 10 cues: 10 × 44 =
   440 px against a 358 px column (390 − 2 × 16 padding), so the row spills about 82 px past its border.
   Arithmetic only — NOT seen on a screen. Smallest fix: `overflow-x: auto` on `.rigscenes-tl` (or wrap).

6. **low — a file whose `project` is empty skips the project check.** `ScenesDeck.jsx:411` —
   `if (parsed.project && parsed.project !== projectId)`. A bundle from another show with `"project": ""` is
   compared, and its scenes (onlyThere, default take theirs) become cues here. Smallest fix: require
   `parsed.project === projectId`.

**Refuted**

- A control that skips the guard — all four go `applyControl` → `guardSceneChange` (`model.js:324`); strobe is on/off only, no rate can be written.
- Sync writes unguarded — every sync action is run through `guardSceneChange` on a working copy BEFORE anything is sent; a refusal sends nothing (`ScenesDeck.jsx:442-457`); the order guard → restore point → record → `applyOps` is enforced in code.
- A laser lit through the sync WITHOUT the marker — refused (A3 refuted list); a take that moves an aim is refused (`mover-policy`), conservative, not a hole.
- Loop pushed outside 60-90 s by a control or a take — guarded (keep both adds no cue). Only restore/undo are unguarded (finding 1).
- Ledger: every storage read/write is in try/catch, a broken entry reads empty, a refused write shows a note (`ledger.js:88-115`); `__proto__` from storage assigns a string to a prototype slot, which is ignored — no pollution.
- Bundle text in the DOM — names and ids are JSX text only; no `dangerouslySetInnerHTML`, no `href` from data; inline styles take only `previewColour` (hex) and numbers.
- Timers and animation frames — the play interval and the preview `requestAnimationFrame` are cleared on unmount / change (`:490-496`, `:150`).
- Preview strobe — fixed 1000/3 ms period, 70 ms flash, off with reduced motion (`preview.js:132-136`).
- Rectangles and targets — every button / range / colour input is `min-height/min-width: 44px`, `border-radius: 2px` (`scenes.css:28-36`); tabs move with arrow keys; ranges commit on key up / pointer up.
- Read only — `applyOps` is `NO_WRITE` and every write path returns early on `readOnly`.

**Not read**

- `RigToolRoute` / `rigToolAccess.js` beyond `NO_WRITE` (who gets `readOnly`); `useProjectDocumentSync.js` beyond `applyLocalOps` and the flush error paths; `RigSteps.jsx`; the body of `ScenesDeck.test.jsx` (only run); global stylesheets (whether the page already hides horizontal overflow). Layout at 1440 / 1920 px not assessed.

### A5 — Light pool (ref `origin/preview/rigbuilder-13-2026-09-30`)

Files read in full: `src/rigbuild/lightPool.js`, `src/rigbuild/useLightPool.js`; the integration line in
`RoomLookFollower.jsx:18-23`; the test names of `lightPool.test.js`. Probes: `stepLightPool` / `slotDrawing` /
`normalizeProjectDocument` in node.

**Findings**

1. **medium — the document half of the flag, and every pool option, never reach the room.**
   `lightPool.js:211-216` reads `mappingState.lightPool.enabled` and `:219-230` reads `slots`, `minHoldMs`,
   `handoverMs`, `margin`, `bounds` from it; but `normalizeProjectDocument({ mappingState: { lightPool: { enabled: true, slots: 4 } } }).mappingState.lightPool`
   is `undefined` (proved), and the store normalises every document it holds (`projectStore.js:21, 56, 76`).
   Nothing in `src`, `scripts`, `serverXR` or `shared` writes `lightPool` either. So the pool can only be switched
   on by `?lightPool=1`, always with the defaults, and `bounds` is always `null`: the `window(d)` term the header
   describes (`lightPool.js:20-24`) never applies in the room — lamps are ranked by I·Ω alone. The test
   "is off unless the document or the page query asks" passes a raw `mappingState`, not a normalised one.
   Smallest fix: keep `lightPool` in the mapping-state normaliser (ESM and the CJS mirror), clamped as
   `lightPoolOptions` does, with a test through `normalizeProjectDocument`.

2. **low — the dip is not continuous when the incoming lamp goes dark during the fade-out half.**
   `lightPool.js:128-131` releases the slot (`s.from = null`) and step 2 re-takes the still-lit OLD lamp with
   `fadeStart = now - handoverMs / 2`. Proved (1 slot): A→B swap at t=2000; at t=2100 the slot shows `a:0.50`;
   B goes dark at t=2100 → `a:0.00`, then `a:0.17` at 2133, `a:1.00` at 2300: a step of 0.5 in the room's
   light. Smallest fix: when `lamp` goes dark while `from` is still lit and mid-dip, give the slot back to
   `from` with a `fadeStart` that keeps the current envelope.

3. **low — `minHoldMs` below `handoverMs` allows a second swap mid-dip (a jump).** `lightPool.js:147` locks a
   slot on `since` only; `lightPoolOptions` (`:225`) allows `minHoldMs: 0`. Proved: `{ minHoldMs: 0 }`,
   slot at `b:0.50` at t=2300, a stronger lamp C arrives → `b:1.00`. Unreachable today (finding 1) and live
   the day finding 1 is fixed. Smallest fix: clamp `minHoldMs >= handoverMs`, or treat a slot as locked while
   `now - fadeStart < handoverMs`.

4. **low — a strobing lamp's cone flashes but its room light, moved to a slot, stays steady.**
   `applyLightPool` (`:193, :201-202`) copies `components.light` only; the slot's `beam` is `{ visible: false }`
   without `strobeHz`, while the lamp, now `beam.only`, still mounts `StrobeDriver` on its cone
   (`SpotLightObject.jsx:104`). Not a flash-rate hole (fewer flashes, not more) — a picture that disagrees with
   itself when a desk strobes a pooled lamp. Smallest fix: carry `beam.strobeHz` onto the slot (StrobeDriver
   then drives the slot's light).

5. **low — during a hand-over every lamp entity gets a new object 30 times a second.** `useLightPool.js:28-31`
   recomputes `applyLightPool` on each `clock` tick (`TICK_MS = 33`), which copies every poolable lamp
   (`lightPool.js:184-188`) and re-ranks all lamps (`:26` effect depends on `clock`). Only for ~400 ms per
   hand-over; cost on an Intel iGPU NOT measured. Smallest fix: memoise the beam-only copies on `entities`
   and let the tick rebuild only the N slot entities.

**Refuted**

- The real-light count changing — the N slots are always emitted, empty ones parked at intensity 0 (`:189-207`); a slot's `beam.visible: false` makes it cast (`spotBeam.js:116`); every rig lamp is written `beam.visible: true` (`rig-lib.mjs:1218`) so becomes beam-only; flash lamps are already beam-only with no light (`looks.js:406`); `atLevel` scales haze but never hides a beam. Changes only when the flag or `slots` changes.
- More than 12 slots — `emptyPool` and `lightPoolOptions` both clamp to `POOL_MAX_SLOTS` (proved: `slots: '1e9'` → 12).
- NaN / missing lamp fields — `num()` turns them into 0 / defaults for the score; a NaN position is passed through, but the lamp itself carried the same NaN before the pool (not introduced here).
- Oscillation — a displaced lamp must beat the new one by 15 % and the new one is locked 1500 ms (defaults).
- Flag OFF — `useLightPool` returns the same `entities` array, and `RoomLookFollower` still maps it to `null` (`:21`); state stays `null`.
- `?lightPool=1` — a regex test on `location.search`, nothing stored, nothing interpolated; it only changes this viewer's own rendering.
- Slots placed wrongly for nested lamps — rig lamps carry no `parentId` (`rig-lib.mjs`).

**Not read**

- The body of `lightPool.test.js` (names only; not run); `useRigLook.js` (where `look.entities` comes from); `spotLightAim.js`; three.js shader code (the "no recompile" claim was checked on the entity count only, not in a renderer). Nothing was run in a browser; no frame rate was measured.
