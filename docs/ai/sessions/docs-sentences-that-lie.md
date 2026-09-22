## 2026-09-23 — sentences that lie, told true: the install host, Docker, di sync, follow files, the trash, Solo

Wave 2 item 1 of `di-atlas/decisions/2026-09-23-connect-everything.md`. Words only: every
fix below is a sentence brought into line with what the code and the servers do. Nothing
was built, no route moved, no server was started.

### The install host — curl results, 2026-09-23

Both hosts answer the installer the same, byte for byte, with no redirect:

```
curl -sI https://diiii.xyz/get          HTTP/2 200  etag "6aa41127-215d"  content-length 8541  text/plain
curl -sI https://di-studio.xyz/get      HTTP/2 200  etag "6aa41127-215d"  content-length 8541  text/plain
curl -sI https://diiii.xyz/get.ps1      HTTP/2 200  etag "6aa41127-1c24"  content-length 7204  text/plain
curl -sI https://di-studio.xyz/get.ps1  HTTP/2 200  etag "6aa41127-1c24"  content-length 7204  text/plain

sha256  /get      810754beda375e758153bd00067ed3df27692cd56bce8d6fc927b1fbc46a6004  (both hosts)
sha256  /get.ps1  34531d7e3f083f500fb0275e28b61ceea151260fd33bab28ca50644516bc6a49  (both hosts)
```

The served `/get` is identical to the repo's `install.sh`, and the scripts fetch the
release from github.com whichever host served them. The page addresses the wiki names
(`/open_jam`, `/open_jam/scene`, `/open`, `/wcc`, `/light`, `/{space}/scan`,
`/main/studio`) answer 200 on both hosts with the same shell. So every `di-studio.xyz` in
the wiki (21 on 20 lines) became `diiii.xyz`, installer lines included.
`di-studio.xyz/get` keeps serving and is still never a redirect; nothing on the server
changed.

### Before → after, with the evidence

**`src/wiki/wikiContent.js`**

- `#di-cli-local`, Docker. Before: "Docker is there too, but only if you ask for it
  (di install --docker) — a container cannot reach things on your machine, …". After: "It
  always installs as that ordinary program, never as a container, so the surfaces that
  talk to your own tools (the agent board, a Claude installed on this computer) can reach
  them." Evidence: `scripts/di/cli.mjs` `COMMANDS` has no `install`;
  `scripts/di/bootstrap.mjs` calls `probeAll({ home })` with no `forcedMode`, and nothing
  in `scripts/di/`, `install.sh` or `install.ps1` reads `DI_MODE`, `--docker` or `--node`;
  the installer finds or downloads a node before bootstrap runs, so `decideMode`
  (`scripts/di/detect.mjs`) always returns node. The GHCR image is not pullable anyway:
  an anonymous token for `dob-0/dii-server` is refused (UNAUTHORIZED, manifest HEAD 403,
  checked 2026-09-23). aylmo's own `~/.di/state.json` says `mode: node`.
- `#di-cli-local`, sync. Before: "di sync compares them and moves work in whichever
  direction is safe — it refuses rather than guess when both sides have changed." After:
  "di sync compares them — what each side has that the other has not, and whether sending
  work either way would be safe or refused, as it is when both sides have changed. It only
  looks: it writes nothing on either side. To carry work between them, use di save and di
  open, di backup, or Save to file on the Spaces page." Evidence: `cmdSync` in
  `scripts/di/cli.mjs` ("writes NOTHING … --push/--pull are later PRs"); `ui.syncReport`
  in `scripts/di/ui.mjs` ends "nothing was written — this command only looks."; Save to
  file and Open a file are in `SpaceHub.jsx` for any signed-in account.
- `#spaces-and-projects`. Before: "/<space>/studio — the same list, in Studio’s older
  address" and "/<space>/raw/projects — the same projects, in the node editor’s older
  address". After: "/<space>/studio — the same projects in Studio, where you make them:
  New project, drafts, shelves and the trash are here, and a card opens its project in
  Studio" and "/<space>/raw/projects — the same projects, for the node editor: a card
  opens its project on the node canvas". Evidence: neither address is older or retired —
  `StudioApp.jsx` renders `StudioHub` (New project, the draft state, shelves, the trash,
  `openProject` → `buildStudioProjectPath`); `RawApp.jsx` renders `RawHub`
  (`listProjects(spaceId)`, `openProject` → `buildRawProjectPath`). Written so it stays
  true when Wave 1 item 5 puts StudioHub on `/raw/projects` with cards opening in Nodes.
- `#algovrithm`. Before: title "a code-authored VR space"; summary "a space whose scene is
  written in three.js/R3F code"; body "a WebXR experience built the way br_id_ge and WCC
  are — a real space, routed through the same server-verified public/private check".
  After: title "a VR piece written in code"; summary "a VR piece written in three.js/R3F
  code rather than made in Studio"; body "a WebXR piece that lives inside di.iiii’s own
  code, as WCC does. Who may see it is decided the way it is for any space — the server
  says whether the algovrithm space is public — but that space holds no projects, and its
  address never opens one: /algovrithm is always the piece’s front door." Evidence:
  `CURRENT.md` Open ("public, empty and it can never open … `src/algoVrithm/` owns that
  url before any space lookup"); `RootApp.jsx` `WorkSurfaceRoute` (`useSpacePublicFlag`,
  then the work's own surface for `/algovrithm` and `/algovrithm/scene`);
  `src/works/works.js` (br_id_ge "lives in its own repository and arrives as a space" —
  so "built the way br_id_ge is" was also stale); `GET /serverXR/api/spaces/algovrithm`
  on diiii.xyz and dev.diiii.xyz → `isPublic: true, publishedProjectId: null`, and
  `/contents` → `projects: []`. The piece itself opens: headless Chromium on
  diiii.xyz/algovrithm and dev.diiii.xyz/algovrithm shows the front door and the
  statement, and /algovrithm/scene shows the piece. The space still holds the Director's
  saved timing (`src/timeline/timingOverlay.js`), which is why the words are "holds no
  projects", not "holds nothing".
- `#following-a-space`. Before: "What does not travel yet: images and models. A followed
  scene will show their absence until they do." After: "A project’s files travel too, both
  ways: an image, a video or a model added to a project on either machine is carried to
  the other, one file at a time, and checked against its name before it is kept. Two kinds
  do not travel yet — files placed straight in the space’s own scene rather than in a
  project, and older files added before files had checkable names. Both stay on the
  machine where they were added; di follows counts the older ones, and adding one again
  sends it." Evidence: `serverXR/src/follow/assets.js` (since 2026-09-20, PROGRESS
  "a follow carries its projects' files"); `docs/architecture/SPEC_follow_files.md` §2;
  `followFileLines` in `scripts/di/ui.mjs` ("older files are not carried … add them again
  to send them"). Tags gain files / images / models.
- 20 lines, `di-studio.xyz` → `diiii.xyz`: Open Jam (short link, `/open_jam/scene`, the
  bare `/open`, Share's copied link, the editor), the front door, `/light` and the rig on a
  hosted site, Projection's address and its two hosted notes, the wcc card, the
  Director's save, `--guests`, the vizzz rig, `/{space}/scan` and "Make the hall", and the
  two installer lines. Evidence: the curl results above. Share copies
  `window.location.origin + /open` (`JamSurface.jsx`), so on diiii.xyz it copies
  diiii.xyz/open.

**Delete dialogs** — `src/studio/components/StudioHub.jsx:260`,
`src/studio/components/StudioProjectsPanel.jsx:77`, and the same sentence in
`src/components/preferences/AdminManageSection.jsx:182`. Before: `Delete "…"? Cannot be
undone.` (admin: `This cannot be undone.`). After: `Delete "…"? Moves to the trash for 30
days.` Evidence: all three call `projectsApi.deleteProject` → `DELETE /api/projects/:id`,
which soft-deletes (`serverXR/src/routes/projectRoutes.js`, `trashed: true`;
`projectStore.js` `TRASH_TTL_MS` = 30 days); the wiki's `#shelves-and-the-trash` and the
delete button's own title already said 30 days. The admin line was not in the plan; it is
the same sentence over the same call.

**Projection** — `src/map/MapSurface.jsx:399-400` (only those two lines). Before: `Solo`,
title "Show this one alone". After: `Solo · screen`, title "Show this one alone on this
screen. The projector still shows every surface." Evidence: `soloId` is local state passed
only to this tab's `MapStage` (`soloSurfaceId`); `MapOutput` (`/out`) never receives it.

**`docs/deploy/DI_CLI.md`** — the install block now names `diiii.xyz/get` and
`/get.ps1`, and says `di-studio.xyz` serves the same bytes forever and must never become a
redirect. "Node or Docker": step "1. DI_MODE, or --docker / --node → obeyed" is gone, with
a paragraph saying Docker mode is not reachable today and why (the evidence above); "Docker
mode is real and kept, but it is the deliberate choice (`--docker` / `DI_MODE=docker`)"
now says the switch was never wired; "make the packages public and it starts working with
no new release" now says that would not change it on its own. The plan's `DI_CLI.md:25`
matched no docker sentence in today's file (line 25 is `di open FILE`); the docker claims
were at 250 and 261-262.

### Owed to the next land: CURRENT.md (a feature branch may not write it)

`docs:ai:check` refuses a CURRENT.md that differs from origin/dev on a feature branch, so
these two corrections were reverted here. The next land PR should apply them:

- `:32` — "aylmo runs a branch build (`0.4.7-shelves.2`)" → "aylmo runs `0.4.15-place.1`
  (packed 2026-09-22 from #534, the place-and-lights landing)". Evidence:
  `~/.di/state.json` `version: 0.4.15-place.1`, `~/.di/current` → that version,
  `release.json` `packedAt 2026-09-22T14:42Z`; local.thedi.studio answers 200.
- `:35` — "Follow … carries NO assets yet — a followed scene shows a grey wall …" →
  "Follow (one space on two installs) carries a project's files both ways since
  2026-09-20 (`serverXR/src/follow/assets.js`; loopback proven only). Still NOT carried:
  files on the space's own scene, and legacy uuid-id files (`di follows` counts them). No
  warning when op retention drops something uncarried; no real two-machine transfer yet,
  and the internet case needs a throwaway space — owner's call." (PROGRESS 2026-09-20
  already wrote this sentence; it never reached CURRENT.md.)

### Left, and why

- `src/raw/AGENTS.md:40` — owned by the one-project-list agent.
- `src/raw/components/RawHub.jsx:133` says "This cannot be undone" over the same soft
  delete. RawHub is the one-project-list agent's (Wave 1 item 5 removes it).
- `install.sh` / `install.ps1` (what `/get` serves): with no node and no nodejs.org, the
  failure text offers "Docker Desktop — install it, open it once, then run this line
  again". Rerunning with Docker still fails: the next run needs a node too, and the
  images are private. Changing it changes the served installer, so it wants its own PR.
- `scripts/di/detect.mjs` reason "docker stays opt-in (--docker)", printed by `di doctor`
  only when Docker runs AND the images are pullable (not today), names a flag that does
  not exist.
- Still naming `di-studio.xyz` for the installer: `scripts/di/ui.mjs:307` (a CLI hint)
  and `docs/deploy/SELF_HOST.md:4`. Same evidence; outside this unit's files.
- Space delete ("Delete space … cannot be undone", `SpaceHub.jsx:520`,
  `AdminManageSection.jsx:130`) is true: `DELETE /api/spaces/:id` removes the space for
  real. Left as is.
