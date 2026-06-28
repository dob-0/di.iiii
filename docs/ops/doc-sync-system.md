# Documentation Sync System

Keeps every "connected point" that describes the product in lockstep when behavior changes:
the in-app help, the landing page, the README, the AI knowledge base, and the GitHub-facing
instruction files. The goal is that a single authored change propagates (or is *forced* to
propagate) to every surface a human or visitor reads.

## The hard truth

Fully-automatic doc generation from code is not reliable — no script or model can read intent
from a diff and write a correct help article. So this system is **not** a generator. It is a
**consistency gate** plus an **authoring reminder**, mirroring the already-proven `docs:ai:check`
pattern. Drift is made *un-mergeable* and *un-ignorable*, not magically fixed.

## Surfaces (connected points)

| Surface | What it is | Who authors | Enforcement |
| --- | --- | --- | --- |
| `src/wiki/wikiContent.js` | in-app `/wiki` help **and** landing teaser — single source of truth for user-facing docs | human / agent | `docs:wiki:check` (Tier 1) |
| `src/landing/LandingPage.jsx` | landing highlights | **derived** from `WIKI_HIGHLIGHT_IDS` | cannot drift (imports the source) |
| `README.md` | durable repo front door (keeps the Evergreen Rule — no feature dumps) | human / agent | must reference the wiki source |
| `AGENTS.md` + `docs/ai/**` | AI knowledge base | human / agent | `docs:ai:sync` + `docs:ai:check` |
| `.github/copilot-instructions.md`, `.github/instructions/**` | GitHub / Copilot guidance | generated bridges | `docs:ai:check` |
| `CURRENT.md`, `PROGRESS.md` | session state + handoff | human / agent (recap) | manual / golden-rules |

## Tiers

### Tier 1 — Consistency gate (deterministic, CI-enforced, free)

- `scripts/wiki-sync-lib.mjs` — pure `collectWikiSyncErrors(...)`; unit-tested in `src/wiki-sync.test.js`.
- `scripts/check-wiki-sync.mjs` — CLI wrapper (`npm run docs:wiki:check`). Verifies:
  - every article has required fields, a known category, a valid `YYYY-MM-DD` `updated`, ≥1 tag, a well-formed body;
  - ids are unique kebab-case;
  - every `WIKI_HIGHLIGHT_IDS` entry resolves to a real article (previously a typo silently vanished from the landing via `.filter(Boolean)`);
  - `README.md` still points at `src/wiki/wikiContent.js`;
  - no private-host strings leak into shipped wiki text.
- Wired into `.github/workflows/ci.yml` (after `docs:ai:check`) and the CURRENT.md Validation block.

### Tier 2 — Authoring reminder (judgment, session-time, free)

Claude Code hooks in `.claude/settings.json`:
- editing `src/wiki/wikiContent.js` → runs `docs:wiki:check` immediately (blocks on failure);
- editing a user-facing surface (`src/{studio,beta,landing,project,wcc}`, serverXR routes) → prints a
  reminder to update the wiki article + bump its `updated` date.

This is the "after we change behavior, update the docs" enforcement. A deterministic script cannot
know a feature's meaning changed; the agent in-session can.

### Tier 3 — Cloud catch-all (optional, not built)

A GitHub Action running a Claude agent on PRs to draft wiki/README updates for commits made
*outside* a Claude session (human / Copilot). Costs API and is the heaviest layer — deferred until
Tiers 1–2 prove out. Adding it later requires no change to Tiers 1–2; it just calls the same gate.

## Adding or changing a user-facing feature

1. Edit `src/wiki/wikiContent.js`: add/update the article, bump `updated`. Add its id to
   `WIKI_HIGHLIGHT_IDS` if it belongs on the landing page.
2. Run `npm run docs:wiki:check` (the hook does this automatically on save).
3. The landing page and `/wiki` update themselves (they import the source).
4. README only changes if a *durable* fact changed — keep feature detail in the wiki, per the
   README Evergreen Rule.
