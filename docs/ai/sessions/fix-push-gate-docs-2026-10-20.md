## the docs gate counts a branch's session note as its recap

- `scripts/check-agent-docs.mjs`: the CURRENT.md freshness rule now reads the newest of `CURRENT.md` and `docs/ai/sessions/*.md` (README excluded), from `CURRENT_MD_RECAP_PATHSPECS` in `scripts/repo-state-lib.mjs`.
- Why (ledger N885): a branch may not write `CURRENT.md` (only `npm run land` does), so when dev's last fold was older than the 2-day grace, every branch push was refused. On 10-19, 107 notes were waiting and the rig-tools branch could not push; PR #1027 folded them by hand.
- Test: `scripts/check-agent-docs.recap-paths.test.js` (temp git repo with dated commits).
- Still open: N843, the doc-paths check should refuse a docs/ai/sessions path named outside that folder.
