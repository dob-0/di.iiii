/**
 * asset-remap-lib.mjs — repoint a document at the asset ids it actually got.
 *
 * Every transfer script assumed the destination would store an asset under the
 * id it was handed, so the document's references would resolve untouched.
 * `project-pull.mjs` says so in a comment: "Ids are preserved so the document's
 * existing references resolve without rewriting."
 *
 * That is false whenever the destination rewrites the bytes. The upload route
 * strips EXIF/GPS before hashing — deliberately, so no photographer's position
 * ever reaches a public URL — and a scrubbed file no longer hashes to the id
 * the caller computed from the original, so the route drops the requested id
 * and stores under the new content address. It answers 200. The transfer
 * counts a success. And the document still points at ids that are now nowhere.
 *
 * Measured on the dev box after a full mirror of staging: **106 of 244 assets
 * unresolvable across 8 projects** — `library/di-library` 51/51,
 * `dilijan/desk` 17/17, `dilijan/welcome` 14/16. Every photo wall grey, every
 * count in the sync report reading "copied, 0 failed".
 *
 * The Studio already handles this: "Callers already remap ids from the
 * response (bundle import in StudioEditor/RawHub)". The scripts never did.
 */

/**
 * Replace every occurrence of an old asset id with its new one, anywhere in
 * the document.
 *
 * Deliberately generic rather than a list of known fields. An id is referenced
 * from `assets[].id`, `assets[].url`, `components.media.assetId`,
 * `worldState.environmentAssetId`, and from inside `presentationState.codeHtml`
 * as a URL in published page markup — and that list grows every time someone
 * adds a component that can carry media. A walk that rewrites any string
 * equal to or containing an old id cannot fall behind the schema.
 *
 * Asset ids are sha256 hex, 64 characters. Nothing else in a document is a
 * 64-character hex string, so substring rewriting cannot hit a false positive.
 */
export const remapAssetIds = (value, remap) => {
    if (!remap || !Object.keys(remap).length) return value
    if (typeof value === 'string') {
        let out = value
        for (const [from, to] of Object.entries(remap)) {
            if (from !== to && out.includes(from)) out = out.split(from).join(to)
        }
        return out
    }
    if (Array.isArray(value)) return value.map((item) => remapAssetIds(item, remap))
    if (value && typeof value === 'object') {
        const out = {}
        for (const [key, item] of Object.entries(value)) out[key] = remapAssetIds(item, remap)
        return out
    }
    return value
}

/**
 * What the destination actually stored, read back from its own response.
 *
 * The upload route answers with the asset it wrote. Trusting the id we SENT is
 * the whole bug; this reads the id that came back, and reports a remap only
 * when the two disagree.
 */
export const remapFromUpload = ({ requestedId, response }) => {
    const stored = response?.asset?.id || response?.assetId || response?.id
    if (!stored || stored === requestedId) return null
    return { [requestedId]: stored }
}
