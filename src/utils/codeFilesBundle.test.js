import { describe, expect, it } from 'vitest'
import { bundleCodeFiles, isSupportedFile, normalizeFileName } from './codeFilesBundle.js'

const indexFile = (body) => ({
    name: 'index.html',
    content: `<!doctype html><html><head><link rel="stylesheet" href="style.css" /></head><body>${body}<script src="app.js"></script></body></html>`
})

describe('bundleCodeFiles', () => {
    it('inlines a css and a js file into the index shell', () => {
        const result = bundleCodeFiles([
            indexFile('<main>hi</main>'),
            { name: 'style.css', content: 'body { color: red; }' },
            { name: 'app.js', content: 'console.log("hi")' }
        ])

        expect(result).toContain('<style>/* style.css */\nbody { color: red; }</style>')
        // The captured pre-attribute whitespace from the original tag rides
        // along ("<script >"); only the src attribute itself is stripped.
        expect(result).toContain('<script >/* app.js */\nconsole.log("hi")</script>')
        expect(result).not.toContain('href="style.css"')
        expect(result).not.toContain('src="app.js"')
    })

    // Regression guard: a minified bundle earlier truncated the actual
    // <script> tag and spilled the rest of itself onto the page as visible
    // text — see the file header. `$&`, `` $` ``, `$'` and `$$` all carry
    // special meaning when a STRING is the second argument to
    // String.replace(); a real bundle (React, GSAP, any library with its own
    // .replace(/x/, '$1') call) routinely contains these sequences by
    // accident, not by construction.
    it('inlines file content containing $-replacement sequences byte for byte', () => {
        const dollarJs = 'const a = "$&"; const b = "$`"; const c = "$\'"; const d = "$$"; const e = "$1";'
        const result = bundleCodeFiles([
            indexFile('<main>PRECEDING TEXT THAT MUST NOT REAPPEAR</main>'),
            { name: 'app.js', content: dollarJs }
        ])

        expect(result).toContain(`<script >/* app.js */\n${dollarJs}</script>`)
        // The bug reinserted the whole preceding document at a `` $` ``, so a
        // literal duplicate of earlier markup right after the script tag is
        // exactly the failure this guards against.
        expect(result.split('PRECEDING TEXT THAT MUST NOT REAPPEAR')).toHaveLength(2)
    })

    it('does the same for a $-bearing css file', () => {
        const dollarCss = '.x::before { content: "$& $` $\' $$"; }'
        const result = bundleCodeFiles([
            indexFile('<main>ok</main>'),
            { name: 'style.css', content: dollarCss }
        ])

        expect(result).toContain(`<style>/* style.css */\n${dollarCss}</style>`)
    })

    it('returns empty string with no index.html file', () => {
        expect(bundleCodeFiles([{ name: 'style.css', content: 'a{}' }])).toBe('')
    })

    it('returns empty string for a non-array or empty input', () => {
        expect(bundleCodeFiles([])).toBe('')
        expect(bundleCodeFiles(null)).toBe('')
    })
})

describe('isSupportedFile', () => {
    it('accepts the documented extensions and rejects the rest', () => {
        expect(isSupportedFile('index.html')).toBe(true)
        expect(isSupportedFile('app.js')).toBe(true)
        expect(isSupportedFile('data.bin')).toBe(false)
    })
})

describe('normalizeFileName', () => {
    it('strips a leading slash and unsafe characters', () => {
        expect(normalizeFileName('/assets/a b?.png')).toBe('assets/a_b_.png')
    })
})
