## 2026-10-26 — the follow engine asks less when nothing moves (DSC-1, 2, 7, 9, 10)

- The owner's whole-machine check of aylmo (N1271/N1283/N1319): the installed di used ~13 % of one core; profiles showed request volume, not a hot function.
- One project-list read per side per tick (was 3 here, 2 on the host); one document read per project per chase pass; a file held on neither machine backs off 5 min -> 6 h, one try per look, one line, its next look in `di follows`; the machine link says a refusal once and backs off to 10 min; pinned agents keep alive.
- Not changed, waiting for the owner: DSC-4 (comparison scope) and DSC-5 (skipping project streams) change sync behaviour.
- Not measured live: the drop in CPU and requests/s on aylmo needs this commit installed there (`di update --from`), which this job may not do.
