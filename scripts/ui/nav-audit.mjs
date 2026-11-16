#!/usr/bin/env node
// Navigation audit: for every control that GOES somewhere, is there a way back?
//   node scripts/ui/nav-audit.mjs <base> <outdir> [--routes a,b] [--viewport 1440x1000] [--cap 60] [--timeout 120000]
// <base> is a SCRATCH stack (di-dev up <name> --api scratch). Every request to another host is aborted.
// Method: Nielsen heuristic 3 (user control and freedom); History API + WAI-ARIA dialog pattern (Escape closes).
// Reads only: controls whose name matches the skip words are never clicked (nav-audit-lib.mjs).
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { backVerdict, classifyChange, isSkipped, looksLikeBack, summarise } from './nav-audit-lib.mjs'

// How each route is reached. {space} = a space from the scratch data, {project} = its project. Source of truth: src/RootApp.jsx AppRouter
// and the *Routing.js files (segments), src/components/PreferencesPage.jsx SECTIONS (the /admin#<key> hashes).
export const ROUTES = [
    ['/', 'front door'], ['/login', 'sign in'], ['/wiki', 'wiki'], ['/privacy', 'page'], ['/terms', 'page'], ['/tools', 'page'],
    ['/for-apps', 'page'], ['/ai', 'page'], ['/ai/setup', 'page'], ['/device', 'page'], ['/shoot', 'page'], ['/chat', 'chat'],
    ['/wcc', 'work'], ['/algovrithm', 'work'],
    ['/{space}', 'space'], ['/{space}/projects', 'space contents'], ['/{space}/studio', 'studio hub'], ['/{space}/studio/{project}', 'studio project'],
    ['/{space}/raw', 'raw canvas'], ['/{space}/make', 'make'], ['/{space}/map', 'map'], ['/{space}/perform', 'perform'], ['/{space}/scan', 'scan'],
    ['/{space}/plot/{project}', 'plot'], ['/{space}/cards/{project}', 'cards'], ['/{space}/scenes/{project}', 'scenes'], ['/{space}/show/{project}', 'show'],
    ['/{space}/equipment/{project}', 'equipment'], ['/{space}/build/{project}', 'build'], ['/{space}/patch/{project}', 'patch sheet'],
    ['/{space}/visualise/{project}', 'visualise'], ['/{space}/touch/{project}', 'touch'], ['/main', 'second space'], ['/main/projects', 'space contents'],
    ['/admin', 'desk: Spaces and users'],
    ...['opencall', 'monitor', 'agents', 'visitors', 'overview', 'inspect', 'system', 'estate'].map((k) => [`/admin#${k}`, `desk: ${k}`]),
    ['/admin#monitor-full', 'desk: Monitor full desk view']
]

const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const BOOL_FLAGS = new Set(['--dedupe'])
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !BOOL_FLAGS.has(argv[i - 1])))
const CONTROL_SELECTOR = 'a[href], button, [role=tab], [role=menuitem], [role=button], [role=link], summary'

async function snapshot(page) {
    return page.evaluate(() => {
        const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
        const txt = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
        return {
            url: location.href, origin: location.origin, path: location.pathname, hash: location.hash,
            headings: [...document.querySelectorAll('h1,h2,h3,[role=heading]')].filter(vis).map(txt).slice(0, 8),
            dialogs: [...document.querySelectorAll('dialog[open],[role=dialog],[aria-modal=true],[role=alertdialog]')].filter(vis).map((d) => txt(d).slice(0, 30)),
            selected: [...document.querySelectorAll('[aria-selected=true],[aria-current=page],[aria-pressed=true]')].filter(vis).map(txt),
            fullscreen: !!document.fullscreenElement || document.documentElement.dataset.fullscreen === 'true'
        }
    })
}

// the controls on screen now: [{i, name}] in DOM order, visible, enabled
async function listControls(page) {
    return page.evaluate((sel) => {
        const out = []
        document.querySelectorAll(sel).forEach((el, i) => {
            const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
            if (!(r.width > 0 && r.height > 0) || cs.visibility === 'hidden' || el.disabled || el.getAttribute('aria-disabled') === 'true') return
            const name = (el.getAttribute('aria-label') || el.innerText || el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 80)
            out.push({ i, name, href: el.getAttribute('href') || '', tag: el.tagName.toLowerCase() })
        })
        return out
    }, CONTROL_SELECTOR)
}

// visible back/close controls on screen now (names)
async function backControls(page) {
    const all = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((el) => {
        const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0
    }).map((el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 60)), CONTROL_SELECTOR)
    return all.filter(looksLikeBack)
}

async function openFresh(page, url, wait = 900) {
    await page.goto('about:blank')
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelectorAll('button,a[href]').length > 2 && !/^loading/i.test(document.body.innerText.trim()), null, { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(wait)
}

async function clickNth(page, i) {
    const h = await page.evaluateHandle(([sel, n]) => document.querySelectorAll(sel)[n] || null, [CONTROL_SELECTOR, i])
    const el = h.asElement()
    if (!el) return false
    await el.click({ timeout: 2500, noWaitAfter: true })
    await page.waitForTimeout(500)
    return true
}

async function auditRoute(page, base, url, label, cap, shots, outdir, tag, seenAcross) {
    const rows = []
    await openFresh(page, url)
    const first = await listControls(page)
    if (process.env.NAV_AUDIT_DEBUG) console.error('listed', first.length)
    const list = first.filter((c) => c.name || c.href).slice(0, cap * 3)
    const seen = new Set()
    let tested = 0
    for (const c of list) {
        if (tested >= cap) break
        const key = `${c.name}|${c.href}`
        if (seen.has(key) || (seenAcross && seenAcross.has(key))) continue
        seen.add(key)
        if (seenAcross) seenAcross.add(key)
        if (isSkipped(c.name) || isSkipped(c.href)) continue
        if (/^(https?:)?\/\//.test(c.href) && !c.href.startsWith(base)) continue
        await openFresh(page, url)
        const before = await snapshot(page)
        try { if (!await clickNth(page, c.i)) continue } catch (e) { if (process.env.NAV_AUDIT_DEBUG) console.error("click failed", c.name, String(e.message).slice(0, 100)); continue }
        const after = await snapshot(page)
        const kind = classifyChange(before, after)
        if (process.env.NAV_AUDIT_DEBUG) console.error('ctl', c.name, kind, JSON.stringify(before).slice(0, 120), JSON.stringify(after).slice(0, 120))
        if (!kind) continue
        tested += 1
        const backs = await backControls(page)
        const row = { page: label, url, control: c.name || c.href, goesTo: kind === 'url' ? `${after.path}${after.hash}` : `${kind}: ${(after.dialogs[0] || after.headings[0] || '').slice(0, 40)}`, kind }
        row.visibleBack = backs.length > 0
        row.visibleBackNames = backs.slice(0, 3)
        let shotFile = null
        const shot = async (why) => {
            if (shots.n >= 40) return
            shots.n += 1
            shotFile = `${tag}-${String(shots.n).padStart(2, '0')}-${why}.png`
            await page.screenshot({ path: path.join(outdir, 'pictures', shotFile) }).catch(() => { shotFile = null })
        }
        if (!row.visibleBack) await shot('noback')
        // Back
        try {
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 4000 }).catch(() => {})
            await page.waitForTimeout(500)
            const ab = await snapshot(page)
            const v = backVerdict(before, ab, new URL(base).origin)
            row.backOk = v.ok; row.backWhy = v.why
            if (!v.ok && !row.visibleBack === false) await shot('backfail')
            else if (!v.ok && !shotFile) await shot('backfail')
        } catch (e) { row.backOk = false; row.backWhy = `error ${String(e.message).slice(0, 60)}` }
        // Escape: only an overlay or full-screen view must close on it
        if (kind === 'overlay' || kind === 'fullscreen') try {
            await openFresh(page, url)
            await clickNth(page, c.i)
            await page.keyboard.press('Escape')
            await page.waitForTimeout(500)
            const ae = await snapshot(page)
            row.escOk = !classifyChange(before, ae)
            if (!row.escOk && !shotFile) await shot('escfail')
        } catch { row.escOk = null }
        else row.escOk = null
        row.picture = shotFile
        rows.push(row)
    }
    return rows
}


// Writes <name>.json and <name>.md from rows; returns the summary.
export function writeReport(outdir, name, { rows, empty, blocked, viewport }) {
    const sum = summarise(rows)
    const failing = rows.filter((r) => !r.backOk || !r.visibleBack || r.escOk === false)
    const result = { base: '(scratch stack)', viewport, when: new Date().toISOString(), blockedForeignRequests: blocked, total: sum.total, byPage: sum.by, rows, notTested: empty }
    fs.writeFileSync(path.join(outdir, `${name}.json`), JSON.stringify(result, null, 1))
    const cell = (v) => String(v).replace(/\|/g, '/')
    const md = [`# Navigation audit ${viewport}`, '',
        `Controls tested ${sum.total.controls}; Back fails ${sum.total.backFails}; no visible back ${sum.total.noVisibleBack}; Esc fails ${sum.total.escFails}. Foreign requests blocked: ${blocked}.`, '',
        '## Per page', '', '| page | controls | Back fails | no visible back | Esc fails |', '|---|---|---|---|---|',
        ...Object.entries(sum.by).map(([p, t]) => `| ${p} | ${t.controls} | ${t.backFails} | ${t.noVisibleBack} | ${t.escFails} |`), '',
        '## Failures first', '', '| page | control | goes to | Back ok | visible back | Esc ok | picture |', '|---|---|---|---|---|---|---|',
        ...[...failing, ...rows.filter((r) => !failing.includes(r))].map((r) => `| ${cell(r.page)} | ${cell(r.control)} | ${cell(r.goesTo)} | ${r.backOk ? 'yes' : `NO (${r.backWhy})`} | ${r.visibleBack ? 'yes' : 'NO'} | ${r.escOk === false ? 'NO' : r.escOk ? 'yes' : 'n/a'} | ${r.picture || ''} |`), '',
        '## Pages with nothing tested', '', ...empty.map((e) => `- ${e.page} (${e.how}): ${e.note}`), '']
    fs.writeFileSync(path.join(outdir, `${name}.md`), md.join('\n'))
    return sum
}

// --merge <outdir> <tag-prefix>: joins the nav-audit-<prefix>*.json parts (parallel runs) into nav-audit-<prefix>.json
export function mergeParts(outdir, prefix) {
    const parts = fs.readdirSync(outdir).filter((f) => f.startsWith(`nav-audit-${prefix}-`) && f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(outdir, f), 'utf8')))
    const rows = parts.flatMap((p) => p.rows); const empty = parts.flatMap((p) => p.notTested)
    return writeReport(outdir, `nav-audit-${prefix}`, { rows, empty, blocked: parts.reduce((n, p) => n + p.blockedForeignRequests, 0), viewport: parts[0]?.viewport || '' })
}

export async function main() {
    if (argv[0] === '--merge') { console.log(JSON.stringify(mergeParts(argv[1], argv[2]).total)); return }
    const [baseArg, outdir] = pos
    if (!baseArg || !outdir) { console.error('usage: nav-audit.mjs <base> <outdir> [--routes a,b] [--viewport WxH]'); process.exit(2) }
    const base = baseArg.replace(/\/$/, '')
    if (!/^https?:\/\/(?:[a-z0-9-]+\.)*(?:diiii\.localhost|localhost|127\.0\.0\.1)(?::\d+)?$/i.test(base)) { console.error('refusing: base must be a local scratch stack'); process.exit(2) }
    const [vw, vh] = String(flag('viewport', '1440x1000')).split('x').map(Number)
    const cap = Number(flag('cap', 60)); const routeTimeout = Number(flag('timeout', 180000))
    const only = flag('routes', '') ? flag('routes', '').split(',') : null
    const tag = flag('tag', `${vw}`)
    fs.mkdirSync(path.join(outdir, 'pictures'), { recursive: true })
    const api = async (p) => { try { return await (await fetch(`${base}${p}`)).json() } catch { return {} } }
    const spaces = (await api('/api/spaces')).spaces || []
    const space = (spaces.find((s) => s.projectCount > 0) || spaces[0] || { id: 'open' })
    const proj = ((await api(`/api/spaces/${space.id}/projects`)).projects || [])[0]
    const fill = (r) => r.replace('{space}', space.id).replace('{project}', proj?.id || 'none')
    const routes = ROUTES.filter(([r]) => !only || only.some((o) => r === o || fill(r) === o))

    const exe = process.env.NAV_AUDIT_CHROME || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
    const browser = await chromium.launch({ executablePath: exe })
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh } })
    let blocked = 0
    await ctx.route('**/*', (route) => {
        const u = route.request().url()
        if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:') || new URL(u).origin === new URL(base).origin || /^http:\/\/(?:[a-z0-9-]+\.)*(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(u)) return route.continue()
        blocked += 1
        return route.abort()
    })
    let page = await ctx.newPage()
    const shots = { n: 0 }
    // --dedupe: a control (name+href) already tested on an earlier route of this run is not tested again (the desk's side nav repeats on every section)
    const dedupe = argv.includes('--dedupe')
    const seenAcross = new Set()
    const rows = []
    const empty = []
    for (const [r, how] of routes) {
        const label = r.startsWith('/admin') ? r : r
        const url = base + fill(r)
        let got = []
        try {
            got = await Promise.race([
                auditRoute(page, base, url, label, cap, shots, outdir, tag, dedupe ? seenAcross : null),
                new Promise((_, rej) => setTimeout(() => rej(new Error('route timeout')), routeTimeout))
            ])
        } catch (e) { empty.push({ page: label, how, note: String(e.message) }) ; await page.close().catch(() => {}); page = await ctx.newPage() }
        if (!got.length && !empty.find((x) => x.page === label)) empty.push({ page: label, how, note: 'no control that goes somewhere' })
        rows.push(...got)
        process.stderr.write(`${label}: ${got.length} controls\n`)
    }
    await browser.close()

    const sum = writeReport(outdir, `nav-audit-${tag}`, { rows, empty, blocked, viewport: `${vw}x${vh}` })
    console.log(JSON.stringify(sum.total))
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1) })
