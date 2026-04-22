---
name: dii-feature-routing
description: 'Route feature work across Studio, Beta, src/project, src/shared, serverXR, scripts, and deploy. Use when deciding where code belongs, whether a change is shared or lane-specific, and what adjacent files and validations to check.'
argument-hint: 'Describe the feature or bug you need to route'
---

# dii Feature Routing

## When to Use
- A request could belong in more than one lane or layer.
- You need to decide whether logic is shared, schema-level, server-authoritative, or lane-specific.
- You want a fast placement decision before editing code.

## Outcome
Pick one primary edit location, list adjacent surfaces to inspect, and choose the minimum useful validation.

## Procedure
1. Start with the root routing rules in AGENTS.md and the nearest scoped AGENTS file for the likely area.
2. Ask whether the behavior should work in more than one editor lane.
3. If the answer is yes, decide between shared document behavior and canonical schema/runtime truth.
4. If the answer is no, decide whether the behavior is shipped Studio work or experimental Beta work.
5. Ask whether the server should be authoritative for the behavior.
6. If deployment or automation behavior changes, route to scripts or deploy instead of product code.
7. Before editing, list one primary directory and up to three adjacent files or docs that must be checked.
8. Run only the narrowest useful validation that matches the chosen area.

## Decision Tree
### Shared vs lane-specific
- If Studio and Beta should both benefit, prefer src/project.
- If the change alters document shape, defaults, normalization, versioning, or op application, prefer src/shared and shared.
- If the change affects shared sync, presence, public viewer behavior, or project API handling, prefer src/project.
- If the change is only the shipped main editor UX, prefer src/studio.
- If the change is intentionally experimental or node-first, prefer src/beta.

### Server authority
- If the change affects auth, persistence, publish state, routes, uploads, SSE, or Socket.IO presence, include serverXR/src.
- If the server contract changes, check both the backend code and the client sync or API consumers.

### Automation and deploy
- If the change modifies commands, release helpers, smoke checks, or env writers, prefer scripts.
- If the change is documentation, templates, or deploy examples, prefer deploy.

## Repo Anchors
- Root routing: ../../AGENTS.md
- Workflow matrix: ../../docs/ai/workflows.md
- Studio lane: ../../src/studio/AGENTS.md
- Beta lane: ../../src/beta/AGENTS.md
- Shared project layer: ../../src/project/AGENTS.md
- Shared schema layer: ../../src/shared/AGENTS.md
- Backend authority: ../../serverXR/src/AGENTS.md
- Automation: ../../scripts/AGENTS.md
- Deploy docs: ../../deploy/AGENTS.md

## Validation Matrix
- src/studio, src/project, src/shared, src/beta: npm run test and npm run build
- serverXR/src route or auth work: npm run test:server-contracts and npm run test
- scripts or deploy work: targeted dry-run or inspection plus npm run docs:ai:check when AI docs change
- AGENTS or docs/ai changes: npm run docs:ai:sync and npm run docs:ai:check

## Completion Checks
- One primary edit location is named.
- Shared logic is not duplicated into a lane without a clear reason.
- Schema truth is not pushed into UI-only code.
- Server-authoritative behavior is not implemented only on the client.
- The chosen validation matches the actual area changed.
