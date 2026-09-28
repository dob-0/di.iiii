#!/usr/bin/env node
/**
 * kit-first-load.mjs — what one route of the BUILT app costs a first visitor.
 *
 * Serves `dist/` as the hosted tiers do (static files, SPA fallback, no API),
 * opens a route in Playwright Firefox at two sizes — a desk at 1440×900 DPR 1
 * and a phone at 390×844 DPR 3 — and adds up what the browser actually fetched
 * from this origin: gzip bytes for text (js, css, html, svg, json), raw bytes
 * for everything else (fonts, images). The same measure as the kit audit of
 * 2026-09-28 (gzip of the chunks a route loads), only taken from a real
 * browser instead of from the chunk graph.
 *
 *   node scripts/kit-first-load.mjs                    # /tools, both sizes
 *   node scripts/kit-first-load.mjs --route /tools --json out.json
 *   node scripts/kit-first-load.mjs --route / --settle 4000
 *
 * The API is absent on purpose: /serverXR/* answers 404, exactly as a page
 * whose server is unreachable would see it, and nothing here depends on it.
 * A route that needs the server to render anything at all will measure only
 * its shell — say so when you quote the number.
 */
import http from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const DIST = path.join(repoRoot, 'dist')

const arg = (name, fallback = null) => {
    const index = process.argv.indexOf(`--${name}`)
    if (index === -1) return fallback
    const value = process.argv[index + 1]
    return value && !value.startsWith('--') ? value : true
}

const route = arg('route', '/tools')
const settleMs = Number(arg('settle', 3000))
const jsonOut = arg('json', null)
const only = arg('only', null) // 'desk' | 'phone'

const TYPES = {
    '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff',
    '.wasm': 'application/wasm', '.txt': 'text/plain', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
}
const TEXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.txt', '.webmanifest'])

const fileFor = (urlPath) => {
    const clean = decodeURIComponent(urlPath.split('?')[0])
    const candidate = path.join(DIST, clean)
    if (candidate.startsWith(DIST) && existsSync(candidate) && statSync(candidate).isFile()) return candidate
    return null
}

const serve = () => new Promise((resolve) => {
    const server = http.createServer((req, res) => {
        if (req.url.startsWith('/serverXR/')) {
            res.writeHead(404, { 'content-type': 'application/json' })
            res.end('{"error":"no server in this measurement"}')
            return
        }
        const file = fileFor(req.url) || path.join(DIST, 'index.html')
        const ext = path.extname(file)
        res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store' })
        createReadStream(file).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
})

const sizeOf = (file) => {
    const bytes = readFileSync(file)
    const ext = path.extname(file)
    return {
        raw: bytes.length,
        wire: TEXT.has(ext) ? gzipSync(bytes, { level: 9 }).length : bytes.length,
        gzipped: TEXT.has(ext)
    }
}

const measure = async (browser, base, { name, viewport, deviceScaleFactor, hasTouch }) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch })
    const page = await context.newPage()
    const seen = new Map()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error?.message || error)))
    page.on('response', (response) => {
        const url = response.url()
        if (!url.startsWith(base)) return
        const urlPath = new URL(url).pathname
        if (urlPath.startsWith('/serverXR/')) return
        const file = fileFor(urlPath) || (response.headers()['content-type']?.includes('text/html') ? path.join(DIST, 'index.html') : null)
        if (!file || seen.has(urlPath)) return
        seen.set(urlPath, { path: urlPath, kind: path.extname(file).slice(1) || 'html', ...sizeOf(file) })
    })
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(settleMs)
    const files = [...seen.values()]
    const sum = (list, key) => list.reduce((total, f) => total + f[key], 0)
    const code = files.filter((f) => ['js', 'mjs', 'css', 'html'].includes(f.kind))
    const report = {
        name, route, viewport, deviceScaleFactor,
        files: files.length,
        wireKB: Math.round(sum(files, 'wire') / 102.4) / 10,
        codeWireKB: Math.round(sum(code, 'wire') / 102.4) / 10,
        rawKB: Math.round(sum(files, 'raw') / 102.4) / 10,
        threeVendorLoaded: files.some((f) => /three-vendor/.test(f.path)),
        errors,
        largest: files.sort((a, b) => b.wire - a.wire).slice(0, 8).map((f) => ({ path: f.path, wireKB: Math.round(f.wire / 102.4) / 10 }))
    }
    await context.close()
    return report
}

const main = async () => {
    if (!existsSync(path.join(DIST, 'index.html'))) {
        console.error('no dist/index.html — run `npm run build` first')
        process.exit(2)
    }
    const { firefox } = await import('playwright')
    const { server, port } = await serve()
    const base = `http://127.0.0.1:${port}`
    const browser = await firefox.launch()
    const profiles = [
        { name: 'desk', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false },
        { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true }
    ].filter((profile) => !only || profile.name === only)
    const reports = []
    for (const profile of profiles) reports.push(await measure(browser, base, profile))
    await browser.close()
    server.close()
    for (const report of reports) {
        console.log(`${report.route} · ${report.name} ${report.viewport.width}×${report.viewport.height} @${report.deviceScaleFactor}x: ${report.files} files, ${report.wireKB} KB on the wire (gzip for text), of which code ${report.codeWireKB} KB; three.js loaded: ${report.threeVendorLoaded ? 'YES' : 'no'}${report.errors.length ? `; page errors: ${report.errors.join(' | ')}` : ''}`)
        for (const f of report.largest) console.log(`    ${String(f.wireKB).padStart(7)} KB  ${f.path}`)
    }
    if (jsonOut) {
        const { writeFileSync } = await import('node:fs')
        writeFileSync(jsonOut, JSON.stringify({ measured: new Date().toISOString().slice(0, 10), reports }, null, 2))
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
