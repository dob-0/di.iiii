# AI Workflow — di.iiii

Three tiers. Use the right one for the job.

---

## Tier 1 — dob-fast (local, ~28 tok/s)
`ollama run dob-fast` or Continue sidebar in VS Code

**Use for:**
- CSS fixes, style tweaks
- Small component edits (<50 lines)
- Hook parameter changes
- Removing/adding imports
- Writing tests for existing logic
- Quick "how do I do X in R3F/MUI" questions

**Example prompts:**
```
Fix the spinner in Spinner component to match the studio dark theme
Add a missing null check in useSpaceSocket.js line 167
Write a test for normalizeAuthRole in authAccess.js
```

---

## Tier 2 — dob-deep (local, ~22 tok/s)
`ollama run dob-deep` or Continue sidebar → switch model

**Use for:**
- New hooks (useXxx.js)
- Auth/session logic
- Collaboration features
- Refactoring a single large file
- Backend route additions
- Performance fixes in a known file

**Example prompts:**
```
Write useAuthSession hook that reads the session cookie and exposes role/spaces
Split useAssetPipeline into useAssetUpload + useAssetRestore + useAssetUrl
Add rate limiting middleware to spaceRoutes.js
```

---

## Tier 3 — Claude (paid, full context)
Open a new Claude Code session in the project directory

**Use for:**
- Cross-file architecture decisions
- "What's wrong with X" — full codebase analysis
- Merging diverged branches
- Planning feature work that touches 5+ files
- Debugging production issues
- Anything that requires understanding the whole system

**Example prompts:**
```
Analyze how App.jsx should be split by domain
How do dii_ii and dii_iiii diverge and how do we merge them
Design the storage migration from filesystem to Postgres
```

---

## Active Task Queue

### Ready to apply now
- [x] Remove 92 console.log lines — done
- [x] Fix sourcemap in vite.config.js — done
- [x] Add lazy loading to RootApp.jsx — done

### Next up (dob-deep)
- [ ] Commit auth work from dii_iiii (authSession + authAccess)
- [ ] Integrate landing page from dii_ii
- [ ] Add lazy loading to Studio/Beta internal routes
- [ ] Split useAssetPipeline (609L) into 3 smaller hooks

### Bigger (Claude)
- [ ] Merge dii_ii + dii_iiii into one clean branch
- [ ] Plan App.jsx domain split
- [ ] Storage migration design (filesystem → Postgres)

---

## Git Hygiene
Stale branches to delete (all merged or abandoned):
```
main-pre-realign, main-prod-fix, main-prod-tight, main-ui-promote,
production-asset-guardrail, production-hotfix, production-hotfix-2026-04-13,
rollback-production-old-ui-20260420, promote-staging-to-main-ee7f4ce
```
