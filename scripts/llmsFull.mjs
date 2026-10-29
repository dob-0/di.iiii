/**
 * /llms-full.txt — llms.txt and the whole wiki in one plain-text file (gap G54).
 *
 * The llms.txt proposal names llms-full.txt as the optional companion: the same
 * index, followed by the text itself, so a program can read the site in one
 * fetch instead of crawling a single-page app whose articles exist only after
 * JavaScript runs. Generated at build time from the two sources it repeats —
 * docs/ai/public/llms.txt and src/wiki/wikiContent.js — so it cannot drift from them.
 * Nothing is written by hand here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// The one public address (owner, 2026-10-21) — the same one llms.txt links.
export const PUBLIC_ORIGIN = 'https://diiii.xyz'

const blockText = (block) => {
    if (typeof block === 'string') return block
    if (Array.isArray(block?.list)) return block.list.map((item) => `- ${String(item)}`).join('\n')
    throw new Error(`llms-full: a wiki block is neither a paragraph nor a list: ${JSON.stringify(block)}`)
}

export const renderLlmsFull = ({ llms, categories, articles, origin = PUBLIC_ORIGIN }) => {
    const known = new Set(categories)
    for (const article of articles) {
        // An article under a category the wiki does not list would be left out
        // of the file silently; refuse instead.
        if (!known.has(article.category)) {
            throw new Error(`llms-full: wiki article "${article.id}" is in an unknown category "${article.category}"`)
        }
    }
    const out = [llms.trimEnd(), '', '## Wiki, in full', '', `Every article of ${origin}/wiki, grouped as the wiki groups them.`]
    for (const category of categories) {
        const inCategory = articles.filter((article) => article.category === category)
        if (!inCategory.length) continue
        out.push('', `### ${category}`)
        for (const article of inCategory) {
            out.push('', `#### ${article.title}`, '', `${origin}/wiki#${article.id} · updated ${article.updated}`, '', article.summary)
            for (const block of article.body) out.push('', blockText(block))
        }
    }
    return `${out.join('\n')}\n`
}

/** Vite plugin: emits llms-full.txt into the build, beside llms.txt. */
export const llmsFullPlugin = ({ rootDir }) => ({
    name: 'emit-llms-full',
    apply: 'build',
    async generateBundle() {
        const llms = fs.readFileSync(path.join(rootDir, 'docs/ai/public/llms.txt'), 'utf8')
        const { WIKI_CATEGORIES, WIKI_ARTICLES } = await import(pathToFileURL(path.join(rootDir, 'src/wiki/wikiContent.js')).href)
        this.emitFile({
            type: 'asset',
            fileName: 'llms-full.txt',
            source: renderLlmsFull({ llms, categories: WIKI_CATEGORIES, articles: WIKI_ARTICLES })
        })
    }
})
