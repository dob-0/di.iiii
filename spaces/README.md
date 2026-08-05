# spaces/

Two different things live here, and they are easy to confuse.

- `spaces/<id>/di-space.space.json` — the **declaration**. What the space is
  supposed to be on every tier: its label, whether it is public, and the tier
  map. Prescriptive. Hand-edited. This is the file the audit compares against.
- `spaces/<id>/scene.json`, `*.project.json` — **content snapshots** pulled
  from a running tier (`npm run space:pull`). Descriptive: what was there when
  someone last looked.

A snapshot cannot catch drift, because it has nothing to disagree with. That is
the whole reason the declarations exist: prod, staging and the dev box each
called `br_id_ge` something different for months, every sync reported success,
and the only thing that ever noticed was a person with three browser windows
open.

## Which spaces are declared where

A space is declared in the repo that is master for it.

| space | declared in | pages |
| --- | --- | --- |
| `main`, `open`, `wcc`, `azd` | here | authored in Studio — none in any repo |
| `algovrithm` | here | none, ever: its scene is React in `src/algoVrithm/` |
| `br-id-ge` | `dob-0/br_id_ge` | 4 |
| `beyond-form` | `dob-0/beyond_form` | 1 |
| `platform-recordar` | `dob-0/platform_recordar` | 1 |

The five declared here have an **empty `projects` list**, which the engine reads
as a space-only declaration (v6): it reconciles the space and touches no
content. Their pages belong to whoever is editing them in Studio, and a sync
must never have an opinion about those.

## Commands

```bash
npm run spaces:audit                      # every declared space, all tiers, read-only
npm run spaces:audit -- --space wcc       # just one

# apply a declaration (the only mode that writes)
node scripts/space-sync.mjs --space spaces/wcc/di-space.space.json --all --tier staging --dry-run
```

`--audit` is read-only and safe against production. `--all` writes; run it with
`--dry-run` first and read what it says it would SET.

Tokens come from the tier's declared `tokenEnv` — `PROD_API_TOKEN`,
`LIVE_API_TOKEN` (staging), `API_TOKEN` (local) — read from the environment or
`serverXR/.env.local`. The `local` tier is `governed: false`: shown in the
table, never enforced, because the dev box holds 70 projects nobody declared.

## Adding a space

1. `mkdir spaces/<id>` and copy a neighbour's `di-space.space.json`.
2. Set `spaceId` and `label` to what the space **already is** on production —
   declaring is not the moment to rename anything. Check with
   `npm run spaces:audit -- --space <id>` before you decide the value is right.
3. If the space's pages come from a repo, list them in `projects` and put the
   declaration in that repo instead of here.

`space-sync.test.js` fails if a declaration is missing `spaceId`, `label`, both
deploy tiers, or marks `local` as governed.
