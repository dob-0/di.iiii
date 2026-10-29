## The pack carries docs/ai/public (ledger N1409)
- dev.diiii.xyz answered 404 for /llms.txt and /ai/context: the dev tier runs the pack natively and the pack lacked docs/ai/public, where serverXR/src/aiPublic.js reads.
- scripts/pack-runtime.mjs now copies that folder (24 KB) into the stage, in every profile (the dev tier packs the local profile, so gating on profile would keep dev at 404).
- aiPublic.js header corrected; scripts/packProfile.test.js guards the copy.
- Not tested: the Mac's dev pack (checked after the deploy).
