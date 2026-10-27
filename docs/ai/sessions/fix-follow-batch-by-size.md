# fix/follow-batch-by-size

## A follow cuts each send by size, so a heavy batch reaches the other side (N1291)

- 2026-10-26 (owner: "i want to sync local and dev"): a read-only compare of every shared space (dev with each follow's key,
  the own di) gave 320 of 322 projects identical. moxir-scenes-v7-0: the own di at version 1584, dev at 1224; the 360 ops
  between are laser-cube `updateComponent` writes of show night (2026-10-17), ~265 KB each, 95 MB. `di follows` said
  "the other di.iiii refused this side's changes … request timeout" for nine days: 200 ops (53 MB) in one request, over
  express.json's 10 mb limit and the 8 s timeout.
- Fix: followPlan.js `unseen`/`moreToCarry` also cut a batch at 2 MB (BATCH_BYTES); one op always goes, however big; order
  and the contiguous cursor (accountedThrough) unchanged. Tests: 4 new (the 360 x 265 KB case carried in order, each once;
  a giant op alone; small ops still 200); src/follow 18 files, 233 passed.
- Owed (not this PR): laser cubes writing ~265 KB of beam frames per op into the document is runtime state in the op log.
