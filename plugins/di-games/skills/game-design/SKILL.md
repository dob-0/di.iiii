---
name: game-design
description: "Stage 1 of the di-games routine. Use once the concept picks are answered, to write the one-page design (rules, numbers, done-when) that the build follows; the owner's yes closes it. Engine-neutral. Starts from design-template.md."
---

# game-design: stage 1, the one-page design

- **Makes:** `docs/design.md` from `${CLAUDE_SKILL_DIR}/design-template.md`, one page.
- **Gate (done when):** the owner says yes to the page.
- **Who:** game-designer.
- **Needs:** `docs/concept-analysis.md` with every pick answered. If a pick is open, stop and return it.

## Method (cited)

- One-page designs: Stone Librande, "One-Page Designs", GDC 2010 (Game Developer's article of 2023-08-08
  confirms a free GDC Vault video from 2010; the exact talk title and the Vault URL were not verified). The
  page is the whole design of the first playable version. If it does not fit one page, v1 is too big.
- The target feelings use the MDA frame (Hunicke, LeBlanc, Zubek, 2004), as in game-concept.
- The design is what the playcentric loop tests against (Fullerton, *Game Design Workshop*, 5th ed., 2024):
  the "done when" list is how stage 4 judges the build.
- The template is modelled on the sections of the first game's "doc 2" (Escape the Haunted School).

## Steps

1. Copy the template to `docs/design.md`. Fill the nine sections in order.
2. Section 3 is a table, one row per part of v1. Every row has a rule and a number. "About", "some" and
   "fast" are not numbers.
3. Draw the plan as plain text, a few lines.
4. Put every unsettled choice in section 5 as a pick with options and a default. The default is what gets
   built if the owner does not choose, and the table says so.
5. Section 6 holds everything that is not v1. Cut hard: v1 is the smallest game that can be won and lost.
6. Section 7 cuts the build into steps, each one something you can play. The greybox is step 1 (stage 2).
7. Section 8, "v1 is done when", is the gate of stages 3 and 4. Each line is one of: a number you can
   measure, a command that passes, or a person's answer that you ask for (never one you assume).
8. Section 9 says what stays from the concept, what moves to later, and what is new.
9. Check before you show it: every number has a name (it becomes one value in `Config` at build time);
   every pick has a default; nothing in section 3 contradicts section 8.
10. Show the page to the owner. After the yes the design is frozen: a change is a new yes, written at the
    top with its date.

## Rules

- The rules hold on every engine. The engine is a pick (section 5), never baked into section 3.
- No look, story or name beyond the concept. Art comes in stage 5.
- An open owner decision stops the build; the builder reads section 5 first.
- One page, plain words, the owner's own words for things.
