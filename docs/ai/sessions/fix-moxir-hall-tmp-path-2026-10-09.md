## 2026-10-09 — the far41 hall rig no longer points into /tmp

- `moxir-hall-2026-10-08-v8-show-back21-far41.hall.json` listed its inputs file under a session scratchpad in `/tmp`, which is gone after a reboot. The inputs (`dims-far41.json`) are now in the repo as `scripts/place/rigs/moxir-hall-dims-far41-2026-10-08.json`, and `dimsFiles` / `dimsNotes` name that path like every other hall rig.
- New check `scripts/place/rigs-no-tmp.test.js`: no file in `scripts/place/rigs` names a temporary path, and every `dimsFiles` entry of a `*.hall.json` exists in the repo.
- Not rebuilt: the hall file was edited by path only, not regenerated with `hall.py`; its numbers are unchanged.
