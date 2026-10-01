## 2026-10-01 — Devices kept off DMX: hazers and smoke run by hand, never patched

- Owner on PONYO, with Gevorg present: "work only with the known ones and with hazer and smoke but keep them out of dmx". The known-ground version recorded this as `policy.dmx.offDmx` (EXT-HAZER, UP-YZ31P), but nothing read it, so a patch still gave them channels (audit: U1@441–456).
- New fixture field `dmx: false` ("kept off DMX"):
  - `src/shared/projectSchema.js` normalizeFixture keeps it, and its manual CJS mirror `shared/projectSchema.cjs` does the same. Before this, the schema silently dropped it.
  - `src/rigbuild/autoPatch.js` `isOffDmx`: `patchRequest` never sends such a device, so it takes no address, and a prune takes it off the desk if it was there.
  - `src/rigbuild/sheet.js`: the row says `by-hand` ("off DMX — run by hand"), never "not patched" or "mode unknown". It is listed under Housekeeping, not counted as unaddressed.
  - `scripts/rigbuild/moxir.mjs` `moxirDocument` sets `dmx: false` on every device whose type code the version lists in `policy.dmx.offDmx`. This covers both the group lamps and buildRig's own effect entities, which pass through.
- Tests:
  - autoPatch.test "never sends a device kept off DMX" and the sheet.test "by hand" block both failed on the old code, shown red, then passed.
  - schemaSync.test: `dmx:false` survives through both schema copies; `dmx:'no'` is dropped.
  - New scripts/rigbuild/offDmx.test.js builds known-ground and patches it on a throwaway desk: 10 hazers and smoke carry dmx:false with no address, and 36 lights are patched.
- Validation (Windows, Node 24.18):
  - src/rigbuild, scripts/rigbuild, scripts/place, serverXR/src/lighting, src/shared and schemaSync: 1371 passed. The 22 failures are the known Windows baseline (CRLF/hash, Git Bash tar, C:\C:\ paths, controlsAreRectangles separators, wash-plan's pathname guard, which aylmo's PR #685 fixes).
  - eslint clean.
- Stacked on feat/moxir-known-ground-2026-10-01.
