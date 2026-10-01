## 2026-10-01 — land batch: the follow sync gaps (#700) + PONYO's MOXIR line (#704–#712)

Owner: "merge 700 703 704 to 712". #703 merged on its own (clean). The other ten were all BEHIND dev, so they land as
one batch (memory feedback_batch_land_behind_prs): `land/batch-ponyo-sync-2026-10-01` from dev, `--no-ff` merge of
#700, #704, #705, #706, #707, #708, #709, #710, #711, #712 in that order (#711 before #712, as PONYO asked). The only
conflicts were new rows at the same spot in `docs/ai/known-fixes.md`; every row from both sides is kept. No code file
conflicted. Each PR's own session note stays in place for the fold on dev.
