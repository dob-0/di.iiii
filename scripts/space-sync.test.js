import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, globToRe, matchGlobs } from './space-sync.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE = path.join(ROOT_DIR, 'scripts', 'space-sync.mjs')
const source = fs.readFileSync(ENGINE, 'utf8')
const bytes = fs.readFileSync(ENGINE)

describe('space-sync engine', () => {
    // Every guard below is a bug that shipped. The engine is copied into three
    // other repos, so each one shipped four times over.

    it('contains no literal NUL byte', () => {
        // Two of them sat in the glob helper as the `**` placeholder. Harmless
        // at runtime — and they made git call the file binary, so for months
        // the engine had no diff, no grep and no review. Both drifts between
        // the four copies happened behind that blindfold.
        expect(bytes.includes(0)).toBe(false)
    })

    it('names no default target, least of all production', () => {
        // `DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'` meant a sync
        // with no --to went to the live site. A rehearsal that forgets a flag
        // must fail, not publish.
        expect(source).not.toMatch(/DEFAULT_LIVE_URL/)
        expect(source).not.toMatch(/=\s*'https:\/\/di-studio\.xyz/)
    })

    it('enforces slug and title on every run, not only at creation', () => {
        // Both were sent in the POST that creates a project and nowhere else,
        // so a tier that got its projects any other way kept null slugs (404 at
        // its own door) and a rename in the manifest reached nothing. The PATCH
        // is what makes the repo actually master for these fields.
        expect(source).toMatch(/JSON\.stringify\(\{ slug: manifest\.slug \}\)/)
        expect(source).toMatch(/JSON\.stringify\(\{ title: wantTitle \}\)/)
    })

    it('exports a version manifests can pin against', () => {
        expect(Number.isInteger(ENGINE_VERSION)).toBe(true)
        expect(ENGINE_VERSION).toBeGreaterThanOrEqual(4)
        expect(source).toMatch(/minEngine/)
    })

    it('still translates globs the way the manifests expect', () => {
        expect(globToRe('assets/**').test('assets/a/b.png')).toBe(true)
        expect(globToRe('assets/**').test('other.png')).toBe(false)
        expect(globToRe('*.html').test('index.html')).toBe(true)
        expect(globToRe('*.html').test('nested/index.html')).toBe(false)
        expect(matchGlobs(['a.html', 'b.css'], ['*.html'])).toEqual(['a.html'])
    })
})
