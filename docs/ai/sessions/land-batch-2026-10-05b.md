## 2026-10-05 — batch landing: follow gaps, Raw drag + one Open, Kit versions, no supplier prices

- One batch branch off dev 25084310 (owner's merge word 10-05 15:0x: "move to 5"), merged `--no-ff`:
  #770 fix/follow-gaps-2026-10-05 · #773 fix/raw-one-open-2026-10-05 (carries #771) ·
  #774 fix/kit-versions-derived · #775 fix/no-supplier-prices-in-public-2026-10-05.
- File overlap checked first: only `docs/ai/known-fixes.md` (#770 + #774) — merged cleanly by git.
- Not in this batch: #772 (MOXIR safety; its CI has a failure), the Raw cloud branches (unreviewed).
- Limit: the supplier prices leave the tree, not the git history; the dev document
  `moxir-hall-known-full` still holds them until it is edited (Emilya's project).
