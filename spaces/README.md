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
| `open`, `wcc`, `azd` | here | authored in Studio — none in any repo |
| `main` | here | **3 manifests declared here** — suite, landing, brand-guide |
| `network` | here | **54 manifests declared here**, generated from `people.json` |
| `algovrithm` | here | none, ever: its scene is React in `src/algoVrithm/` |
| `br-id-ge` | `dob-0/br_id_ge` | 4 |
| `beyond-form` | `dob-0/beyond_form` | 1 |
| `platform-recordar` | `dob-0/platform_recordar` | 1 |

**Four of the six declared here — `algovrithm`, `azd`, `open`, `wcc` — have an
empty `projects` list**, which the engine reads as a space-only declaration
(v6): it reconciles the space and touches no content. Their pages belong to
whoever is editing them in Studio, and a sync must never have an opinion about
those.

**`main` (3) and `network` (54) DO carry manifests, and `--all` will push every
one of them over whatever is live.** That mode is push-only — repo → `PUT`, no
read-back, no diff, no undo (`docs/ai/golden_rules.md`). `network`'s own
declaration says the rooms are handed over one by one: *"When a person takes
their room over in Studio, remove their manifest from `projects`."* Copying the
`wcc` command line below and swapping the space id is exactly how someone's
live edits get overwritten — check the `projects` length before running it.

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

That last sentence has a cost worth naming: **the local tier goes stale in
silence.** The audit prints `—` for a space the dev box has never heard of and
still exits 0, and an audit only covers the spaces someone wrote a declaration
for — the private ones (`library`, `atlas`, `decisions`) are declared nowhere.
The command that fixes it walks production's own space list instead:

```bash
npm run local:mirror:check   # read-only: what prod has that this box doesn't
npm run local:mirror         # create the missing spaces and pull their projects
```

It mirrors `label`, `isPublic`, `openInscriptions` and `allowEdits`, and
deliberately **not** `kind` or `permanent` — a local install builds `open` as
`kind: global` while production reports `normal`, and copying that across would
demote the local open space. Ownership and roles it never touches, for the
reason given below.

## Ownership is not declared here

A space's owner is deliberately **not** a declared field. Handing someone a
space is a grant, and a grant that a file can silently re-apply on every sync is
not a grant. Ownership is set once, by an admin, in Preferences → Manage → a
space → Owner & access — or over the API:

```bash
# who owns what, and which accounts exist
curl -s -H "Authorization: Bearer $PROD_API_TOKEN" https://di-studio.xyz/serverXR/api/spaces
curl -s -H "Authorization: Bearer $PROD_API_TOKEN" https://di-studio.xyz/serverXR/api/users

# adopt one space (admin only; null releases it back to the platform)
curl -X PATCH -H "Authorization: Bearer $PROD_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"ownerUserId":"<account-id>"}' https://di-studio.xyz/serverXR/api/spaces/<spaceId>
```

Spaces created before ownership existed carry `ownerUserId: null`, so every
publish, invite, rename and delete on those falls through to a platform admin.
**The PATCH handler has landed** — `serverXR/src/routes/spaceRoutes.js`, the
`ownerUserId !== undefined` branch — so adoption works against any tier running
that build or later. (This paragraph used to say the route was unshipped and a
PATCH was silently ignored; that was true of `feat/space-declared` before it
merged, and stopped being true without the paragraph noticing.) GET the space
back and confirm the field before assuming an older prod build accepted it.

## Adding a space

1. `mkdir spaces/<id>` and copy a neighbour's `di-space.space.json`.
2. Set `spaceId` and `label` to what the space **already is** on production —
   declaring is not the moment to rename anything. Check with
   `npm run spaces:audit -- --space <id>` before you decide the value is right.
3. If the space's pages come from a repo, list them in `projects` and put the
   declaration in that repo instead of here.

`space-sync.test.js` fails if a declaration is missing `spaceId`, `label`, both
deploy tiers, or marks `local` as governed.
