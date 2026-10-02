## 2026-10-02 — Nodes UI plan and Nodes audit (docs only; the build waits for the owner's Scene decision)

- The owner asked to optimise Raw (Nodes) UI/UX: wasted space, hard to work with. Sketches A–E (fit on open,
  content on cards, docked list, row menu, no code names) and F (joints) were drawn on the lab page
  `lab/p/nodes-ui-sketch-2026-10-02` (source in di-atlas). The owner asked for A–E mixed with F.
- `docs/raw/2026-10-02-nodes-ui-plan.md` records the plan and how F changed across the owner's four answers.
- The owner then asked to keep nodes pure: Text has an OUT, and a Scene is a scene. `docs/raw/2026-10-02-nodes-audit.md`
  measures the registry. 23 of 123 node types have no output; Text and List are dead ends; Scene takes no content
  by wire, only by nesting. The pattern it points to is TouchDesigner's Render TOP (objects, lights and a camera in,
  a picture out).
- Not done: no code has changed. The build waits for the owner's answer: is Scene a container with inputs, or
  purely wired, and does it output a picture? After that, A–E are re-checked against the answer.
- The first push on 10-02 failed. The branch tracked `origin/dev`, so the pre-push guard refused it, and the worktree
  had no `node_modules`, so lint couldn't run. Fixed by `npm ci` and pushing to the branch's own name.
