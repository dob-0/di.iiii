---
name: game-look
description: "Stage 5 of the di-games routine. Use when art, light and sound go into a playable game. Every asset gets a row in assets.csv with its source and licence: CC0 first, CC-BY with credit, NC never, Roblox Creator Store only after its terms are read. Done when the provenance check passes and light stops at walls."
---

# game-look: stage 5, art, light and sound with provenance

- **Makes:** the game's look, and `assets.csv` (one row per asset).
- **Gate (done when):** `python3 -I scripts/check_assets.py` passes; light stops at walls; the verifier looked.
- **Who:** game-builder with asset-scout; game-verifier signs off.
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
- Sketchfab: download needs a login; most models allow commercial use, so check each model.
- Roblox Creator Store: no licence text on the page read; blocked until the terms are read (rule 4).

## Light and sound on Roblox (limits read 2026-10-28)

- **Light stops at walls.** A lamp's light never shows through a wall, floor or roof. Check it from inside
  and from outside: walk the level, then look at it from outside each area.
- Light types: PointLight, SpotLight, SurfaceLight. A flashlight as a SpotLight is a HYPOTHESIS. Spot
  shadows are cheapest at a narrow angle and point shadows cost most (Roblox staff, DevForum 2020; may be
  old). No documented cap on shadow-casting lights was found. Test on a phone.
- Meshes: at most 20,000 triangles each. Textures up to 4096x4096. PBR maps (SurfaceAppearance) are not
  updated by an Open Cloud publish.
- Sounds sit in `Config.SOUNDS`; an empty `SoundId` is silent. Add an id only with its row in `assets.csv`.

## Steps

1. asset-scout returns candidates with proposed rows (text only, it is read-only).
2. The builder opens each source page, adds the row, then the asset.
3. Run `python3 -I scripts/check_assets.py` and `scripts/check.sh`.
4. The verifier checks a sample of rows against their pages (say how many), looks at the level from
   outside, and plays it on a phone.
