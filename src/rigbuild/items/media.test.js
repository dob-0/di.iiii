import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ITEMS, picturesOf } from './index.js'
import { MEDIA, assetUrl, documentsOf, mediaProblems, photosOf, rightsLine, verificationOf } from './media.js'
import rental from '../../../scripts/rigbuild/rentals/moxir-2026-10-17.json'

// The makers' photos and documents (RIG_BUILD.md §13.8) are the makers' copyright: the
// repository holds where each came from, never the bytes; a file is kept only where the maker
// offers it for download; every item says whether its rental code was verified, with evidence.
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..')

describe('the makers\' media — metadata only, with provenance', () => {
    it('is well formed: every status, evidence, date, maker and offer', () => {
        expect(mediaProblems(MEDIA, { itemIds: new Set(ITEMS.keys()), requireFetched: true })).toEqual([])
    })
    it('verifies every item of the catalogue — all 25 price-list codes and the extras', () => {
        for (const id of ITEMS.keys()) expect(verificationOf(id), id).toBeTruthy()
        for (const c of rental.rentalList.catalogue) expect(verificationOf(c.code.toLowerCase()), c.code).toBeTruthy()
    })
    it('never keeps a maker\'s bytes in the repository', () => {
        const hashes = new Set(Object.values(MEDIA.items).flatMap((e) => e.media || []).map((m) => m.sha256).filter(Boolean))
        const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]))
        for (const file of walk(path.join(ROOT, 'public/rigbuild'))) {
            const h = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
            expect(hashes.has(h), file).toBe(false)
        }
        for (const e of Object.values(MEDIA.items)) for (const m of e.media || []) expect(m.file, m.url).toBeUndefined()
    })
    it('serves only a downloaded, stored file from the install; a link is never an asset', () => {
        expect(assetUrl('/serverXR', { offer: 'download', asset: 'abc12345' })).toBe('/serverXR/api/spaces/moxir/assets/abc12345')
        expect(assetUrl('/serverXR', { offer: 'link', asset: 'abc12345' })).toBe(null)
        expect(assetUrl('/serverXR', { offer: 'download' })).toBe(null)
        expect(rightsLine({ kind: 'manual', offer: 'download', maker: 'M', url: 'https://m/x.pdf', fetched: '2026-09-28' })).toBe('© M — manufacturer\'s document, internal reference, source https://m/x.pdf, fetched 2026-09-28')
        expect(rightsLine({ kind: 'photo', offer: 'link', maker: 'M', url: 'https://m/p.jpg', page: 'https://m/p', checked: '2026-09-28' })).toMatch(/linked \(not copied\)/)
    })
    it('refuses a stand-in\'s file that does not say so, and a stored link', () => {
        const bad = { store: { space: 'moxir' }, items: { x: { verification: { status: 'equivalent', checked: '2026-09-28', equivalentOf: { maker: 'A', model: 'B' }, evidence: [{ url: 'https://a', accessed: '2026-09-28' }] }, media: [{ kind: 'manual', offer: 'link', checked: '2026-09-28', url: 'https://a/m.pdf', maker: 'A', title: 't', sha256: 'a'.repeat(64) }] } } }
        const problems = mediaProblems(bad)
        expect(problems.some((p) => /not marked equivalent/.test(p))).toBe(true)
        expect(problems.some((p) => /never stored or hashed/.test(p))).toBe(true)
    })
    it('puts the maker\'s kept photo first, our render next as the 3D model', () => {
        const withKept = Object.entries(MEDIA.items).find(([, e]) => (e.media || []).some((m) => m.kind === 'photo' && m.offer === 'download' && m.asset))
        if (withKept) {
            const [id] = withKept
            const pics = picturesOf({ id, item: ITEMS.get(id), apiBase: '/serverXR' })
            expect(pics[0].kind).toBe('maker')
        }
        const pics = picturesOf({ id: 'up-b380f', item: ITEMS.get('up-b380f') })
        expect(pics.every((p) => p.kind !== 'maker')).toBe(true) // no apiBase, no maker's file
        expect(photosOf('up-b380f').every((m) => m.offer === 'download' || m.offer === 'link')).toBe(true)
        expect(documentsOf('up-q108s').length).toBeGreaterThan(0)
    })
})
