## 2026-09-22 — a lamp can be aimed, and a place can be scanned: #530, #531 and #533 land together

- Batch branch off `dev`, merging three green PRs in one CI round rather than three:
  `feat/lights-on-a-place` (#530), `feat/place-pipeline` (#531), `feat/place-scan` (#533).
  All three were BEHIND `dev`, so landing them one at a time would have invalidated the
  others in turn.
- **Why these three now.** Walking the install on 2026-09-22 asking "how do I set the
  lights here", the answer was: you cannot. A light's TRANSFORM offered Position only, the
  renderer passed `SpotLightObject` no target so three.js aimed every spot at the world
  origin, and adding a lamp changed nothing you could see. The fix already existed, tested,
  in #530 — it had simply never left its branch. #531 and #533 are the lane the same walk
  found doors missing for: the scan surface works and nothing linked to it.
- Two conflicts, both "keep both sides", both resolved by hand:
  - `docs/ai/known-fixes.md` — #530 and #531 each append rows to the same table; kept every
    row from both.
  - `src/wiki/wikiContent.js` — `WIKI_HIGHLIGHT_IDS` gained `lights-on-a-place` on one side
    and `scan-a-place` on the other. Written as the union, both near the front; both ids
    were checked to resolve to real wiki pages in the merged file.
- The combined tree is what no CI run had ever seen: each PR was green alone, none of them
  green together. The suite was run on the batch before it was pushed.
- Known and deliberately not addressed here: the tools room still has no door to the scan
  surface, `di stage` or NDI, and its Desk card links to `localhost:4748` with no indication
  when that is down. Platform chrome is still below every touch-target minimum — the top nav
  is 27px tall on a phone, the front door's footer links 16px. Both are their own pass.
