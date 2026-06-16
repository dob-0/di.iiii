# Repository Visibility And Mirror Status

This document replaces the old "private dev + public mirror" model.

## Current Reality

- Primary repo: [dob-0/di.iiii](https://github.com/dob-0/di.iiii) (**public**, active, deploy source of truth)

## Active Workflow

```mermaid
flowchart LR
    dev["dob-0/di.iiii:dev"] --> staging_env["staging.di-studio.xyz"]
    dev --> main["dob-0/di.iiii:main"]
    main --> host["di-studio.xyz"]
```

## Rules

- Treat `dob-0/di.iiii` as the only active collaboration lane.
- Keep deployment automation and release branches in `di.iiii`.
- Branch flow is `dev → main`. Staging is a GitHub Actions deploy environment, not a source branch.

## Legacy Note

Any references in older docs to "private working repo" vs "public mirror repo" are historical and should be interpreted using the current reality above.
