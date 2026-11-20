## 2026-11-20 — the Colab launcher rests while it waits (ledger N5947-N5950)
- Owner asked why Colab uses our machine: only the waiting client runs here, and it spins. Three of them held aylmo at 100 °C.
- Brought `scripts/place/colab-pinned.sh` (pinned CLI 0.7.5, from branch feat/place-keep-front-door, commit c2d51ec55) to dev and made it run at the lowest priority, CPU-capped at 15 % under systemd (`PLACE_COLAB_CPU`, `off` = uncapped).
- Test: `bash scripts/place/colab-pinned.test.sh` (stand-in spinner, cap under 25 %).
- Not done: the library's `pg-cards-colab.sh` (repo di-library-pg) still points at the ch3d tree's copy; it follows once this is on dev.
