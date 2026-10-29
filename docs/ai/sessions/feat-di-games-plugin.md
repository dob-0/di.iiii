## 2026-10-28 — di-games plugin v0.1.0: the games framework from concept to game

- Added `plugins/di-games`, a Claude Code plugin, and the repo-root `.claude-plugin/marketplace.json` that lists it. Install: `claude plugin marketplace add dob-0/di.iiii`, then `claude plugin install di-games@di-iiii`.
- Eight skills: `game-concept`, `game-design`, `game-greybox`, `game-playtest`, `game-release` (the method, one per stage), `game-build-roblox` (with the repo template and `new-game.sh`), `game-build-dii` (a stub: the di.iiii parts are not built), `game-look` (with the asset provenance check).
- Four agents: `game-designer` (Opus), `game-builder` (Sonnet), `game-verifier` (Opus, fresh context, signs off or sends back), `asset-scout` (Haiku, read-only).
- MCP: `.mcp.json` ships only Blender MCP, pinned `mcp-for-blender==2.1.9`, safe mode on, telemetry off. Roblox Studio's own MCP is documented as "to enable" in the plugin README (it ships with Studio, so it cannot be pinned, and the docs list no Linux path).
- The template is the first game's toolchain (Escape the Haunted School, `~/work/haunted-school`, checks green at its commit 30c648d) made generic. Design and method come from the games framework draft (ledger N1430, N1434).
- Still undone: the Roblox publish script and the safe key store for the API key; the Roblox Studio MCP hookup (Studio on Linux is unproven); Creator Store terms are unread, so no store asset goes in; `game-build-dii` waits for the di.iiii parts; the template's services and HUD have not run inside Roblox; Rokit setup supports Linux x86_64 only.
