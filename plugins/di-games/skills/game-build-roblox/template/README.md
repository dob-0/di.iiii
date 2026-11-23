# __GAME_SLUG__ (Roblox)

Started from the template of the `di-games` plugin (skill `game-build-roblox`). Replace this line with the
game in one sentence.

The method, in order, is the plugin's skills: `game-concept`, `game-design`, `game-greybox`,
`game-build-roblox`, `game-playtest`, `game-look`, `game-release`. The design is `docs/design.md`; build only
what it says.

Status: template state. The example round (wait, run, win or lose, next round) is tested under Lune.
Nothing here has run inside Roblox yet.

## How it is built

- **Code is text.** Luau (`--!strict`) in git. Rojo copies it into Roblox Studio or builds a place file.
- **The map is text too.** `map/plan.json` (areas, walls, doors, spawn, zones, markers) becomes Rojo
  `.model.json` files through `scripts/gen_greybox.py`: plain grey blocks, no art.
- **Pure logic is testable without Roblox.** `src/shared/logic/` calls no Roblox service, so Lune can test
  it. The thin services in `src/server/` and `src/client/` connect it to the engine.

```text
src/shared/Config.luau       every number of the design, by name
src/shared/logic/            pure rules (Round is the example)
src/server/                  Main.server.luau and thin services
src/client/                  thin client scripts (Hud)
map/                         plan.json + generated *.model.json
tests/, tests.luau           Lune tests; add one line per test file in tests.luau
scripts/                     check.sh, tools.sh, setup-tools.sh, gen_greybox.py, check_assets.py
docs/                        design.md, decisions/
assets.csv                   provenance of every asset
```

## Run the checks

Install the tools once (pinned in `rokit.toml`). It never edits your shell profile:

```bash
scripts/setup-tools.sh --dry-run   # show the steps first
scripts/setup-tools.sh             # Rokit v1.2.0 into $HOME/tools/rokit (or ROKIT_ROOT), then the tools
scripts/tools.sh rojo --version    # run one tool; PATH is set for this command only
```

Then:

```bash
python3 -I scripts/gen_greybox.py   # rebuild the map files from map/plan.json
scripts/check.sh                    # all checks, in order; ends with ALL CHECKS PASSED
scripts/tools.sh lune run tests     # only the tests: prints "N passed, 0 failed"
```

## Play it in Studio

Studio runs on Windows and macOS. Once: `scripts/tools.sh rojo plugin install`. Then
`scripts/tools.sh rojo serve` and press Connect in the Rojo plugin inside Studio.

## Assets

Every asset gets a row in `assets.csv` (source, licence, author, date) before it goes into the game. CC0
first, CC-BY with credit, NonCommercial never. `scripts/check_assets.py` checks it; `check.sh` runs it.
