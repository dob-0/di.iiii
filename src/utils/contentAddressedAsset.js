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

// The `cache` mode an asset fetch should use, given its id or its url.
//
// Content-addressed ids are immutable, so the browser may trust the server's
// own `immutable` Cache-Control outright. Legacy (pre-content-addressing)
// ids are project-local and mutable — the same id can be overwritten with
// different bytes — so those must never be served from cache unchecked.
//
// `no-cache` is what "mutable" actually asks for: the response IS stored, and
// the browser revalidates it with the server (If-None-Match / If-Modified-
// Since) before every reuse, so a replaced asset still arrives fresh while an
// unchanged one costs a 304 with no body. `no-store` — which every one of
// these call sites used until 2026-09-21 — forbids storing at all, so each
// fetch re-downloads the whole file. Measured on the front room that day: two
// model entities carrying a 3.2 MB legacy asset each, loaded twice apiece,
// pulled 12.84 MB of the page's 13.04 MB. Revalidation makes three of those
// four requests a 0-byte 304, at no cost to correctness.
export const assetFetchCacheMode = (idOrUrl) => (
    isContentAddressedAssetUrl(idOrUrl) ? 'default' : 'no-cache'
)

export default isContentAddressedAssetUrl
