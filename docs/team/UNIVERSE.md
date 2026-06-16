# di.i — Team Universe

The people who make di.i work span a wide range of roles. This document maps the universe of contributors — technical and creative — to the parts of the platform they own, and links each role to the skills that guide their work.

---

## Platform Engineers

### Backend Engineer
Owns the serverXR runtime: auth, persistence, project document storage, asset routes, publish state, SSE, and Socket.IO realtime events. This is the authority layer — decisions made here govern what all clients can and cannot do.

- Home: `serverXR/src/`
- Skills: `dii-serverxr-contract-work`, `dii-schema-op-changes`, `dii-project-sync-ops`
- Runs: `npm run test:server-contracts`

### Frontend Platform Engineer
Owns shared project sync, schema, op delivery, and the project document model used across all editor lanes. Keeps shared logic in `src/project/` rather than duplicating it per lane.

- Home: `src/project/`, `src/shared/`, `src/hooks/`
- Skills: `dii-project-sync-ops`, `dii-schema-op-changes`, `dii-feature-routing`
- Runs: `npm run test`

### Infra / Deploy Engineer
Owns the promotion path from dev to staging to production, cPanel prebuilt releases, cron-based auto-deploy, and smoke verification. Gatekeeps what reaches users.

- Home: `scripts/`, `deploy/`, `.github/workflows/`
- Skills: `dii-deploy-workflow`, `dii-ai-doc-maintenance`
- Runs: `npm run deploy:staging`, `npm run smoke:cpanel staging`

---

## Editor Engineers

### Studio Engineer
Owns the main shipped editor lane: StudioShell, StudioHub, StudioEditor, StudioInspector, StudioViewport. The user-facing authoring surface that most creators experience.

- Home: `src/studio/`
- Skills: `dii-studio-ux-work`, `dii-hotspot-refactor`, `dii-feature-routing`
- Runs: `npx vitest run src/studio`

### Beta / Node Engineer
Owns the experimental node-first authoring lane. Explores patterns that may eventually ship in Studio. Works with the node registry, node palette, window layout, and Beta workspace.

- Home: `src/beta/`, `src/project/nodeRegistry.js`
- Skills: `dii-beta-node-authoring`, `dii-feature-routing`
- Runs: `npx vitest run src/beta`

### XR / 3D Engineer
Owns Three.js and R3F integration, object component implementations, scene canvas, camera controls, gizmos, and the WebXR entry path. Keeps the scene graph deterministic and XR-compatible.

- Home: `src/objectComponents/`, `src/xr/`, `src/components/SceneCanvas.jsx`
- Skills: `dii-xr-scene-authoring`, `dii-media-content-creation`
- Runs: `npm run test && npm run build`

---

## Creative Roles

### Spatial Designer
Composes scenes using the Studio or Beta editor. Arranges objects in 3D space, sets transforms, lighting, and camera angles. Authors the spatial experience that gets published as the live space.

- Home: the editor — Studio at `/<space>/studio`, Beta at `/<space>/beta`
- Skills: `dii-xr-scene-authoring`, `dii-space-publish-presentation`
- Key actions: add object → set position/rotation/scale → publish to space

### Multimedia Artist
Creates and manages the media assets that populate a scene: images, videos, audio, 3D models, fonts. Uses the Asset Panel to upload, manages variants, and optimizes media for delivery.

- Home: the Asset Panel and Media Panel in the editor
- Skills: `dii-media-content-creation`, `dii-project-asset-transport`
- Key actions: upload file → assign to scene object → verify playback in viewer

### Presentation / Publication Designer
Takes a finished scene and makes it available to the world. Manages the live pointer, presentation canvas behavior, and the public viewer experience at `/<space>`.

- Home: StudioHub publish controls, PresentationCanvas
- Skills: `dii-space-publish-presentation`, `dii-studio-ux-work`
- Key actions: review in presentation mode → publish project → verify public viewer

---

## Platform Support Roles

### AI Doc Maintainer
Keeps AGENTS.md files, docs/ai/, and generated bridge files honest as the platform evolves. Runs sync/check gates after any canonical AI guidance changes.

- Home: `AGENTS.md` files, `docs/ai/`, `.github/skills/`, `scripts/sync-agent-docs.mjs`
- Skills: `dii-ai-doc-maintenance`
- Runs: `npm run docs:ai:sync && npm run docs:ai:check`

### Codebase Architect / Refactor Lead
Watches the hotspot files for overgrowth and leads safe decompositions. Ensures shared logic stays in shared layers and lane-specific behavior stays in its lane.

- Home: everywhere, but especially `src/App.jsx`, `src/studio/components/StudioShell.jsx`, `serverXR/src/index.js`
- Skills: `dii-hotspot-refactor`, `dii-feature-routing`
- Runs: `npm run lint && npm run test && npm run build`

---

## Skill Index

| Role | Primary Skills |
|---|---|
| Backend Engineer | `dii-serverxr-contract-work` · `dii-schema-op-changes` · `dii-project-sync-ops` |
| Frontend Platform Engineer | `dii-project-sync-ops` · `dii-schema-op-changes` · `dii-feature-routing` |
| Infra / Deploy Engineer | `dii-deploy-workflow` · `dii-ai-doc-maintenance` |
| Studio Engineer | `dii-studio-ux-work` · `dii-hotspot-refactor` · `dii-feature-routing` |
| Beta / Node Engineer | `dii-beta-node-authoring` · `dii-feature-routing` |
| XR / 3D Engineer | `dii-xr-scene-authoring` · `dii-media-content-creation` |
| Spatial Designer | `dii-xr-scene-authoring` · `dii-space-publish-presentation` |
| Multimedia Artist | `dii-media-content-creation` · `dii-project-asset-transport` |
| Presentation Designer | `dii-space-publish-presentation` · `dii-studio-ux-work` |
| AI Doc Maintainer | `dii-ai-doc-maintenance` |
| Architect / Refactor Lead | `dii-hotspot-refactor` · `dii-feature-routing` |

---

## Platform Validation (All Roles)

```bash
npm run lint
npm run build
npm run test
npm run test:server-contracts
npm run docs:ai:check
```
