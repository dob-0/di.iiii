# land/concept-picture-channels-2026-10-05

## What landed and how

- #760 concept status for the production version list (owner: 'keep the others as concept').
- #761 apply-picture.mjs: the rig code's night/fog/background written into versions (the 'porthole' fix; already run on dev with --fields fog,background).
- #762 release channels: dev prerelease per green commit, di update --channel dev, di autoupdate timer (owner: 'all places the same, synced'; installs need no GitHub account).
- All three merged clean. Locally on this branch: followIntegration + lighting 35/35 (both failed once on GitHub in their own PR runs: #760 twice in followIntegration, #761 once in lighting.test 'a cue whose look is not on the desk'); this batch's CI decides — if they fail again it is a defect, not a re-run.
- #762 channel tests 58/58 locally.
