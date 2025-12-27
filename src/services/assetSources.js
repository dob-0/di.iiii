const assetSourceMap = new Map()
const MAX_CONCURRENT_STREAMS = 3
const streamQueue = []
let activeStreams = 0

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '')
const ensureLeadingSlash = (value = '') => (value.startsWith('/') ? value : `/${value}`)
const isAbsolute = (value = '') => /^https?:\/\//i.test(value)

const buildFromBase = (baseUrl = '', suffix = '') => {
    if (!baseUrl) return suffix || null
    const base = trimTrailingSlash(baseUrl)
    const tail = suffix ? suffix.replace(/^\/+/, '') : ''
    return tail ? `${base}/${tail}` : base
}

const SERVER_ASSET_BASE_REGEX = /\/api\/spaces\/[^/]+\/assets$/i
const isServerAssetBase = (baseUrl = '') => SERVER_ASSET_BASE_REGEX.test(trimTrailingSlash(baseUrl || ''))
const normalizeArchivePath = (value = '') => value.replace(/^\/+/, '')

const buildAbsolutePath = (path = '') => {
    const normalized = ensureLeadingSlash(path.replace(/^\/+/, ''))
    if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}${normalized}`
    }
    return normalized
}

const resolveAssetUrl = (asset, baseUrl = '') => {
    const candidates = getAssetUrlCandidates(asset, baseUrl)
    return candidates.length ? candidates[0] : null
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

    const normalizedBase = trimTrailingSlash(baseUrl || '')
    const archivePath = asset.archivePath ? normalizeArchivePath(asset.archivePath) : ''

    if (asset.url) {
        if (isAbsolute(asset.url)) {
            addCandidate(candidates, asset.url)
        } else {
            addCandidate(candidates, buildAbsolutePath(asset.url))
        }
    }

    if (normalizedBase) {
        if (isServerAssetBase(normalizedBase)) {
            if (asset.id) {
                addCandidate(candidates, `${normalizedBase}/${asset.id}`)
            }
        } else if (archivePath) {
            addCandidate(candidates, `${normalizedBase}/${archivePath}`)
        } else if (asset.id) {
            // Fallback for archives that are stored under /assets/<id> (e.g., default-scene.zip extraction)
            addCandidate(candidates, `${normalizedBase}/assets/${asset.id}`)
            addCandidate(candidates, `${normalizedBase}/${asset.id}`)
        }
        if (!isServerAssetBase(normalizedBase) && asset.id) {
            addCandidate(candidates, `${normalizedBase}/${asset.id}`)
        }
    }

    if (archivePath) {
        addCandidate(candidates, ensureLeadingSlash(archivePath))
    }

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
    return enqueueStream(async () => {
        let lastError = null
        for (const url of candidates) {
            if (!url) continue
            try {
                const response = await fetch(url, { cache: 'no-store' })
                if (!response.ok) {
                    lastError = new Error(`Failed to fetch ${url} (${response.status})`)
                    continue
                }
                return response.blob()
            } catch (error) {
                lastError = error
            }
        }
        throw lastError || new Error(`No remote source available for asset ${id}`)
    })
}
