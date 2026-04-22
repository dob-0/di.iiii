---
name: dii-hotspot-refactor
description: 'Safely decompose large orchestration files in this repo. Use when splitting App.jsx, PreferencesPage, StudioShell, useAssetPipeline, serverXR/src/index.js, or spaceRoutes by domain responsibility without breaking behavior or tests.'
argument-hint: 'Describe which file or area needs decomposition'
---

# dii Hotspot Refactor

## When to Use
- A known large orchestration file needs to be split by domain responsibility.
- A new feature would push a hotspot file further past its useful size.
- A bug is hard to find because too many concerns live in one file.
- You want to reduce the maintenance surface of a file without changing behavior.

## Outcome
Split one concern out of a large file into a correctly-scoped target, with behavior preserved and tests confirming the extraction.

## Core Rule
Extract by concern, not by line count. One well-named module with clear ownership is better than two arbitrarily-split files.

## Known Hotspots
- src/App.jsx: top-level editor orchestration for the legacy app surface
- src/components/PreferencesPage.jsx: operator dashboard with many unrelated sections
- src/studio/components/StudioShell.jsx: Studio shell composition and panel coordination
- src/hooks/useAssetPipeline.js: upload, restore, media optimization, and shared media objects in one hook
- serverXR/src/index.js: backend bootstrap, shared schema loading, and route mounting
- serverXR/src/routes/spaceRoutes.js: space CRUD, live pointer, and asset manifest logic

## Extraction Procedure
1. Identify one single domain that can be extracted cleanly.
2. Confirm the target location for the extracted code using the feature routing skill if the destination is unclear.
3. Write or run the existing tests first to establish the baseline.
4. Move the code into the new location without changing behavior.
5. Re-export from the original location temporarily if other files import it, to keep the diff minimal.
6. Update all import sites to point to the new location.
7. Remove the temporary re-export once all callers are updated.
8. Run the tests again to confirm behavior is unchanged.
9. Run the build to confirm no import errors.

## Extraction Target Examples
- Business logic out of a component: extract to a nearby hook or utility
- Multiple independent panel sections in a component: extract each to its own component with a clear name
- Upload logic separate from restore logic in a hook: extract to separate hooks that each do one thing
- Route handlers that own independent resources: extract to separate route files
- Backend bootstrap code separate from route mounting: extract bootstrap to a dedicated file

## Constraints
- Do not extract just to hit a line-count target. Extract to make ownership clearer.
- Do not change behavior, add features, or improve error handling during the extraction. Do only the structural work.
- Do not re-export indefinitely. Clean up all callers before closing the PR.
- Do not extract shared behavior into a lane-specific module. Use the correct shared layer.

## Repo Anchors
- Routing guidance: ../../AGENTS.md and dii-feature-routing skill
- Architecture hotspots: ../../docs/roadmaps/PROJECT_DEVELOPMENT_FRAMEWORK.md
- Studio guide: ../../src/studio/AGENTS.md
- Shared project guide: ../../src/project/AGENTS.md
- Backend guide: ../../serverXR/src/AGENTS.md

## Validation
- Before extraction: npm run test to baseline
- After extraction: npm run test and npm run build
- For serverXR extractions: npm run test:server-contracts

## Completion Checks
- Only one concern was extracted per PR.
- No behavior was changed during the extraction.
- All import sites now point to the new location.
- Temporary re-exports were removed.
- Tests and build both pass.
- The extracted module has a clear name that reflects its responsibility.
