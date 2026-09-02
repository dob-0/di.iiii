# the-light-put-back

**The Light Put Back** — 14 laser photographs from MOCT × MECHATRONICA
(photographs: Davit Nersisyan) taken apart into the algorithm that made them:
photograph → tophat threshold → recovered vector path → depth point cloud →
scanner traversal → pixel grid → ILDA frame.

A work, not platform. It lives here as a space, per `src/works/works.js`.

## What is committed here, and what is not

`scene.json` only. The published page is a single self-contained HTML file of
~4.3 MB — every colour plate, tophat field and depth map inlined as a data URI —
and a generated bundle of that size does not belong in git history. No other space
in this directory commits one either.

The page is mastered outside this repo, with the photographs and the extraction
code (OpenCV for the vector recovery, Depth Anything V2 for the depth maps).
To re-publish it, drop the built file at `spaces/the-light-put-back/code/index.html`
and run:

```bash
node scripts/space-code-push.mjs the-light-put-back --to https://staging.di-studio.xyz/serverXR
```

## Two things that are NOT automatic

- **A fresh space opens its scene, not its page.** `space-code-push` writes the
  project document; it does not point the space at that project. Until
  `PATCH /api/spaces/the-light-put-back {"publishedProjectId":"the-light-put-back"}`
  runs, the URL renders an empty room and nothing says why.
- **The space is private** (`isPublic: false`) and stays that way until its owner
  decides otherwise. These are someone else's photographs.

## Owed before this goes anywhere near prod

The inlined data URIs should become space assets (SHA-256, content-addressed —
the manifesto's way), so the page downloads what a visitor actually looks at
instead of all fourteen frames at once. See the `dii-space-weight-audit` skill.
