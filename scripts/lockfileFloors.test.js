// Every copy of a package that a security advisory named must resolve at or
// above the patched release, in both lockfiles.
//
// Why a test and not CI's audit step: `.github/workflows/ci.yml` runs
// `npm audit --production`, which skips dev dependencies — and every package
// below is a dev dependency of the root. Dependabot reports them anyway (it
// scans the default branch, `main`), so a lockfile refresh that rolled one of
// them back would pass CI silently. Floors are the patched versions from the
// advisories (2026-10-21 alert batch); raise a floor, never lower one.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const FLOORS = {
    undici: '8.10.2',
    'source-map-js': '1.2.2',
    'js-yaml': '4.3.2',
    browserslist: '4.28.7',
    postcss: '8.5.23',
    'brace-expansion': '1.1.21',
    'baseline-browser-mapping': '2.11.0',
    // Reported by `npm audit` against main's lockfile in the same batch.
    '@modelcontextprotocol/server': '2.3.0',
    nanoid: '3.3.18',
    vite: '8.2.4'
}

// Lines of release, keyed by major: a floor applies only to copies on the
// same major (brace-expansion 1.x and 2.x are separate lines; a 2.x copy is
// not "below" 1.1.21). A copy on an OLDER major than the floor still fails.
const parse = (version) => String(version).split(/[.+-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0)

export function belowFloor(version, floor) {
    const [a, b, c] = parse(version)
    const [x, y, z] = parse(floor)
    if (a !== x) return a < x
    if (b !== y) return b < y
    return c < z
}

export function findBelowFloor(lock, floors = FLOORS) {
    const found = []
    for (const [path, entry] of Object.entries(lock.packages || {})) {
        for (const [name, floor] of Object.entries(floors)) {
            if (!path.endsWith(`node_modules/${name}`) || !entry?.version) continue
            if (belowFloor(entry.version, floor)) found.push(`${path} ${entry.version} < ${floor}`)
        }
    }
    return found
}

const readLock = (rel) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'))

describe('lockfile security floors', () => {
    it('compares versions on the same line only', () => {
        expect(belowFloor('8.10.1', '8.10.2')).toBe(true)
        expect(belowFloor('8.10.2', '8.10.2')).toBe(false)
        expect(belowFloor('8.11.0', '8.10.2')).toBe(false)
        expect(belowFloor('7.99.0', '8.10.2')).toBe(true)
        expect(belowFloor('2.0.1', '1.1.21')).toBe(false)
    })

    it('names a stale copy, nested ones included', () => {
        const lock = { packages: { 'node_modules/a/node_modules/undici': { version: '8.9.0' } } }
        expect(findBelowFloor(lock)).toEqual(['node_modules/a/node_modules/undici 8.9.0 < 8.10.2'])
    })

    it.each(['package-lock.json', 'serverXR/package-lock.json'])('%s holds no advisory-named package below its patched release', (rel) => {
        expect(findBelowFloor(readLock(rel))).toEqual([])
    })
})
