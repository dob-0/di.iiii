/**
 * wcc-page-snapshot.mjs — stand the two coded WCC pages up as projects in the
 * `wcc` space, so the space's own list shows everything the exhibition has.
 *
 * Usage:
 *   node scripts/wcc-page-snapshot.mjs --to <url> [--token <token>]
 *                                      [--only landing|artist-works]
 *                                      [--out <dir>] [--dry-run]
 *
 * WHY. "wcc" names two things (src/works/works.js): the coded microsite served
 * at exactly /wcc, and the `wcc` SPACE holding eleven artist projects at
 * /wcc/<slug>. The landing page is the first kind, so it has no rows anywhere
 * and the space's project list could not show it — the owner opened
 * /wcc/studio, counted eleven artists, and asked where the landing page was.
 *
 * A copy in the database is a second source of truth, and he was told so before
 * choosing it (2026-09-10). This script is the answer to that: the copy is
 * COMPILED FROM the real source every time it runs, never retyped, so bringing
 * it level with the code is one command and not an editing session. What it
 * cannot do is notice on its own that the code moved — see the drift note in
 * docs/ai/sessions/feat-wcc-landing-project.md.
 *
 * Two pages, two projects:
 *   landing        src/wccSite/landing/ compiled through snapshotEntry.jsx —
 *                  the same LandingPage component the route renders.
 *   artist-works   public/wcc/artist-works-land/index.html, the hand-made page
 *                  the landing embeds in an iframe and nothing else links to.
 *
 * Media is REFERENCED, not inlined: every image already lives under /wcc/ on
 * any tier that carries the work, and a published page's iframe inherits the
 * shell's base URL (src/utils/presentationPreviewDocument.js), so a bare
 * `/wcc/process/process-01.jpeg` resolves on the tier actually serving it. Only
 * the webfonts are inlined, because those are bundled by vite and have no
 * stable public address. That keeps each project a few hundred KB rather than
 * 25 MB, and keeps it tier-independent.
 *
 * Requires a target (--to, or STAGING_API_URL / LIVE_API_URL from .env,
 * .env.local, serverXR/.env.local) and a token. There is no default target.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SPACE_ID = 'wcc'

// The date the copy was taken travels with it — in the title, and on the page
// itself. A month from now the only honest thing a snapshot can say is when it
// was taken and where the live one is.
//
// The operator's WALL-CLOCK date, not UTC's: `toISOString()` reads UTC, which
// in Yerevan (+04) still says "yesterday" for the first four hours of every
// day — a snapshot taken just after midnight would carry a date the person
// running it had not reached yet.
const now = new Date()
const TAKEN_ON = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const TAKEN_LABEL = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const PAGES = {
    'landing': {
        projectId: 'landing-page-snapshot',
        title: `Landing page — snapshot ${TAKEN_LABEL}`,
        liveAt: '/wcc',
        note: 'The page visitors meet at /wcc.'
    },
    'artist-works': {
        projectId: 'artists-works-page-snapshot',
        title: `Artists Works page — snapshot ${TAKEN_LABEL}`,
        liveAt: '/wcc/artist-works-land/index.html',
        note: 'The works page the landing shows inside its second panel.'
    }
}

const parseArgs = (argv) => {
    const args = { to: null, token: null, only: null, out: null, dryRun: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--to') { args.to = argv[++i]; continue }
        if (arg === '--token') { args.token = argv[++i]; continue }
        if (arg === '--only') { args.only = argv[++i]; continue }
        if (arg === '--out') { args.out = argv[++i]; continue }
        if (arg === '--dry-run') { args.dryRun = true; continue }
    }
    return args
}

const loadEnvFile = async (filePath) => {
    try {
        const raw = await fs.readFile(filePath, 'utf8')
        const env = {}
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const idx = trimmed.indexOf('=')
            if (idx === -1) continue
            const key = trimmed.slice(0, idx).trim()
            const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
            if (key) env[key] = value
        }
        return env
    } catch {
        return {}
    }
}

const buildHeaders = (token) => {
    const h = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
}

const apiFetch = async (url, options = {}) => {
    const response = await fetch(url, options)
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
        const error = new Error(`HTTP ${response.status} from ${url}: ${body?.error || JSON.stringify(body).slice(0, 200)}`)
        error.status = response.status
        throw error
    }
    return body
}

// The one visible line that says this is a copy. Deliberately not styled like
// the page: a snapshot that looks exactly like the live page, forever, is the
// drift risk wearing a disguise.
const snapshotMark = (page) => `
<a class="wcc-snapshot-mark" href="${page.liveAt}" target="_top" rel="noopener">
    <b>Snapshot</b> · taken ${TAKEN_LABEL} · the live page is at <code>${page.liveAt}</code>
</a>`

const SNAPSHOT_MARK_CSS = `
.wcc-snapshot-mark {
    position: fixed;
    left: 0;
    bottom: 0;
    z-index: 2147483647;
    display: block;
    padding: 6px 12px;
    border-top-right-radius: 8px;
    background: rgba(8, 6, 7, 0.86);
    color: rgba(255, 255, 255, 0.72);
    font: 400 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.02em;
    text-decoration: none;
    backdrop-filter: blur(6px);
}
.wcc-snapshot-mark b { color: #d90000; font-weight: 600; }
.wcc-snapshot-mark code { color: rgba(255, 255, 255, 0.92); }
.wcc-snapshot-mark:hover { color: #ffffff; }
`

const pageShell = ({ page, title, bodyHtml, cssHref, jsSrc }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title}</title>
<!-- Taken from ${page.liveAt} on ${TAKEN_ON} by scripts/wcc-page-snapshot.mjs. -->
${cssHref ? `<link rel="stylesheet" href="${cssHref}" />` : ''}
<style>
html, body { margin: 0; padding: 0; height: 100%; background: #070506; }
${SNAPSHOT_MARK_CSS}</style>
</head>
<body>
${bodyHtml}
${snapshotMark(page)}
${jsSrc ? `<script src="${jsSrc}"></script>` : ''}
</body>
</html>
`

/* ── the landing: compiled, not retyped ──────────────────────────────────── */

const buildLanding = async () => {
    // Imported here rather than at module load so `--only artist-works` and
    // `--dry-run` do not pay for vite's start-up.
    const { build } = await import('vite')
    const react = (await import('@vitejs/plugin-react')).default

    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wcc-landing-snapshot-'))
    await build({
        root: ROOT_DIR,
        configFile: false,
        logLevel: 'warn',
        plugins: [react()],
        // `configFile: false` means the app's own vite.config.js — which never
        // sets this either, and relies on the vite CLI's own default mode/define
        // wiring — plays no part here. Without it, `process.env.NODE_ENV` survives
        // into the bundle as a literal, undefined `process` throws the instant
        // React (and every other library gated on it) evaluates, and the page
        // never mounts: found by opening the built snapshot in a browser, where
        // the whole page was blank but for the snapshot banner.
        define: { 'process.env.NODE_ENV': JSON.stringify('production') },
        build: {
            outDir,
            emptyOutDir: true,
            // One file each. A snapshot travels as a string in a JSON document,
            // so a chunk graph would be a set of URLs that do not exist.
            lib: {
                entry: path.join(ROOT_DIR, 'src/wccSite/landing/snapshotEntry.jsx'),
                formats: ['iife'],
                name: 'WccLandingSnapshot',
                fileName: () => 'landing.js',
                cssFileName: 'landing'
            },
            // The lazy ProcessField import would otherwise become a second file.
            rollupOptions: { output: { inlineDynamicImports: true } },
            // Webfonts become data: URIs. Everything the page shows lives under
            // /wcc/ already and stays a URL — see the header.
            assetsInlineLimit: () => true,
            cssCodeSplit: false,
            sourcemap: false,
            reportCompressedSize: false
        }
    })

    const js = await fs.readFile(path.join(outDir, 'landing.js'), 'utf8')
    const css = await fs.readFile(path.join(outDir, 'landing.css'), 'utf8')
    await fs.rm(outDir, { recursive: true, force: true })

    const page = PAGES.landing
    return [
        {
            name: 'index.html',
            content: pageShell({
                page,
                title: 'WCC: Women Creating Change',
                bodyHtml: '<div id="wcc-landing-root"></div>',
                cssHref: 'landing.css',
                jsSrc: 'landing.js'
            })
        },
        { name: 'landing.css', content: css },
        { name: 'landing.js', content: js }
    ]
}

/* ── the artists works page: rehosted, not rewritten ─────────────────────── */

// Emily's page is a single hand-made file that loads its script, fonts and
// twelve photographs by `./`-relative path. Inside a published page's iframe
// `./` resolves against the SHELL's URL (/wcc/p/<id>), not against the folder
// the file came from, so every one of those would 404. Making them absolute is
// the whole port: same bytes, addresses that still point at the same files.
const ARTIST_WORKS_DIR = 'public/wcc/artist-works-land'
const ARTIST_WORKS_BASE = '/wcc/artist-works-land/'

// Matches both forms the page actually uses: `./support.js` (leading dot-slash)
// and bare `assets/alla.png` (no prefix at all — most of the <img> tags). An
// earlier version only caught the first form, which left every bare
// `assets/*.png|jpg` reference relative to the sandboxed iframe's opaque
// `about:srcdoc` base and 404ing — 12 of the page's own portraits. A scheme,
// a leading slash, or a fragment marks a URL that already resolves correctly
// and must be left alone.
export const absolutiseArtistWorksUrls = (html = '') =>
    String(html).replace(/\b(src|href)=(["'])((?:(?!\2)[\s\S])*)\2/g, (match, attr, quote, value) => {
        if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) return match
        const relative = value.replace(/^\.\//, '')
        return `${attr}=${quote}${ARTIST_WORKS_BASE}${relative}${quote}`
    })

const buildArtistWorks = async () => {
    const source = await fs.readFile(path.join(ROOT_DIR, ARTIST_WORKS_DIR, 'index.html'), 'utf8')
    const page = PAGES['artist-works']
    const body = absolutiseArtistWorksUrls(source)
        // The file is a whole document; the shell supplies its own head, so the
        // original's <head> contents ride along inside the body, which is where
        // the browser puts them anyway when it re-parses.
        .replace(/^[\s\S]*?<body[^>]*>/i, '')
        .replace(/<\/body>[\s\S]*$/i, '')

    return [
        {
            name: 'index.html',
            content: pageShell({
                page,
                title: 'WCC — Artists Works',
                bodyHtml: body,
                cssHref: null,
                jsSrc: null
            })
        }
    ]
}

/* ── putting a page in the space ─────────────────────────────────────────── */

const pushPage = async ({ liveBase, token, key, codeFiles, dryRun }) => {
    const page = PAGES[key]
    const bytes = codeFiles.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0)
    console.log(`[wcc-page-snapshot] ${key}`)
    console.log(`  project: ${page.projectId}`)
    console.log(`  title:   ${page.title}`)
    console.log(`  files:   ${codeFiles.map((f) => `${f.name} (${Math.round(Buffer.byteLength(f.content, 'utf8') / 1024)} KB)`).join(', ')}`)
    if (bytes > 9 * 1024 * 1024) {
        throw new Error(`Snapshot is ${Math.round(bytes / 1024 / 1024)} MB; serverXR accepts a 10 MB JSON body.`)
    }
    if (dryRun) { console.log('  dry-run: no changes'); return }

    let existing = null
    try {
        existing = await apiFetch(`${liveBase}/api/projects/${page.projectId}`, { headers: buildHeaders(token) })
    } catch (error) {
        if (error.status !== 404) throw error
    }

    if (!existing) {
        await apiFetch(`${liveBase}/api/spaces/${SPACE_ID}/projects`, {
            method: 'POST',
            headers: buildHeaders(token),
            body: JSON.stringify({ slug: page.projectId, title: page.title, source: 'wcc-page-snapshot' })
        })
        console.log('  created')
    } else {
        await apiFetch(`${liveBase}/api/projects/${page.projectId}`, {
            method: 'PATCH',
            headers: buildHeaders(token),
            body: JSON.stringify({ title: page.title })
        })
        console.log('  updated')
    }

    const { document: doc } = await apiFetch(`${liveBase}/api/projects/${page.projectId}/document`, {
        headers: buildHeaders(token)
    })

    // The shape serverXR/src/spaceSyncPlan.js writes, and the one
    // scripts/space-code-push.mjs learned the hard way: the viewer keys on
    // entryView, not on mode, so setting mode alone publishes an empty scene.
    const updated = {
        ...doc,
        presentationState: {
            ...(doc?.presentationState || {}),
            mode: 'code',
            entryView: 'code',
            codeSourceType: 'html',
            codeFiles
        },
        publishState: { ...(doc?.publishState || {}), shareEnabled: true }
    }

    // PUT, not PATCH: projectRoutes.js registers only GET and PUT here.
    await apiFetch(`${liveBase}/api/projects/${page.projectId}/document`, {
        method: 'PUT',
        headers: buildHeaders(token),
        body: JSON.stringify(updated)
    })
    console.log(`  ok — ${codeFiles.length} file(s) at ${liveBase.replace(/\/serverXR$/, '')}/${SPACE_ID}/p/${page.projectId}`)
}

const main = async () => {
    const localEnv = {
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, '.env.local'))),
        ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env.local')))
    }
    const getEnv = (key) => process.env[key] || localEnv[key] || ''

    const args = parseArgs(process.argv.slice(2))
    if (args.only && !PAGES[args.only]) {
        console.error(`Unknown --only "${args.only}". Use one of: ${Object.keys(PAGES).join(', ')}`)
        process.exitCode = 1
        return
    }
    const keys = args.only ? [args.only] : Object.keys(PAGES)

    const builders = { 'landing': buildLanding, 'artist-works': buildArtistWorks }
    const built = {}
    for (const key of keys) built[key] = await builders[key]()

    if (args.out) {
        for (const key of keys) {
            const dir = path.join(path.resolve(args.out), key)
            await fs.mkdir(dir, { recursive: true })
            for (const file of built[key]) await fs.writeFile(path.join(dir, file.name), file.content, 'utf8')
            console.log(`[wcc-page-snapshot] wrote ${key} to ${dir}`)
        }
    }

    // No default target. The same rule space-code-push.mjs was brought under
    // after its DEFAULT_LIVE_URL published to the live site from a bare run.
    const target = args.to || getEnv('STAGING_API_URL') || getEnv('LIVE_API_URL')
    if (!target) {
        if (args.out) return
        console.error('Error: no target. Pass --to <url>, or set STAGING_API_URL / LIVE_API_URL.')
        console.error('  local:   https://local.thedi.studio/serverXR')
        console.error('  staging: https://staging.di-studio.xyz/serverXR')
        process.exitCode = 1
        return
    }
    const liveBase = target.replace(/\/+$/, '')
    const token = args.token || getEnv('LIVE_API_TOKEN') || ''
    if (!token) {
        console.error('Error: a token is required. Pass --token, or set LIVE_API_TOKEN in serverXR/.env.local.')
        process.exitCode = 1
        return
    }

    console.log(`[wcc-page-snapshot] target: ${liveBase}`)
    for (const key of keys) {
        await pushPage({ liveBase, token, key, codeFiles: built[key], dryRun: args.dryRun })
    }
}

// Importable for its tests without running the push.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error?.message || error)
        process.exitCode = 1
    })
}
