## 2026-08-09 — sync could not lose your work quietly; now it cannot lose it at all

Groundwork for `di sync` (phase 2 of the CLI), but it landed alone and first because the
survey turned up a **live data-loss path in shipped code**, not a future one. `serverXR`
already has local↔live sync routes, and both directions were destructive:

- `POST /api/sync/spaces/:id/pull` → `replaceSceneAndBroadcast` → `writeOpsHistory`, which
  is delete-all-then-insert. A pull erased the **local** op-log — on the artist's own
  machine. A push did the same **upstream**.
- `GET /scene` does not return the stored scene: it drops manifest entries whose asset file
  is missing here and rewrites every asset URL to the serving host. Sync round-tripped that,
  so pull-then-push **permanently deleted upstream entries this machine had merely not
  downloaded**, and baked the wrong origin into the scene.
- The sync row claimed "in sync" whenever two object *counts* matched, and a remote `409` —
  the status that means someone else's work would have been overwritten — was flattened into
  `502 "Live server returned 409"`, i.e. displayed as a bad network.
- Pull also wrote a copy into `<serverXR>/../spaces/<id>/scene.json`, which on a `di` install
  lands inside `~/.di/versions/<v>/` — the directory `di update` deletes.

## What changed

**Append, never write-over.** One line — `writeOpsHistory` → `appendOpsHistory` — plus
removing `writeOpsHistory` from the route module's injected dependencies entirely, so a
future route that reaches for it fails loudly instead of quietly destroying. Safe because
`applySceneOps` already treats a mid-log `replaceScene` as a full reset, so replay from any
earlier version still converges; no op semantics changed, so no dual-maintained
`src/shared` + `shared/*.cjs` edit was needed.

**A precondition on whole-scene writes.** `If-Match: "<n>"` / `?baseVersion=<n>` on
`PUT /scene`, answered with the same `409 { latestVersion, pendingOps }` shape `POST /ops`
has always returned — so `useLiveSync` and `useServerPublishing` needed no new code. A
*malformed* precondition is a 400, never a silent unconditional write. It is opt-in via
`SCENE_REPLACE_REQUIRE_PRECONDITION`: **off online**, where this route has callers nobody can
enumerate (scripts here, sync engines vendored into three other repos, whatever is pointed at
production), and **on for `di` installs**, which have no legacy callers by construction. When
the unconditional-replace warnings stop appearing in the online logs, that default can flip.

**A verbatim read.** `GET /scene?verbatim=1` returns what is stored, with `missingAssetIds`
naming what the normal read would have dropped. Sync uses it both ways and **refuses against
a peer that cannot serve it** — an old server ignores the query and answers with its filtered
rendering, identical apart from that key, and writing that back is the erasure bug.

**Refusals instead of proceeding.** Pull requires the local version it means to replace
(428 otherwise), snapshots before writing and reports where the snapshot went, and a remote
409 passes straight through as a 409. `/status` reports both sides and returns
`relation: 'unknown'`, because per-install counters genuinely cannot answer "are these the
same?". Even force-publish is now conditional — on the version the person was *shown in the
dialog*, not on the stale ref that caused the conflict, so a third change arriving while the
confirm is open cannot be buried.

## Verified

lint 0 errors · 1934 tests · 7 server-contract files, 92 tests · build clean.

Guards watched failing first, all of them: the op-log test leaves exactly one op on `dev`;
the panel test really does print `in sync · 3 objects` for local v41 against live v13.

End-to-end on a real install (`di` from a packed runtime, `DI_HOME` with a dot in it):

```
ops before replace: seed-1, seed-2, seed-3
unconditional PUT            → 428
conditional PUT If-Match "3" → 200
same stale If-Match again    → 409
ops after replace:  seed-1 | seed-2 | seed-3 | …:replaceScene
```

And looked at, desktop and phone, on a server with `LIVE_API_URL` configured — which is how
the last bug was found: the new two-sided message truncated to `local v0 · 0 …` on a 390px
phone, hiding the live side, the one thing the row exists to show. The row now wraps below
560px with each side unbreakable.

## Next

`di sync` itself: `di link` + ledger + a read-only diff first, then `--push`/`--pull` over the
op transport, then `--replace-*` over bundles. The plan and its refusal list are in
`~/.claude/plans/misty-humming-hearth.md`; `PUT /document`'s precondition is deliberately
split into its own PR because it drags `space-sync.mjs`'s `ENGINE_VERSION` and three
vendored copies with it.
