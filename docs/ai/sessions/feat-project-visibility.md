## 2026-09-29 — private projects inside a public space (per-project visibility)

- New `projects.visibility` column (`'public'` default | `'private'`), rule in
  `serverXR/src/projectVisibility.js`: a private project is seen only by the space's members
  (the same test a private space applies); to anyone else every route answers the 404 a
  never-created project gets. One gate in the `/api/projects/:projectId` middleware covers
  meta, document, ops, events, assets and every write; lists, contents, trash, resolve, og
  previews and the save-to-file bundle filter separately. Full audit table:
  `docs/architecture/SPEC_project_visibility.md`.
- The space's published project cannot be private (409 `published_project_private`, both ways,
  re-checked when an approval-gated patch executes). Owner or admin changes visibility; anyone
  who may create can create private.
- Found and closed: the per-SPACE blob store let a visitor's "save to file" carry a private
  project's photographs out; visitors now get `space-bundle.mjs export --public-only`. A
  member's asset bytes for a private project are `Cache-Control: private, no-store`. A
  visitor's open SSE stream closes when the project turns private.
- Carried between tiers: tier-sync, project-pull (and local-mirror), promote-space-projects,
  space-bundle import/export, proposals, snapshot restore, the follower — through
  `scripts/project-visibility-lib.mjs` (create private, verify the destination kept it before
  writing content, never widen).
- Studio: a "public / private" select (titled "Private — only members see it") on each project card for the space owner
  or an admin, and a lock + "private" mark on private cards; the contents page marks a private
  row for members. Wiki entry `private-projects`.
- Not done, stated in the spec: push-space-projects and space-sync(-github) cannot carry
  visibility (they read no project row); a rollback past this landing serves private projects
  as public (no SCHEMA_VERSION bump).
