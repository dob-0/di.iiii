// @vitest-environment node
//
// public/sitemap.xml is a promise to every search engine: "these addresses are
// public, index them". It is kept by hand, so it can drift from what the server
// really shows a visitor — and it did: it named /cascade and /the-light-put-back,
// two private spaces. A visitor who follows either is turned away (the server
// answers an anonymous GET of a private space with 401), and for the-light-put-back
// the space's own README says why it must stay private: the photographs are
// someone else's (spaces/the-light-put-back/README.md).
//
// This guard is a ledger, not an oracle. Every SPACE the sitemap names must be in
// SPACES_PUBLIC_ON_PROD below, with the day it was checked, so adding a space to the
// sitemap needs a second edit here — and that edit is where you check it is really
// public. Platform addresses (/, /spaces, /wiki, /suite …) need no entry: they are the
// reserved app routes and static directories of shared/reservedSegments.cjs.
//
// What it cannot see: a space made private AFTER the day below. That needs the live
// list, which nothing fetches by itself yet (owed in docs/ai/known-fixes.md).
//
// Check by hand, read-only, no token:
//   curl -s https://di-studio.xyz/serverXR/api/spaces                       # the visitor list
//   curl -s -o /dev/null -w '%{http_code}\n' https://di-studio.xyz/serverXR/api/spaces/<id>   # 200 public, 401 private

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { RESERVED_SPACE_SLUGS } = createRequire(import.meta.url)('../shared/reservedSegments.cjs')

// Public on production: each answered 200 to an anonymous GET of /api/spaces/<id>
// and the visitor list (GET /api/spaces, no token) held it — checked 2026-10-10.
// `br_id_ge` is the space the list calls `br-id-ge`; both ids answer 200.
const SPACES_PUBLIC_ON_PROD = [
    'open', 'network', 'wcc', 'br_id_ge', 'beyond-form',
    'algovrithm', 'dilijan', 'azd', 'platform-recordar'
]

// Private on production (anonymous GET /api/spaces/<id> answers 401 — checked
// 2026-10-10) and never to be advertised. Kept so the failure can say why.
const PRIVATE_ON_PROD = {
    cascade: 'a private space: the server answers a visitor 401',
    'the-light-put-back': 'a private space, and the photographs in it are someone else\'s (spaces/the-light-put-back/README.md)'
}

const sitemap = fs.readFileSync(path.join(ROOT_DIR, 'public', 'sitemap.xml'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
const locs = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1])
const firstSegment = (loc) => new URL(loc).pathname.split('/').filter(Boolean)[0] ?? ''
const spaceSegments = locs.map(firstSegment).filter((segment) => segment && !RESERVED_SPACE_SLUGS.has(segment))

describe('public/sitemap.xml advertises only what a visitor can open', () => {
    it('reads as a sitemap with the home address and at least one space (so the checks below cannot pass on nothing)', () => {
        expect(locs).toContain('https://diiii.xyz/')
        expect(spaceSegments.length).toBeGreaterThan(0)
    })

    it('names no space that is private on production', () => {
        const listed = spaceSegments.filter((segment) => segment in PRIVATE_ON_PROD)
        expect(listed.map((segment) => `/${segment} — ${PRIVATE_ON_PROD[segment]}`)).toEqual([])
    })

    it('names only spaces checked public on production (add a new one to SPACES_PUBLIC_ON_PROD after checking it)', () => {
        const unchecked = spaceSegments.filter((segment) => !SPACES_PUBLIC_ON_PROD.includes(segment))
        expect(unchecked).toEqual([])
    })
})
