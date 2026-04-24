# deploy AGENTS

Short routing guide for AI agents working in `deploy/`.

## What This Area Owns

- versioned deployment docs
- cPanel env examples and release templates
- checked-in deploy contracts that explain how artifacts should be staged and applied

## When To Edit Here

- edit here for deployment documentation, env examples, and checked-in deploy templates
- start here when the deploy contract changes but the change is primarily documentary or example-driven
- move to `scripts/` when the actual automation behavior changes
- check `serverXR/README.md` when backend runtime or auth/runtime deployment truth changes

## Adjacent Systems To Check

- [../AGENTS.md](../AGENTS.md)
- [../docs/ai/index.md](../docs/ai/index.md)
- [../scripts/AGENTS.md](../scripts/AGENTS.md)
- `../docs/deploy/`
- `../serverXR/README.md`

## Do Not Assume

- do not store secrets, private host paths, or personal machine notes here
- do not let deploy docs drift away from the actual automation scripts
- do not describe legacy fallback deploy paths as the default future path

## Validation And Tests

- `npm run docs:ai:check`
- cross-check deploy docs against:
  - `scripts/deploy.mjs`
  - `deploy/cpanel/DEPLOY.md`
  - `.github/workflows/publish-cpanel-prebuilt-v2.yml`

## One-Line Summary

Use `deploy/` for versioned deploy docs and examples, but keep real automation behavior in `scripts/` and keep both layers aligned.
