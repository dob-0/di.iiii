# Space blurbs — drafts for the owner to read (2026-10-21)

**Status: DRAFT. Nothing below is on any tier.** These are the lines a space's
"One line for visitors" field (added on branch `cloud/mkt-second-click-2026-10-21`,
audit row G23) would carry. Each was written from what the repo already says,
with the source named; none is invented. They go live only when the owner (or
Emilya) reads them and sets them, in Studio (`/spaces` → Manage → One line for
visitors) or by declaring `blurb` in a space's `di-space.space.json`
(`scripts/space-sync.mjs` now reconciles it).

Limit: 160 characters, one line (`shared/spaceBlurb.cjs`). The count column is
characters as JavaScript counts them (`String.length`).

| space | draft line | chars | from |
|---|---|---|---|
| open | The room anyone can build in. Walk in, put something down, and leave it for whoever comes next. | 95 | spaces/open/di-space.space.json (note) |
| network | Everyone who makes di.iiii: 65 people, each with a room of their own. | 69 | spaces/network/people.json (65 entries) |
| wcc | WCC: Women Creating Change. Artworks made from personal experience, shown as an exhibition you can walk through. | 112 | src/wiki/wikiContent.js (WCC article) |
| br_id_ge | կամուրջ, a bridge: cross it, be read into Armenian letters, answer one question, leave a chrome core. Notations #2, 2026. | 121 | src/wiki/wikiContent.js (br_id_ge article) |
| beyond-form | Beyond Form: an exhibition from Gyumri, and the open call it was gathered by. | 77 | docs/ai/known-fixes.md, docs/ai/golden_rules.md (open-call template) |
| algovrithm | algovrithm: a WebXR piece by Emilya Nikoghosyan, shown at Notations #2, State Philharmonia of Armenia, 2026. | 108 | src/wiki/wikiContent.js; spaces/network/people.json |
| dilijan (English) | Rooms children aged 10 to 17 built on their own phones at a hosq day camp in Dilijan, August 2026. | 98 | src/wiki/wikiContent.js; docs/architecture/PROJECTION_MAPPING.md; PROGRESS.md (camp day 2 = 2026-08-26) |
| dilijan (Armenian, FIRST) | Սենյակներ, որ 10–17 տարեկան երեխաները կառուցել են իրենց հեռախոսներով hosq-ի ցերեկային ճամբարում, Դիլիջան, օգոստոս 2026։ | 119 | the English line above, translated — NOT checked by a native speaker |
| azd | ազդ \| azd: a piece and the essay beside it, made in di.iiii Studio. | 67 | PROGRESS.md (title, essay); spaces/azd/di-space.space.json — thin, see below |
| platform-recordar | RecordAR: mentored at Import Export, Munich, October 2025. | 58 | spaces/network/people.json — thin, see below |
| cascade | Cascade Club: Yerevan's Cascade of the 1990s, rebuilt to walk through in VR, 2025. | 82 | spaces/network/people.json |
| the-light-put-back | 14 laser photographs by Davit Nersisyan from MOCT × MECHATRONICA, each taken apart into the algorithm that drew it. | 115 | spaces/the-light-put-back/README.md |

## What a reader must check

- **Dilijan, Armenian first** (the audience is Armenian, audit row G24). The
  Armenian line is a translation of the English one and has **not** been read
  by a native speaker. Do not set it until Emilya (or the owner) has.
- **Dilijan, the numbers.** The wiki says five children built rooms; the live
  copy holds 19 projects (`docs/research/2026-09-16-spaces-audit.md`). The line
  names neither number on purpose. The credits line naming Green Rock
  Foundation × hosq and Apicius School needs their yes and their wording:
  nothing in the repo names either, so no draft is given.
- **azd** and **RecordAR** are thin: the repo says almost nothing about what
  they are. The owner should replace both lines rather than approve them.
- **algovrithm** cannot open as a space (CURRENT.md: the work owns that
  address before any space lookup), so its line will show on its card but the
  card's door is the work.
- **the-light-put-back** names a photographer (Davit Nersisyan); confirm he is
  happy to be named on a share card.
- The audit counted 11 public cards, 10 without a line; this table drafts all
  of the public spaces the sitemap lists, so one may already have a line on
  prod. Keep whichever the owner prefers.
