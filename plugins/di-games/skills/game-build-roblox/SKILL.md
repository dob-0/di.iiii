---
name: game-build-roblox
description: "Stage 3 of the di-games routine for Roblox. Use to start a new Roblox game repo from the template (scripts/new-game.sh) or to build in one: Rojo, Rokit-pinned tools, pure logic tested with Lune, thin services, scripts/check.sh. Done when every v1 rule works and all checks are green."
---

# game-build-roblox: stage 3, the playable v1 on Roblox

- **Makes:** a game repo from the template, then every v1 rule of `docs/design.md` working.
- **Gate (done when):** the design's section 8 list passes, `scripts/check.sh` ends with `ALL CHECKS PASSED`,
  and the verifier signs off.
- **Who:** game-builder builds; game-verifier checks and signs off.
- **Needs:** an approved `docs/design.md` with no open pick that blocks the build.

## Start a game

```bash
${CLAUDE_SKILL_DIR}/scripts/new-game.sh <name> <dir>   # name: kebab-case; dir: new or empty
cd <dir> && scripts/setup-tools.sh && scripts/check.sh
```

`new-game.sh` copies `template/` (the toolchain and layout of the first game, made generic), adds the design
page from `game-design` and the asset check from `game-look`, fills in the name, and runs `git init`. It
writes nothing outside `<dir>`. Each game is its own repo.

It needs Linux with GNU tools and bash 4 or newer. On bash 3 (the macOS default) or a `grep` or `sed` that is not GNU it
stops with a message before it creates anything, and `setup-tools.sh` downloads for Linux x86_64 only. The macOS port is
owed. `setup-tools.sh` also records `tools.sha256`, the sha256 of each installed tool binary (trusted on the first install:
the GitHub release and the version pin), and `scripts/check.sh` checks every binary against it first, on every run.

## The toolchain, pinned in `rokit.toml`

| Tool | Job | Version (date) |
|---|---|---|
| Rojo | files and git to Studio; builds `.rbxl` | 7.7.1 (2026-10-02) |
| Rokit | installs and pins the tools (Aftman's maintainer has left Roblox) | v1.2.0 (2025-09-30) |
| Selene | linter | 0.32.0 (2026-10-01) |
| StyLua | formatter | 2.6.0 (2026-10-10) |
| luau-lsp | editor help and types | 1.70.1 (2026-09-27) |
| Lune | runs Luau outside Roblox, for the tests | 0.11.1 (2026-10-21) |

Versions and dates: each project's GitHub release API, read 2026-10-28. Not chosen:
Wally (last release 2023-06-05; add it when a package is needed) and Jest Lua (runs only inside Roblox).

## The layout

```text
src/shared/Config.luau       every number of the design, by name
src/shared/logic/            pure rules: no engine calls, tested with Lune
src/server/                  Main.server.luau and thin services
src/client/                  thin client scripts (the HUD)
map/                         plan.json + generated *.model.json (the greybox)
tests/, tests.luau           Lune tests; one line per file in tests.luau
scripts/                     check.sh, tools.sh, setup-tools.sh, gen_greybox.py, check_assets.py
docs/                        design.md, decisions/
assets.csv                   provenance of every asset (skill game-look)
```

## The pattern: pure logic and thin services

- A rule is a pure module in `src/shared/logic/`. It takes its inputs as arguments, reads no clock, calls no
  engine service, and requires no other logic module (hand it what it needs). Lune loads a module by file
  path and Roblox by instance, so a pure module that requires another one works in only one of them.
- A service in `src/server/` only connects: an engine event comes in, the logic is called, an engine call goes
  out. If a service holds an `if` about the game's rules, move that `if` into logic and test it.
- Numbers live in `Config`. A number written anywhere else is a defect.
- Write the test first. Test names read as sentences. `Round` in the template is the worked example.
- Monster pathfinding uses `PathfindingService:CreatePath`, `path:ComputeAsync` and a `path.Blocked` handler;
  it runs where the NPC logic runs, and the docs give no distance or cost limits (UNCHECKED: from the research job's notes, which are not in this repo; read the PathfindingService page before relying on it).

## Rules for the builder

1. Build only what `docs/design.md` says. A number that looks wrong is a question to the designer.
2. Run `scripts/check.sh` before every hand-over and quote its last lines. It fails on zero tests.
3. Hand to game-verifier with: the commit, the check output, what was run in Studio and what was not.
   You never sign off your own work.
4. Versions are pinned in `rokit.toml` only. Run tools through `scripts/tools.sh`. Never edit a shell profile.
5. Heat: the checks are light. If you add anything heavy, run it pinned (`taskset -c 0-3 nice -n 19`), in
   the foreground, never detached.

## What check.sh proves, and what it does not

- Proves, in order: the map files match the plan; `assets.csv` is complete; JSON parses; the code is
  formatted and linted; the place file builds; the pure-logic tests pass, with at least one test.
- Does not prove anything inside the engine (pathfinding, raycasts, lights, networking, phone UI), nor
  types (a type-check step is owed). Those need Studio and a person.

## Studio

Once: `scripts/tools.sh rojo plugin install`. Then `scripts/tools.sh rojo serve` and Connect in the Rojo
plugin. Studio officially runs on Windows 10+ and macOS 10.14+ (create.roblox.com/docs/studio/setup); Linux
is not listed. Vinegar (Studio through Wine, v1.9.4 of 2026-06-24) exists but had open crash and login
issues dated 2026-10 (UNCHECKED: from the research job's notes, which are not in this repo; the Vinegar issue tracker was not re-read), so on Linux treat Studio as unproven and use a Windows or
macOS machine for the walk and the playtests.

## Lessons

Each was measured on a real game and is now built into the template, so a new game starts right.

- **Rojo ignores `Position` in a `.model.json`; only an explicit `CFrame` places a part** (2026-10-28; haunted-school `57fd4c9`, night-forest `bf50922`). `gen_greybox.py` writes `CFrame`; `tests/map.test.luau` fails on any `Position`, any part without a `CFrame`, any part at the origin. Tests read a part's place from `Properties.CFrame.CFrame.position`.
- **Logic tests read the same JSON as the build, so they cannot see a wrong build** (2026-10-28; haunted-school `8b7aa01`). `scripts/check_place.luau` reads the BUILT `.rbxl` with Lune and fails on parts at the origin, parts outside the plan, a missing or misplaced spawn, scripts missing from the place. `check.sh` runs it right after the Rojo build. Add the game's own rules at its section 5.
- **`luau-lsp analyze` with Roblox's definitions finds real bugs** (2026-10-28; haunted-school `brain:update` on a method-less table). `check.sh` runs it on `src` with the pinned definitions (`scripts/setup-types.sh` fetches them once; the sha256 is checked). First run on the template itself found a loose `event` type in `RoundService.luau`, now annotated.
