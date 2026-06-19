import JSZip from 'jszip'
import { normalizeProjectDocument } from '../../shared/projectSchema.js'
import { getAssetUrlCandidates } from '../../services/assetSources.js'

const PROJECT_ENTRY = 'project.json'
const BUNDLE_FORMAT = 'dii-studio-project'
const BUNDLE_VERSION = 1

const readBlob = (blob, method) => {
    if (typeof blob?.[method] === 'function') return blob[method]()
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error || new Error(`Could not read ${blob?.name || 'file'}`))
        reader.onload = () => resolve(reader.result)
        if (method === 'text') reader.readAsText(blob)
        else reader.readAsArrayBuffer(blob)
    })
}

const safeSegment = (value, fallback) => {
    const normalized = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return normalized || fallback
}

const fetchAssetBlob = async (asset) => {
    const candidates = getAssetUrlCandidates(asset)
    let lastError = null
    for (const url of candidates) {
        try {
            const response = await fetch(url, { credentials: 'include', cache: 'no-store' })
            if (!response.ok) {
                lastError = new Error(`${response.status} ${response.statusText}`.trim())
                continue
            }
            return response.blob()
        } catch (error) {
            lastError = error
        }
    }
    throw new Error(`Could not export asset "${asset.name || asset.id}": ${lastError?.message || 'no downloadable source'}`)
}

export async function createStudioProjectBundle(sourceDocument, options = {}) {
    const loadAsset = options.loadAsset || fetchAssetBlob
    const onProgress = options.onProgress || (() => {})
    const document = normalizeProjectDocument(sourceDocument)
    const zip = new JSZip()
    const assets = document.assets || []
    const results = new Array(assets.length)
    let nextIndex = 0
    let completed = 0

    onProgress({ phase: 'downloading', completed, total: assets.length })
    const worker = async () => {
        while (nextIndex < assets.length) {
            const index = nextIndex
            nextIndex += 1
            const asset = assets[index]
            const blob = await loadAsset(asset)
            results[index] = { asset, blob }
            completed += 1
            onProgress({ phase: 'downloading', completed, total: assets.length, asset })
        }
    }
    await Promise.all(Array.from({ length: Math.min(3, Math.max(1, assets.length)) }, worker))

    const bundledAssets = results.map(({ asset, blob }) => {
        if (!(blob instanceof Blob)) {
            throw new Error(`Could not export asset "${asset.name || asset.id}": invalid binary response`)
        }
        const assetId = safeSegment(asset.id, 'asset')
        const filename = safeSegment(asset.name, `${assetId}.bin`)
        const archivePath = `assets/${assetId}/${filename}`
        zip.file(archivePath, blob)
        return {
            ...asset,
            size: blob.size,
            mimeType: asset.mimeType || blob.type || 'application/octet-stream',
            archivePath
        }
    })

    zip.file(PROJECT_ENTRY, JSON.stringify({
        ...document,
        bundle: { format: BUNDLE_FORMAT, version: BUNDLE_VERSION },
        assets: bundledAssets
    }, null, 2))

    onProgress({ phase: 'packing', percent: 0, total: assets.length })
    return zip.generateAsync({ type: 'blob', compression: 'STORE' }, (metadata) => {
        onProgress({ phase: 'packing', percent: metadata.percent, total: assets.length })
    })
}

export async function readStudioProjectBundle(file) {
    const isZip = file.name?.toLowerCase().endsWith('.zip') || file.type?.includes('zip')
    if (!isZip) {
        return {
            document: normalizeProjectDocument(JSON.parse(await readBlob(file, 'text'))),
            assetFiles: new Map()
        }
    }

    const zip = await JSZip.loadAsync(await readBlob(file, 'arrayBuffer'))
    const projectEntry = zip.file(PROJECT_ENTRY)
    if (!projectEntry) throw new Error(`Project archive is missing ${PROJECT_ENTRY}`)
    const rawDocument = JSON.parse(await projectEntry.async('string'))
    if (rawDocument.bundle?.format !== BUNDLE_FORMAT) {
        throw new Error('Unsupported Studio project archive')
    }

    const assetFiles = new Map()
    for (const asset of rawDocument.assets || []) {
        if (!asset?.id || !asset.archivePath) {
            throw new Error(`Project archive has incomplete asset metadata for ${asset?.name || asset?.id || 'unknown asset'}`)
        }
        const entry = zip.file(asset.archivePath)
        if (!entry) throw new Error(`Project archive is missing ${asset.archivePath}`)
        const blob = await entry.async('blob')
        assetFiles.set(asset.id, new File([blob], asset.name || asset.id, {
            type: asset.mimeType || blob.type || 'application/octet-stream'
        }))
    }

    return {
        document: normalizeProjectDocument(rawDocument),
        assetFiles
    }
}
