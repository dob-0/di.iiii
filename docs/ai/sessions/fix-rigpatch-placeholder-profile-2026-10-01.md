## 2026-10-01 — The desk upgrades a placeholder profile when the room brings the known channel list

- Found in the MOXIR human test on PONYO: with the Known rig patched (36 fixtures), every look fired and every DMX channel stayed at 0, so the room and the rig stayed dark. Gevorg's show file carried "UP-PL5403 8ch" and "UP-B380F 16ch" as owed placeholders (roles ch1..chN, labels "Ch N (list owed)"). rigpatch reused any existing profile with the same name and width, so the tested lists (dimmer, r, g, b … / pan, tilt …) never reached the desk.
- `serverXR/src/lighting/rigpatch.js`:
  - A same-name, same-width profile whose roles are exactly ch1..chN is replaced (`addProfile … replace: true`) by the room's known list. Fixtures already on it keep their address and gain the new roles at their resting value.
  - Two different known lists produce a `profile-clash` flag, and the desk keeps its own.
- Tests: tests/test-rigpatch.js +2 (12/14 on the old code, 14/14 after); test-http, test-cues, test-wiring and test.js pass; vitest serverXR/src/lighting 15/15; eslint clean.
- Data on PONYO (serverXR/data-known): the two profiles were replaced by hand through `POST /api/profiles/add {replace:true}` before this fix. Looks now drive 112–123 channels.
