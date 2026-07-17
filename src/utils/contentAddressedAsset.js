// Matches serverXR's SHA256_HEX_REGEX (serverXR/src/assetHash.js) -- kept as
// a separate client-side copy since this file is bundled into the browser
// and that one isn't.
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i

// Server-verified content-addressed asset ids (sha256 of the actual bytes)
// can never change without changing the id itself, so the browser HTTP cache
// can be trusted indefinitely -- the server already sends
// `Cache-Control: public, max-age=31536000, immutable` for these. Legacy
// (pre-content-addressing) asset ids are project-local and mutable, so a
// cached copy could go stale if the same id is ever overwritten; those must
// keep bypassing the cache. This checks the URL's last path segment against
// the id shape rather than trusting a `no-store` blanket default (audit
// 2026-07-17: that blanket default was throwing away the server's immutable
// caching for every model/asset fetch, content-addressed or not).
export const isContentAddressedAssetUrl = (url) => {
    if (!url || typeof url !== 'string') return false
    const withoutQuery = url.split(/[?#]/)[0]
    const lastSegment = withoutQuery.split('/').filter(Boolean).pop() || ''
    return SHA256_HEX_REGEX.test(lastSegment)
}

export default isContentAddressedAssetUrl
