#!/usr/bin/env node
// Bundle sizes from a real build: every chunk's raw and gzip bytes, the entry and
// each lazy route chunk named by the module it starts from, and the first load
// (the entry plus everything it imports statically — what the browser must fetch
// before the app runs at all).
//
//   npx vite build --manifest
//   node scripts/audit/bundle-sizes.mjs [distDir] [--json]
//
// Reads <distDir>/.vite/manifest.json (default dist/). It never builds: the
// numbers are always those of the build that is on disk, so say which one.
// gzip is node's zlib at level 9; the server's own level may differ.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

export const gzipBytes = (buf) => zlib.gzipSync(buf, { level: 9 }).length

// manifest → one row per emitted .js/.css file. kind: entry | lazy | shared | css.
export function chunkRows(manifest, sizeOf) {
    const rows = new Map()
    const add = (file, kind, from) => {
        const prev = rows.get(file)
        if (prev && prev.kind !== 'shared') return
        rows.set(file, { file, kind, from: from || '', ...sizeOf(file) })
    }
    for (const [key, chunk] of Object.entries(manifest)) {
        if (!/\.(js|css)$/.test(chunk.file)) continue
        const kind = chunk.isEntry ? 'entry' : chunk.isDynamicEntry ? 'lazy' : 'shared'
        add(chunk.file, kind, kind === 'shared' ? (chunk.name || '') : (chunk.src || key))
        for (const css of chunk.css || []) add(css, 'css', chunk.src || key)
    }
    return [...rows.values()]
}

// The entry's static closure: its own file, every chunk it imports (recursively),
// and their css. Dynamic imports are left out — they load on a route.
export function firstLoad(manifest) {
    const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry)
    if (!entryKey) throw new Error('no entry chunk in the manifest')
    const seen = new Set()
    const files = new Set()
    const walk = (key) => {
        if (seen.has(key) || !manifest[key]) return
        seen.add(key)
        files.add(manifest[key].file)
        for (const css of manifest[key].css || []) files.add(css)
        for (const dep of manifest[key].imports || []) walk(dep)
    }
    walk(entryKey)
    return { entry: entryKey, files: [...files].filter((f) => /\.(js|css)$/.test(f)) }
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

function main(argv) {
    const json = argv.includes('--json')
    const dist = path.resolve(argv.find((a) => !a.startsWith('--')) || 'dist')
    const manifestPath = path.join(dist, '.vite', 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
        console.error(`no ${manifestPath} — build with: npx vite build --manifest`)
        process.exit(1)
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const sizeOf = (file) => {
        const buf = fs.readFileSync(path.join(dist, file))
        return { raw: buf.length, gzip: gzipBytes(buf) }
    }
    const rows = chunkRows(manifest, sizeOf).sort((a, b) => b.raw - a.raw)
    const first = firstLoad(manifest)
    const byFile = new Map(rows.map((r) => [r.file, r]))
    const firstRows = first.files.map((f) => byFile.get(f) || { file: f, ...sizeOf(f) })
    const sum = (list, k) => list.reduce((n, r) => n + r[k], 0)
    const total = { raw: sum(rows, 'raw'), gzip: sum(rows, 'gzip') }
    const firstTotal = { raw: sum(firstRows, 'raw'), gzip: sum(firstRows, 'gzip') }

    if (json) {
        console.log(JSON.stringify({ rows, firstLoad: { entry: first.entry, files: first.files, ...firstTotal }, total }, null, 2))
        return
    }
    console.log('| kind | file | starts from | raw | gzip |')
    console.log('|---|---|---|---:|---:|')
    for (const r of rows) console.log(`| ${r.kind} | ${r.file} | ${r.from} | ${kb(r.raw)} | ${kb(r.gzip)} |`)
    console.log(`\nall chunks: ${rows.length} files, ${kb(total.raw)} raw, ${kb(total.gzip)} gzip`)
    console.log(`first load (${first.entry} + static imports, ${first.files.length} files): ${kb(firstTotal.raw)} raw, ${kb(firstTotal.gzip)} gzip`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2))
