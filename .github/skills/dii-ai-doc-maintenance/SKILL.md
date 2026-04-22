---
name: dii-ai-doc-maintenance
description: 'Maintain AGENTS.md, docs/ai, and generated instruction bridges for this repo. Use when changing canonical AI guidance, adding new scoped areas, syncing generated bridge files, or preventing AI-doc drift.'
argument-hint: 'Describe the AI doc or agent guidance change'
---

# dii AI Doc Maintenance

## When to Use
- You are editing AGENTS.md files, docs/ai pages, or generated instruction bridges.
- A new project area, workflow, or ownership boundary needs durable AI guidance.
- Canonical docs changed and generated bridge files must be refreshed.

## Outcome
Keep canonical docs concise and authoritative, regenerate bridges, and verify that the documented routing still matches the repo.

## Procedure
1. Start at the root AGENTS.md and docs/ai/index.md.
2. Decide whether the change belongs in canonical docs or in generated bridge output.
3. Edit canonical sources first:
   - root or scoped AGENTS.md for short routing
   - docs/ai for deeper reference
4. Do not hand-edit generated bridge files unless the generator workflow explicitly requires it.
5. If a scoped area changed, verify the nearest AGENTS file still points to the right adjacent systems and validations.
6. Run the sync command to regenerate tool-native bridge files.
7. Run the check command to catch drift, broken links, or scope issues.
8. If scripts or workflows are the source of truth for the change, cross-check docs against scripts and package.json before finishing.

## Rules
- Keep root docs as a table of contents, not a dump of deep detail.
- Keep shared guidance in AGENTS.md and docs/ai instead of tool-specific files.
- Keep checked-in AI docs public-safe.
- When architecture or workflow truth changes, update canonical docs before generated outputs.

## Repo Anchors
- Root guide: ../../AGENTS.md
- AI index: ../../docs/ai/index.md
- Workflow guide: ../../docs/ai/workflows.md
- Testing guide: ../../docs/ai/testing.md
- Deploy guide: ../../docs/ai/deploy.md
- Automation guide: ../../scripts/AGENTS.md
- Sync script: ../../scripts/sync-agent-docs.mjs
- Check script: ../../scripts/check-agent-docs.mjs

## Validation
- npm run docs:ai:sync
- npm run docs:ai:check

## Completion Checks
- Canonical docs were updated instead of only generated outputs.
- Scoped guides still match real ownership boundaries.
- Generated files are back in sync.
- No private or machine-local details were added to checked-in AI docs.
