# Project visibility — private work inside a public space

Status: landed 2026-09-29 (branch `feat/project-visibility`).
Owner's words: "i think we need to create private and public inside the project to not flood everywhere".

## Why

Visibility used to be a property of a SPACE only (`spaces.is_public`). A public space
exposed every project in it, and every asset those projects hold. The only way to keep
one piece of work private was to split it into a second space — which "floods
everywhere": more spaces, more cards, more places for the same show. The first case was
MOXIR: the space must be public on the dev tier so the show can be shared, and it holds
`moxir-sources` — 37 venue photographs with no recorded consent for public use.

## The rule

Every project has `visibility`: `'public'` (the default) or `'private'`.

| Space | Project | A visitor (not a member) | A member |
| --- | --- | --- | --- |
| public | public | sees it | sees it |
| public | **private** | **404 — it does not exist** | sees it |
| private | either | 401/403 at the space gate, as before | sees it |

- `'public'` means *as visible as its space*, not "public on the internet". Every project
  that existed before this landing reads `'public'`, so nothing that was on show changed.
- **Member** = anyone whose session could read the space if the space were NOT public:
  authenticated, role viewer or above, and `canAccessSpace()` for that space. That is the
  exact test `requireReadRole` applies to a private space (`serverXR/src/index.js`), so
  there is no second membership list to drift. It covers admins, unrestricted identities,
  accounts whose scope includes the space, tokens scoped to it, sync keys for it, and —
  in the communal open space — every signed-in session. With `REQUIRE_AUTH` off, everyone
  is a member (everyone is the owner of a self-hosted install).
- **A visitor gets 404, never 401/403**, with the same body a project id nobody created
  gets (`{"error":"Project not found."}`). A different answer would confirm the project
  exists. The contract test compares the two responses byte for byte.
- **The published project cannot be private**, either way round: `PATCH /api/spaces/:id`
  with a private `publishedProjectId` → 409 `published_project_private` (re-checked when an
  approval-gated patch executes), and `PATCH /api/projects/:id {visibility:'private'}` on
  the space's published project → 409 with the same code. The front door is what every
  visitor is sent to; a private one would be a door that 404s.
- **Who changes it:** the space owner or an admin (403 otherwise) — the same person who
  decides the space's own `isPublic`. A project can also be **created** private by anyone
  who may create in the space (`POST /api/spaces/:id/projects {visibility:'private'}`), so
  a copy of private work is never public for a moment.

## Where it is enforced (every read path, audited 2026-09-29)

One gate, ahead of everything: the `router.use('/api/projects/:projectId')` middleware in
`serverXR/src/index.js` answers 404 before any route, write gate or role check runs. That
single gate covers, by construction, every route under `/api/projects/:projectId`:

- meta `GET /api/projects/:id`, document, `ops` (and `?since=`), `events` (SSE),
  assets `GET …/assets/:assetId` and `…/meta`, shelf, and every write
  (PATCH, PUT document, POST ops, asset upload/delete) — a visitor cannot even learn
  that a write target exists.

The rule itself lives in `serverXR/src/projectVisibility.js` (`isSpaceMember`,
`canSeeProject`, `filterVisibleProjects`, `assetCacheControl`). The other paths:

| Path | What it does for a non-member |
| --- | --- |
| `GET /api/spaces/:id/projects` | private rows filtered out |
| `GET /api/spaces/:id/contents` | private rows filtered out (members get `visibility:'private'` on the row, for the lock mark) |
| `GET /api/trash?space=` | private trashed rows filtered out |
| `GET /api/resolve/:space/:project` | 404; a `movedTo` pointer to a private project is not given |
| `/og/…` link previews | a private project resolves to nothing; the card falls back to the space's |
| `GET /api/spaces/:id/bundle` (save to file) | exported with `--public-only`: no private project rows, documents, op logs, asset refs — and no blob that only private projects name |
| project SSE `…/events` | a stream opened before the project turned private is closed at the next event (the visibility change itself broadcasts one) |
| asset bytes | `Cache-Control: private, no-store` for a private project's files (public ones stay `public, immutable`), so a CDN in front of a tier never serves a member's copy to the next visitor |

Paths checked and found not to need a change:

- **The space blob store.** Content-addressed bytes live per SPACE
  (`spaces/<id>/blobs/<sha256>`, `serverXR/src/blobStore.js`), shared by every project in
  it. No route serves a blob by hash alone: `GET /api/spaces/:id/assets/:assetId` serves
  only the space's own `assets/` directory, and a blob is reachable only through
  `GET /api/projects/:id/assets/:hash` while THAT project holds the `<hash>.json`
  reference — which is behind the gate above. A visitor cannot add a reference (that is a
  write). The one place the whole store left the server was the bundle export, now
  `--public-only` for visitors.
- **Socket.IO** `join-project`: the socket handshake already requires an authenticated
  editor and `ensureProjectAvailable` requires `canAccessSpace` — only members connect.
- **Space scene / space ops / space assets / space events**: space-level data, no project
  content.
- **The catalogue / MCP agent door** (`GET /api/catalogue`, `sdk/mcp.mjs`): a description
  of routes, and an HTTP client of the same gated routes — it reads nothing the caller's
  token could not. The catalogue now documents `visibility` on create and PATCH.
- **Snapshots, changes, sync keys, invites**: owner/admin-only routes.
- **Chat rooms**: listed per space, and only for spaces the caller can access.

## Carrying it between tiers

`visibility` is a column on the `projects` row (`ensureColumn … DEFAULT 'public'`,
`serverXR/src/db.js`), not in the document — so every tool that copies a project had to
learn it, or a private project would arrive public. `scripts/project-visibility-lib.mjs`
holds the one rule they share: **create it private, check the destination said
`private` back before writing any content, never widen**.

| Tool | How it carries it |
| --- | --- |
| `scripts/tier-sync.mjs` | reads the source meta, creates with `visibility`, verifies (PATCHes an existing public copy), refuses before the document PUT if the destination is older than the field |
| `scripts/project-pull.mjs` (and `local-mirror.mjs`, which runs it) | same, from the document response's `project` meta |
| `scripts/promote-space-projects.mjs` | makes the destination private before pushing a private project's document; skips (exit 1) if it cannot |
| `scripts/space-bundle.mjs` | export writes the whole row (`SELECT *`); import writes `visibility`; `--public-only` export for visitors |
| content proposals (`contentProposals.js`) and snapshot restore (`spaceStore.restoreSpaceProjectDocuments`) | a project NEW to the space arrives with the file's visibility; an existing row keeps what the space decided |
| `serverXR/src/follow/follower.js` | a project private on the other machine is created private here |
| `scripts/project-move.mjs` | updates the row in place — the column moves with it |

**The old-server trap.** A server older than this landing drops an unknown `visibility`
field from the create body and answers 201 with a public project. The copy tools read
the answer back and stop before writing content; the (empty, titled) project that was
created is reported, not silently filled.

## Limits, stated

- **Rolling a tier back past this landing** exposes private projects: an older build
  ignores the column and serves them as public. `SCHEMA_VERSION` was not bumped (an added
  column is invisible to older code, by that constant's own rule), so the older build
  will open the data without refusing. Before any rollback of a tier holding private
  work, make the space private or accept the exposure.
- `scripts/push-space-projects.mjs` (local project directories → a tier) and
  `scripts/space-sync.mjs` / `space-sync-github.mjs` (repo-declared projects) read no
  project row, so they cannot carry `visibility`. They never PATCH it either, so an
  existing private project stays private; a project they CREATE is public. Owed: a
  `visibility` key in the space manifest if repo-declared private work is ever needed.
- A space's project COUNTS on `/api/spaces` are shown only to members already, and
  include private projects.
