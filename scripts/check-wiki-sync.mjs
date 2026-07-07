// Consistency gate for the user-facing documentation surfaces driven by the in-app Wiki.
// Fails (exit 1) when src/wiki/wikiContent.js is internally inconsistent, when a landing
// highlight points at a missing article, or when README stops pointing at the wiki source.
//
// This is the deterministic half of the doc-sync system (docs/ops/doc-sync-system.md).
// The judgment half — "did the wiki get updated when user-facing behavior changed?" —
// is handled by the Claude hooks in .claude/settings.json, not here.
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { collectWikiSyncErrors } from './wiki-sync-lib.mjs'
import {
    WIKI_ARTICLES,
    WIKI_CATEGORIES,
    WIKI_HIGHLIGHT_IDS
} from '../src/wiki/wikiContent.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const forbiddenPatterns = [
    /distudio@di-studio\.xyz/i,
    /\/home\/distudio\//i
]

const readFileSafe = async (relativePath) => {
    try {
        return await fs.readFile(path.join(repoRoot, relativePath), 'utf8')
    } catch {
        return null
    }
}

// Freshness: if user-facing surfaces changed well after the newest wiki
// `updated:` date, the "ship the feature, update the wiki in the same change"
// rule was skipped. Uses git commit dates, so it runs where history exists
// (local + pre-push gate) and skips silently in shallow CI checkouts.
const FRESHNESS_GRACE_DAYS = 7
const USER_FACING_PATHS = ['src/studio', 'src/wcc', 'src/landing', 'src/project', 'src/beta', 'serverXR/src/routes']

const collectFreshnessErrors = (articles) => {
    let lastCode
    try {
        const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...USER_FACING_PATHS], { cwd: repoRoot, encoding: 'utf8' }).trim()
        if (!out) return []
        lastCode = new Date(out)
        // Shallow clones truncate history; a lone grafted commit makes the date unreliable.
        const depth = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
        if (Number(depth) < 10) return []
    } catch {
        return []
    }
    const lastWiki = articles
        .map((article) => new Date(article.updated || 0))
        .reduce((max, date) => (date > max ? date : max), new Date(0))
    const gapDays = Math.floor((lastCode - lastWiki) / 86_400_000)
    if (gapDays > FRESHNESS_GRACE_DAYS) {
        return [
            `wiki freshness: user-facing code last changed ${lastCode.toISOString().slice(0, 10)} but the newest wiki article is dated ${lastWiki.toISOString().slice(0, 10)} (${gapDays} days behind, grace ${FRESHNESS_GRACE_DAYS}). Update the relevant src/wiki/wikiContent.js article (bump its updated date) or confirm nothing visitor-facing changed.`
        ]
    }
    return []
}

const main = async () => {
    const errors = collectWikiSyncErrors({
        articles: WIKI_ARTICLES,
        categories: WIKI_CATEGORIES,
        highlightIds: WIKI_HIGHLIGHT_IDS
    })

    // README must keep pointing humans/agents at the in-app wiki as the user-facing source.
    const readme = await readFileSafe('README.md')
    if (readme === null) {
        errors.push('README.md is missing.')
    } else if (!/src\/wiki\/wikiContent\.js/.test(readme)) {
        errors.push('README.md no longer references src/wiki/wikiContent.js as the user-facing doc source.')
    }

    // No private-host leakage in the wiki text that ships to visitors.
    const wikiSource = await readFileSafe('src/wiki/wikiContent.js')
    if (wikiSource) {
        for (const pattern of forbiddenPatterns) {
            if (pattern.test(wikiSource)) {
                errors.push(`src/wiki/wikiContent.js contains a forbidden private-host pattern: ${pattern}`)
            }
        }
    }

    errors.push(...collectFreshnessErrors(WIKI_ARTICLES))

    if (errors.length) {
        console.error('Wiki / user-facing doc checks failed:')
        errors.forEach((error) => console.error(`- ${error}`))
        process.exit(1)
    }

    console.log(`Wiki / user-facing doc checks passed (${WIKI_ARTICLES.length} articles, ${WIKI_HIGHLIGHT_IDS.length} highlights).`)
}

await main()
