import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { WIKI_ARTICLES } from '../wiki/wikiContent.js'
import { buildPassages, scanForSecrets, markdownPassages, ASK_EXCLUDED_IDS } from './askIndex.js'
import { createAsk, terms } from './askSearch.js'
import { ASK_DOCS, askPassages } from './askSources.js'
import { SUPPORT_PASSAGES } from '../pages/supportContent.js'

const passages = askPassages()
const ask = createAsk(passages)

// Questions a person with no terminal would type, each with the page that
// answers it (taken from the real wiki ids / public pages). Not tuned to the
// engine: written first from the articles' titles and summaries.
export const QUESTIONS = [
    ['How do I join a space someone invited me to?', '/wiki/joining-a-space'],
    ['What is di.iiii?', '/ai/about.md'],
    ['How can I support the work with money?', '/support'],
    ['Is di.iiii open source and what is the licence?', '/wiki/license-and-openness'],
    ['Can I sign in with my Google account?', '/wiki/sign-in-anywhere'],
    ['How do I publish my space so others can see it?', '/wiki/publishing'],
    ['What can an AI assistant read on di.iiii?', '/wiki/for-apps'],
    ['How do I connect Claude to di.iiii?', '/wiki/connect-your-assistant'],
    ['Where do I find the Algovrithm artwork?', '/wiki/algovrithm'],
    ['How do I use my own domain name for a space?', '/wiki/space-own-domain'],
    ['How do I move around the scene with the keyboard?', '/wiki/studio-keyboard'],
    ['What happens when I delete a space? Can I get it back from the trash?', '/wiki/delete-a-space-and-the-trash'],
    ['Do I have to install anything to use it on my phone?', '/wiki/joining-a-space'],
    ['How does projection mapping work?', '/wiki/projection-mapping'],
]

describe('Ask di search', () => {
    it('puts the right page in the top 3 for at least 12 of 14 real questions', () => {
        const misses = []
        for (const [q, url] of QUESTIONS) {
            const got = ask.ask(q, 3).map((r) => r.url)
            if (!got.includes(url)) misses.push({ q, want: url, got })
        }
        const hit = QUESTIONS.length - misses.length
        console.info('ask-di top-3 hits', hit, 'of', QUESTIONS.length)
        if (misses.length) console.warn('ask misses', JSON.stringify(misses, null, 1))
        expect(hit).toBeGreaterThanOrEqual(12)
    })

    it('answers nothing for a nonsense question and for an empty one', () => {
        expect(ask.ask('')).toEqual([])
        expect(ask.ask('the of and')).toEqual([])
        expect(ask.ask('zxqvk wplmn')).toEqual([])
    })

    it('every answer has a link that is a path on our site and a snippet', () => {
        for (const [q] of QUESTIONS) {
            for (const r of ask.ask(q, 3)) {
                expect(r.url.startsWith('/')).toBe(true)
                expect(r.snippet.length).toBeGreaterThan(10)
            }
        }
    })

    it('drops stop words so a spoken question searches its content words', () => {
        expect(terms('How do I join a space?')).toEqual(['join', 'space'])
    })
})

describe('Ask di index', () => {
    it('is built from the wiki, the public pages and the support page, and is not empty', () => {
        expect(passages.length).toBeGreaterThan(WIKI_ARTICLES.length - ASK_EXCLUDED_IDS.length)
        expect(passages.some((p) => p.url === '/support')).toBe(true)
        expect(passages.some((p) => p.url === '/ai/about.md')).toBe(true)
    })

    it('leaves out the operator-only articles', () => {
        for (const id of ASK_EXCLUDED_IDS) expect(passages.some((p) => p.id === `wiki:${id}`)).toBe(false)
        expect(passages.every((p) => !/^\/(admin|preferences)/.test(p.url))).toBe(true)
    })

    it('holds no secret, key, token, private address or home path', () => {
        expect(scanForSecrets(passages)).toEqual([])
    })

    // ASK_INDEX_OUT=/some/file.json npx vitest run src/askdi/ask.test.js writes the
    // index, so gitleaks can read exactly what the box searches.
    it('can write the index to a file for a secret scanner', () => {
        const out = process.env.ASK_INDEX_OUT
        if (out) fs.writeFileSync(out, JSON.stringify(passages, null, 1))
        expect(passages.length).toBeGreaterThan(100)
    })

    it('the secret scan does catch each kind (so the empty result above means something)', () => {
        const bad = (text) => scanForSecrets([{ id: 'x', title: 't', url: '/x', summary: '', tags: '', paragraphs: [text] }]).length
        expect(bad('-----BEGIN OPENSSH PRIVATE KEY-----')).toBe(1)
        expect(bad(`ghp_${'a'.repeat(36)}`)).toBe(1)
        expect(bad(`sk-${'a'.repeat(30)}`)).toBe(1)
        expect(bad('password = hunter2hunter2hunter2')).toBe(1)
        expect(bad('see /home/dob/work/x')).toBe(1)
        expect(bad('host 100.107.177.72')).toBe(1)
        expect(bad('plain public words')).toBe(0)
    })

    it('splits a markdown page at its headings, one passage per section', () => {
        const ps = markdownPassages({ file: 't', url: '/t', title: 'T', source: '# T\n\nintro line\n\n## Part\n\n- a [link](http://x) here\n' })
        expect(ps.map((p) => p.title)).toEqual(['T', 'T — Part'])
        expect(ps[1].paragraphs).toEqual(['a link here'])
    })

    it('reads each public doc file that exists on disk', () => {
        for (const d of ASK_DOCS) expect(d.source.length).toBeGreaterThan(50)
        expect(fs.existsSync('docs/ai/public/about.md')).toBe(true)
    })

    it('buildPassages accepts empty input', () => {
        expect(buildPassages()).toEqual([])
        expect(SUPPORT_PASSAGES[0].url).toBe('/support')
    })
})
