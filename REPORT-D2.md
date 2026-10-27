# D2 report
PR https://github.com/dob-0/di.iiii/pull/765 (draft, base dev). Fix: `listedAs` map in scripts/place/rigs/moxir-versions-2026-10-17.json, read by codeVersionIds (scripts/production/derive.mjs). Code ids not renamed (they name rig files and marks).
Test: versions-audit.test.js "D2: the real versions file's ids..." fails without fix: yes.
Audit (local side only, read-only): before exit 1 (3 mismatches), after exit 0. Dev side not read (anonymous 429, no token).
Owed: re-run with dev token after landing; CI wiring.
