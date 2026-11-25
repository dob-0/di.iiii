## 2026-11-20 — the mapping desk, one version: dev plus the bar desk as it ran (PR #1321)

- Rebuilt PR #1321's two commits on today's dev: the bar desk as it ran (screens and clips, Output and Preview monitors, 61 effects, an LFO on every setting, HTML visuals), then the 11-12 audit fixes. The audit commit is still separate, so it can be dropped alone.
- Conflicts kept dev's upload rules (uploadPolicy.js) and added HTML there; test hosts follow dev's host; two jsx-a11y lint errors fixed.
- The warp-points draft (#627) is not folded in: it rewrites the same map files. It stays on its own PR; folding it is a separate decision.
- Tests on work-laptop: the map tests pass, full lint passes. Not done: a headless picture of the desk at real screen sizes; seven other map branches ahead of dev were listed, not reviewed.

## 2026-11-20 (later) — older map work triaged against the one version

- Merged into dev already (squash PRs, content present): light-map-looks (#340), map-subdomain (#351, Caddyfile), fix/map-stream-reacquire (#1267, reacquire test in dev), fix/monitor-map-ux (#1305) and monitor-map-2026-11-16 (#1293). The last two are the Monitor/admin map in src/components/preferences, not the mapping desk.
- deck-midi-map (136 ahead): in src/map only two things differ from dev. "Back to Perform" on the output controls: brought in (cherry-pick of a7fd47eb1, 2 files, merged clean). The per-source on/off switch (sourceSwitch.js, camera pool, MapSourceView): not brought, it belongs to the VJ deck (a new module outside the mapping desk).
- Warp #627: trial merge gives 9 conflicting files (MapSurface, MapStage, MapInspector, MapDeskParts, mapSurface.css, both projectSchema files, PerformWindows, wikiContent). Not folded; the one version already has a warp grid. Per-feature table: agent-reports-2026-11-20/map-triage.md.
- Tests on work-laptop (node 24.22.3): npx eslint . 0 errors; npx vitest run src/map 579 passed.
