/**
 * document-asset-refs.mjs — every asset id a project document actually needs.
 *
 * `document.assets` is a manifest, not the truth. It is filled in when the
 * Studio places an entity that carries media; it stays EMPTY for a code-mode
 * page, because `space-sync.mjs` uploads the page's files and then rewrites
 * their names into `/api/projects/<id>/assets/<sha256>` URLs *inside the built
 * markup* — never touching `document.assets`.
 *
 * Every transfer script read the manifest alone. `project-pull.mjs` printed
 * "0 assets" for `beyond-form/open-call`, copied nothing, and reported
 * success; the document arrived on the dev box and on staging pointing at 13
 * GLBs that only production had. The page answered with a 404 per model and
 * said nothing — no test fails when a picture is missing.
 *
 * So: read the ids off the document itself. A URL sitting in built JS is a
 * dependency exactly as much as a manifest row is.
 *
 * Asset ids are sha256 hex, 64 characters — nothing else in a document is a
 * 64-character hex string, which is why `asset-remap-lib.mjs` can rewrite them
 * by substring and why matching them here cannot collide with prose.
 */

export const ASSET_ID_RE = /^[a-f0-9]{64}$/

const projectAssetUrlRe = () => /\/api\/projects\/([A-Za-z0-9._-]+)\/assets\/([a-f0-9]{64})/g
const spaceAssetUrlRe = () => /\/api\/spaces\/([A-Za-z0-9._-]+)\/assets\/([a-f0-9]{64})/g

const walkStrings = (value, visit) => {
    if (typeof value === 'string') { visit(value); return }
    if (Array.isArray(value)) { for (const item of value) walkStrings(item, visit); return }
    if (value && typeof value === 'object') {
        for (const item of Object.values(value)) walkStrings(item, visit)
    }
}

/**
 * The raw find: what the manifest declares, and what the document's strings
 * point at. Kept separate so a caller can tell a page that lost its bytes from
 * a page that never had a manifest — the audit reports the difference.
 */
export const collectDocumentAssetRefs = (document) => {
    const manifest = []
    const seenManifest = new Set()
    if (Array.isArray(document?.assets)) {
        for (const asset of document.assets) {
            const id = typeof asset?.id === 'string' ? asset.id : null
            if (!id || seenManifest.has(id)) continue
            seenManifest.add(id)
            manifest.push({ id, name: asset?.name || null, mimeType: asset?.mimeType || null })
        }
    }

    const projectUrls = []
    const spaceUrls = []
    const seenProjectUrl = new Set()
    const seenSpaceUrl = new Set()
    walkStrings(document, (text) => {
        if (!text.includes('/assets/')) return
        for (const match of text.matchAll(projectAssetUrlRe())) {
            const key = `${match[1]}/${match[2]}`
            if (seenProjectUrl.has(key)) continue
            seenProjectUrl.add(key)
            projectUrls.push({ projectId: match[1], id: match[2] })
        }
        for (const match of text.matchAll(spaceAssetUrlRe())) {
            const key = `${match[1]}/${match[2]}`
            if (seenSpaceUrl.has(key)) continue
            seenSpaceUrl.add(key)
            spaceUrls.push({ spaceId: match[1], id: match[2] })
        }
    })

    return { manifest, projectUrls, spaceUrls }
}

/**
 * What has to exist in THIS project's asset store for the document to render.
 *
 * Manifest rows first (they carry a name and a mime type, which a transfer
 * wants), then the ids that only a URL knows about. `projectId` filters the
 * URLs to this project's own store; omit it to take every project URL the
 * document carries, whoever it names.
 */
export const collectProjectAssetRefs = (document, projectId = null) => {
    const { manifest, projectUrls } = collectDocumentAssetRefs(document)
    const refs = []
    const seen = new Set()
    for (const asset of manifest) {
        seen.add(asset.id)
        refs.push({ ...asset, source: 'manifest' })
    }
    for (const ref of projectUrls) {
        if (projectId && ref.projectId !== projectId) continue
        if (seen.has(ref.id)) continue
        seen.add(ref.id)
        refs.push({ id: ref.id, name: null, mimeType: null, source: 'url' })
    }
    return refs
}
