---
name: game-greybox
description: "Stage 2 of the di-games routine. Use when the design is approved and the map must exist as plain blocks with the core loop playable and no art. Done when one round can be won. The builder makes it; a separate verifier signs it off."
---

# game-greybox: stage 2, plain blocks and the core loop

- **Makes:** the map as plain blocks, and the core loop as pure logic with tests. No art, no sound.
- **Gate (done when):** one round can be won: played from the spawn to the win, with the time written down.
- **Who:** game-builder makes it; game-verifier checks it and signs off.
- **Needs:** an approved `docs/design.md`, and every pick that its sections 3, 7 and 8 depend on answered.

## Method (cited)

- Prototype the cheapest thing that can be played and tested, then playtest it (the playcentric loop;
  Fullerton, *Game Design Workshop*, 5th ed., CRC Press, 2024, where a paper prototype is fine). Plain grey
  blocks are that prototype for an area. Art comes later (stage 5), so that stage 4 judges the rules and
  not the look.
- Rules live in pure logic with no engine calls, so they can be tested without the engine; the engine code
  stays thin. This is the pattern of `game-build-roblox`.

## Steps (Roblox; for di.iiii see game-build-dii)

1. Read design sections 3, 7 and 8. If a pick they depend on is open, stop and return it.
2. Write the plan in `map/plan.json`: areas with corners, walls, doors, the spawn, zones and markers. Sizes
   come from the design's numbers; every number also gets a name in `src/shared/Config.luau`.
3. Run `python3 -I scripts/gen_greybox.py`. It checks the plan first and stops on a mistake (a door that is
   not on a wall, a spawn outside every area). Commit `plan.json` and the generated files together.
4. Write the core loop as pure logic in `src/shared/logic/`, with its tests in `tests/`, test first. The first
   loop is the round: wait, run, win or lose, next round.
5. Add the thin service and the screen counters that connect the logic to the engine. Nothing else.
6. Run `scripts/check.sh`. It must end with `ALL CHECKS PASSED`. Quote its last lines in the hand-over.
7. Walk it in Studio with Rojo (`scripts/tools.sh rojo serve`, then Connect in the Studio plugin). A person
   or the verifier plays one round and writes down: seconds from spawn to goal, whether the round was won,
   whether it was lost on time. Studio runs on Windows and macOS; on Linux it is unproven (Vinegar). If no
   Studio is at hand, write "walk not done" and the gate stays open.
8. Hand to the verifier: the commit, the check output, what was walked and what was not.

## What the verifier looks at

- The gate as measured: a won round with its time, against the design's numbers.
- The check output, run again by the verifier, not copied from the builder.
- No art and no sound slipped in. No design number changed (a change goes back to the designer).

## Rules

- The builder never signs off its own work.
- An open owner decision stops you. A design number that looks wrong is a question to the designer, not a fix.
- Grey means grey: one plain light per area so the level can be walked, nothing for looks.
