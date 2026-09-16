## 2026-09-16 — Land the rig (protocol 1) and Raw picture operators together

- Batch of #447 (Raw picture operators; spine-gate colour literals tokenised, dev merged in) and #478 (the rig, step 1: members find each other in any version).
- One conflict, `src/map/MapOutput.jsx` imports: kept both (`useTopNetwork`/`useMachinePresence` and `RigBlackout`).
- Combined checks before push: full vitest 4832 passed, eslint 0 errors, local-profile build ok.
