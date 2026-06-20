#!/usr/bin/env node
/**
 * optimize-wcc-assets.mjs
 *
 * Optimizes WCC project assets in-place:
 *   - PNG images → WebP (quality 85, saves 60-80%)
 *   - MP4 videos → H.264 CRF 28 (saves 80-95%)
 *
 * After optimizing, updates asset file + metadata .json + document.json
 * to use the new SHA-256 hash.
 *
 * Usage:
 *   node scripts/optimize-wcc-assets.mjs [--dry-run] [--project <id>] [--min-size <bytes>]
 *
 * Requires: ffmpeg, magick (ImageMagick 7)
 */

import { createHash } from 'node:crypto'
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WCC_DIR = path.join(ROOT_DIR, 'serverXR', 'data', 'spaces', 'wcc', 'projects')

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const PROJECT_FILTER = args.includes('--project') ? args[args.indexOf('--project') + 1] : null
const MIN_SIZE_IDX = args.indexOf('--min-size')
const MIN_SIZE = MIN_SIZE_IDX !== -1 ? Number(args[MIN_SIZE_IDX + 1]) : 100_000 // 100KB default

if (DRY_RUN) console.log('[dry-run] No files will be modified.\n')

// ── Helpers ───────────────────────────────────────────────────────────────────
function sha256(filePath) {
    const buf = fs.readFileSync(filePath)
    return createHash('sha256').update(buf).digest('hex')
}

function fmtMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function run(cmd, args, opts = {}) {
    const result = spawnSync(cmd, args, { stdio: 'pipe', ...opts })
    if (result.status !== 0) {
        throw new Error(`${cmd} failed:\n${result.stderr?.toString()}`)
    }
    return result
}

// ── Optimization functions ────────────────────────────────────────────────────
function optimizePng(srcPath, destPath) {
    run('magick', [srcPath, '-quality', '85', destPath])
}

function optimizeMp4(srcPath, destPath) {
    run('ffmpeg', [
        '-y', '-i', srcPath,
        '-c:v', 'libx264',
        '-crf', '28',
        '-preset', 'slow',
        '-vf', 'scale=\'min(1920,iw)\':-2',  // cap at 1920px wide
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        destPath,
    ])
}

// ── Core logic ────────────────────────────────────────────────────────────────
async function replaceAssetInDocument(docPath, oldId, newId, newName, newSize, newMime) {
    let text = await fsp.readFile(docPath, 'utf8')
    const original = text

    // Replace all occurrences of the old ID
    text = text.replaceAll(oldId, newId)

    // Update the name in the assets array (only where it sits next to the new id)
    // Pattern: "id": "<newId>", "name": "<oldName>"
    text = text.replace(
        new RegExp(`("id":\\s*"${newId}",[^}]*"name":\\s*)"[^"]*"`),
        `$1"${newName}"`
    )
    // Update size
    text = text.replace(
        new RegExp(`("id":\\s*"${newId}",[^}]*"size":\\s*)\\d+`),
        `$1${newSize}`
    )
    // Update mimeType if changed (PNG→WebP)
    if (newMime) {
        text = text.replace(
            new RegExp(`("id":\\s*"${newId}",[^}]*"mimeType":\\s*)"[^"]*"`),
            `$1"${newMime}"`
        )
    }

    if (text === original) {
        console.log(`  [skip] document unchanged: ${path.basename(docPath)}`)
        return false
    }

    if (!DRY_RUN) {
        await fsp.writeFile(docPath, text, 'utf8')
    }
    return true
}

async function processAsset(assetPath, projectDir, docPath) {
    const metaPath = assetPath + '.json'
    if (!fs.existsSync(metaPath)) return

    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'))
    const { id: oldId, name, mimeType, size } = meta

    if (size < MIN_SIZE) return

    const ext = path.extname(name).toLowerCase()
    // Strip the original (possibly mixed-case) extension to get the stem
    const stem = name.slice(0, name.length - path.extname(name).length)
    let shouldOptimize = false
    let optimizeFn = null
    let newExt = ext
    let newMime = mimeType

    if (ext === '.png' && mimeType === 'image/png') {
        shouldOptimize = true
        optimizeFn = optimizePng
        newExt = '.webp'
        newMime = 'image/webp'
    } else if ((ext === '.mp4' || ext === '.mov' || ext === '.avi') && mimeType?.startsWith('video/')) {
        shouldOptimize = true
        optimizeFn = optimizeMp4
        newExt = '.mp4'
        newMime = 'video/mp4'
    }

    if (!shouldOptimize) return

    const newName = stem + newExt
    const tmpPath = path.join(os.tmpdir(), `wcc-opt-${Date.now()}${newExt}`)

    console.log(`\n[${path.basename(projectDir)}] ${name}`)
    console.log(`  original: ${fmtMB(size)}`)

    if (DRY_RUN) {
        console.log(`  → would convert to ${newName} (${newMime})`)
        return
    }

    try {
        optimizeFn(assetPath, tmpPath)
    } catch (err) {
        console.error(`  ERROR during optimization: ${err.message}`)
        try { fs.unlinkSync(tmpPath) } catch {}
        return
    }

    const newSize = fs.statSync(tmpPath).size
    const newId = sha256(tmpPath)
    const newAssetPath = path.join(projectDir, 'assets', newId)
    const newMetaPath = newAssetPath + '.json'

    console.log(`  optimized: ${fmtMB(newSize)} (saved ${fmtMB(size - newSize)})`)
    console.log(`  new id: ${newId.slice(0, 16)}...`)

    if (newId === oldId) {
        console.log(`  [skip] hash unchanged — file was already optimal`)
        fs.unlinkSync(tmpPath)
        return
    }

    // Write new asset file (copy across potential filesystem boundaries, then remove tmp)
    fs.copyFileSync(tmpPath, newAssetPath)
    fs.unlinkSync(tmpPath)

    // Write new metadata
    const newMeta = {
        id: newId,
        name: newName,
        mimeType: newMime,
        size: newSize,
        createdAt: meta.createdAt,
        ...(meta.source ? { source: meta.source } : {}),
    }
    await fsp.writeFile(newMetaPath, JSON.stringify(newMeta, null, 2), 'utf8')

    // Update document.json
    if (docPath && fs.existsSync(docPath)) {
        const updated = await replaceAssetInDocument(docPath, oldId, newId, newName, newSize, newMime)
        console.log(`  document.json: ${updated ? 'updated' : 'unchanged'}`)
    }

    // Remove old files
    try { fs.unlinkSync(assetPath) } catch {}
    try { fs.unlinkSync(metaPath) } catch {}
    console.log(`  ✓ done`)
}

async function main() {
    const projectDirs = fs.readdirSync(WCC_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(WCC_DIR, e.name))
        .filter(d => !PROJECT_FILTER || path.basename(d) === PROJECT_FILTER)

    let totalSaved = 0

    for (const projectDir of projectDirs) {
        const assetsDir = path.join(projectDir, 'assets')
        if (!fs.existsSync(assetsDir)) continue

        const docPath = path.join(projectDir, 'document.json')
        const assetFiles = fs.readdirSync(assetsDir)
            .filter(f => !f.endsWith('.json'))
            .map(f => path.join(assetsDir, f))

        for (const assetPath of assetFiles) {
            await processAsset(assetPath, projectDir, docPath)
        }
    }
}

main().catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
})
