# Spec — GitHub→space sync: multi-file (Tier 1, repo tree-walk)

Status: **PLAN.** Current sync is single-file. This extends the fetch side to pull all
supported *text* files from the repo so the existing client bundler can inline them.

---

## Checkpoint — where we are now (2026-07-01)

**Pipeline is single-file on the fetch side; the renderer is already multi-file capable.**

Fetch side (the gap):
- `syncLinkedSpace` — `serverXR/src/index.js:729` — fetches one file (`link.entry`), hardcodes
  the name to `index.html`: `const codeFiles = [{ name: 'index.html', content: html }]`.
- `githubApp.fetchRepoFile` — `serverXR/src/githubApp.js:77` — fetches **one** file per call.
- Original script `scripts/space-sync-github.mjs:123` does the same single-file thing.

Render side (already done):
- `bundleCodeFiles(files)` — `src/utils/codeFilesBundle.js` — takes `[{name, content}]`, finds
  the HTML entry, **inlines** referenced local CSS (`<link href="x.css">` → `<style>`) and JS
  (`<script src="x.js">` → inline script). Output is one HTML doc rendered via `srcdoc`.
- Supported extensions: `html, htm, css, js, mjs, txt, svg, json, md` — **text only, no binary.**

Consumers of `codeFiles` (all already array-aware):
`PublicProjectViewer.jsx`, `StudioPresentationSurface.jsx`, `StudioShellPanels.jsx`,
schema default in `src/shared/projectSchema.js:148`.

**Conclusion:** Tier 1 (text multi-file) is a **server-only** change. The client needs nothing.

### Ceiling (why this is "Tier 1")
The renderer bundles into a single `srcdoc` HTML — there is no per-space file server. So anything
referenced by URL at runtime (images, `.glb`, fonts, `fetch('data.json')`) will **not** resolve.
That is **Tier 2** (base64/data-URL inlining in the bundler, or a real static asset host) and is
out of scope here.

---

## Tier 1 plan — fetch the repo tree

### 1. `serverXR/src/githubApp.js` — add tree + blob-by-sha helpers
- `fetchRepoTree(token, owner, repo, ref)` → `GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1`,
  return entries where `type === 'blob'` (each has `path`, `sha`, `size`).
- `fetchRepoBlobBySha(token, owner, repo, sha)` → `GET /repos/{owner}/{repo}/git/blobs/{sha}`,
  decode base64 → utf8. (The existing `fetchRepoFile` already has the blob-decode path inline;
  factor the decode out so both share it.)

### 2. Supported-extension list available server-side
`isSupportedFile` lives in the client util (`src/utils/codeFilesBundle.js`, ESM). serverXR is
CommonJS. Define the small allowlist in serverXR (single source: a `shared/` constant if one fits,
else a 3-line local copy) — keep it in sync with `SUPPORTED_EXTENSIONS`.

### 3. `serverXR/src/index.js` `syncLinkedSpace` — replace the single fetch
```
ref      = link.ref || default branch
tree     = fetchRepoTree(...)            // blobs only
files    = tree.filter(isSupportedFile)  // by path extension
          .filter(size/count caps)       // safety bound (see below)
codeFiles = await Promise.all(files.map(f => ({
             name: f.path,               // keep slashes so href="css/x.css" matches
             content: await fetchRepoBlobBySha(token, ..., f.sha)
           })))
// PUT codeFiles exactly as today (presentationState.mode='code', shareEnabled=true)
```
- Keep file **paths** as names (don't flatten to `index.html`) so the bundler's exact-name match
  on `<link>/<script src>` works for subdir refs like `href="css/main.css"`.
- `bundleCodeFiles` finds `index.html` (or any `.html`) as the entry — no rename needed.

### 4. Safety bounds (cPanel/LVE already bit us once — undici OOM)
- Cap file count (e.g. ≤ 50) and total bytes (e.g. ≤ 2 MB); skip the rest and log.
- Fetch blobs with bounded concurrency, not all at once.

---

## Known limitations after Tier 1 (document, don't fix here)
- Bundler matches refs by **exact name**: `href="./css/x.css"` (leading `./`) won't match file
  `css/x.css`. Normalizing leading `./` is a small client-side (`codeFilesBundle.js`) follow-up.
- Binary assets / runtime fetches still won't load → Tier 2.
- Only files reachable from the entry via `<link>/<script src>` are inlined; standalone `.json`
  loaded via `fetch()` won't be available (no file server in `srcdoc`).

---

## Validation
- `npm run test:server-contracts`, `npm run test`, `npm run lint`, `npm run build`.
- Add a sync test against a fixture repo tree with `index.html` + `css/` + `js/` (mock GitHub API).
- Manual: link a multi-file repo, push, confirm the bundled space renders styles + scripts.
- Wiki: update `github-sync` article in `src/wiki/wikiContent.js` (now multi-file, text only).

## Roles
- Primary: **Backend/API Engineer** (`serverXR/src/index.js`, `githubApp.js`).
- Follow-up (optional): **UI/UX Engineer** for the `codeFilesBundle.js` `./` normalization.
