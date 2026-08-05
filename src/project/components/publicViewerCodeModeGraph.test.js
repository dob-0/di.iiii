// @vitest-environment node
//
// Regression guard (perf audit 2026-08-05). A code-mode published page is an
// <iframe srcDoc> and never mounts a canvas, yet it downloaded and evaluated
// the whole three/fiber/drei/xr bundle (three-vendor, 1,614,468 bytes raw /
// ~452KB gzipped) before first paint.
//
// The first attempt at the fix put both scene renderers behind React.lazy and
// asserted that in the component's own source -- which passed while the page
// still shipped three-vendor, because `useXrAr` (@react-three/xr) and
// `cameraFraming` (three) were still *static* imports of the viewer. Rollup
// only drops a chunk from the critical path when NOTHING statically reachable
// from the entry needs it; one static import anywhere in that closure is
// enough to pull it back.
//
// So this walks the real static import graph the bundler walks -- from
// PublicProjectViewer.jsx, following `import ... from` / `export ... from`
// only, never `import(...)` -- and fails if any three.js-ecosystem package is
// reachable. Source-level, so it costs nothing and cannot be fooled by a
// render that has already happened by the time a test can observe it.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const ENTRY = path.join(ROOT_DIR, 'src/project/components/PublicProjectViewer.jsx')

const THREE_PACKAGE = /^(three|three-mesh-bvh|three-stdlib|meshline|meshoptimizer|r3f-perf|camera-controls|detect-gpu|maath|iwer)(\/|$)|^(@react-three|@react-spring|@pmndrs|@iwer|troika-|@monogrid)/

const STATIC_IMPORT = /(?:^|[;\s])(?:import|export)\s+(?:[^;'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g

const readStaticSpecifiers = (file) => {
    const source = fs.readFileSync(file, 'utf8')
    const specifiers = []
    let match
    STATIC_IMPORT.lastIndex = 0
    while ((match = STATIC_IMPORT.exec(source)) !== null) {
        specifiers.push(match[1])
    }
    return specifiers
}

const resolveRelative = (fromFile, specifier) => {
    const base = path.resolve(path.dirname(fromFile), specifier.split('?')[0])
    const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')]
    return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null
}

// Shortest import chain from the entry to the first three.js package, or null.
const findThreeImportChain = (entry) => {
    const queue = [entry]
    const parents = new Map([[entry, null]])
    const chainTo = (file, specifier) => {
        const chain = [specifier]
        let cursor = file
        while (cursor) {
            chain.unshift(path.relative(ROOT_DIR, cursor))
            cursor = parents.get(cursor)
        }
        return chain
    }

    while (queue.length) {
        const file = queue.shift()
        for (const specifier of readStaticSpecifiers(file)) {
            if (THREE_PACKAGE.test(specifier)) {
                return chainTo(file, specifier)
            }
            if (!specifier.startsWith('.')) continue
            const resolved = resolveRelative(file, specifier)
            if (!resolved || parents.has(resolved)) continue
            parents.set(resolved, file)
            queue.push(resolved)
        }
    }
    return null
}

describe('the code-mode published page never reaches three-vendor', () => {
    it('has no three.js package in PublicProjectViewer\'s static import graph', () => {
        const chain = findThreeImportChain(ENTRY)
        expect(
            chain,
            chain ? `three is statically reachable:\n  ${chain.join('\n    -> ')}` : ''
        ).toBeNull()
    })

    it('keeps the scene surface -- which does reach three -- behind React.lazy', () => {
        const source = fs.readFileSync(ENTRY, 'utf8')
        expect(source).toMatch(/const PublicProjectSceneSurface = lazy\(\(\) => import\(/)
        expect(source).not.toMatch(/^import\s+PublicProjectSceneSurface\s+from/m)
        // and the guard above is only meaningful if that surface really is the
        // module that pulls three in
        expect(findThreeImportChain(path.join(ROOT_DIR, 'src/project/components/PublicProjectSceneSurface.jsx'))).not.toBeNull()
    })
})
