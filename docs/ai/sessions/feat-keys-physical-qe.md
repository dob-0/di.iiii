## 2026-10-29 — walk and fly keys are physical, E is up and Q is down while flying

- The walk reads the key's place (`event.code`) through `src/components/physicalKey.js`, so an Armenian or Russian layout walks like a Latin one; F and L read the same way.
- While flying, E is up and Q is down (Unity, Unreal, Roblox Studio and Blender agree); Space and C still work; the old Q-up / E-down pair is kept as `LEGACY_ALTITUDE_KEYS` in `walkKeys.js`.
- `docs/ai/keys.md` is the spec table with the vendor sources read that day.
- Not done: /build keeps E for the inventory and Q for raise (a clash the owner decides); no pickable setting for the old pair; no real Armenian keyboard test.
