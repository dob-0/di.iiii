# scripts AGENTS

Short routing guide for AI agents working in `scripts/`.

## What This Area Owns

- deploy helpers and promotion wrappers
- environment file writers
- cPanel release staging
- smoke checks, asset sync, public-repo sync, and dev-stack helpers
- repository maintenance automation such as AI-doc sync/check scripts

## When To Edit Here

- edit here when changing developer automation, release flow helpers, or repeatable repo maintenance tasks
- start here when a command in `package.json` or a workflow step needs a new script or different behavior
- check `deploy/` for versioned deploy docs and env examples
- check `.github/workflows/` when a script change affects CI or release automation

## Adjacent Systems To Check

- [../AGENTS.md](../AGENTS.md)
- [../docs/ai/index.md](../docs/ai/index.md)
- [../deploy/AGENTS.md](../deploy/AGENTS.md)
- `../package.json`
- `../.github/workflows/`

## Do Not Assume

- do not embed secrets or personal machine instructions in versioned scripts
- do not change release behavior without updating the corresponding docs
- do not let CLI help text drift from real command behavior

## Validation And Tests

- `npm run test`
- `npm run docs:ai:sync`
- `npm run docs:ai:check`
- nearby tests:
  - `src/deploy-lib.test.js`

## One-Line Summary

Use `scripts/` for repeatable automation and repo maintenance, and keep it aligned with `package.json`, deploy docs, and CI workflows.
