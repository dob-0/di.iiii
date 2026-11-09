## 2026-11-09 — "Ask di": a question box on the Wiki that answers from our own public pages, and a /support page

Owner's plan row 4.5 ("the terminal is too much for some"; yes to "start 'ask di' on the site as a branch"): one web way to ask without a terminal.

### What we already had (checked on origin/dev 7574c4be3)
- The site is this repo: `src/` builds diiii.xyz (vite), `/wiki` holds 139 articles (`src/wiki/wikiContent.js`) with a plain substring filter; `docs/ai/public/*.md` is served at `/ai/*.md`; `scripts/sitemap.mjs` writes the sitemap at build; `public/robots.txt` and `llms.txt` exist.
- `src/components/ui/AskDialog.jsx` is a yes/no confirm box, not a question box. Not reused.
- Missing: a way to ask in a sentence; and `/support`, which the landing nav and footer link to and `.github/FUNDING.yml` names, opened nothing.

### What this branch adds
- `src/askdi/`: `askIndex.js` (public text cut into passages, operator-only articles left out, `scanForSecrets`), `askSearch.js` (MiniSearch 7.2.0, MIT, pinned; stop words and a light stemmer; returns the best 3 pages with the matching sentence and a link), `askSources.js` (wiki + `/ai/about.md`, `/ai/words.md`, `/ai/setup` + the support text), `AskDi.jsx` + `askdi.css`. No server call, no model, no key: the question never leaves the page.
- `/support` page (`SupportPage.jsx`, `supportContent.js`): four ways to help. The GitHub Sponsors link is a placeholder (`SPONSORS_URL = null`, the owner picks the account); the page says the account is being opened. `/support` is reserved in `spaceRouting.js`, listed in the sitemap and in `llms.txt`.
- Wiki article `ask-di` (user-facing change, `updated` 2026-11-09).
- Not done here: `.github/FUNDING.yml` still names `polar: di-iiii`, which answers 404 (checked 2026-11-09); it is the owner's file to change once the Sponsors account exists.

### Look spec (UI from brand, not taste — di-brand SYSTEM.md rules 1-6 read first)
- Where: inside the Wiki header, under the existing "Search the wiki" field. Not on the landing (its hero is designed art; the nav already links to the Wiki).
- Words: title "Ask di" (mono, uppercase, tracked .14em, eyebrow scale); button "Ask"; four example questions; empty answer says what to do next. Vocabulary words only (space, project, scene).
- Colour: tokens from `src/styles/base.css` only: `--di-black` ground, `--di-cyan-wash` fill, `--di-cyan-border` line, `--di-cyan` only for focus and the page link (it marks meaning, rule 1).
- Shape: `border-radius: 0` everywhere, 1px lines, no shadow or glow, focus = 2px cyan outline (rule 3), transitions name border-color and background-color at 0.12s (rule 6). Buttons 44px high on touch.
- Phone: stacks, the Ask button takes the full row under 640px.

### Public-data rule
Only text a visitor can already read: the Wiki, public `/ai/*.md`, the support text. Excluded: admin-manage, admin-estate, agents-board, dev-copy-label; never the ledger, memory, `.env`, private spaces. Checked by `scanForSecrets` (unit test, proven on bad samples) and gitleaks over the built index JSON.
