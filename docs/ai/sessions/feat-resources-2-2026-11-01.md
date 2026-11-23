## 2026-11-01 — Resources page audit (N1719)

- Owner 01:2x: "there some thing need to fix … check everything yourself". Page rebuilt as plain-word cards (state in words, one plain sentence, proof under "How we know"), "Needs a look", honest pick by job ("not for others", "not checked"), glossary. Model: `plain` field, `STATE_WORDS`, `GLOSSARY`, `notForOthers`, `unchecked`.
- Data (private di-atlas): stale rows fixed, 3 tailnet nodes added.
- Tests: `npx vitest run resourceModel render-resources` — 21 passed. Screenshots light/dark, desk/phone on the agent screen.
- Not done: phone page is still ~13 k px (34 cards); collapse by kind is owed.
