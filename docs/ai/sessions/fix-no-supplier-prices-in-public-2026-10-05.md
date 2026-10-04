## 2026-10-05 — Poligraf's prices out of the public repo

- Owner, 2026-10-05: the rental house's (Poligraf's) prices must not be public. This repo is public, so the
  supplier rates in `scripts/rigbuild/rentals/*.json`, two package rates in the MOXIR versions file and one
  "AMD/day" text in the item library were removed. Prices live in the private di-atlas repo
  (`production/rental-house-2026-09-27.csv`).
- Pages and reports still count everything; where a price was, the equipment page says "price: private".
  On the owner's machine a script can read real prices from `DI_PRIVATE_PRICES` (a csv kept in di-atlas)
  through `scripts/rigbuild/privatePrices.mjs`; `src/` never imports it and nothing packs it.
- Guard: `scripts/rigbuild/noSupplierPrices.test.js` fails if a price field or an AMD amount returns
  (seen failing on the old files).
- Still undone: the dev document `moxir-hall-known-full` holds the same rates in `rig-show` →
  `rentalList` (`items[].rate`, `catalogue[].rate`); that is a data edit for the owner and Emilya. Git
  history and older PR branches still hold the numbers; purging them would need a force-push, the owner's call.
