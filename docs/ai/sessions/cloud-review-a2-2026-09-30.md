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
