/**
 * THE BOUNDARY. Platform in one direction, works in the other, and nothing
 * crossing back except through the registry.
 *
 * This exists because the boundary was designed once already and quietly
 * failed. src/raw/director/pieces.js carried the sentence "THIS FILE is the
 * only part of the director that knows algovrithm exists" — a true intention,
 * and false in fact: thirteen sibling files imported that artwork for the
 * timeline maths, the clock, the light model and the camera. Nothing failed,
 * nothing warned, and the cost surfaced somewhere else entirely — 88 MB of one
 * piece's reels in the bundle every artist downloads with `curl … /get | sh`,
 * because a general tool reached into a piece for its media bin.
 *
 * A rule nobody can break by accident is a rule; a rule in a comment is a
 * wish. So: the direction is asserted, on every run.
 *
 *   a work importing the platform    always fine — that is what a platform is for
 *   the platform importing a work    only src/works/routes.jsx, only lazily
 *
 * When this fails, the fix is almost never to add an exception. It is one of:
 *   - the module is really the TOOL and belongs in src/timeline, src/hooks or
 *     src/raw/director (that is where 1,650 lines went when this was written)
 *   - the module is really the PIECE's and the platform should receive it
 *     through the descriptor, not import it (see src/algoVrithm/directorPiece.js)
 *   - the new thing is a work of its own, in which case it does not belong in
 *     this repo at all — see docs/ai/golden_rules.md, "Platform and works".
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORKS, workSourceDirs } from './works.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = 'works/routes.jsx'

const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (name === 'node_modules') return []
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(jsx?|css)$/.test(name) ? [full] : []
})

const ALL_FILES = walk(SRC).map((full) => relative(SRC, full).split('\\').join('/'))

// "src/algoVrithm" -> "algoVrithm", the shape paths take inside src/
const WORK_DIRS = workSourceDirs().map((dir) => dir.replace(/^src\//, ''))
const insideAWork = (file) => WORK_DIRS.some((dir) => file.startsWith(`${dir}/`))

// Any import specifier that lands inside a work directory, however it is spelled.
const importsIntoWork = (source) => {
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
    return specifiers.filter((spec) => WORK_DIRS.some((dir) => spec.includes(`${dir}/`)))
}

describe('platform and works stay separate', () => {
    it('has works to check, so a broken registry cannot make this vacuous', () => {
        expect(WORKS.length).toBeGreaterThan(0)
        expect(WORK_DIRS.length).toBe(WORKS.length)
        expect(ALL_FILES.some(insideAWork)).toBe(true)
    })

    it('lets no platform file import a work, except the registry', () => {
        const offenders = []
        for (const file of ALL_FILES) {
            if (insideAWork(file) || file === REGISTRY) continue
            const hits = importsIntoWork(readFileSync(join(SRC, file), 'utf8'))
            for (const hit of hits) offenders.push(`${file} → ${hit}`)
        }
        expect(offenders).toEqual([])
    })

    it('keeps the registry lazy, so no work is in the first paint', () => {
        const registry = readFileSync(join(SRC, REGISTRY), 'utf8')
        for (const spec of importsIntoWork(registry)) {
            // Every work reference must sit inside an import() call, never a
            // top-level `import x from`. A static one would put the work in the
            // main chunk and undo the whole arrangement.
            const staticImport = new RegExp(`import\\s+[^('"]*['"]${spec.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}['"]`)
            expect(staticImport.test(registry)).toBe(false)
        }
        expect(importsIntoWork(registry).length).toBeGreaterThan(0)
    })

    it('names entry points and asset directories that exist', () => {
        for (const work of WORKS) {
            expect(() => statSync(join(SRC, '..', work.source))).not.toThrow()
            for (const entry of work.entries) {
                expect(() => statSync(join(SRC, '..', entry))).not.toThrow()
            }
            for (const dir of work.assetDirs) {
                expect(statSync(join(SRC, '..', dir)).isDirectory()).toBe(true)
            }
            for (const dir of work.publicDirs) {
                expect(statSync(join(SRC, '..', 'public', dir)).isDirectory()).toBe(true)
            }
        }
    })

    it('keeps a work’s own stylesheet out of the platform', () => {
        const offenders = []
        for (const file of ALL_FILES) {
            if (!file.endsWith('.css') || insideAWork(file)) continue
            // Comments stripped first: a platform file may well EXPLAIN a
            // work's class (studioCodeSpaceDirector.css says why its host is
            // positioned), and prose is not a dependency. Selectors are.
            const css = readFileSync(join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
            // The director's rules lived in the piece's stylesheet, so Raw's
            // own CSS had selectors reaching into an artwork's class names to
            // lay out a platform panel.
            if (/\.algo-vrithm-/.test(css)) offenders.push(file)
        }
        expect(offenders).toEqual([])
    })
})
