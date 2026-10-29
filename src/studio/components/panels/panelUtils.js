// Asset URLs come in two shapes: space assets already include the /serverXR mount,
// project assets are mount-relative. Resolve without double-prefixing (the cause of
// the blank "/serverXR/serverXR/..." thumbnails).
export const assetSrc = (url) => {
    if (!url) return ''
    if (/^(https?:|\/serverXR\/)/.test(url)) return url
    return `/serverXR${url.startsWith('/') ? '' : '/'}${url}`
}

export const formatTimestamp = (value) => {
    if (!value) return 'Not yet'
    try {
        return new Date(value).toLocaleString()
    } catch {
        return String(value)
    }
}
