import { describe, it, expect } from 'vitest'
import { chunkRows, firstLoad, gzipBytes } from './bundle-sizes.mjs'

const manifest = {
    'index.html': { file: 'assets/index-a.js', src: 'index.html', isEntry: true, imports: ['_react.js'], dynamicImports: ['src/wiki/WikiPage.jsx'], css: ['assets/index-a.css'] },
    '_react.js': { file: 'assets/react-vendor-b.js', name: 'react-vendor', imports: ['_runtime.js'] },
    '_runtime.js': { file: 'assets/runtime-c.js', name: 'runtime' },
    '_three.js': { file: 'assets/three-vendor-d.js', name: 'three-vendor' },
    'src/wiki/WikiPage.jsx': { file: 'assets/WikiPage-e.js', src: 'src/wiki/WikiPage.jsx', isDynamicEntry: true, imports: ['_three.js', '_react.js'] },
    'public/logo.png': { file: 'assets/logo-f.png', src: 'public/logo.png' }
}
const sizeOf = (file) => ({ raw: file.length, gzip: 1 })

describe('bundle-sizes', () => {
    it('names the entry and each lazy route chunk by the module it starts from; leaves non-code out', () => {
        const rows = chunkRows(manifest, sizeOf)
        const by = Object.fromEntries(rows.map((r) => [r.file, r]))
        expect(by['assets/index-a.js']).toMatchObject({ kind: 'entry', from: 'index.html' })
        expect(by['assets/WikiPage-e.js']).toMatchObject({ kind: 'lazy', from: 'src/wiki/WikiPage.jsx' })
        expect(by['assets/three-vendor-d.js']).toMatchObject({ kind: 'shared', from: 'three-vendor' })
        expect(by['assets/index-a.css'].kind).toBe('css')
        expect(by['assets/logo-f.png']).toBeUndefined()
        expect(rows).toHaveLength(6)
    })

    it('first load is the entry and its static closure, never a route chunk or what only a route imports', () => {
        const first = firstLoad(manifest)
        expect(first.entry).toBe('index.html')
        expect(first.files.sort()).toEqual(['assets/index-a.css', 'assets/index-a.js', 'assets/react-vendor-b.js', 'assets/runtime-c.js'])
    })

    it('gzip is measured, not estimated: repetitive bytes shrink, random-ish ones do not', () => {
        expect(gzipBytes(Buffer.from('a'.repeat(10000)))).toBeLessThan(100)
        const noise = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 2654435761) >>> 24))
        expect(gzipBytes(noise)).toBeGreaterThan(1000)
    })
})
