# WCC: public landing page that transforms into the live 3D scene

Supersedes the old merge plan for a `wcc-space` branch (that branch never
existed on `origin` or on Emily's fork — this doc was stale). What actually
happened: Emily built a one-off public landing page on her fork
(`wcc-on-dev`, hand-coded React + GSAP, hardcoded auth bypass). That file
wasn't merged as-is — instead di.iiii gained one small, reusable piece of
platform plumbing (a per-space `isPublic` flag) plus one small addition to
an existing mechanism, and the page itself is built with tools that already
existed.

## What shipped

- Space metadata gained an `isPublic` flag (`PATCH /api/spaces/:id`). When
  true, the frontend router skips the login gate for that space only;
  Studio, Beta, and every other space are unaffected.
- The existing **Present → Code view** (`presentationState.entryView:
  'code'`, `codeFiles`/`codeHtml`) renders pasted HTML/CSS/JS in an iframe
  at the public space URL — that's the 2D landing page itself. Emily's page
  can pull in three.js/gsap from a CDN inside that one file, same as her
  original (WebGL veil, animated circles) — fully self-contained, no
  platform code involved.
- **One small addition** to let that page transform into the live 3D scene
  without a reload: the sandboxed preview already had a postMessage bridge
  (`PREVIEW_HOST_MESSAGE_TYPE`, `src/utils/presentationPreviewDocument.js`)
  for reporting sandbox issues back to the host. It now also exposes
  `window.diiEnterExhibition()` inside the iframe — call it from any button
  in the pasted page, and `PublicProjectViewer` swaps the iframe for the
  live Studio-built 3D scene in place. One listener, no schema changes, no
  new Studio panel.
- A first pass at a generic "Landing" schema/panel (kicker/title/sections/
  gallery fields, a dedicated Studio panel) was built and then deliberately
  reverted — it was more platform surface than one page justified. If a
  second project ever needs the same kind of page, revisit that idea then.

## How to put up the WCC page

1. Create/open the `wcc` space in Studio, build the actual 3D exhibition in
   the scene (entities, lighting, etc.) — same as any other space.
2. Present panel → Code view → paste the landing page's HTML/CSS/JS
   (Emily's content, ported by hand — copy and structure, not a literal
   file dump). Anywhere she wants an "Enter exhibition" button:
   ```html
   <button onclick="diiEnterExhibition()">Enter exhibition</button>
   ```
   Images go through the space's existing Assets panel upload; uploaded
   assets get a stable URL (`/serverXR/api/spaces/wcc/assets/<id>`) to
   reference directly in the pasted HTML.
3. Present panel → "Public entry view" → Code view (so visitors land on the
   2D page first; clicking the button reveals the 3D scene already built in
   step 1).
4. Mark the space public: `PATCH /api/spaces/wcc { "isPublic": true }`.
5. Visit `/wcc` — landing page renders without login, button swaps to the
   live 3D scene in place.

## Emily's workflow

- **Get scoped access to `wcc`.** Two ways, same end result (an editor
  session that can only touch the `wcc` space):
  - **Env-var token** (no account needed): admin adds an entry to
    `AUTH_IDENTITIES` on the serverXR host (or the `EDITOR_API_TOKEN` /
    `EDITOR_ALLOWED_SPACES` pair for a single identity):
    ```json
    { "token": "<generated>", "role": "editor", "subject": "emily", "spaces": ["wcc"] }
    ```
  - **Sign in with GitHub/Google, then get granted access**: she signs in
    once (top-right account button) — new sign-ins default to *no* space
    access (`spaces: []`), not unrestricted. The admin finds her in
    `GET /api/users` (admin-only) and grants `wcc` specifically:
    ```bash
    curl -X PATCH https://di-studio.xyz/serverXR/api/users/<her-user-id> \
      -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" \
      -d '{"spaces": ["wcc"]}'
    ```
  Either way, the resulting session can only write to the `wcc` space — it
  can't touch other spaces, Studio settings, or admin routes. Signing in is
  for someone who wants to *control* a space, not a requirement for
  visitors — anyone can still browse public spaces with no account at all.
- Day to day, she works entirely inside Studio's Present panel (Code view
  for the landing page, the normal 3D editor for the exhibition) — no git
  branch needed for content changes.
- **Branch off `dev` as `wcc/<short-description>`** only for actual code
  work (new node types, custom interaction logic beyond what Code view
  supports). Off-limits: `serverXR/`, `shared/`/`src/shared/` schema, auth
  code — those need review from whoever owns that area (see `AGENTS.md`
  role routing). Open a PR back to `dev`, same as any other contributor.
