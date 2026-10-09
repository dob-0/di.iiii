## 2026-10-09 — CI runners pinned to ubuntu-24.04 before GitHub moves ubuntu-latest to Ubuntu 26

- GitHub's annotation on every run: "The ubuntu-latest label will migrate to Ubuntu 26 beginning October 19, 2026" (actions/runner-images#14748), two days after the 17 Oct show. All 21 `ubuntu-latest` uses in 12 workflows and the 2 in `docs/templates/*.yml` now say `ubuntu-24.04`.
- Measured before the change: ci.yml run 37943811580 (2026-10-09) ran image `ubuntu-24.04` 20261002.596 under `ubuntu-latest`, so the pin changes no runner today. All 14 files parse as YAML.
- Rule written in `docs/ai/roles/infrastructure-engineer.md` → "Runner Images Are Pinned". Owed: try `ubuntu-26.04` on its own branch after the show; pin `install-matrix.yml`'s `windows-latest` (image `windows-2025-vs2026` today) once the label is confirmed.
