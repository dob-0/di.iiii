---
name: hall-compare
description: Before any lamp check, sync walk, scene write or desk reload, compare a project's 3D and the light desk's patch with the place's hall reference, lamp by lamp. The reference file is an argument. Use at the start of every lamp-related job for a place.
---

# hall-compare

**Needs:** the di.iiii checkout, node >= 22, the place's hall reference file, read access to the project API and the desk, an admin token file if the API needs one.

Rule source: owner 2026-10-17 ("this is final … so before a check, run what can compare with the real one"), memory `feedback_compare_with_hall_reference_first`. Method: check against a golden reference before testing (the reference is the truth; the desk and an old document are not). Words: `docs/ai/vocabulary.md`.

## Run
```
node scripts/rigbuild/hall-compare.mjs --ref <hall-reference.json> --project <id> [--api <api>] [--desk <desk>] [--token-file <env file>] [--tolerance 0.15]
```
Exit 0 = the 3D and the desk equal the reference. 1 = differences, listed lamp by lamp. 2 = could not read something. It writes nothing. Checks, per DMX lamp: present, type, universe, address, place within the tolerance (metres); on the desk: every reference address patched once with the same type, nothing extra, no two projects at one address.

`<hall-reference.json>` is the file written from the project the owner called final: one lamp a row (id, type, universe, address, position, rotation). It is an ARGUMENT, never a default. Find the place's file with `ls scripts/place/rigs/*reference*` (a worked example is `scripts/place/rigs/moxir-hall-reference-2026-10-17.json`, one production's file, not a default). A new place = a new reference file; never edit the old one.

## Order
1. Run it first. Anything not exit 0 is fixed FIRST, before the lamp check or write.
2. To put a project's addresses on the desk: `node scripts/rigbuild/patch.mjs --project <old> --unpatch`, then `--project <id> --exact`, then `scripts/rigbuild/show-loop.mjs --project <id>`.
3. Re-run until exit 0, say the lamp count it compared.
4. `job-end-gate`.

## Known limits
- Checked this run: the script takes `--ref` and has no production file in its code (`grep -i moxir scripts/rigbuild/hall-compare.mjs` empty on dev). Its usage text and tests were not read in full; if a production file is found hard-coded there, the de-branding is job N1311.3, not this skill.
- DMX lamps only (a network laser has no address). Positions are compared to `--tolerance`, not to the hall's triangles.
- Method doc for the audit loop: `docs/moxir/devices/audit-loop.md` step 0 (a production folder name; the method is general).
