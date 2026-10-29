# di-games

A Claude Code plugin that takes a game concept to a game you can play, the same way every time: seven
stages with one skill and one gate each, four agents, and the tool config. Roblox is the first target; a
di.iiii target follows. Version 0.1.0, 2026-10-28 (ledger N1430, N1434). Every game teaches the routine
something, and that goes back into these files (rule "learn once").

## Install

```bash
claude plugin marketplace add dob-0/di.iiii   # once per machine: adds this repo's catalogue (needs read access to the repo)
claude plugin install di-games@di-iiii        # installs the plugin
claude plugin details di-games                # lists what loaded, with its token cost
```

To try it from a checkout without installing: `claude --plugin-dir plugins/di-games`. The skills then appear
as `/di-games:game-concept` and so on. The commands are from the Claude Code docs (code.claude.com, plugins
reference and marketplaces, read 2026-10-28) and the CLI's own help.

## The seven stages: one skill and one gate each

| # | Stage | Skill | It makes | Gate: done when | Who |
|---|---|---|---|---|---|
| 0 | Concept | game-concept | An analysis of the concept, plus the picks only the owner decides | The owner answered the picks | designer |
| 1 | Design | game-design | The one-page design: rules, numbers, done-when | The owner's yes | designer |
| 2 | Greybox | game-greybox | A map of plain blocks and the core loop | One round can be won | builder, then verifier |
| 3 | Playable v1 | game-build-roblox (game-build-dii is a stub) | Every v1 rule working, all checks green | The done-when list passes | builder, then verifier |
| 4 | Playtest | game-playtest | A test plan, sessions with friends, notes, fixes | Players ask for another round | verifier and the owner |
| 5 | Look | game-look | Art, light and sound; each asset keeps its source and licence | Every asset has a row and every row is valid; light stops at walls | builder and asset-scout, then verifier |
| 6 | Release | game-release | The rating questionnaire; private, then public | Label set; live; the owner's money and ID steps done | the owner and builder |

Method: the playcentric loop (Fullerton, *Game Design Workshop*, 5th ed., CRC Press, 2024), one-page designs
(Librande, GDC 2010), the MDA frame (Hunicke, LeBlanc, Zubek, 2004). Routing (di-atlas `agents/ROUTING.md`):
a written brief, an open owner decision stops the builder, the builder never signs off its own work, a
separate Opus verifier does.

## Where a game lives

Each game is its own repo and installs this plugin. The first, Escape the Haunted School, is
`~/work/haunted-school`. Start the next Roblox game from the template:

```bash
plugins/di-games/skills/game-build-roblox/scripts/new-game.sh my-game ~/work/my-game
```

Inside a Claude session the skill runs it as `${CLAUDE_SKILL_DIR}/scripts/new-game.sh`. It copies the first
game's toolchain and layout, made generic, adds the design page and the asset check, and runs `git init`.
Tested 2026-10-28 on Linux x86_64 with the tools from Rokit: a copy made into a scratch directory ended its
`scripts/check.sh` with `13 passed, 0 failed` and `ALL CHECKS PASSED`.

`new-game.sh` needs Linux with GNU tools (`grep`, `sed`) and bash 4 or newer: it uses `${p^}`, `grep -Z` and `sed -i`.
On bash 3 (the macOS default) or a `grep` or `sed` that is not GNU it stops with a message before it creates anything.
`setup-tools.sh` downloads for Linux x86_64 only. The macOS port is owed.

The tools are pinned by version in `rokit.toml` and by hash in `tools.sha256`: `setup-tools.sh` records the sha256 of
each installed binary on the first install, and `scripts/check.sh` checks every binary against it on every run
(`scripts/verify_tools.py`). The first install trusts the GitHub release and the version pin: Rokit keeps the unpacked
binary, not the archive that GitHub publishes a digest for. Later runs only detect a change.

## Agents (`agents/`)

| Agent | Model | Does | Tools |
|---|---|---|---|
| game-designer | Opus | Reads the concept, writes the design, returns only the picks | read, write, web |
| game-builder | Sonnet | Writes code and maps, runs every check, never signs off | read, write, bash, Blender MCP |
| game-verifier | Opus | Fresh context. Checks the gate itself; signs off or sends back | read, bash, writes only its verdict file |
| asset-scout | Haiku | Finds CC0 assets and proposes their licence rows | read-only, web |

Each agent stops on an open owner decision, keeps to about 60 tool calls and then hands over by a file, and
carries the heat rules (brief template items 16 and 19: `di-cool`, pinned tests, never detached).

Only game-builder has the Blender tools: `mcp__plugin_di-games_blender__*` is in its `tools:` list. An agent's `tools:`
list is an allow-list, so an agent that does not name MCP tools has none, and a plugin agent's own `mcpServers:` field is
ignored: the plugin's `.mcp.json` is the only door (code.claude.com/docs/en/sub-agents, "Restrict which tools a subagent
can use" and "Choose the subagent scope"; the name form `mcp__plugin_<plugin>_<server>__<tool>` is from
code.claude.com/docs/en/mcp, "Plugin MCP tool names"; all read 2026-10-28). NOT RUN: the Blender server was never started
here, so no agent's tool list with the Blender tools in it has been seen. If the builder reports that it has no Blender
tools, the main session runs the Blender step.

## Tools (MCP)

**On, in `.mcp.json`: Blender MCP**, pinned `mcp-for-blender==2.1.9` (through `uvx`) with
`BLENDER_MCP_SAFE_MODE=1`, `DISABLE_TELEMETRY=true` and `BLENDER_HOST=localhost`.

- Why this version: the newest release at least 14 days old on 2026-10-28 (released 2026-10-06; the newest,
  2.2.6, came out on 2026-10-28 itself). The 14-day rule is ours and unvalidated.
- Checked 2026-10-28: PyPI lists it as MIT and not yanked; the wheel's sha256 matches PyPI's; the wheel's
  source reads `BLENDER_MCP_SAFE_MODE` (`safe_mode.py:72`) and `DISABLE_TELEMETRY` (`telemetry.py:110`) and
  has the `install-addon` command. The server was NOT started in this test; the `uvx --from` form was
  checked against `uvx --help`, not run.
- It needs `uv` and Blender with the add-on: `uvx --from mcp-for-blender==2.1.9 mcp-for-blender install-addon`.
  The old PyPI name `blender-mcp` is only a rename shim: do not use it.
- Limits: its README warns that `execute_blender_code` runs any Python in Blender (save first). Safe mode
  blocks risky calls; it is not a sandbox. The README says collecting your content is opt-in and that
  `DISABLE_TELEMETRY` also stops the minimal usage record. The server starts with the plugin, so switch it
  off in `/mcp` when you are not modelling. The terms of its AI generators were not checked (game-look rule 6).

**To enable, not shipped on: Roblox Studio's own MCP server.** It is not in `.mcp.json` because (1) it is
built into Studio, so its version is Studio's and cannot be pinned here; (2) it can read and change the
places you have open (its page: "MCP clients can read and modify content in your open Roblox places. Make
sure to only connect clients you trust."); (3) its docs give a path for macOS and Windows only and do not
mention Linux (create.roblox.com/docs/studio/mcp, read 2026-10-28). Use it on test games only. To enable:
in Studio open Assistant, then "... > Manage MCP Servers", and turn on "Enable Studio as MCP server". Then
add the config for your system to your own MCP settings, for example with `claude mcp add-json Roblox_Studio '<json>'`
(that command exists; this exact call was not run):

```json
{"type": "stdio", "command": "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP"}
```

```json
{"type": "stdio", "command": "cmd.exe", "args": ["/c", "%LOCALAPPDATA%\\Roblox\\mcp.bat"]}
```

The first is macOS, the second Windows; both are the page's own commands (the page names no `type`). `claude -p` loads project
`.mcp.json` servers without asking, so a headless run that must not touch Studio uses `--strict-mcp-config`.

**Not made yet:** the di.iiii agent door (our own MCP server; it is on branches and whether it is merged is
unchecked); the Roblox publish script (Open Cloud) and a safe key store for its API key; fetchers for Poly
Haven, ambientCG, Kenney and Freesound that write the licence row (the research job found no MCP for them).

## Limits, stated

- Studio does not run on Linux officially; on aylmo it depends on Vinegar, which is still being tested. The
  greybox walk, the playtests and the publish need Studio on Windows or macOS.
- The Lune tests cover the pure logic only. The template's services and HUD have not run inside Roblox.
- The Creator Store's terms are unread, so no store asset goes in until they are (game-look).
- The Roblox rules in game-release were read on 2026-10-28 by the research job and change; re-read at release.
- Every skill's name and description sits in every chat's context, so there are eight skills and they are short.
- No evals yet: `claude plugin eval` exists; the skills are checked only by `claude plugin validate` and by
  the new-game test above.

## Layout

```text
plugins/di-games/
  .claude-plugin/plugin.json     name, version 0.1.0
  .mcp.json                      Blender MCP: pinned, safe mode on, telemetry off
  agents/                        game-designer, game-builder, game-verifier, asset-scout
  skills/game-concept/           stage 0
  skills/game-design/            stage 1, with design-template.md
  skills/game-greybox/           stage 2
  skills/game-build-roblox/      stage 3, with scripts/new-game.sh and template/ (the game repo)
  skills/game-build-dii/         stage 3 for di.iiii: a stub
  skills/game-playtest/          stage 4, with the test-plan and session-notes templates
  skills/game-look/              stage 5, with scripts/check_assets.py
  skills/game-release/           stage 6
.claude-plugin/marketplace.json  (repo root) lists the plugin
```

Template files are copied into a game, never linked, so a game keeps working when the plugin changes.

## Owed

The asset scanner: a check that fails when an asset the game uses has no row in `assets.csv` (`rbxassetid://` ids
in `src/`, ids in `Config.SOUNDS`, asset files). Today `check_assets.py` checks only the rows that exist, and the
verifier checks completeness by hand (game-look, gate and step 4). The archive digests of the tools (GitHub's
`digest` of each release zip), so the first install is checked too. A macOS port of `new-game.sh` and
`setup-tools.sh` (GNU `grep` and `sed`, bash 4, a Linux x86_64 download). A runtime test that the builder sees the
Blender tools. The publish script and key store; the Studio MCP hookup once a Studio machine is settled;
`game-build-dii` (waits for the di.iiii parts, and for how a game made in di.iiii relates to a project; the word
"game" is settled, see the vocabulary entry of 2026-10-21); a type-check step in `check.sh`; the asset fetchers;
reading the Creator Store terms and Roblox's IP policy; evals for the skills.
