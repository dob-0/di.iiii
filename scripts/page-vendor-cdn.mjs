/**
 * page-vendor-cdn.mjs — point a space's published pages at /vendor/ instead
 * of a CDN, so they paint on a machine with no internet.
 *
 * A published page is HTML in a project document (presentationState.codeHtml
 * or codeFiles[].content) rendered in a srcdoc iframe. Several load three.js,
 * Leaflet, cannon-es, marked or es-module-shims from cdnjs / unpkg / jsdelivr
 * and go black offline (docs/testing/FESTIVAL_MACHINE_2026-09-06.md). The
 * same libraries, pinned, live in public/vendor/ (VENDOR.md there) and are
 * served at /vendor/ on every tier and on a `di` install.
 *
 * What it rewrites — nothing else:
 *   <script src="…">           a CDN URL the map knows → /vendor/…
 *   <link href="…">            same. A Google Fonts link is a webfont request,
 *                              not a library: by default it is LEFT and reported
 *                              (offline the page falls back to its own font
 *                              stack, online it keeps its face); --drop-fonts
 *                              removes the <link> so the page never asks
 *   <script type="importmap">  each URL value the map knows, including the
 *                              `examples/jsm/` prefix — that is how the ESM
 *                              pages load three, and es-module-shims exists in
 *                              those pages precisely to honour the map
 * Any other CDN URL — a string inside JavaScript, an import() call, a library
 * the map does not know — is left exactly as it is and printed, because a
 * blind replace inside prose or code is how a page gets quietly broken.
 *
 * Code before data. `--apply` first asks the target's own origin for every
 * /vendor/ file the rewritten pages would fetch; one 404 and NOTHING is
 * written. A page rewritten against a server that has no /vendor/ yet is
 * black online too — that happened on the owner's install on 2026-09-07
 * (docs/ai/sessions/feat-vendor-cdn-libs-for-offline-pages.md).
 *
 * Usage:
 *   node scripts/page-vendor-cdn.mjs --space azd                    # local, dry-run
 *   node scripts/page-vendor-cdn.mjs --tier staging --space dilijan  # staging, dry-run
 *   node scripts/page-vendor-cdn.mjs --space azd --apply
 *   node scripts/page-vendor-cdn.mjs --space azd --restore --apply   # put the originals back
 *
 * Options:
 *   --tier <local|staging>   default local. There is no prod entry: production
 *                            data moves on the owner's word, never from here.
 *   --space <id>             every project in this space (repeatable)
 *   --project <space/id>     one project (repeatable)
 *   --drop-fonts             also remove Google Fonts <link>s. Off by default:
 *                            that is a visible change to a page that works
 *                            online, and offline the fallback face is what
 *                            a visitor sees either way.
 *   --dry-run                default — print the per-project URL diff, write nothing
 *   --apply                  PUT the rewritten documents. The ORIGINAL of every
 *                            project written is saved first under --originals
 *   --originals <dir>        default ~/di-backups/page-vendor-cdn/ — laid out
 *                            <tier>/<space>/<project>.html (+ one file per
 *                            codeFiles entry, + the whole document as JSON,
 *                            which is what a restore actually needs)
 *   --restore                the other direction: PUT the saved
 *                            <project>.document.json back for every --space /
 *                            --project that has one under --originals. Dry-run
 *                            lists them; --apply writes. No vendor check — the
 *                            originals are the CDN pages that work online
 *   --api <url>              a scratch stack instead of the tier's API (a test
 *                            serverXR on a spare port). Refused for di-studio.xyz.
 *
 * Tokens come from serverXR/.env.local (API_TOKEN for local, LIVE_API_TOKEN for
 * staging), never printed. Never deletes a project, an asset or a space.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEnv } from './normalise-page-asset-urls.mjs'
import { isProductionTarget } from './tier-sync.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const VENDOR_DIR = path.join(ROOT_DIR, 'public', 'vendor')
const TIMEOUT_MS = 30000

// Local and staging only — by construction, not by flag.
export const TIERS = {
    local: { base: 'http://localhost:4000/serverXR', tokenKey: 'API_TOKEN' },
    staging: { base: 'https://staging.di-studio.xyz/serverXR', tokenKey: 'LIVE_API_TOKEN' }
}

export const CDN_HOSTS = ['cdnjs.cloudflare.com', 'unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com']
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

// npm-backed CDNs serve the same tree under two hosts; both spellings map.
const NPM = String.raw`https?://(?:cdn\.jsdelivr\.net/npm|unpkg\.com)`

/**
 * The map. `to` is a path under public/vendor/; the test suite asserts every
 * one exists, so adding a line here without the file fails CI. `prefix`
 * entries map a directory (an importmap's `three/addons/` value) and keep
 * whatever follows.
 */
export const VENDOR_MAP = [
    { test: new RegExp(String.raw`^https?://cdnjs\.cloudflare\.com/ajax/libs/three\.js/0\.160\.0/three\.min\.js$`), to: 'three@0.160.0/three.min.js' },
    { test: new RegExp(String.raw`^https?://cdnjs\.cloudflare\.com/ajax/libs/three\.js/r128/three\.min\.js$`), to: 'three@0.128.0/three.min.js' },
    { test: new RegExp(String.raw`^${NPM}/three@0\.128\.0/build/three\.min\.js$`), to: 'three@0.128.0/three.min.js' },
    { test: new RegExp(String.raw`^${NPM}/three@0\.160\.0/build/three\.module(?:\.min)?\.js$`), to: 'three@0.160.0/three.module.min.js' },
    { test: new RegExp(String.raw`^${NPM}/three@0\.160\.0/examples/jsm/`), to: 'three@0.160.0/examples/jsm/', prefix: true },
    { test: new RegExp(String.raw`^${NPM}/three@0\.166\.1/build/three\.module(?:\.min)?\.js$`), to: 'three@0.166.1/three.module.min.js' },
    { test: new RegExp(String.raw`^${NPM}/three@0\.166\.1/examples/jsm/`), to: 'three@0.166.1/examples/jsm/', prefix: true },
    { test: new RegExp(String.raw`^${NPM}/cannon-es@0\.20\.0/dist/cannon-es\.js$`), to: 'cannon-es@0.20.0/cannon-es.js' },
    { test: new RegExp(String.raw`^${NPM}/es-module-shims@1\.8\.0/dist/es-module-shims\.js$`), to: 'es-module-shims@1.8.0/es-module-shims.js' },
    { test: new RegExp(String.raw`^${NPM}/leaflet@1\.9\.4/dist/leaflet\.js$`), to: 'leaflet@1.9.4/leaflet.js' },
    { test: new RegExp(String.raw`^${NPM}/leaflet@1\.9\.4/dist/leaflet\.css$`), to: 'leaflet@1.9.4/leaflet.css' },
    // The pages ask for `marked` unpinned; jsdelivr resolved that to 15.0.12 on
    // 2026-09-06 and that is the copy vendored, so any 15.x spelling maps.
    { test: new RegExp(String.raw`^${NPM}/marked(?:@15(?:\.0(?:\.12)?)?)?/marked\.min\.js$`), to: 'marked@15.0.12/marked.min.js' }
]

const hostOf = (url) => {
    try { return new URL(url.startsWith('//') ? `https:${url}` : url).hostname } catch { return '' }
}
export const isCdnUrl = (url) => CDN_HOSTS.includes(hostOf(url))
export const isFontUrl = (url) => FONT_HOSTS.includes(hostOf(url))

/** The /vendor/ path for a CDN URL, or null when the map does not know it. */
export const vendorPathFor = (url) => {
    const absolute = url.startsWith('//') ? `https:${url}` : url
    const bare = absolute.split(/[?#]/)[0]
    for (const entry of VENDOR_MAP) {
        const match = bare.match(entry.test)
        if (!match) continue
        return entry.prefix ? `/vendor/${entry.to}${bare.slice(match[0].length)}` : `/vendor/${entry.to}`
    }
    return null
}

const lineOf = (text, offset) => text.slice(0, offset).split('\n').length

const ATTR = (name) => new RegExp(String.raw`(\s${name}\s*=\s*)(["'])([^"']*)\2`, 'i')

// Rewrites the URL attribute of one tag, or drops the tag for a font link.
// Returns the new tag text and the change it made (or null for no CDN URL).
const rewriteTag = ({ tag, attr, allowDrop, dropFonts }) => {
    const m = tag.match(ATTR(attr))
    if (!m) return { tag, change: null }
    const url = m[3]
    if (!isCdnUrl(url)) return { tag, change: null }
    if (isFontUrl(url)) {
        if (allowDrop && dropFonts) return { tag: '', change: { kind: 'drop', from: url } }
        return { tag, change: { kind: 'font', from: url } }
    }
    const to = vendorPathFor(url)
    if (!to) return { tag, change: { kind: 'unknown', from: url } }
    return { tag: tag.replace(m[0], `${m[1]}${m[2]}${to}${m[2]}`), change: { kind: 'rewrite', from: url, to } }
}

const IMPORTMAP_BLOCK = /(<script\b[^>]*\btype\s*=\s*["']importmap["'][^>]*>)([\s\S]*?)(<\/script>)/gi
const SCRIPT_TAG = /<script\b[^>]*>/gi
const LINK_TAG = /<link\b[^>]*>/gi
const ANY_CDN_URL = /(?:https?:)?\/\/(?:cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)[^\s"'`)<>]*/g

/**
 * Rewrite one HTML text. Returns { html, changes, fetches } where every change is
 * { kind: 'rewrite' | 'drop' | 'font' | 'unknown' | 'left' | 'missing-addon', line, from, to? }
 * and `fetches` is every concrete /vendor/ path the rewritten page will ask the
 * server for (a prefix rewrite contributes the addons the page imports through
 * it) — what --apply probes before it writes anything.
 * Pure: the same input always gives the same output, and running it on its
 * own output changes nothing.
 */
export const rewriteHtml = (input = '', { dropFonts = false } = {}) => {
    const changes = []
    let html = String(input || '')

    html = html.replace(IMPORTMAP_BLOCK, (whole, open, body, close, offset) => {
        const line = lineOf(html, offset)
        const rewrittenBody = body.replace(/"((?:https?:)?\/\/[^"]+)"/g, (quoted, url) => {
            if (!isCdnUrl(url)) return quoted
            const to = vendorPathFor(url)
            if (!to) { changes.push({ kind: 'unknown', where: 'importmap', line, from: url }); return quoted }
            changes.push({ kind: 'rewrite', where: 'importmap', line, from: url, to })
            return `"${to}"`
        })
        return `${open}${rewrittenBody}${close}`
    })

    html = html.replace(SCRIPT_TAG, (tag, offset) => {
        const { tag: next, change } = rewriteTag({ tag, attr: 'src', allowDrop: false, dropFonts })
        if (change) changes.push({ ...change, where: 'script src', line: lineOf(html, offset) })
        return next
    })

    // A dropped <link> that sat on its own line takes the line with it. This
    // pass only drops; every other link is left for the pass below so that
    // one tag is never reported twice.
    html = html.replace(/^([ \t]*)(<link\b[^>]*>)([ \t]*\r?\n)?/gim, (whole, indent, tag, eol = '', offset) => {
        const { change } = rewriteTag({ tag, attr: 'href', allowDrop: true, dropFonts })
        if (change?.kind !== 'drop') return whole
        changes.push({ ...change, where: 'link href', line: lineOf(html, offset) })
        return eol ? '' : indent
    })
    html = html.replace(LINK_TAG, (tag, offset) => {
        const { tag: next, change } = rewriteTag({ tag, attr: 'href', allowDrop: true, dropFonts })
        if (change) changes.push({ ...change, where: 'link href', line: lineOf(html, offset) })
        return next
    })

    // Anything the page still fetches from a CDN — inside JavaScript, an
    // import(), a fallback string — is reported, never touched.
    const reportedFonts = new Set(changes.filter((c) => c.kind === 'font').map((c) => c.from))
    for (const m of html.matchAll(ANY_CDN_URL)) {
        if (reportedFonts.has(m[0])) continue
        changes.push({ kind: 'left', where: 'elsewhere', line: lineOf(html, m.index), from: m[0] })
    }

    // An importmap prefix only helps if the addons the page imports are here.
    const fetches = new Set(changes.filter((c) => c.kind === 'rewrite' && !c.to.endsWith('/')).map((c) => c.to))
    const rewroteAddons = changes.filter((c) => c.kind === 'rewrite' && c.where === 'importmap' && c.to.endsWith('/examples/jsm/'))
    for (const entry of rewroteAddons) {
        const seen = new Set()
        for (const m of html.matchAll(/["']three\/addons\/([^"']+)["']/g)) {
            if (seen.has(m[1])) continue
            seen.add(m[1])
            fetches.add(`${entry.to}${m[1]}`)
            const file = path.join(VENDOR_DIR, entry.to.replace(/^\/vendor\//, ''), m[1])
            if (!fs.existsSync(file)) changes.push({ kind: 'missing-addon', where: 'importmap', line: lineOf(html, m.index), from: `three/addons/${m[1]}`, to: `${entry.to}${m[1]}` })
        }
    }

    return { html, changes, fetches: [...fetches] }
}

/** Rewrite codeHtml and every codeFiles[].content of one document (shallow copy). */
export const rewriteDocument = (document, options = {}) => {
    const ps = document?.presentationState
    if (!ps) return { document, changes: [], changed: false, fetches: [] }
    const next = { ...document, presentationState: { ...ps } }
    const changes = []
    const fetches = new Set()
    let changed = false

    if (typeof ps.codeHtml === 'string') {
        const r = rewriteHtml(ps.codeHtml, options)
        if (r.html !== ps.codeHtml) { next.presentationState.codeHtml = r.html; changed = true }
        changes.push(...r.changes.map((c) => ({ ...c, file: 'codeHtml' })))
        r.fetches.forEach((f) => fetches.add(f))
    }
    if (Array.isArray(ps.codeFiles)) {
        next.presentationState.codeFiles = ps.codeFiles.map((file) => {
            const content = typeof file?.content === 'string' ? file.content : ''
            const r = rewriteHtml(content, options)
            changes.push(...r.changes.map((c) => ({ ...c, file: `codeFiles/${file?.name || '?'}` })))
            r.fetches.forEach((f) => fetches.add(f))
            if (r.html === content) return file
            changed = true
            return { ...file, content: r.html }
        })
    }
    return { document: next, changes, changed, fetches: [...fetches] }
}

/**
 * Which of the /vendor/ paths the rewritten pages will fetch does this origin
 * NOT serve? A GET per path (HEAD is not what a browser sends and a static
 * mount may answer it differently); anything but 200 counts as missing.
 */
export const missingVendorFiles = async (origin, fetches, { fetchImpl = fetch } = {}) => {
    const missing = []
    for (const pathname of [...new Set(fetches)].sort()) {
        try {
            const res = await fetchImpl(origin + pathname, { signal: AbortSignal.timeout(TIMEOUT_MS) })
            if (res.status !== 200) missing.push({ pathname, status: res.status })
        } catch (error) {
            missing.push({ pathname, status: error?.name === 'TimeoutError' ? 'timeout' : String(error?.message || error) })
        }
    }
    return missing
}

export const parseArgs = (argv) => {
    const args = { tier: 'local', spaces: [], projects: [], apply: false, dropFonts: false, restore: false, originals: null, api: null }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--tier') args.tier = argv[++i]
        else if (arg === '--space') args.spaces.push(argv[++i])
        else if (arg === '--project') args.projects.push(argv[++i])
        else if (arg === '--apply') args.apply = true
        else if (arg === '--dry-run') args.apply = false
        else if (arg === '--drop-fonts') args.dropFonts = true
        else if (arg === '--restore') args.restore = true
        else if (arg === '--originals') args.originals = argv[++i]
        else if (arg === '--api') args.api = argv[++i]
        else throw new Error(`unknown argument ${arg}`)
    }
    return args
}

/** The API base to talk to. Throws for anything that is not local or staging. */
export const resolveApi = ({ tier, api }) => {
    if (api) {
        if (isProductionTarget(api)) throw new Error('refused: --api points at production')
        return api.replace(/\/+$/, '')
    }
    if (!TIERS[tier]) throw new Error(`refused: --tier must be local or staging, got ${tier}`)
    return TIERS[tier].base
}

const defaultOriginals = () => path.join(os.homedir(), 'di-backups', 'page-vendor-cdn')

const saveOriginal = ({ dir, tier, spaceId, projectId, document }) => {
    const target = path.join(dir, tier, spaceId)
    fs.mkdirSync(target, { recursive: true })
    const ps = document.presentationState || {}
    if (typeof ps.codeHtml === 'string') fs.writeFileSync(path.join(target, `${projectId}.html`), ps.codeHtml)
    for (const file of ps.codeFiles || []) {
        if (typeof file?.content === 'string') fs.writeFileSync(path.join(target, `${projectId}.${path.basename(file.name || 'file')}`), file.content)
    }
    fs.writeFileSync(path.join(target, `${projectId}.document.json`), JSON.stringify(document))
    return target
}

const printChanges = (changes) => {
    for (const c of changes) {
        const at = `${c.file}:${c.line}`.padEnd(28)
        if (c.kind === 'rewrite') console.log(`    ${at} - ${c.from}\n    ${''.padEnd(28)} + ${c.to}`)
        else if (c.kind === 'drop') console.log(`    ${at} x dropped <link> ${c.from}`)
        else if (c.kind === 'font') console.log(`    ${at} ~ Google Fonts, kept (--drop-fonts removes it): ${c.from}`)
        else if (c.kind === 'unknown') console.log(`    ${at} ? not in the map, left: ${c.from}`)
        else if (c.kind === 'missing-addon') console.log(`    ${at} ! imports ${c.from} but ${c.to} is not vendored`)
        else console.log(`    ${at} ! left in place (${c.where}): ${c.from}`)
    }
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    if (!args.spaces.length && !args.projects.length) {
        console.error('usage: node scripts/page-vendor-cdn.mjs [--tier local|staging] (--space <id> | --project <space/id>)... [--apply] [--drop-fonts] [--originals <dir>] [--api <url>]')
        process.exit(1)
    }
    const base = resolveApi(args)
    const token = readEnv()[TIERS[args.tier]?.tokenKey] || ''
    const call = (pathname, options = {}) => fetch(base + pathname, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    const targets = args.projects.map((p) => {
        const i = p.indexOf('/')
        if (i === -1) throw new Error(`--project wants <space>/<id>, got ${p}`)
        return { spaceId: p.slice(0, i), projectId: p.slice(i + 1) }
    })
    const originalsDir = args.originals || defaultOriginals()

    if (args.restore) {
        // The saved documents are the source here, not the API: a space's
        // restore set is exactly the projects an --apply once wrote.
        for (const spaceId of args.spaces) {
            const dir = path.join(originalsDir, args.tier, spaceId)
            const saved = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.document.json')) : []
            if (!saved.length) console.log(`  ${spaceId}: no originals under ${dir}`)
            for (const f of saved) targets.push({ spaceId, projectId: f.slice(0, -'.document.json'.length) })
        }
        console.log(`${args.apply ? 'RESTORE' : 'RESTORE DRY-RUN'} tier=${args.tier} api=${base} — ${targets.length} project(s)\noriginals ← ${originalsDir}\n`)
        const restored = []
        for (const { spaceId, projectId } of targets) {
            const label = `${spaceId}/${projectId}`
            const file = path.join(originalsDir, args.tier, spaceId, `${projectId}.document.json`)
            if (!fs.existsSync(file)) { console.log(`  ${label}: no original at ${file} — skipped`); continue }
            const original = JSON.parse(fs.readFileSync(file, 'utf8'))
            const cdnUrls = new Set()
            for (const html of [original.presentationState?.codeHtml, ...(original.presentationState?.codeFiles || []).map((c) => c?.content)]) {
                for (const m of String(html || '').matchAll(ANY_CDN_URL)) cdnUrls.add(m[0])
            }
            console.log(`  ${label}: ${cdnUrls.size} CDN URL(s) come back`)
            if (!args.apply) continue
            const put = await call(`/api/projects/${projectId}/document`, { method: 'PUT', body: JSON.stringify(original) })
            if (!put.ok) { console.log(`    restore FAILED: HTTP ${put.status}`); process.exitCode = 1; continue }
            console.log('    restored')
            restored.push(label)
        }
        if (args.apply) console.log(`\n${restored.length} project(s) restored: ${restored.join(', ') || '—'}`)
        else console.log('\ndry-run — nothing written; pass --apply to restore.')
        return
    }

    for (const spaceId of args.spaces) {
        const res = await call(`/api/spaces/${spaceId}/projects`)
        if (!res.ok) { console.error(`  ${spaceId}: HTTP ${res.status} listing projects — skipped`); continue }
        const body = await res.json()
        for (const p of body.projects || []) targets.push({ spaceId, projectId: p.id })
    }

    console.log(`${args.apply ? 'APPLY' : 'DRY-RUN'} tier=${args.tier} api=${base} — ${targets.length} project(s)${args.dropFonts ? ', Google Fonts links dropped' : ''}${args.apply ? `\noriginals → ${originalsDir}` : ''}\n`)

    // Plan everything first, write nothing yet: the vendor probe below has to
    // see every path the whole run would introduce before the first PUT.
    const plans = []
    let untouched = 0
    for (const { spaceId, projectId } of targets) {
        const label = `${spaceId}/${projectId}`
        const res = await call(`/api/projects/${projectId}/document`)
        if (!res.ok) { console.log(`  ${label}: HTTP ${res.status} — skipped`); continue }
        const body = await res.json()
        const document = body.document || body
        const { document: next, changes, changed, fetches } = rewriteDocument(document, { dropFonts: args.dropFonts })
        if (!changes.length) { untouched++; continue }
        console.log(`  ${label}${changed ? '' : '  (nothing to rewrite)'}`)
        printChanges(changes)
        if (changed) plans.push({ spaceId, projectId, label, document, next, fetches })
    }

    const written = []
    if (args.apply && plans.length) {
        const origin = new URL(base).origin
        const missing = await missingVendorFiles(origin, plans.flatMap((p) => p.fetches))
        if (missing.length) {
            console.log(`\nREFUSED — ${origin} does not serve ${missing.length} of the /vendor/ files these pages would need; nothing written.`)
            for (const m of missing) console.log(`    ${m.status}  ${origin}${m.pathname}`)
            console.log('A page pointed at a /vendor/ that is not there is black online as well as offline.\n'
                + 'Install a build that carries public/vendor/ on this server first (code before data):\n'
                + '  a di install:  DI_PROFILE=local npm run build && node scripts/pack-runtime.mjs --no-build --version=<v>\n'
                + '                 then  di update --from dist-runtime/di-runtime-<v>.tar.gz\n'
                + '  a hosted tier: deploy the branch that has public/vendor/, then re-run this.')
            process.exitCode = 1
            return
        }
        console.log(`\n${origin} serves every /vendor/ file these pages need (${new Set(plans.flatMap((p) => p.fetches)).size} probed).`)
        for (const { spaceId, projectId, label, document, next } of plans) {
            const savedTo = saveOriginal({ dir: originalsDir, tier: args.tier, spaceId, projectId, document })
            const put = await call(`/api/projects/${projectId}/document`, { method: 'PUT', body: JSON.stringify(next) })
            if (!put.ok) { console.log(`  ${label}: write FAILED: HTTP ${put.status} (original kept at ${savedTo})`); process.exitCode = 1; continue }
            console.log(`  ${label}: written (original at ${savedTo}/${projectId}.*)`)
            written.push(label)
        }
    }

    console.log(`\n${untouched} project(s) load nothing from a CDN.`)
    if (args.apply) console.log(`${written.length} project(s) rewritten: ${written.join(', ') || '—'}`)
    else console.log('dry-run — nothing written; pass --apply to write.')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
    main().catch((error) => {
        console.error(error?.message || error)
        process.exit(1)
    })
}
