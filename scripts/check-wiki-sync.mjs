// Consistency gate for the user-facing documentation surfaces driven by the in-app Wiki.
// Fails (exit 1) when src/wiki/wikiContent.js is internally inconsistent, when a landing
// highlight points at a missing article, or when README stops pointing at the wiki source.
//
// This is the deterministic half of the doc-sync system (docs/ops/doc-sync-system.md).
// The judgment half — "did the wiki get updated when user-facing behavior changed?" —
// is handled by the Claude hooks in .claude/settings.json, not here.
import fs from 'node:fs/promises'
import path from 'node:path'
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

    if (errors.length) {
        console.error('Wiki / user-facing doc checks failed:')
        errors.forEach((error) => console.error(`- ${error}`))
        process.exit(1)
    }

    console.log(`Wiki / user-facing doc checks passed (${WIKI_ARTICLES.length} articles, ${WIKI_HIGHLIGHT_IDS.length} highlights).`)
}

await main()
