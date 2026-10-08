## 2026-10-07 — cards are laid out from their real heights, not an assumed one

- A production's project (di-atlas production-new) put its cards in rows at a fixed y; the product alone knows a card's height (cardGeometry.js: header, ports, wrapped lines, or the size a person gave it). On the MOCT project the Pricing card is 580 tall and covered Across the night (owner, ledger N146/N164).
- New `src/raw/utils/cardRows.js` (`separateCards`, `coveredPairs`): moves a card down only when it covers one above, from real boxes; columns and order kept; a clean layout is unchanged. `scripts/separate-cards.mjs` runs it on a document and prints the moves (writes nothing).
- Test: `src/raw/utils/cardRows.test.js`. The editor does not move stored cards by itself; only tools call this. Still owed: apply the new positions to the hayfilm MOCT project on dev (the owner's cards there were already moved by hand).
