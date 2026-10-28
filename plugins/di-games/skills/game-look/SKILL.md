---
name: game-look
description: "Stage 5 of the di-games routine. Use when art, light and sound go into a playable game. Every asset gets a row in assets.csv with its source and licence: CC0 first, CC-BY with credit, NC never, Roblox Creator Store only after its terms are read. Done when every asset in the game has a valid row (the check passes and the verifier lists the assets) and light stops at walls."
---

# game-look: stage 5, art, light and sound with provenance

- **Makes:** the game's look, and `assets.csv` (one row per asset).
- **Gate (done when):** `python3 -I scripts/check_assets.py` passes (every row is valid); every asset in the game has a row; light stops at walls; the verifier looked.
- **Who:** game-builder with asset-scout; game-verifier signs off. Blender (the plugin's MCP server) is a tool of game-builder only; if the builder reports that it has no Blender tools, the main session runs the Blender step (README, Agents).
- **Needs:** stage 3 passed. The concept's own pictures are the target look. Do not replace them with a template look.

## The provenance file, `assets.csv`

Columns, in this order: `id,file,source_url,licence,author,date,how_used`

- `id`: a short unique name, for example `snd-door-creak-01`.
- `file`: the path in the repo; for a Roblox store asset, `roblox:<asset id>`.
- `source_url`: the page the asset came from, opened by you.
- `licence`: one of `CC0-1.0`, `CC-BY-4.0`, `CC-BY-3.0`, `own`, `roblox-creator-store`.
- `author`: the creator as the source names them. Empty is an error.
- `date`: `YYYY-MM-DD`, the day the licence was read.
- `how_used`: where in the game.

`scripts/check_assets.py` (copied into each game by `new-game.sh`) checks the header, every field, the
allowed licences, that files exist, and the rules below. `scripts/check.sh` runs it.

It checks the rows that exist. It cannot see an asset that has no row: a file with only the header passes with
`0 row(s)`. So "every asset in the game has a row" is a gate line of its own, checked by the verifier by hand
(step 4 below) until the scanner exists (README, Owed).

## The licence rules

1. **CC0 first.** Look for CC0 before anything else.
2. **CC-BY needs credit.** The author is required in the row, and the credit goes in the game's credits.
3. **NC never.** Any NonCommercial licence is out, even for a free game. The check refuses it.
4. **Roblox Creator Store assets only after its terms are read.** The terms page answered 404 when the
   research job tried (2026-10-28), so they are unread. The check refuses `roblox-creator-store` rows until
   `docs/creator-store-terms-read.md` exists (who read, which URL, which date, what it says). A store asset
   may carry scripts: read and disable them. Record its asset id and creator.
5. **Read the licence on the asset's own page, today.** Not from memory, not from a search snippet.
6. **AI-generated assets** (the Blender MCP generators): their terms were not checked. Do not use one until
   a note in `docs/decisions/` records the terms and the date.

## Sources, as the research job found them (2026-10-28; check each asset's own page)

- Poly Haven: all CC0, commercial use ok, no credit needed (polyhaven.com/license). Its API has separate
  terms, not read. No scraping.
- Kenney: game assets CC0, commercial use ok, the logo is reserved (kenney.nl/support).
- ambientCG: the API answers but has no licence field and the licence page gave 404. "CC0" is from memory
  and UNCHECKED: read each asset's page.
- Freesound: each sound is CC0, CC-BY (credit) or CC-BY-NC (not for us) (freesound.org/help/faq). Filter by licence.
- Sketchfab: end users must be able to log in to download, and "Most models allow commercial use" (sketchfab.com/developers/download-api, read 2026-10-28), so check each model's own licence.
- Roblox Creator Store: no licence text on the page read; blocked until the terms are read (rule 4).

## Light and sound on Roblox (limits read 2026-10-28)

- **Light stops at walls.** A lamp's light never shows through a wall, floor or roof. Check it from inside
  and from outside: walk the level, then look at it from outside each area.
- Light types: PointLight, SpotLight, SurfaceLight. A flashlight as a SpotLight is a HYPOTHESIS.
  UNCHECKED: that spot shadows are cheapest at a narrow angle and point shadows cost most. The research job's only
  source was a 2020 DevForum post by Roblox staff, which was not re-read. The Creator Hub pages for global lighting
  (create.roblox.com/docs/environment/lighting) and for the Light class
  (create.roblox.com/docs/reference/engine/classes/Light), read 2026-10-28, say nothing on the cost of shadows or a cap
  on shadow-casting lights. Test on a phone.
- Meshes: "Individual meshes can not exceed 20,000 triangles" (create.roblox.com/docs/art/modeling/specifications,
  "Geometry", read 2026-10-28). Textures: the page create.roblox.com/docs/art/modeling/texture-specifications (read
  2026-10-28) says Roblox supports texture resolutions up to 4096x4096 (4K) and gives 1024x1024 for UV texture maps,
  so read it before you author. A place publish through Open Cloud does not update SurfaceAppearance instances
  (create.roblox.com/docs/cloud/open-cloud/usage-place-publishing, "Limitations", read 2026-10-28).
- Sounds sit in `Config.SOUNDS`; an empty `SoundId` is silent. Add an id only with its row in `assets.csv`.

## Steps

1. asset-scout returns candidates with proposed rows (text only, it is read-only).
2. The builder opens each source page, adds the row, then the asset.
3. Run `python3 -I scripts/check_assets.py` and `scripts/check.sh`.
4. The verifier lists every asset the game uses: asset files in the repo, every `rbxassetid://` id in `src/` and `map/`,
   every id in `Config.SOUNDS`. Each one needs a row. Say how many were listed and how many rows match.
5. The verifier checks a sample of rows against their pages (say how many), looks at the level from
   outside, and plays it on a phone.
