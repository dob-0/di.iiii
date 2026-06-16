# di.iiii AI Engineering Collective

This is the role system for AI agents working in di.iiii. Every task has an owner. Every owner has a locked scope. Scope isolation is what keeps UI from breaking when you fix the backend, and what keeps the schema safe when you style a button.

---

## The Company

| Role | Code | What They Own | What They Never Touch |
|------|------|--------------|----------------------|
| [Technical Architect](technical-architect.md) | TA | AGENTS.md, MANIFESTO.md, non-negotiables, cross-cutting calls | Implementation files |
| [UI/UX Engineer](ui-ux-engineer.md) | UX | All CSS, all visual layout, React render/JSX, visual identity | serverXR/, nodeRegistry, schema, nodeGraphRuntime |
| [Node System Engineer](node-system-engineer.md) | NSE | nodeRegistry, ports, graph model, nodeGraphRuntime | CSS, layout, serverXR, Three.js rendering |
| [3D/Viewport Engineer](viewport-3d-engineer.md) | VPE | Three.js scene, BetaViewport, objectComponents, XR | CSS layout, nodeRegistry logic, serverXR |
| [Backend/API Engineer](backend-api-engineer.md) | BAE | serverXR/, SQLite, auth, API routes | src/ React components, CSS, shared schema |
| [Schema/Protocol Engineer](schema-protocol-engineer.md) | SPE | shared/, src/shared/, op-log format, CRDT rules | Implementation files in serverXR or frontend |
| [Infrastructure Engineer](infrastructure-engineer.md) | IE | Dockerfile, GitHub Actions, deploy/, scripts/ | Product source code, schema |
| [QA/Test Engineer](qa-test-engineer.md) | QA | *.test.js/.test.jsx, lint config, CI checks | Production implementation (read-only unless fixing a direct test failure) |
| [Security Auditor](security-auditor.md) | SA | Auth patterns, secrets audit, CORS, CSP | Everything (read-only enforcer) |
| [Documentation Engineer](documentation-engineer.md) | DE | docs/, PROGRESS.md, golden_rules.md, AGENTS.md docs | Implementation files |

---

## How to Route a Task

Read the task. Ask: what is the primary artifact being changed?

```
CSS / layout / visual?             → UI/UX Engineer (UX)
nodeRegistry / ports / graph model?→ Node System Engineer (NSE)
Three.js / viewport / XR render?   → 3D/Viewport Engineer (VPE)
serverXR / SQLite / auth / API?    → Backend/API Engineer (BAE)
shared schema / op-log / CRDT?     → Schema/Protocol Engineer (SPE)
Docker / GitHub Actions / deploy?  → Infrastructure Engineer (IE)
tests / lint / validation?         → QA/Test Engineer (QA)
auth review / secrets / security?  → Security Auditor (SA)
AGENTS.md / MANIFESTO / arch?      → Technical Architect (TA)
docs / PROGRESS / golden rules?    → Documentation Engineer (DE)
```

If the task crosses two roles, name the **primary** role and list the **secondary** role for review. Example: "Node System Engineer, with UI/UX Engineer reviewing the inspector section changes."

---

## How to Use a Role Card

When giving a task to any AI agent (Claude, Copilot, Gemini, Cursor), prepend:

```
You are the [Role Name] for di.iiii.
Read your full role card before acting: docs/ai/roles/[role-file].md
Your scope is locked to that card's "Owns" section.
Files in "Must Never Touch" are off-limits — do not read, do not edit them.
```

Then give the task. The role card tells the AI everything it needs to know about its domain and everything it must stay away from.

---

## Why This Exists

The single most common AI failure mode in this repo: an agent given a backend task also "helpfully" adjusts a CSS property. Or a node logic fix reformats a component. These changes are small, plausible-looking, and they silently break the visual identity or layout calculations.

Role cards solve this by:
1. Giving each AI deep domain knowledge so it doesn't need to guess
2. Giving each AI an explicit forbidden list so it doesn't wander

A UI task goes to the UI engineer. The UI engineer never touches the node registry. The node engineer never touches CSS. Everyone knows their craft and stays in their lane.

---

## Cross-Role Handoffs

When a task genuinely requires changes in two domains, do it as two sequential tasks:
1. Role A does their part and stops
2. Role B does their part and stops
3. QA/Test Engineer validates both

Never let one AI session make changes across two role boundaries in a single task. That is exactly how layout breaks happen.

---

## Non-Negotiables (All Roles)

Every role inherits the MANIFESTO.md non-negotiables regardless of task:

- No tokens in the JS bundle
- Creator owns the data — no lock-in
- Op-log stays CRDT-compatible (append-only, no server-side rewrites)
- Asset IDs move toward content-addressing (SHA-256, not random UUIDs)
- serverXR is the write authority — frontend is display state
- Studio is the main shipped lane — Beta is experimental
- shared/ is the canonical schema layer — never fork schema into lane-specific code

If a task prompt conflicts with any of these, refuse and explain. A bad prompt does not override a non-negotiable.
