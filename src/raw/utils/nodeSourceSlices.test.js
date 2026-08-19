import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadSourceSlice, canShowLines, MAX_QUOTED_LINES } from './nodeSourceSlices.js'
import { NODE_ANATOMY, SOURCE_FINGERPRINTS } from '../../project/graph/nodeAnatomy.generated.js'

// Nothing mocked: vitest runs through Vite, `?raw` is a Vite transform, and
// the real files load. A stubbed loader here would keep every test green over
// exactly the semantics that matter — whether the quoted lines ARE the file's.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('loadSourceSlice', () => {
    it('returns the real file lines for the cube case, dedented but otherwise verbatim', async () => {
        const place = NODE_ANATOMY['geom.cube'].computes
        const result = await loadSourceSlice(place)
        expect(result.ok).toBe(true)
        const raw = readFileSync(join(ROOT, place.file), 'utf8')
            .split('\n').slice(place.fromLine - 1, place.toLine)
        // Dedent is the only transformation allowed — assert it against the
        // disk content, so "verbatim" is checked, not trusted.
        const indent = Math.min(...raw.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length))
        expect(result.text).toBe(raw.map((l) => l.slice(indent)).join('\n'))
        expect(result.text).toContain("case 'geom.cube':")
    })

    it('refuses a file outside the thunk map rather than guessing', async () => {
        expect(canShowLines('src/raw/components/RawEditor.jsx')).toBe(false)
        const result = await loadSourceSlice({ file: 'src/raw/components/RawEditor.jsx', fromLine: 1, toLine: 5 })
        expect(result).toEqual({ ok: false, reason: 'unavailable' })
    })

    it('names a slice too long to quote instead of flooding the window', async () => {
        const result = await loadSourceSlice({
            file: 'src/project/graph/nodeGraphRuntime.js',
            fromLine: 1,
            toLine: MAX_QUOTED_LINES + 2
        })
        expect(result).toEqual({ ok: false, reason: 'too-long' })
    })

    describe('the fingerprint refusal', () => {
        const real = SOURCE_FINGERPRINTS['src/project/graph/nodeGraphRuntime.js']
        afterEach(() => { SOURCE_FINGERPRINTS['src/project/graph/nodeGraphRuntime.js'] = real })

        // Watched red the other way: with the guard commented out of
        // loadSourceSlice, this test fails — the corrupted fingerprint is
        // ignored and the lines come back ok:true. That is the silent-lie
        // path the guard exists to close.
        it('shows nothing when the code moved after the manifest was built', async () => {
            SOURCE_FINGERPRINTS['src/project/graph/nodeGraphRuntime.js'] = 'deadbeef'
            const result = await loadSourceSlice(NODE_ANATOMY['geom.cube'].computes)
            expect(result).toEqual({ ok: false, reason: 'moved' })
        })
    })
})
