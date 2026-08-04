import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    findRowBlocks,
    matchBracket,
    patchEditListSource,
    scanCode
} from './editListSource.js'
import { SEQUENCES } from './sequences/index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const INDEX_PATH = path.resolve(HERE, 'sequences/index.js')
const realSource = () => fs.readFileSync(INDEX_PATH, 'utf8')

const TINY = `export const SEQUENCES = [
    {
        id: 's01-a',
        title: 'A',
        note: 'first',
        startSec: 0,
        endSec: 5.6,
        backdrop: { color: '#000000', fogNear: 6, fogFar: 26, ambient: 0 },
        Component: A
    },
    {
        id: 's02-b',
        title: 'B',
        note: 'second',
        startSec: 4.4,
        endSec: 9.4,
        veil: false,
        Component: B
    }
]
`

const rowsOf = (source) => findRowBlocks(source).blocks.map((block) => block.id)

describe('scanCode', () => {
    it('masks line comments, block comments and strings', () => {
        const text = `a // b\n/* c */ d 'e' f`
        const mask = scanCode(text)
        const codeAt = (needle) => Boolean(mask[text.indexOf(needle)])

        expect(codeAt('a')).toBe(true)
        expect(codeAt('// b')).toBe(false)
        expect(codeAt('/* c')).toBe(false)
        expect(codeAt('d')).toBe(true)
        expect(codeAt("'e'")).toBe(false)
    })

    it('does not end a string on an escaped quote', () => {
        const text = `x = 'it\\'s'; y`
        const mask = scanCode(text)
        expect(mask[text.indexOf('y')]).toBe(1)
        expect(mask[text.indexOf("it\\'s")]).toBe(0)
    })
})

describe('matchBracket', () => {
    it('ignores brackets inside comments', () => {
        // The exact hazard in sequences/index.js: a comment describing the
        // shape of a row. Counting its braces walks the match off the end.
        const text = `[\n  // shape: [{ id, kind }]\n  { a: 1 }\n]`
        const end = matchBracket(text, scanCode(text), 0)
        expect(end).toBe(text.length)
    })

    it('reports -1 on an unbalanced array rather than guessing', () => {
        const text = `[ { a: 1 }`
        expect(matchBracket(text, scanCode(text), 0)).toBe(-1)
    })
})

describe('findRowBlocks', () => {
    it('finds every row in the real edit list, in order', () => {
        expect(rowsOf(realSource())).toEqual(SEQUENCES.map((row) => row.id))
    })

    it('returns null when there is no SEQUENCES array', () => {
        expect(findRowBlocks('export const OTHER = []')).toBe(null)
    })
})

describe('patchEditListSource', () => {
    it('changes the number it was asked to and nothing else', () => {
        const draft = [
            { id: 's01-a', startSec: 0, endSec: 7.2, backdrop: { color: '#000000', fogNear: 6, fogFar: 26, ambient: 0 } },
            { id: 's02-b', startSec: 4.4, endSec: 9.4 }
        ]
        const result = patchEditListSource(TINY, draft)

        expect(result.ok).toBe(true)
        expect(result.source).toContain('endSec: 7.2')
        expect(result.source).not.toContain('endSec: 5.6')
        // Everything untouched is byte-identical.
        expect(result.source.replace('endSec: 7.2', 'endSec: 5.6')).toBe(TINY)
    })

    it('preserves fields it does not know about', () => {
        // `veil: false` is the case this protects. It is not panel-editable, it
        // is load-bearing on two rows, and formatEditListSource drops it.
        const draft = [
            { id: 's01-a', startSec: 0, endSec: 5.6, backdrop: { color: '#000000', fogNear: 6, fogFar: 26, ambient: 0 } },
            { id: 's02-b', startSec: 4.4, endSec: 12 }
        ]
        const result = patchEditListSource(TINY, draft)
        expect(result.source).toContain('veil: false')
    })

    it('writes a changed world back in place', () => {
        const draft = [
            { id: 's01-a', startSec: 0, endSec: 5.6, backdrop: { color: '#101820', fogNear: 4, fogFar: 30, ambient: 0.16 } },
            { id: 's02-b', startSec: 4.4, endSec: 9.4 }
        ]
        const result = patchEditListSource(TINY, draft)
        expect(result.source).toContain("backdrop: { color: '#101820', fogNear: 4, fogFar: 30, ambient: 0.16 }")
    })

    it('inserts a field the row did not have', () => {
        const draft = [
            { id: 's01-a', startSec: 0, endSec: 5.6, backdrop: { color: '#000000', fogNear: 6, fogFar: 26, ambient: 0 } },
            { id: 's02-b', startSec: 4.4, endSec: 9.4, travel: [0, 0, -1.9] }
        ]
        const result = patchEditListSource(TINY, draft)
        expect(result.source).toContain('travel: [0, 0, -1.9],')
        // Inserted before Component, so the row still reads like the others.
        const body = result.source.slice(result.source.indexOf("id: 's02-b'"))
        expect(body.indexOf('travel:')).toBeLessThan(body.indexOf('Component:'))
    })

    it('removes a field the draft no longer carries', () => {
        const draft = [
            { id: 's01-a', startSec: 0, endSec: 5.6 },
            { id: 's02-b', startSec: 4.4, endSec: 9.4 }
        ]
        const result = patchEditListSource(TINY, draft)
        expect(result.source).not.toContain('backdrop:')
        expect(result.source).toContain("id: 's01-a'")
    })

    it('removes a deleted row together with the comments above it', () => {
        const withNote = TINY.replace('    {\n        id: \'s02-b\'', '    // why B exists\n    {\n        id: \'s02-b\'')
        const result = patchEditListSource(withNote, [
            { id: 's01-a', startSec: 0, endSec: 5.6, backdrop: { color: '#000000', fogNear: 6, fogFar: 26, ambient: 0 } }
        ])

        expect(result.ok).toBe(true)
        expect(result.source).not.toContain('why B exists')
        expect(result.source).not.toContain("id: 's02-b'")
        expect(result.source).toContain("id: 's01-a'")
    })

    it('refuses a draft row that is not in the file', () => {
        const result = patchEditListSource(TINY, [
            { id: 's01-a', startSec: 0, endSec: 5.6 },
            { id: 'asset-new', startSec: 1, endSec: 5 }
        ])
        expect(result.ok).toBe(false)
        expect(result.reason).toMatch(/asset-new/)
    })

    it('refuses duplicate ids', () => {
        const result = patchEditListSource(TINY, [
            { id: 's01-a', startSec: 0, endSec: 5.6 },
            { id: 's01-a', startSec: 1, endSec: 6 }
        ])
        expect(result.ok).toBe(false)
    })

    it('refuses a file it cannot read rather than writing something plausible', () => {
        expect(patchEditListSource('const x = 1', SEQUENCES).ok).toBe(false)
    })
})

describe('against the real sequences/index.js', () => {
    it('saving an unchanged draft is a no-op, byte for byte', () => {
        // The strongest guarantee this module can offer: open the panel, touch
        // nothing, hit save, and git shows no diff.
        const source = realSource()
        const result = patchEditListSource(source, SEQUENCES, SEQUENCES)

        expect(result.ok).toBe(true)
        expect(result.source).toBe(source)
    })

    it('leaves a shared world preset as a reference, not an expanded literal', () => {
        // The scan row reads `backdrop: WORLD_PRESETS.field`. Rewriting it as a
        // colour literal renders the same and silently unlinks the row from the
        // preset, so editing the shared world would stop reaching it.
        const source = realSource()
        const draft = SEQUENCES.map((row) => row.id === 's01-white-tunnel'
            ? { ...row, endSec: 6.4 }
            : row)

        const result = patchEditListSource(source, draft, SEQUENCES)
        expect(result.source).toContain('backdrop: WORLD_PRESETS.field')
    })

    it('only rewrites the rows that actually changed', () => {
        const source = realSource()
        const draft = SEQUENCES.map((row) => row.id === 's01-white-tunnel'
            ? { ...row, endSec: 6.4 }
            : row)

        const result = patchEditListSource(source, draft, SEQUENCES)
        // Undo the one intended edit and the file is byte-identical again.
        expect(result.source.replace('endSec: 6.4', 'endSec: 5.6')).toBe(source)
    })

    it('keeps every comment in the file when a row is retimed', () => {
        const source = realSource()
        const draft = SEQUENCES.map((row) => row.id === 's07-dispersion-sphere'
            ? { ...row, startSec: 44.2, endSec: 53.5 }
            : row)

        const result = patchEditListSource(source, draft, SEQUENCES)
        expect(result.ok).toBe(true)
        expect(result.source).toContain('endSec: 53.5')

        // Every comment line in the original still appears in the output.
        const comments = source
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('//') && line.length > 8)
        for (const comment of comments) {
            expect(result.source).toContain(comment)
        }
        expect(comments.length).toBeGreaterThan(100)
    })

    it('keeps veil: false on both rows that carry it', () => {
        const source = realSource()
        const draft = SEQUENCES.map((row) => ({ ...row, startSec: row.startSec + 1, endSec: row.endSec + 1 }))
        const result = patchEditListSource(source, draft, SEQUENCES)

        expect(result.ok).toBe(true)
        expect(result.source.match(/veil: false/g)).toHaveLength(2)
    })
})
