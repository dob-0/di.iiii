# Spec — Clean Space URLs, Custom Domains, and Space Portability

Status: **Items 3a (vanity slugs) and 3b (bare short-link routing) SHIPPED 2026-07-19** —
the product owner chose the "multiple independently-addressed projects per space" model
from section 3b's open question (confirmed via real examples: `/wcc/artistplace`,
`/wcc/mainexhibihtion`, `/beyond_data/open_call` — the existing multi-project-per-space
model, not a single-primary-project one). See "Shipped" section below for what actually
landed and where. Items 3c (custom domains) and 3d (in-app space export UI) remain
**DRAFT — plan only**, and 3c still needs product-owner (Gevorg) sign-off before any code —
it's the piece that actually touches new infrastructure (Caddy/DNS), not just routing.
Owner: Technical Architect to sequence remaining items; UI/UX (routing/link surfaces),
Backend/API (domain routing), Infrastructure (Caddy/DNS) all touch 3c.

**Amendment, 2026-08-21 — the tool doorway.** Appending a tool word to any project link
opens it there: `/<space>/<project>/studio`, or `/raw` for the node editor, and the same on
the `/<space>/p/<id>` form. This is an **alias, not an address**: the slug resolves, then the
router replaces the bar with the lane's canonical path (`/<space>/projects/<id>` for Studio
since 2026-08-24, `/<space>/raw/projects/<id>` for the node editor),
carrying `?query` and `#hash` across. No new permanent URL is minted, so nothing here has to
outlive a future addressing model — which is also why it does not prejudge §7.1 of
`SPEC_url_architecture_and_tree_addressing.md`, unsigned since 2026-08-04.
It replaced a silent fall-through: before this, *anything* after a project slug rendered the
published project at 200 while the address bar said otherwise. See `docs/ai/known-fixes.md`.

## Shipped (2026-07-19)

- **3a — vanity slugs**: `spaces.slug` / `projects.slug` (nullable, independently renameable
  from the immutable id; project slugs unique per-space, space slugs unique platform-wide).
  `PATCH /api/spaces/:id` / `PATCH /api/projects/:id` accept `slug`; reserved-word and
  format validation, 409 on collision, never silent truncation/auto-suffixing.
- **3b — bare short-link routing**: `GET /api/resolve/:spaceSegment/:projectSegment`
  resolves slug-or-id to real ids (gated by the same `requireReadRole` every other route
  uses — a private space's slug is not distinguishable from a nonexistent one to an
  unauthenticated caller). Client: `getAppLocationState` classifies the bare two-segment
  shape, `SlugProjectRoute` (`RootApp.jsx`) resolves it and falls through to a plain space
  route on a miss — `/somespace/randomtext` never breaks, it just isn't a project deep-link.
  `buildVanityProjectPath` builds the short form; `buildPublicProjectPath` (`/p/{id}`) stays
  the guaranteed-stable fallback forever.
- Admin UI (`AdminManageSection.jsx`): "Edit public link" action, independent of Rename.
- `ProjectSwitcher.jsx`: one-click "Copy link" per project, using the slug when set.
- Deliberately NOT touched by THIS spec: Studio's own internal editor URL — that's an
  editing deep-link, not the public share link this covers. (It did change later:
  **2026-08-24** it became the tool-free `/{space}/projects/{id}`, completing the layered
  addresses of 08-21, which had given the LIST a tool-free address and left the item
  tool-first. `/{space}/studio/projects/{id}` parses forever and heals the bar.) WCC's hardcoded `/wcc` + `/wcc/scene` routes — untouched, still claimed
  first in `RootApp.jsx`'s dispatch order before the new generic mechanism is ever reached.

> Prompted 2026-07-18 by a direct product ask: today's Studio project links are long and
> internal (`https://staging.di-studio.xyz/open/studio/projects/open-jam`), and the product
> direction wants each space to feel like its own clean address (`di-studio.xyz/NPAK`),
> eventually ownable enough that an artist could take their space to their own domain/hosting.
> Written after a full audit of current routing + export code — several pieces of this already
> exist and just aren't wired to a UI. See "What already exists" below before assuming a
> greenfield build.

## 1. The actual problem (and what it isn't)

Investigated before proposing anything, because "the URL is messy" has more than one possible
cause:

- **Not** excessive URL churn from Studio's own internal navigation. Switching between
  Create/Scene/World/Share/Code panels, viewport modes, gizmo state, etc. is already pure
  in-memory React state (`StudioShell.jsx`) — none of it touches the browser URL. Studio is
  already SPA-style for in-page interaction.
- **Is** the URL *shape itself* at the two points where it's meant to be shared/bookmarked: a
  Studio project deep-link is `/{spaceId}/studio/projects/{projectId}` — three path segments,
  and `spaceId`/`projectId` are today the *exact same string*, sanitized (`^[a-z0-9-]{3,48}$`,
  `spaceStore.js:11-12`) — there is no shorter display form. "NPAK" as a space name would become
  URL segment `npak`; there's no path to a vanity slug that differs from the internal id.
- **Also is** a completely separate, currently-unbuilt idea: an artist owning their space enough
  to run it on their own domain/hosting. That's not a URL-shortening problem, it's a
  custom-domain + export/import problem. Two different features, worth scoping separately below,
  since they have very different risk/effort profiles.

## 2. What already exists (don't rebuild this)

- **Space bundles** (`scripts/space-bundle.mjs`) — a whole space (every project, config, CAS
  blobs, secrets stripped) as one portable `.tar.gz`, importable into any other di.iiii install
  via `npm run selfhost -- <bundle>` with an optional `--as <newId>` remap. **This already IS
  the "give an artist their space in hand" mechanism at the data layer.** It's CLI-only today —
  no in-app trigger, no download button in Studio's Share panel.
- **`docs/architecture/P2P_DISTRIBUTION.md`** (2026-07-10, status: proposal) — already plans
  Phase 1 as "pin the space bundle to IPFS, get back `ipfs://<cid>`, store it in a new nullable
  `spaces.published_cid` column, `selfhost -- ipfs://<cid>` imports it anywhere." This is the
  *content-addressed* half of "an artist can take their space anywhere" — complementary to, not
  competing with, the human-readable-domain half this doc is about.
- **`docs/architecture/SPEC_artist_ecosystem.md`** (2026-07-18, status: draft) — the Telegram
  front-door concept for non-technical artists. If a clean per-space export/domain flow ships,
  it's a natural `/export` or `/mydomain` bot command later — not blocking, just worth keeping
  in the same mental model (this doc, that doc, and P2P_DISTRIBUTION.md are three faces of the
  same "artist owns their space" direction).

## 3. Proposal — three independent, separately-greenlightable pieces

### 3a. Vanity slug distinct from internal spaceId (smallest, safest)

Add a nullable `slug` column to the `spaces` table (`serverXR/src/db.js`), unique, same
`SLUG_REGEX` validation as the id itself. Routing resolves `/:segment` by trying slug lookup
first, falling back to id lookup (id keeps working forever — no link ever breaks). Studio's
`buildStudioProjectPath`/`buildStudioHubPath` (`src/studio/utils/studioRouting.js`) prefer the
slug when set. Doesn't shorten the *path depth* (`/NPAK/studio/projects/open-jam` is still three
segments) but does decouple the human-facing name from the sanitized internal id, and lets an
artist rename their public handle without breaking their internal data. Lowest risk, no schema
migration risk (nullable, additive), reversible.

### 3b. Shorter project deep-links (needs a decision, not just a schema change)

The three-segment shape exists because `spaceId` and `projectId` are both needed to resolve a
project (`getStudioLocationState`, `studioRouting.js:35-98` — this session's own fix made the
space-less fallback resolve correctly rather than silently defaulting, but a space-less form is
still a valid *input* shape, just not the canonical output one). Two real options, not a foregone
conclusion:
- **Global project-id namespace**: if project ids were globally unique (they already are —
  server-generated), a bare `/p/{projectId}` could resolve straight to the owning space without
  needing it in the URL at all, same principle as email being globally addressable without a
  domain-in-the-path. Shortest possible link. Cost: a new global lookup route + a decision about
  whether that's the *canonical* link (with the long form as a fallback/mirror) or a redirect.
- **Space becomes the whole page, project becomes state**: if a space is meant to feel like "one
  place," `/{spaceId}` could open directly into that space's most-relevant project (its
  published one, or its only one) with project-switching becoming in-page navigation (mirroring
  how Studio's panels already work) rather than a path segment. This is a bigger UX decision —
  does a space host multiple independent projects as top-level addresses, or one primary project
  with others as secondary? Needs Gevorg's call, not an engineering-only decision.

### 3c. Custom domains (largest, genuinely new infrastructure)

Nothing here exists today — confirmed zero domain-related DB columns, zero per-space Caddy
config, zero code referencing "customDomain" anywhere in the repo. Would need:
- `spaces.custom_domain` column (nullable, unique).
- A routing layer in front of the app that resolves `Host` header → spaceId before falling into
  today's path-based routing (`RootApp.jsx`'s `AppRouter`) — either a Caddy on-demand-TLS config
  keyed off a domain→spaceId lookup endpoint, or a reverse-proxy layer that rewrites incoming
  requests to `di-studio.xyz/{spaceId}/...` internally.
- DNS/TLS is the artist's own responsibility (they point a CNAME, Caddy/Let's Encrypt handles the
  cert on demand) — this repo's job is only the Host-header→space resolution.
- This is the piece that actually delivers "an artist can point their own domain at their space
  without leaving di.iiii's hosting" — distinct from full export (3d below), which is "an artist
  takes their space to run somewhere else entirely."

### 3d. In-app export trigger (wires up what already exists)

Expose `scripts/space-bundle.mjs`'s export as a real product surface: a "Download my space"
button in Studio's Share panel (or admin), calling a new `serverXR` route that shells out to (or
reimplements inline) the same bundling logic, streaming the `.tar.gz` back. Smallest-effort item
in this whole doc since the hard part (the bundle format itself, secret-stripping, CAS blob
packaging) is already built and presumably already tested — this is a UI + one route.

## 4. Suggested sequencing (not a commitment — Gevorg's call)

1. **3d (in-app export)** — smallest lift, reuses fully-built code, immediately gives artists
   something in hand today, zero new infrastructure risk.
2. **3a (vanity slug)** — small, additive, no breaking change, meaningfully improves the "NPAK"
   naming complaint even before any path-depth work.
3. **3b (shorter deep-links)** — needs a real UX decision first (global project namespace vs.
   space-as-primary-project), then is a routing change, not a data-model change.
4. **3c (custom domains)** — largest, only worth building once there's actual artist demand for
   "my own domain" specifically (vs. "a clean di-studio.xyz link," which 3a/3b already solve).
5. IPFS pinning (`P2P_DISTRIBUTION.md` Phase 1) can proceed independently/in parallel — it's the
   content-addressed portability story, not the human-domain one.

## 5. Open questions (need decisions before any code)

- Is a space meant to be a multi-project container with independent addresses (current model),
  or does the product want "one space = one primary public face," pushing multi-project-per-space
  toward an internal/organizational concept rather than a routing one? This single decision
  determines whether 3b is even the right shape.
- Vanity slugs: globally unique across all spaces, or does a slug only need to be unique per
  some namespace (doesn't matter today since there's one platform, but worth deciding once custom
  domains exist and "npak.custom-domain.com" and "di-studio.xyz/npak" might diverge).
- Custom domains: self-serve (artist enters their own domain, Caddy handles it automatically) or
  admin-mediated (artist asks, an admin wires it) for the first version? Self-serve is more
  "artist-owned" but is real new attack surface (domain verification, TLS issuance abuse) worth
  a Security Auditor pass before self-serve ships.
- Does 3d's export become a paid/gated feature eventually (an actual product lever — "your space,
  fully portable, is the thing you get for X"), or stay free or basic tier from day one? Not an
  engineering question, flagging because it affects whether the UI treats it as a headline
  feature or a quiet utility button.
