## 2026-10-07 — MOXIR: model vs real, crane parking, and the 10-08 site survey

- Owner 2026-10-07: "we can move the crane, but we need to model maximum close to the real — one more check
  of all, look what is right". The owner and Emilya measure in the hall on 2026-10-08.
- Branch `feat/moxir-site-survey-2026-10-07`, cut from `feat/moxir-truss-flip-2026-10-07` (e489a6db).
  Read-only on every server: nothing was written to dev or local.
- `docs/moxir/MODEL_VS_REAL_2026-10-07.md`: every geometric fact the flipped cut depends on (value,
  source, confidence, range, what moves if it is wrong), the crane parking options run through the branch's
  own `versions.mjs` `craneCut` on copies of the 10-02 hall, and the ranked survey list for 10-08.
- `scripts/place/rigs/moxir-hall-measured-2026-10-08.json`: an empty dims layer (top-level keys null,
  which hall.py skips) with a `measurements` record per survey item (value, method, by, at, photo).
- Key findings: this branch still derives the cut from the 8.15 m girder guess (the 7.95 m measured
  girder is in PR #772, still open), so the flipped cut is drawn 0.2 m too high; the girders' 1.5 m inner
  gap is hard-coded in hall.py and moves the trim 0.29 m per metre; the crane's travel and end stops are in
  no file; the cut does not change with the crane's z inside the allowed 4.0–6.0 m window.
- Owed: fill the template on 10-08; merge #772 into the flip; code for the new keys (girder gap, cab x,
  travel, power) in hall.py.
