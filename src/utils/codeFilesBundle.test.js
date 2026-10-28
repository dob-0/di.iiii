import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
    bundleCodeFiles,
    isSupportedFile,
    mergeImported,
    normalizeFileName,
    readZipFiles,
    restoreDeleted,
    startPageFile,
    undoImported
} from './codeFilesBundle.js'

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

describe('startPageFile', () => {
    it('is index.html, else the first .html file, else nothing', () => {
        expect(startPageFile([{ name: 'a.html' }, { name: 'index.html' }]).name).toBe('index.html')
        expect(startPageFile([{ name: 'a.css' }, { name: 'b.html' }]).name).toBe('b.html')
        expect(startPageFile([{ name: 'a.css' }])).toBeNull()
    })
})

describe('readZipFiles', () => {
    it('returns the readable files and names what was left out', async () => {
        const zip = new JSZip()
        zip.file('index.html', '<p>x</p>')
        zip.file('pics/cat.png', 'bin')
        const out = await readZipFiles(JSZip, await zip.generateAsync({ type: 'uint8array' }))
        expect(out.files.map((f) => f.name)).toEqual(['index.html'])
        expect(out.skipped).toEqual(['pics/cat.png'])
        expect(out.error).toBe('')
    })

    it('says why a broken zip failed', async () => {
        const out = await readZipFiles(JSZip, new Uint8Array([1, 2, 3, 4]))
        expect(out.files).toEqual([])
        expect(out.error).toMatch(/could not be read/)
    })
})

describe('mergeImported / undoImported / restoreDeleted', () => {
    const mine = [{ name: 'index.html', content: 'mine' }, { name: 'a.css', content: 'a' }]
    const incoming = [{ name: 'a.css', content: 'new a' }, { name: 'b.js', content: 'b' }]

    it('add keeps old files, replaces a same-named one, appends new ones', () => {
        expect(mergeImported(mine, incoming, 'add')).toEqual([
            { name: 'index.html', content: 'mine' }, { name: 'a.css', content: 'new a' }, { name: 'b.js', content: 'b' }
        ])
    })

    it('replace gives only the incoming files', () => {
        expect(mergeImported(mine, incoming, 'replace')).toEqual(incoming)
    })

    it('undo restores touched files and keeps text typed since in untouched ones', () => {
        const now = [{ name: 'index.html', content: 'typed since' }, { name: 'a.css', content: 'new a' }, { name: 'b.js', content: 'b' }]
        expect(undoImported(mine, now, ['a.css', 'b.js'])).toEqual([
            { name: 'index.html', content: 'typed since' }, { name: 'a.css', content: 'a' }
        ])
    })

    it('a deleted file goes back at its place unless the name is taken', () => {
        const file = { name: 'a.css', content: 'a' }
        expect(restoreDeleted([{ name: 'index.html', content: '' }], file, 1).map((f) => f.name)).toEqual(['index.html', 'a.css'])
        const taken = [{ name: 'a.css', content: 'other' }]
        expect(restoreDeleted(taken, file, 0)).toBe(taken)
    })
})
