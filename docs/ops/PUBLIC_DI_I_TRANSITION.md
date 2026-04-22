# Public `di.i` Transition

This doc defines the recommended target model for making `dob-0/di.i` the real public home of the project without exposing hosting internals, secrets, or local runtime data.

## Goal

- `dob-0/di.i` becomes the main public showcase and open-source collaboration repo
- `dob-0/di.iiii` remains the private work and ops overlay until hosting-specific material is fully separated
- production hosting continues to deploy from the private release flow

## Recommended Repo Roles

- `dob-0/di.i`
  - public code
  - public docs
  - public issues and PRs
  - collaboration in the open
- `dob-0/di.iiii`
  - hosting-connected automation
  - private deploy notes
  - local/runtime data
  - emergency ops overlay while the split is still in progress

## What Should Move Public

- root app source in `src/`
- shared runtime/schema code in `shared/`
- public-safe backend source in `serverXR/src/`
- public-safe static assets in `public/` and `serverXR/public/`
- architecture, testing, and roadmap docs
- local dev/build/test config
- public CI workflow

## What Must Stay Out Of The Public Repo

- `.env` files and generated env files
- cPanel and CloudLinux deploy scripts
- `.deploy/`
- `serverXR/data/`
- `serverXR/uploads/`
- deploy runbooks with host-specific filesystem paths
- private checkpoints and local archive material

## Sync Mechanism

Use the public sync script from the private repo:

```bash
npm run sync:public:di.i -- --dest /tmp/di_i_public
```

What it does:

- syncs from the current private worktree
- syncs only the curated public-safe file set
- generates a sanitized public `package.json`
- generates a sanitized public `package-lock.json`
- leaves deploy/hosting paths out of the public repo
- supports repeated `--skip <path>` arguments so dirty or unfinished files stay private for a given sync

## Current Rule

Do not try to solve this with hidden branches in a public repository. Keep the public repo public, keep secrets out of git, and keep host-specific operations in the private overlay until they can be removed cleanly.
