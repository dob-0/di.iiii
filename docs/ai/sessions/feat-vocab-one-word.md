# One word, one meaning — the vocabulary pass lands (plan Phase 0)

## Provenance

Authored by the dob-88 vocabulary session (four commits, cb382339..10dbb9c2,
including the Kiosk decision), stranded un-pushed on the main checkout's
local dev when that session moved on. Recovered by fetching from
/home/dob/di.iiii (read-only), merged onto origin/dev after the Phase-1
defect wave (#196–#202), reviewed in full as the owner's requested
"check and collab look".

## What it is

docs/ai/vocabulary.md — the dictionary (space, project, canvas, node,
object, scene, page, Studio; banned: Raw, Beta, desk, chrome, workspace,
entity, Universe, lane, surface…; British spelling; bare-noun labels) —
enforced by src/copyVocabulary.test.js which FAILS THE BUILD when a banned
word reaches a user-visible string. Node labels settled: universe.world
World → Scene, universe.space Universe → Kiosk (not Container — Geo already
took that word), Color → Colour, palette command Room → Full screen (a
command and a node type were about to answer to one word), Show Chrome →
Show the toolbar. ~200 user-visible strings reworded across 85 files; ids,
op names, routes and CSS untouched by design.

## Merge resolutions (this session)

surfaceWorkflow.js/.test.js deletion in dev wins (guard's COPY_FILES row
dropped); rawGuide.js + RawHelpDialog take dev's post-#200 rewrite with
dictionary re-applied (aria-label "Raw help" → "Help", guide copy aligned to
the Full screen command); wikiContent conflict resolved keeping the
vocabulary wording plus #202's objects-at-root sentence reworded to the
dictionary; nodeAnatomy.generated.js regenerated, never hand-merged.

## Verified

By eye (screenshot read): Scene kicker + topbar, Colour card and port,
Kiosk and Full screen in the palette. copyVocabulary 10/10, full suite
2471/2471 (one known server-contract flake passed on rerun), lint equal to
dev baseline (18), build, anatomy, wiki (40 articles), docs checks green.
