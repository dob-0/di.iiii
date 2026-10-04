# Publish Workflow

How to push content to a live public route (`/<space>`).

## Visual Quality Checklist (public teaser pages)

Before publishing a teaser page on `/<space>`:

1. Fill the full viewport (`100vh`) and avoid empty black regions.
2. Keep one strong headline, one core concept line, and one platform relation block.
3. Ensure mobile readability (single-column fallback below ~920px).
4. Keep contrast high and type large enough for projection/screen capture.
5. Include explicit relation text:
  - `di.iiii` = open-source XR platform
  - `br_id_ge` = project built on di.iiii
6. Verify on the dev tier (`https://dev.diiii.xyz`) before promotion.

## Option A: Manual in-app update (fast teaser changes)

Use this when updating copy, layout, or quick visual HTML for a live public route.

1. Open `/<space>/studio/projects/<projectId>`.
2. Open `Present`.
3. Set `Public entry view` to `Code view` (or `Fixed camera` / `3D scene` as needed).
4. Update `Code preview HTML` and verify the result on `/<space>`.

Best for rapid content iteration. Keep this path for lightweight updates, not full application deployments.

## Option B: Branch + URL source workflow (recommended for multi-file content)

Use this when the experience has multiple files, custom scripts/styles, or needs repeatable updates.

1. Build and host the experience from a versioned branch/release path.
2. In Studio `Present`, keep `Public entry view` as `Code view` and set the source to the hosted URL (or embed a stable iframe wrapper).
3. Validate on the dev tier (`https://dev.diiii.xyz`) and then promote through normal branch deploy flow.

Better rollback, diffs, and CI checks than manual ZIP transfer. Treat the public route as a stable shell that points to versioned content.

## Option C: ZIP package workflow (fallback only)

Use ZIP only when branch-based hosting is not available.

1. Export a project package from Studio (`Export project`).
2. Re-import via Studio Hub `Import legacy scene` (supports `.zip` / `.json`).
3. Validate on the dev tier (`https://dev.diiii.xyz`) and publish the project to the target space route.

The ZIP flow is for project packages, not arbitrary web app bundles. Imported assets are normalized into project document + asset storage.

## Option D: Full code deploy (extended runtime/application changes)

Use this when the change requires runtime code, component behavior, or platform-level updates.

1. Implement and validate locally on the `dev` branch.
2. Promote via `npm run deploy:dev` (push `dev`; deploys the dev tier).
3. Verify on `https://dev.diiii.xyz`.
4. Promote via `npm run deploy:production`.

The correct path for long-term, multi-file, versioned behavior. Prefer branch-based deploys over ad-hoc host edits for reliability and rollback.
