/**
 * The four claimants on a URL segment must agree.
 *
 * A top-level word can be claimed by the SPA router, by space creation, by
 * project creation, and by a real directory under public/ that nginx serves
 * before the app ever sees the path. Nothing reconciled them, and they had
 * drifted: `privacy`, `terms`, `tools` and `make` were routable pages that a
 * space could still be named after; `wiki`, `light`, `spaces` and five more
 * were creatable project slugs that spaceRouting.js's own guard throws away.
 *
 * shared/reservedSegments.cjs is the one list now. This asserts the client's
 * copy still matches it, and that the directories in public/ are accounted
 * for — the fourth claimant, which lives on disk and in nginx.conf and can
 * therefore never be imported.
 */

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESERVED_APP_SEGMENTS } from './spaceRouting.js'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const shared = require(path.join(ROOT, 'shared/reservedSegments.cjs'))

// public/wcc is a directory AND a real space — the one collision the estate
// carries deliberately, held open by a hand-written nginx location block.
// See src/works/works.js.
const HAND_HELD_COLLISIONS = new Set(['wcc'])

describe('reserved segments', () => {
    it('the client list and the shared list are the same words', () => {
        expect([...RESERVED_APP_SEGMENTS].sort()).toEqual([...shared.APP_SEGMENTS].sort())
    })

    it('every routable app word is refused as a space slug', () => {
        for (const word of RESERVED_APP_SEGMENTS) {
            expect(shared.RESERVED_SPACE_SLUGS.has(word)).toBe(true)
        }
    })

    it('every routable app word is refused as a project slug', () => {
        // spaceRouting.js drops a reserved segment in the project position, so
        // a project allowed to take one of these words is unreachable.
        for (const word of RESERVED_APP_SEGMENTS) {
            expect(shared.RESERVED_PROJECT_SLUGS.has(word)).toBe(true)
        }
    })

    it('every directory in public/ is refused as a space slug', () => {
        const dirs = readdirSync(path.join(ROOT, 'public'), { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter(name => !HAND_HELD_COLLISIONS.has(name))
        expect(dirs.length).toBeGreaterThan(0)
        for (const dir of dirs) {
            expect(shared.RESERVED_SPACE_SLUGS.has(dir)).toBe(true)
        }
    })

    // The fifth claimant, found the hard way on 2026-09-10: a directory in
    // public/ whose name is also an APP ROUTE shadows the route itself. nginx's
    // `try_files $uri $uri/ /index.html` matches the directory before the SPA
    // fallback, and express.static answers the bare path with a redirect to the
    // trailing slash — which is also why a service worker could not replay the
    // page offline (a redirected response may not satisfy a navigation). The
    // chat's icons and manifest lived in `public/chat/` for exactly one commit.
    it('no directory in public/ shadows an app route', () => {
        const dirs = readdirSync(path.join(ROOT, 'public'), { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter(name => !HAND_HELD_COLLISIONS.has(name))
        for (const dir of dirs) {
            expect(shared.APP_SEGMENTS).not.toContain(dir)
        }
    })

    it('the static words are not claimed as project slugs', () => {
        // They only ever shadow the top level; a project lives one deeper, so
        // reserving them there would refuse names for no reason.
        for (const word of shared.STATIC_SEGMENTS) {
            expect(shared.RESERVED_PROJECT_SLUGS.has(word)).toBe(false)
        }
    })
})
