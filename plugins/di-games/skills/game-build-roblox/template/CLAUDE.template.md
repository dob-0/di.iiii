# __GAME_SLUG__: notes for Claude

This repo is a Roblox game made with the `di-games` plugin
(`claude plugin marketplace add dob-0/di.iiii`, then `claude plugin install di-games@di-iiii`).

- Method and order: the plugin's skills `game-concept`, `game-design`, `game-greybox`, `game-build-roblox`,
  `game-playtest`, `game-look`, `game-release`. Read the skill of the stage you are in.
- The design is `docs/design.md`. Build only what it says. An open pick in its section 5 stops the build.
- Every number is a named value in `src/shared/Config.luau`. Rules are pure modules in `src/shared/logic/` with
  a test in `tests/`; `src/server` and `src/client` stay thin.
- Run `scripts/check.sh` before you hand over. It must end with `ALL CHECKS PASSED`. Quote its last lines.
- The builder never signs off its own work: the `game-verifier` agent does.
- Every asset gets a row in `assets.csv` (source, licence, author, date). CC0 first, CC-BY with credit, NC never.
- Tools run through `scripts/tools.sh` (versions pinned in `rokit.toml`). Install them once with
  `scripts/setup-tools.sh`. Never edit a shell profile.
- Studio is needed only to walk the map and play it. Studio does not run on Linux officially.
- Never run tests detached (`&`, `nohup`, `setsid`). On a hot machine run `di-cool` first, if the machine has it.
