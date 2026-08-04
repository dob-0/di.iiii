# Spec — URL Architecture and Tree Addressing

Status: **DRAFT — plan only, no code.** Needs product-owner (Gevorg) sign-off before
any implementation, because Stage 2 touches the project schema and Stage 0 touches
Caddy/DNS on the VPS.
Owner: Technical Architect to sequence. Backend/API (cookie scope, resolve endpoint),
Infrastructure (Caddy/DNS/certs), UI/UX (routing helpers, link surfaces) all touch this.
Supersedes the routing half of `SPEC_space_urls_and_portability.md` (its shipped items
3a/3b stay valid and are load-bearing here); item 3c (custom domains) becomes a
downstream consequence of Stage 0 rather than an independent piece.

Written 2026-07-26 after a full audit of `src/utils/spaceRouting.js`,
`src/studio/utils/studioRouting.js`, `src/RootApp.jsx`, `serverXR/src/authSession.js`,
`serverXR/src/config.js`, `Caddyfile`, and `vite.config.js`. Re-verify against code
before trusting a specific line here.

---

## 1. The problem

The product decision that forces this spec: **a space's contents nest to arbitrary
depth.** A space contains addressable nodes; a node contains addressable nodes. The
public URL of a node is its path in that tree. This is the "tree" direction — see
`RECURSIVE_NODE_CORE.md` for the data model that already does the nesting
(`nodes[].parentId`).

Everything below follows from that one requirement plus four defects in what exists
today.

### 1.1 What exists today

Verified in `src/utils/spaceRouting.js` and `src/RootApp.jsx`:

```
/                             landing
/{space}                      public space viewer
/{space}/{projectSlug}        public project (resolved via /api/resolve/...)
/{space}/p/{projectId}        permanent id-based fallback
/{space}/studio               editor hub
/{space}/studio/projects/{id} editor deep link
/studio                       spaces list
/open_jam                     short alias -> the open-jam EDITOR
/admin?space={space}          space admin, as a query param
/wiki
/wcc  /wcc/scene              hardcoded, claimed before the generic mechanism
```

`RESERVED_APP_SEGMENTS` (`spaceRouting.js`) is currently:
`admin`, `preferences`, `prefrenaces`, `preferances`, `wiki`, `beta`, `studio`
— plus `p` handled separately, plus `wcc` claimed by dispatch order.

### 1.2 The four defects

1. **Two grammars for one concept.** "A creator surface scoped to a space" is a path
   for the editor (`/{space}/studio`) and a query param for admin (`/admin?space=X`).
2. **User content and app words share one namespace.** Segments 1 and 2 are both
   user-controlled wildcards, and app routes live in the same slots. No space can be
   named `studio`. The reserved list grows forever and already contains two
   *typos* (`prefrenaces`, `preferances`) permanently denied to users.
3. **Dispatch order is the spec.** Route meaning depends on `if`-statement order in
   `RootApp.jsx`; `/wcc` is claimed first, by comment-documented convention.
4. **No mode axis.** Viewer, editor and admin are three unrelated URL shapes rather
   than three modes of one address.

### 1.3 Why nesting kills the cheap fix

The obvious fix is mode-as-suffix: `/{space}/{project}/edit`, reserving a short closed
list (`edit`, `settings`, `links`) at segment 2. That is correct **only if projects are
single-segment leaves.**

With nesting, `/br_id_ge/notations/edit` cannot be distinguished from a child node
named `edit`, and the collision can occur at *any* depth. No finite reserved-word list
closes it. This is precisely the situation that forced GitLab to introduce the `/-/`
separator after years of denying users project names like `dashboard`
(<https://docs.gitlab.com/development/urls_in_gitlab/>,
<https://gitlab.com/gitlab-org/gitlab/-/issues/16854>). di.iiii is on the same
trajectory at smaller scale.

So the requirement is stronger than "tidy the routes": **the public tree path must have
zero reserved words at any depth, permanently.**

---

## 2. The design

Two rules. Everything else is consequence.

> **Rule 1 — Split by host.** The work lives on the public host. The platform lives on
> the creator host. A node's path is *identical* on both; only the host changes.
>
> **Rule 2 — `-` is the only reserved path token in the entire system, at any
> position.** Every other segment at every depth belongs to the user.

### 2.1 Route table

**Public host — `di-studio.xyz`** (the work; what gets shared)

| Path | Meaning |
| --- | --- |
| `/` | landing |
| `/{space}` | space root |
| `/{space}/{...treePath}` | addressable node, arbitrary depth |
| `/-/wiki` | platform pages |
| `/-/privacy` | (also unwires the currently-dead `/privacy` item in CURRENT.md) |
| `/-/p/{projectId}` | permanent id link, space-independent |
| `/{space}/p/{projectId}` | **grandfathered** permanent id link — kept forever, never minted new |

**Creator host — `studio.di-studio.xyz`** (the platform; never shared with visitors)

| Path | Meaning |
| --- | --- |
| `/` | your spaces list |
| `/{space}` | editor, space root |
| `/{space}/{...treePath}` | editor focused on that node — **same path as public** |
| `/{space}/-/settings` | space admin (replaces `/admin?space=`) |
| `/{space}/-/links` | link directory |
| `/-/settings` | account-level preferences |

**Custom domain (Stage 3, later)** — `brid.ge/{...treePath}`: same tree, space segment
dropped because the host implies it. Editor stays on `studio.di-studio.xyz` and never
appears on the artist's domain.

### 2.2 Modes are panels, not routes

`settings`, `links`, `share`, `code` are windows *inside* the editor, not URL modes.
This is already how Studio works — `SPEC_space_urls_and_portability.md` §1 records that
panel state is pure in-memory React and never touches the URL. The consequence is that
the creator host needs exactly one path grammar, identical to public, and the `-` infix
appears only for the two genuinely-addressable admin surfaces.

The two exceptions (`/-/settings`, `/-/links`) are addressable because they are
deep-linkable destinations, not editor panel state.

### 2.3 Why this shape and not the alternatives

| Option | Verdict |
| --- | --- |
| Mode-as-suffix (`/{space}/{...path}/edit`) | **Rejected** — unbounded depth makes the collision unclosable (§1.3). |
| GitLab `/-/` infix on one host (`/{space}/-/edit/{...path}`) | Workable, less infra. **Rejected** because the separator then appears in every creator URL forever, and because a custom domain would have to host the editor, auth and platform chrome on the artist's domain. |
| Separate host (this spec) | **Chosen.** One canonical path, two hosts. Ugliness confined to platform pages. Custom domains become structural rather than a special case. |
| Query param (`?mode=edit`) | **Rejected** — it is defect 1, generalized. |

Three further properties that argue for it independently of aesthetics:

- **One auth predicate.** The whole creator host is gated. No per-path rules, no
  `?space=` special case, no risk of a new editor route shipping ungated.
- **Indexability.** Only the public host is crawlable; the editor cannot leak into
  search results.
- **It is 3c's infrastructure.** Custom domains need Caddy vhost + cert automation
  regardless. Stage 0 buys that plumbing and uses it immediately.

---

## 3. Staging

Stage 0 and 1 are shippable without touching the schema. Stage 2 is the one that
actually delivers nesting and it is the expensive one. **Do not start Stage 2 before
Stage 1 is live and verified**, because Stage 2's addressing depends on Stage 1's
resolver shape.

### Stage 0 — the creator host exists

Infrastructure only, no user-visible change. `studio.di-studio.xyz` serves the same
bundle as `di-studio.xyz`; both hosts accept every current route. Nothing redirects
yet. Verifiable on staging as `studio.staging.di-studio.xyz`.

### Stage 1 — move the creator surfaces, flat paths only

Editor and admin move to the creator host at their flat (current) depth. Public host
sheds every reserved word except `-`. All old URLs 301. No schema change: `spaces.slug`
and `projects.slug` already carry the addressing.

At the end of Stage 1 the public host's reserved list is exactly `{-}` at segment 1 and
`{p}` grandfathered at segment 2.

### Stage 2 — nested addressing

Nodes become addressable, which requires them to have slugs. **This is a schema
change** and it is the reason Stage 2 is a separate decision, not a continuation:

- `nodes[]` instances today are `{id, typeId, label, values, graphX, graphY, runtimeId,
  assetRef, parentId}` (`RECURSIVE_NODE_CORE.md`) — **no slug field.**
- Addressing needs `slug`, unique among siblings (same `parentId`), nullable, falling
  back to `id`.
- `entities[]` and `nodes[]` are two parallel type systems that never reference each
  other. **A single addressable tree must pick one or explicitly bridge them.** This is
  the hardest open question in this spec and it is not resolved here — see §7.
- `/api/resolve/:spaceSegment/:projectSegment` becomes
  `/api/resolve/:spaceSegment/*path`, resolving segment by segment down the tree,
  returning 404 on any miss (never a partial resolve).

### Stage 3 — custom domains

Reuses Stage 0's vhost machinery. Out of scope for this spec beyond the compatibility
constraint that the editor never moves to the artist's domain.

---

## 4. Redirect map

Every row is permanent. `br_id_ge` links are canon and already in the wild; nothing here
may ever 404.

| Old | New | Code |
| --- | --- | --- |
| `/{space}/studio` | `studio.{host}/{space}` | 301 |
| `/{space}/studio/projects/{id}` | `studio.{host}/{space}/{projectSlugOrId}` | 301 |
| `/studio` | `studio.{host}/` | 301 |
| `/admin` | `studio.{host}/-/settings` | 301 |
| `/admin?space=X` | `studio.{host}/X/-/settings` | 301 |
| `/preferences`, `/prefrenaces`, `/preferances` | as `/admin` | 301 |
| `/wiki` | `/-/wiki` | 301 |
| `/open_jam` | `studio.{host}/open/open-jam` | **302, permanent fixture** |
| `/{space}/p/{id}` | — | **no redirect, serves forever** |
| `/wcc`, `/wcc/scene` | — | **no change in Stage 1** (see §6) |

Notes:

- `/open_jam` is 302 not 301 because it exists on printed flyers and QR codes; a 302
  keeps the target reroutable if jam mode ever moves again. It must never be deleted.
- The two typo aliases get redirects and are then **removed from the reserved list** —
  reserved lists shrink here, they do not grow.
- After Stage 1, `RESERVED_APP_SEGMENTS` should not exist as a growing array. It
  collapses to a single token check.

---

## 5. Implementation surface

### 5.1 Client routing

- `src/utils/spaceRouting.js` — `RESERVED_APP_SEGMENTS` collapses to `-`.
  `getAppLocationState` stops classifying by reserved word and classifies by host +
  the `-` token. `buildPreferencesPath` stops emitting `?space=`.
- `src/studio/utils/studioRouting.js` — `STUDIO_RESERVED_SEGMENT` is deleted;
  `buildStudioHubPath` / `buildStudioProjectPath` emit creator-host paths.
  `getStudioLocationState`'s segment-position branching (currently a chain that
  inspects `segments[0]`/`segments[1]` for the literal `studio`) is replaced by a
  host check.
- `src/RootApp.jsx` — **replace the `if`-chain with an ordered route table** (data,
  not control flow) in the same change. If this is skipped, defect 3 survives the
  rename and the whole exercise is half-done.
- `src/utils/appNavigate.js` — needs a cross-host navigation path; today it assumes
  same-origin (`window.location.assign` / react-router `navigate`). Navigating from
  public to creator host cannot go through react-router.

### 5.2 Server

- `serverXR/src/authSession.js` — `serializeCookie` currently emits no `Domain`
  attribute (verified: name, `Path`, `Max-Age`, `HttpOnly`, `SameSite`, `Secure`
  only). Add an optional `domain`, threaded through
  `serializeAuthSessionCookie` and `serializeExpiredAuthSessionCookie`.
- `serverXR/src/config.js` — new `AUTH_SESSION_COOKIE_DOMAIN` env. **Unset means
  host-only, i.e. exactly today's behaviour** — dev and self-host installs are
  unaffected. Set to `.di-studio.xyz` in prod, `.staging.di-studio.xyz` in staging.
- `CORS_ORIGINS` gains the creator origin for both lanes.
- `/api/resolve/:spaceSegment/:projectSegment` → `*path` (Stage 2 only).

### 5.3 Security review — mandatory before Stage 1 ships

Assign Security Auditor. Three specific items:

1. **Cookie scope widening is the real risk.** `Domain=.di-studio.xyz` makes the
   session cookie readable by *every* current and future subdomain. Any subdomain
   takeover becomes a session compromise. Enumerate existing subdomains, and treat
   the domain list as security-relevant config from then on.
2. **There is no request-level CSRF token.** Verified: protection today is
   `SameSite=Lax` plus the CORS origin allowlist (`loginState.js`'s CSRF handling
   covers OAuth `state` only). `SameSite=Lax` is unaffected by the split — subdomains
   are same-*site*, so this is not a regression — but it means the CORS allowlist is
   load-bearing and must not be widened casually.
3. The cookie name (`dii_serverxr_session`) has no `__Host-` prefix, so adding
   `Domain` is mechanically safe. Do not add a `__Host-` prefix later without
   revisiting this — the two are incompatible.

### 5.4 Infrastructure

- `Caddyfile` — today two blocks, `{$SITE_DOMAIN}` and `{$STAGING_DOMAIN}`, both
  `reverse_proxy` to the same client. Add `{$STUDIO_DOMAIN}` and
  `{$STAGING_STUDIO_DOMAIN}` blocks. Follow the existing pattern where an unset
  domain var leaves the block inert (a harmless cert-issuance log line) so the
  change is safe to merge before DNS exists.
- DNS: two new A records to the Hetzner box.
- The client bundle must know which host it is on. Prefer reading `location.hostname`
  at runtime over a build-time env, so one built artifact serves both hosts — the
  deploy pipeline builds once.

### 5.5 Development environment

The most disruptive day-to-day cost, and the one most likely to be discovered late.

- `localhost:5173` has no subdomains. Chrome resolves `*.localhost` to loopback, so
  `studio.localhost:5173` works — but Vite must be told: add `server.allowedHosts`
  and set `server.host` appropriately in `vite.config.js`.
- Cookie domain must be **unset** in dev (`studio.localhost` and `localhost` are
  different sites; a shared cookie is not achievable and not needed if dev logs in
  per-host).
- The existing `VITE_PROXY_API_TARGET` dev proxy needs to work from both host names.
- Document the dev story in `docs/deploy/SELF_HOST.md`; self-hosters running a single
  host must be able to keep the current single-host behaviour. **Single-host mode must
  remain supported** — see §7.

---

## 6. Compatibility hazards

- **`/wcc` and `/wcc/scene` are hardcoded and claimed before the generic mechanism.**
  Stage 1 does not touch them. In Stage 2 `/wcc/scene` becomes expressible as an
  ordinary tree node named `scene`, at which point the special case can be deleted —
  but only after a live verification, not as part of the rename.
- **`/open_jam` is a creator surface at a public root URL.** It opens the *editor*.
  Under the split it must move to the creator host while its public URL survives
  (§4).
- **Existing published spaces** (`br_id_ge`, `wcc`, `beyond_data`, `open`) are the
  regression surface. Each must be click-verified on staging before promotion, per
  the standing dev→staging→main rule.
- **`di-spaces` snapshots and any linked-space sync** may embed absolute editor URLs.
  Grep before Stage 1.

---

## 7. Open questions — resolve before Stage 2

Each question below carries a **recommendation** added 2026-08-04, re-verified
against the code as it stands (`src/shared/projectSchema.js`,
`src/studio/components/StudioViewport.jsx`, `StudioShellPanels.jsx`,
`src/raw/components/RawViewport.jsx`, `src/raw/utils/viewportWorldState.js`).
They are proposals, not decisions: **§7 is still unsigned.** Sign-off means
striking through the recommendation you reject, not silence.

1. **`entities[]` or `nodes[]`?** A single addressable tree must pick one type system
   or explicitly bridge them. This is the load-bearing unknown; Stage 2 cannot be
   estimated until it is answered. Studio's shipped viewport runs on `entities[]`;
   the nesting mechanism (`parentId`) lives on `nodes[]`.

   > **Correction to the premise:** `parentId` is not exclusive to `nodes[]`.
   > `normalizeEntity` has carried `parentId: … || null` since before this spec was
   > written; `StudioViewport` builds a real parent→children map and renders only
   > roots recursively; `StudioShellPanels` ships drag-to-reparent
   > (`onReparentEntity`); `deleteEntity` cascades over descendants with the
   > visited-set cycle guard from audit batch 1. **Entities already nest, in the
   > shipped lane, with a UI for it.**
   >
   > **Recommendation: address `entities[]`. Add `slug` to the entity, not the node.**
   > URLs are a public-surface contract, and the public surfaces
   > (`PublicProjectViewer`, `LiveProjectScene`, the shared `buildAssetMap`) render
   > entities. `nodes[]` lives in Beta and Raw — two independent experimental forks
   > that AGENTS.md explicitly says are not the shipped lane; addressing them would
   > freeze an experiment as a permanent public contract.
   >
   > **No bridge is needed, and none should be built.** `entity.parentId` only ever
   > points at another entity, and node scoping (`node.parentId`) only ever points at
   > another node — `RawViewport` renders the two as co-resident but unrelated sets.
   > The entity tree is therefore closed, so it is addressable on its own. If a node
   > lane ever ships publicly it gets `slug` by the same mechanism; a bridge is only
   > required if one URL must cross from an entity into a node subtree, which nothing
   > does today.
   >
   > Cost of this answer: one nullable field, added in **both** schema twins
   > (`src/shared/projectSchema.js` and `shared/projectSchema.cjs` — they drift, see
   > known-fixes) plus sibling-uniqueness validation on create/reparent.

2. **Do spaces nest?** This spec assumes spaces are the flat top level — the tenancy
   and permission boundary — and only their contents nest. If spaces nest into
   spaces, the public grammar still holds (the path just gets deeper) but the
   permission model does not, and that needs its own pass.

   > **Recommendation: no — spaces stay flat.** Every grant, role and read gate in
   > `serverXR` keys on a single `spaceId`; nesting turns each of those into a walk
   > up an ancestor chain with an inheritance rule to invent (does a child space
   > inherit its parent's editors? can it be more private than its parent?). That is
   > a second spec, and nothing shipped is asking for it. Revisit only when a real
   > org/tenant hierarchy exists.

3. **Slug uniqueness scope.** Sibling-unique is proposed. Sibling-unique means moving
   a node can force a rename; globally-unique-per-space avoids that but makes deep
   trees noisy. Product call.

   > **Recommendation: sibling-unique**, as proposed — it matches how people name
   > things inside folders, and it is the only rule that stays checkable locally as
   > a tree grows. The forced-rename objection is answered by §7.4's fallback: a
   > rename on move is rare, and it no longer breaks links when it happens.

4. **What happens to a node's URL when it moves in the tree?** Renaming already has an
   answer (old slug keeps working via the shipped 3a behaviour). Reparenting does not.
   Without one, the tree's most natural operation silently breaks links.

   > **Recommendation: never store a redirect history. Resolve, then fall back once.**
   > `/api/resolve/:space/*path` walks the path segment by segment as specified. On a
   > miss, it makes exactly one more attempt: look for that **last** segment's slug
   > anywhere in the project. Unique hit → `301` to the current canonical path.
   > Zero or ambiguous hits → `404`, never a partial resolve.
   >
   > This keeps reparenting free (no per-move bookkeeping, no alias table that grows
   > forever and leaks the old tree shape), it degrades to the existing `404`
   > contract rather than to a wrong page, and `/{space}/p/{id}` remains the
   > guaranteed-stable path that never redirects — already the convention every
   > raw-id link surface uses.

5. **Single-host mode for self-hosters.** The split must degrade to one host for
   `npm run selfhost` installs. Simplest answer is a config flag that falls back to
   the `/-/`-infix scheme on a single host — which means both schemes must be
   implemented. Confirm this is wanted before assuming it.

   > **Recommendation: yes, keep it — and make local dev run in single-host mode by
   > default.** Self-hosting is a stated non-negotiable, and one host is what a
   > self-hoster with one domain and one cert actually has. The real risk is not the
   > implementation cost but rot: a second scheme nobody exercises is broken by the
   > time it is needed. Running dev on the `/-/` infix means the fallback is
   > exercised every day and the split-host path is what staging verifies —
   > both stay alive, and neither becomes the untested one.

---

## 8. Done criteria

Stage 1 is done when all of the following hold:

- [ ] Every row in §4's redirect map verified live on staging, including the four
      existing published spaces.
- [ ] `RESERVED_APP_SEGMENTS` no longer exists as a growing list; the only reserved
      token is `-`, asserted by test.
- [ ] A space can be created named `studio`, `admin`, `wiki`, and `beta`, and each
      resolves correctly on both hosts. This is the acceptance test for the whole
      exercise.
- [ ] `RootApp.jsx` dispatch is a data table; a test asserts route resolution is
      independent of declaration order.
- [ ] Slug validation rejects `-` at creation time with a clear error, for both
      spaces and projects — a collision that cannot be created cannot bite.
- [ ] Security Auditor sign-off on §5.3.
- [ ] Session survives navigation between public and creator host in both directions,
      for owner, guest, and logged-out visitors.
- [ ] `npm run lint && npm run build && npm run test -- --run &&
      npm run test:server-contracts && npm run docs:wiki:check` all pass.
- [ ] `src/wiki/wikiContent.js` updated — this is a user-facing behaviour change and
      the existing wiki entry describing `/admin` → Manage link editing becomes wrong
      the moment Stage 1 ships.
- [ ] `docs/ai/known-fixes.md` row for the defect-3 class (dispatch-order-dependent
      routing), with the route-table test as its regression guard.

## 9. Test contracts

| Contract | Level |
| --- | --- |
| `getAppLocationState` classifies by host + `-`, never by a word list | unit |
| Route table resolution is order-independent | unit |
| A space named `studio`/`admin`/`wiki` round-trips on both hosts | unit + live |
| Every §4 redirect returns the stated code and target | server contract |
| `/{space}/p/{id}` never redirects and never 404s | server contract |
| Session cookie carries `Domain` only when configured; absent by default | server contract |
| Cross-host navigation preserves session for owner/guest/logged-out | live, staging |
| `/api/resolve` returns 404 on a partial tree path, never a partial resolve | server contract (Stage 2) |
| Sibling slug collision is rejected at creation with 409 | server contract (Stage 2) |
