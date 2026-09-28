#!/usr/bin/env node
/**
 * kit-weights.mjs — the numbers the Kit prints about itself, measured.
 *
 * Reads a finished `dist/` and writes src/kit/kitWeights.json:
 *   kitPageKB        gzip of the Kit's own chunk(s): KitPage js + css
 *   coreKB           gzip of what every page loads before any route: the
 *                    index.html modulepreload + stylesheet list
 *   threeKB          gzip of the three-vendor chunk a live picture fetches
 *   firstLoadKB      what a first visit to /tools fetches, desk (kit-first-load.mjs)
 *   firstLoadPhoneKB the same on a phone
 *
 * Run AFTER `npm run build`; the page imports the JSON, so the next build
 * carries the numbers (the JSON itself is a few hundred bytes and does not
 * move them).
 *
 *   npm run build && node scripts/kit-weights.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(repoRoot, 'dist')
const assets = path.join(dist, 'assets')
const out = path.join(repoRoot, 'src/kit/kitWeights.json')

if (!existsSync(path.join(dist, 'index.html'))) {
    console.error('no dist/index.html — run `npm run build` first')
    process.exit(2)
}

const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length
const kb = (bytes) => Math.round(bytes / 102.4) / 10
const files = readdirSync(assets)
const sum = (pattern) => files.filter((f) => pattern.test(f)).reduce((total, f) => total + gz(path.join(assets, f)), 0)

const kitPage = sum(/^KitPage-.*\.(js|css)$/)
const three = sum(/^three-vendor-.*\.js$/)
const html = readFileSync(path.join(dist, 'index.html'), 'utf8')
const eager = [...html.matchAll(/href="\/(assets\/[^"]+)"/g)].map((m) => m[1])
const core = eager.reduce((total, rel) => total + gz(path.join(dist, rel)), 0) + gzipSync(Buffer.from(html)).length

const tmp = path.join(mkdtempSync(path.join(os.tmpdir(), 'kit-weights-')), 'first-load.json')
execFileSync(process.execPath, [path.join(repoRoot, 'scripts/kit-first-load.mjs'), '--route', '/tools', '--json', tmp], { stdio: 'inherit' })
const first = JSON.parse(readFileSync(tmp, 'utf8'))
const desk = first.reports.find((r) => r.name === 'desk')
const phone = first.reports.find((r) => r.name === 'phone')

const weights = {
    measured: new Date().toISOString().slice(0, 10),
    method: 'scripts/kit-weights.mjs: gzip -9 of the built chunks; first load from scripts/kit-first-load.mjs in Playwright Firefox (1440×900 @1, 390×844 @3), static dist, no server',
    kitPageKB: kb(kitPage),
    coreKB: kb(core),
    threeKB: kb(three),
    firstLoadKB: desk.wireKB,
    firstLoadPhoneKB: phone.wireKB,
    firstLoadFiles: desk.files,
    threeOnFirstLoad: Boolean(desk.threeVendorLoaded || phone.threeVendorLoaded)
}
writeFileSync(out, `${JSON.stringify(weights, null, 2)}\n`)
console.log(JSON.stringify(weights, null, 2))
