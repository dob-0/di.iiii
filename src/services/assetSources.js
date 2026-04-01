import { apiBaseUrl } from './apiClient.js'
import { normalizeSpaceId } from '../utils/spaceNames.js'

const assetSourceMap = new Map()
const MAX_CONCURRENT_STREAMS = 3
const streamQueue = []
let activeStreams = 0

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '')
const ensureLeadingSlash = (value = '') => (value.startsWith('/') ? value : `/${value}`)
const isAbsolute = (value = '') => /^https?:\/\//i.test(value)

const SERVER_ASSET_BASE_REGEX = /\/api\/spaces\/[^/]+\/assets$/i
const SPACE_API_SEGMENT_REGEX = /(\/api\/spaces\/)([^/]+)(?=\/|$)/i
const isServerAssetBase = (baseUrl = '') => SERVER_ASSET_BASE_REGEX.test(trimTrailingSlash(baseUrl || ''))
const normalizeArchivePath = (value = '') => value.replace(/^\/+/, '')

const buildAbsolutePath = (path = '') => {
    const normalized = ensureLeadingSlash(path.replace(/^\/+/, ''))
    if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}${normalized}`
    }
    return normalized
}

const extractPathname = (value = '') => {
    if (!value) return ''
    if (isAbsolute(value)) {
        try {
            const url = new URL(value)
            return url.pathname || ''
        } catch {
            return ''
        }
    }
    return ensureLeadingSlash(String(value).trim().replace(/^\/+/, ''))
}

const extractApiPath = (pathname = '') => {
    const normalizedPathname = String(pathname || '')
    const apiIndex = normalizedPathname.indexOf('/api/')
    return apiIndex >= 0 ? normalizedPathname.slice(apiIndex) : ''
}

const normalizeSpacePathname = (pathname = '') => {
    if (!pathname) return ''
    return String(pathname).replace(SPACE_API_SEGMENT_REGEX, (match, prefix, spaceId) => {
        const normalizedSpaceId = normalizeSpaceId(spaceId)
        if (!normalizedSpaceId) {
            return match
        }
        return `${prefix}${normalizedSpaceId}`
    })
}

const normalizeSpaceUrl = (value = '') => {
    if (!value) return ''
    if (isAbsolute(value)) {
        try {
            const url = new URL(value)
            const normalizedPathname = normalizeSpacePathname(url.pathname || '')
            if (normalizedPathname) {
                url.pathname = normalizedPathname
            }
            return url.toString()
        } catch {
            return value
        }
    }
    return normalizeSpacePathname(ensureLeadingSlash(String(value).trim().replace(/^\/+/, '')))
}

const buildApiMountedUrl = (value = '') => {
    const base = trimTrailingSlash(apiBaseUrl || '')
    const pathname = normalizeSpacePathname(extractPathname(value))
    const apiPath = extractApiPath(pathname)
    if (!base || !apiPath) {
        return null
    }
    return `${base}${apiPath}`
}

const processQueue = () => {
    if (!streamQueue.length || activeStreams >= MAX_CONCURRENT_STREAMS) return
    const { task } = streamQueue.shift()
    activeStreams += 1
    task().finally(() => {
        activeStreams -= 1
        processQueue()
    })
}

const enqueueStream = (runner) => {
    return new Promise((resolve, reject) => {
        streamQueue.push({
            task: () => runner().then(resolve).catch(reject)
        })
        processQueue()
    })
}

export function registerAssetSources(assets = [], baseUrl = '', fallbackBases = []) {
    assetSourceMap.clear()
    const bases = [baseUrl, ...(Array.isArray(fallbackBases) ? fallbackBases : [])]
    assets.forEach((asset) => {
        if (!asset?.id) return
        const candidates = []
        bases.forEach((base) => {
            getAssetUrlCandidates(asset, base).forEach((candidate) => {
                if (!candidates.includes(candidate)) {
                    candidates.push(candidate)
                }
            })
        })
        assetSourceMap.set(asset.id, candidates)
    })
}

export function setAssetSource(asset, baseUrl = '') {
    if (!asset?.id) return
    const existing = Array.isArray(assetSourceMap.get(asset.id))
        ? assetSourceMap.get(asset.id).filter(Boolean)
        : []
    let candidates
    if (asset.dataUrl) {
        candidates = [asset.dataUrl, ...existing.filter(url => url !== asset.dataUrl)]
    } else {
        candidates = getAssetUrlCandidates(asset, baseUrl)
        existing.forEach((url) => {
            if (!candidates.includes(url)) {
                candidates.push(url)
            }
        })
    }
    assetSourceMap.set(asset.id, candidates)
}

export function getAssetSourceUrl(id) {
    if (!id) return null
    const candidates = assetSourceMap.get(id)
    if (!candidates || !candidates.length) return null
    return candidates[0] || null
}

export function clearAssetSources() {
    assetSourceMap.clear()
}

const addCandidate = (list, value) => {
    if (!value) return
    if (!list.includes(value)) {
        list.push(value)
    }
}

export function getAssetUrlCandidates(asset, baseUrl = '') {
    const candidates = []
    if (!asset) {
        return candidates
    }

    const rawBase = trimTrailingSlash(baseUrl || '')
    const normalizedBase = trimTrailingSlash(normalizeSpaceUrl(rawBase))
    const archivePath = asset.archivePath ? normalizeArchivePath(asset.archivePath) : ''
    const deferredUrls = []
    const baseCandidates = []

    ;[
        buildApiMountedUrl(normalizedBase),
        normalizedBase,
        buildApiMountedUrl(rawBase),
        rawBase
    ].forEach((base) => {
        if (base && !baseCandidates.includes(base)) {
            baseCandidates.push(base)
        }
    })

    if (asset.url) {
        const addUrlValue = (value) => {
            if (!value) return
            const mountedUrl = buildApiMountedUrl(value)
            if (mountedUrl) {
                addCandidate(candidates, mountedUrl)
            }
            if (isAbsolute(value)) {
                addCandidate(candidates, value)
            } else {
                // Defer relative URLs so server base candidates are tried first.
                addCandidate(deferredUrls, buildAbsolutePath(value))
            }
        }

        const normalizedUrl = normalizeSpaceUrl(asset.url)
        addUrlValue(normalizedUrl)
        if (normalizedUrl !== asset.url) {
            addUrlValue(asset.url)
        }
    }

    baseCandidates.forEach((candidateBase) => {
        if (isServerAssetBase(candidateBase)) {
            if (asset.id) {
                addCandidate(candidates, `${candidateBase}/${asset.id}`)
            }
        } else if (archivePath) {
            addCandidate(candidates, `${candidateBase}/${archivePath}`)
        } else if (asset.id) {
            // Fallback for archives that are stored under /assets/<id> (e.g., default-scene.zip extraction)
            addCandidate(candidates, `${candidateBase}/assets/${asset.id}`)
            addCandidate(candidates, `${candidateBase}/${asset.id}`)
        }
        if (!isServerAssetBase(candidateBase) && asset.id) {
            addCandidate(candidates, `${candidateBase}/${asset.id}`)
        }
    })

    if (archivePath) {
        addCandidate(candidates, ensureLeadingSlash(archivePath))
    }

    deferredUrls.forEach((url) => addCandidate(candidates, url))

    return candidates
}

export function streamRemoteAsset(id) {
    if (!id) {
        return Promise.reject(new Error('Asset id required'))
    }
    const registered = assetSourceMap.get(id)
    const candidates = Array.isArray(registered) && registered.length
        ? [...registered]
        : []
    // Always try fallback default-scene paths after any registered sources
    ;[
        ensureLeadingSlash(`default-scene/assets/${id}`),
        ensureLeadingSlash(`default-scene/${id}`),
        ensureLeadingSlash(id)
    ].forEach((fallback) => addCandidate(candidates, fallback))
    
    console.log(`Attempting to stream asset ${id} from candidates:`, candidates)
    
    return enqueueStream(async () => {
        let lastError = null
        for (const url of candidates) {
            if (!url) continue
            try {
                console.log(`Trying asset URL: ${url}`)
                const response = await fetch(url, { cache: 'no-store' })
                if (!response.ok) {
                    lastError = new Error(`Failed to fetch ${url} (${response.status})`)
                    console.warn(`Asset fetch failed: ${url} (${response.status})`)
                    continue
                }
                
                // Check Content-Type to avoid accepting HTML error pages
                const contentType = response.headers.get('content-type') || ''
                if (contentType.includes('text/html')) {
                    lastError = new Error(`URL returned HTML instead of asset: ${url}`)
                    console.warn(`Asset URL returned HTML: ${url}`)
                    continue
                }
                
                console.log(`Successfully fetched asset from: ${url}`)
                return response.blob()
            } catch (error) {
                lastError = error
                console.warn(`Error fetching asset from ${url}:`, error)
            }
        }
        console.error(`All asset fetch attempts failed for ${id}`, lastError)
        throw lastError || new Error(`No remote source available for asset ${id}`)
    })
}
