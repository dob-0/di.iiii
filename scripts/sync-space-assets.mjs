import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_SPACES_DIR = path.join(ROOT_DIR, 'serverXR', 'data', 'spaces')

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '')

const parseArgs = (argv = []) => {
    const args = {
        space: 'main',
        spacesDir: DEFAULT_SPACES_DIR,
        dryRun: false,
        overwrite: false,
        limit: Infinity,
        baseUrl: ''
    }

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--space') {
            args.space = argv[index + 1] || args.space
            index += 1
            continue
        }
        if (arg === '--spaces-dir') {
            args.spacesDir = path.resolve(argv[index + 1] || args.spacesDir)
            index += 1
            continue
        }
        if (arg === '--base-url') {
            args.baseUrl = trimTrailingSlash(argv[index + 1] || '')
            index += 1
            continue
        }
        if (arg === '--limit') {
            const parsed = Number(argv[index + 1])
            if (Number.isFinite(parsed) && parsed > 0) {
                args.limit = parsed
            }
            index += 1
            continue
        }
        if (arg === '--overwrite') {
            args.overwrite = true
            continue
        }
        if (arg === '--dry-run') {
            args.dryRun = true
            continue
        }
    }

    return args
}

const loadScene = async (scenePath) => {
    const raw = await fs.readFile(scenePath, 'utf8')
    return JSON.parse(raw)
}

const pathExists = async (targetPath) => {
    try {
        await fs.access(targetPath)
        return true
    } catch {
        return false
    }
}

const uniqueValues = (values = []) => Array.from(new Set(values.filter(Boolean)))

const buildAssetCandidates = (asset, sceneBaseUrl, overrideBaseUrl = '') => {
    const baseUrl = trimTrailingSlash(overrideBaseUrl || sceneBaseUrl || '')
    return uniqueValues([
        asset?.url || '',
        baseUrl && asset?.id ? `${baseUrl}/${asset.id}` : ''
    ])
}

const downloadAsset = async (asset, sceneBaseUrl, overrideBaseUrl = '') => {
    const candidates = buildAssetCandidates(asset, sceneBaseUrl, overrideBaseUrl)
    let lastError = null

    for (const candidate of candidates) {
        try {
            const response = await fetch(candidate)
            if (!response.ok) {
                lastError = new Error(`Failed to fetch ${candidate} (${response.status})`)
                continue
            }
            const contentType = response.headers.get('content-type') || ''
            if (contentType.includes('text/html')) {
                lastError = new Error(`Received HTML instead of asset bytes from ${candidate}`)
                continue
            }
            const buffer = Buffer.from(await response.arrayBuffer())
            return {
                url: candidate,
                buffer,
                mimeType: asset?.mimeType || contentType || 'application/octet-stream'
            }
        } catch (error) {
            lastError = error
        }
    }

    throw lastError || new Error(`No download source available for asset ${asset?.id || 'unknown'}`)
}

const formatCount = (value) => `${value} asset${value === 1 ? '' : 's'}`

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const spaceDir = path.join(args.spacesDir, args.space)
    const scenePath = path.join(spaceDir, 'scene.json')
    const assetsDir = path.join(spaceDir, 'assets')

    const scene = await loadScene(scenePath)
    const manifest = Array.isArray(scene.assets) ? scene.assets : []
    const sceneBaseUrl = trimTrailingSlash(scene.assetsBaseUrl || '')

    if (!manifest.length) {
        console.log(`No assets found in ${scenePath}`)
        return
    }

    await fs.mkdir(assetsDir, { recursive: true })

    const queue = []
    for (const asset of manifest) {
        if (!asset?.id) continue
        const assetPath = path.join(assetsDir, asset.id)
        const hasAsset = await pathExists(assetPath)
        if (hasAsset && !args.overwrite) {
            continue
        }
        queue.push(asset)
    }

    const selectedAssets = queue.slice(0, args.limit)
    console.log(
        `${args.dryRun ? 'Planning' : 'Syncing'} ${formatCount(selectedAssets.length)} for space "${args.space}" `
        + `(manifest: ${manifest.length}, overwrite: ${args.overwrite ? 'yes' : 'no'})`
    )

    if (args.dryRun || !selectedAssets.length) {
        selectedAssets.slice(0, 20).forEach((asset) => {
            console.log(`- ${asset.id} ${asset.name || ''}`.trim())
        })
        if (selectedAssets.length > 20) {
            console.log(`...and ${selectedAssets.length - 20} more`)
        }
        return
    }

    let completed = 0
    for (const asset of selectedAssets) {
        const assetPath = path.join(assetsDir, asset.id)
        const metaPath = `${assetPath}.json`
        const downloaded = await downloadAsset(asset, sceneBaseUrl, args.baseUrl)
        const metadata = {
            id: asset.id,
            name: asset.name || asset.id,
            mimeType: downloaded.mimeType || 'application/octet-stream',
            size: downloaded.buffer.byteLength,
            createdAt: asset.createdAt || Date.now()
        }
        await fs.writeFile(assetPath, downloaded.buffer)
        await fs.writeFile(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
        completed += 1
        console.log(`[${completed}/${selectedAssets.length}] synced ${asset.id} <- ${downloaded.url}`)
    }

    console.log(`Finished syncing ${formatCount(completed)} into ${assetsDir}`)
}

main().catch((error) => {
    console.error(error?.stack || error?.message || error)
    process.exitCode = 1
})
