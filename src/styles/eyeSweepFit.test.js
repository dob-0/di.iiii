import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Eye sweep 2026-11-19: scripts/check-box-escape.mjs found two boxes that ran out of
// their own cell. The cause in both is a grid/flex track that sizes to its content.
const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(resolve(HERE, rel), 'utf8')
const block = (css, selector) => {
    const at = css.indexOf(`${selector} {`)
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}

describe('eye sweep fit rules', () => {
    it('/wiki phone layout: the single column may shrink (article was 37 px past the window at 390 px)', () => {
        const wiki = read('../wiki/wiki.css')
        const phone = wiki.slice(wiki.indexOf('@media (max-width: 800px)'))
        expect(phone).toMatch(/\.wiki-layout\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    })
    it('/wiki content column and article may shrink to the window', () => {
        const wiki = read('../wiki/wiki.css')
        expect(block(wiki, '.wiki-content')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
        expect(block(wiki, '.wiki-article')).toMatch(/overflow-wrap:\s*anywhere/)
    })
    it('/tools card head: the "where" label shrinks and the head wraps (label ran 15 px past the card at 700 px)', () => {
        const kit = read('../kit/kit.css')
        expect(kit).toMatch(/\.kit-head \{ display: flex; flex-wrap: wrap;/)
        const where = block(kit, '.kit-where')
        expect(where).not.toMatch(/flex-shrink:\s*0/)
        expect(where).toMatch(/min-width:\s*0/)
    })
})
