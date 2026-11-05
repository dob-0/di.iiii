## 2026-11-05 — The XR handbook: one space for the team (`xr-docs`)

- Owner asked: share our XR documentation with the team, organised and collected in one space; he picked a di.iiii space on dev.
- New: `spaces/xr-docs/` — `build.py` turns six repo documents into pages (Python-Markdown 3.11, the Arch package; no script in any page), plus a door page with the reading order, code anchors, and every other markdown file that mentions XR (found by the same search each build). `build.py --check` fails when a page is stale.
- Pages: production cycle (`docs/architecture/XR_PRODUCTION_CYCLE.md`), scene authoring (skill), XR creator role, headsets and phones (`one-local-address.md`), network name, AR scan decision. Sources are unchanged; the repo stays the one source.
- Prose writes `diiii&#46;xyz` as an entity so space-sync step 3b does not retarget the documents' own addresses on dev (measured: 0 retargeted pages after, 1 before).
- Carried: space-sync to local (`http://diiii.localhost/xr-docs`), then `di save xr-docs` + `di open … --to https://dev.diiii.xyz` with the stored login. Dev: 7 projects, published door `xr-docs`, public.
- Not done: owner and `permanent` on dev are browser-only by guard (`not_through_cli`); the sweep spares the space anyway (published, public, content). Prod not declared.
