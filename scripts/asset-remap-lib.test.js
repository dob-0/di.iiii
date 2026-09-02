import { describe, it, expect } from 'vitest'
import { remapAssetIds, remapFromUpload } from './asset-remap-lib.mjs'

const OLD = '97a850da2f4aa8c31998251e6f6e4c3ffea3437425a8783947994b5999ba9f9d'
const NEW = '155681f777db349018873113c90882516cd8ad3a0fad11419e18013be4c586d9'

describe('remapFromUpload', () => {
    // The whole bug in one assertion: the transfer trusted the id it SENT.
    it('reads the id the server stored, not the one we asked for', () => {
        expect(remapFromUpload({ requestedId: OLD, response: { ok: true, asset: { id: NEW } } }))
            .toEqual({ [OLD]: NEW })
    })

    it('is quiet when the server kept the id', () => {
        expect(remapFromUpload({ requestedId: OLD, response: { asset: { id: OLD } } })).toBeNull()
    })

    // A response we cannot read is not a licence to assume the id survived —
    // but it is also not a remap. The caller keeps its own id and the audit
    // catches it, rather than this inventing a rewrite from nothing.
    it('reports nothing when the response says nothing', () => {
        expect(remapFromUpload({ requestedId: OLD, response: {} })).toBeNull()
        expect(remapFromUpload({ requestedId: OLD, response: null })).toBeNull()
    })
})

describe('remapAssetIds', () => {
    it('follows an id into every place a document can hold one', () => {
        const document = {
            assets: [{ id: OLD, url: `/serverXR/api/projects/welcome/assets/${OLD}` }],
            entities: [{ components: { media: { assetId: OLD } } }],
            worldState: { environmentAssetId: OLD },
            presentationState: { codeHtml: `<img src="/serverXR/api/projects/welcome/assets/${OLD}">` }
        }
        const out = remapAssetIds(document, { [OLD]: NEW })
        expect(out.assets[0].id).toBe(NEW)
        expect(out.assets[0].url).toContain(NEW)
        expect(out.entities[0].components.media.assetId).toBe(NEW)
        expect(out.worldState.environmentAssetId).toBe(NEW)
        expect(out.presentationState.codeHtml).toContain(NEW)
        expect(JSON.stringify(out)).not.toContain(OLD)
    })

    it('leaves the document alone when nothing was remapped', () => {
        const document = { assets: [{ id: OLD }], entities: [] }
        expect(remapAssetIds(document, {})).toBe(document)
        expect(remapAssetIds(document, null)).toBe(document)
    })

    it('rewrites only the ids that moved', () => {
        const other = 'b'.repeat(64)
        const out = remapAssetIds({ assets: [{ id: OLD }, { id: other }] }, { [OLD]: NEW })
        expect(out.assets[0].id).toBe(NEW)
        expect(out.assets[1].id).toBe(other)
    })

    it('survives the shapes a document actually contains', () => {
        const out = remapAssetIds(
            { n: 1, t: true, z: null, nested: [[{ deep: OLD }]] },
            { [OLD]: NEW }
        )
        expect(out.nested[0][0].deep).toBe(NEW)
        expect(out).toMatchObject({ n: 1, t: true, z: null })
    })
})
