import { describe, it, expect } from 'vitest'
import { collectDocumentAssetRefs, collectProjectAssetRefs } from './document-asset-refs.mjs'

const A = 'f5c4b3e023104970a8d09a72b9bb5ecd91ecd087a27fba802188d4e68001af69'
const B = '2ccadc1ed05d21e59db17114eea8a1753deab53326bae3f3175b86c145708b77'
const C = '9f2d42325d60592dfebc5d20eaf4509afedbe69f9003ffe71de8e590906df34b'

// The shape that lost 13 files: space-sync rewrites asset names into URLs
// inside the built bundle and never writes a manifest row.
const codePageDocument = {
    assets: [],
    presentationState: {
        mode: 'code',
        codeFiles: [{
            name: 'index.html',
            content: `<script>const m="/serverXR/api/projects/open-call/assets/${A}",n="/serverXR/api/projects/open-call/assets/${B}"</script>`
        }]
    }
}

describe('collectProjectAssetRefs', () => {
    // The regression guard for the beyond-form outage: a code-mode page whose
    // manifest is empty still depends on every file its markup names.
    it('finds the assets of a code page whose manifest is empty', () => {
        const refs = collectProjectAssetRefs(codePageDocument, 'open-call')
        expect(refs.map((r) => r.id).sort()).toEqual([B, A].sort())
        expect(refs.every((r) => r.source === 'url')).toBe(true)
    })

    it('keeps the manifest rows, with the name and mime a transfer needs', () => {
        const document = {
            assets: [{ id: C, name: 'poster.png', mimeType: 'image/png' }],
            entities: [{ components: { media: { url: `/api/projects/welcome/assets/${A}` } } }]
        }
        expect(collectProjectAssetRefs(document, 'welcome')).toEqual([
            { id: C, name: 'poster.png', mimeType: 'image/png', source: 'manifest' },
            { id: A, name: null, mimeType: null, source: 'url' }
        ])
    })

    it('does not count an id twice when the manifest and a URL agree', () => {
        const document = {
            assets: [{ id: A, name: 'model.glb', mimeType: 'model/gltf-binary' }],
            presentationState: { codeHtml: `<a href="/api/projects/open-call/assets/${A}">` }
        }
        const refs = collectProjectAssetRefs(document, 'open-call')
        expect(refs).toHaveLength(1)
        expect(refs[0].source).toBe('manifest')
    })

    // A page can legitimately embed another project's asset. That file is not
    // missing from THIS store, and reporting it as such is a false alarm.
    it('ignores a URL that names a different project', () => {
        const document = { assets: [], presentationState: { codeHtml: `<img src="/api/projects/other/assets/${A}">` } }
        expect(collectProjectAssetRefs(document, 'open-call')).toEqual([])
        expect(collectProjectAssetRefs(document)).toHaveLength(1)
    })

    it('reads nothing out of a document that references nothing', () => {
        expect(collectProjectAssetRefs({ assets: [], entities: [] }, 'open-call')).toEqual([])
        expect(collectProjectAssetRefs(null, 'open-call')).toEqual([])
    })
})

describe('collectDocumentAssetRefs', () => {
    it('separates the space-level store from the project one', () => {
        const document = {
            assets: [],
            presentationState: {
                codeHtml: `<img src="/api/spaces/beyond-form/assets/${A}"><img src="/api/projects/open-call/assets/${B}">`
            }
        }
        const refs = collectDocumentAssetRefs(document)
        expect(refs.spaceUrls).toEqual([{ spaceId: 'beyond-form', id: A }])
        expect(refs.projectUrls).toEqual([{ projectId: 'open-call', id: B }])
        expect(refs.manifest).toEqual([])
    })

    // Prose is not a reference. The 64-hex bound is what keeps this honest.
    it('does not read an asset URL out of a truncated or malformed id', () => {
        const document = { presentationState: { codeHtml: `see /api/projects/open-call/assets/${A.slice(0, 48)} for the model` } }
        expect(collectDocumentAssetRefs(document).projectUrls).toEqual([])
    })
})
