## 2026-10-21 — the wiki's spacing and type sizes use the token scales (audit D03, D27)

- Built on PR #1072's branch (`cloud/pro-sweep-site-wiki-admin-2026-10-21`), which was open and not merged. It edits the same `wiki.css` and `wikiStyles.test.js`.
- `src/wiki/wiki.css`: 28 of 33 spacing declarations had a literal and 0 used `--di-space-*`. Now there are 0 literals and 28 use tokens. Every move is ≤ 2 px except the bottom padding (64 → 48) and the footer margin (56 → 48). Those two use `--di-space-8`, not `--di-space-section-break`: 48 px is nearer, and section-break is documented as studio-hub's one value. Font sizes: 9 of 10 now use `--di-text-*`. The title's `clamp()` is unchanged (owner question) and is named as an exception.
- The three eyebrows are now `var(--di-mono)` at `var(--di-label-tracking)`; their colours are unchanged. Sidebar links lost `opacity: .82`; their hover stays cyan.
- Guard: `src/styles/spine.test.js` no longer exempts `wiki/wiki.css` from the rhythm checks, and `wikiStyles.test.js` checks the eyebrows and links. Against the old CSS, 6 tests fail; with this change all 392 pass across `src/styles` and `src/wiki`.
- Before and after pictures are in `docs/ai/handover/brand-wiki/`. The wiki has no light theme: in the light/dark pairs only the live scene differs.
- Not done: the blur scrim, the title size and case, and the eyebrow and heading colours. These are owner questions.
