---
name: game-build-dii
description: "Stage 3 of the di-games routine for a di.iiii target. A stub: the di.iiii parts it needs are planned, not built. Use only to find the parts plan and its order. Build nothing from it yet; build on Roblox with game-build-roblox."
---

# game-build-dii: stage 3 in di.iiii (stub)

Status: **stub. Do not use this skill to build.**

The parts plan, "Escape the Haunted School in di.iiii: the parts plan" (draft of 2026-10-28, ledger N1424 and
N1429, facts from `di-iiii-route.md`, a research-job file that is not in this repo, at dev `bfc508bf0`), lists seven parts. The plan lists all seven as still
to build; this stub did not check that against the code. In di.iiii a **project** is one thing made inside a **space**;
the place you walk in is its **scene**; each new ability is a **part** that loads only in projects that
use it (`docs/ai/vocabulary.md`; the Lego decision, di-atlas `decisions/2026-09-28-lego-core-and-parts.md`).
Nothing is made for one game alone: every part works for any project.

| # | Part | What it does | Size |
|---|---|---|---|
| 1 | Head light | A flashlight that follows your view in walk mode | S |
| 2 | Solid walls | Walk mode stops at walls and follows floors, from the scene's own models | M |
| 3 | Sound on event | A node plays a one-shot sound at an object | S-M |
| 4 | Things you can use | Pick up, lock, open; each visitor carries what they picked up | L |
| 5 | Rules | Win, lose and rounds on the existing timer and counter nodes; counters on screen | M |
| 6 | Walker | A character that walks the scene: patrol, follow, search; needs a measured trial of a navmesh library | L |
| 7 | Shared play | One state for everyone in the project at once, on the existing socket.io server | L |

How each part lands (from the plan): its own branch and PR, with tests, a test copy link, and before and
after pictures (light and dark theme). Light parts also pass the physics check (light stops at walls). Each is
measured on a phone. It merges through the owner's merge window. Parts 1 and 2 start first, because every
walk in di.iiii gains from them; parts 3 to 7 follow what the Roblox playtests teach.

Open in the plan: which space holds the game, and how a game made in di.iiii relates to a project. The word is not
open: "game" is defined (`docs/ai/vocabulary.md`, amended 2026-10-21: "An app made to be played. A type of app, never a
separate thing"). Use it as defined.

Until the parts exist, use `game-concept`, `game-design` and `game-playtest` as they are (they are
engine-neutral), and build on Roblox with `game-build-roblox`.
