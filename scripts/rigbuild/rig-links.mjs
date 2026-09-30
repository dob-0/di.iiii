#!/usr/bin/env node
/**
 * rig-links.mjs — walk every link a person can reach from a space's rig, in the OWNER'S
 * browser, and say what each one showed. docs/architecture/RIG_BUILD.md §14–15.
 *
 *   flock <lock> node scripts/rigbuild/rig-links.mjs --base https://local.thedi.studio --space moxir \
 *       --out ~/Downloads/rig-links/<tag> [--max 200] [--port 9335]
 *   … --only /moxir/p/nope,/tools   visit just these (paths or URLs), follow nothing — a spot check
 *
 * Owner, 2026-09-28, after the version switch's "Full" opened "Project not found.":
 * "fix this look to check all". So: every rig project of the space (from the space's own
 * project list — a project with typed lamps, a rental list or a rigVariant), and from each
 *   /{space}, /{space}/p/{project}           the room — its version switch, its steps row
 *   every href on the steps row             room · equipment · build · plot · cards & looks ·
 *                                           patch sheet · crew link · light desk, next ‹ back
 *   /{space}/studio/projects/{project}      the Studio's "Rig" link
 *   /tools                                  the rig builder's card
 *   /light/?space=&project=&from=<step>     the desk's way back (#fromBack) and its tool links
 * and every link those pages carry into the same set, once each (breadth first). The rows
 * are READ FROM THE PAGES, never written down here: a link the app draws is a link this checks.
 *
 * THE BROWSER is the owner's own: the Flatpak Chromium (org.chromium.Chromium) with its
 * default flags, a throwaway profile (--user-data-dir inside the Flatpak's own cache, removed
 * after), driven over CDP (Playwright connectOverCDP). It is killed at the end. 3D pages are
 * given until a canvas appears plus a few seconds — never "network idle", which a live room
 * never reaches. Nothing is written to the server.
 *
 * Output: links.json (every URL: status, final URL, what it showed, where it was linked
 * from, the screenshot) and links.md (the same as a table). Exit 1 when any page is broken.
 */
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs, die, say } from '../place/common.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const args = parseArgs()

// What a broken page says. The app's own words for "not here" and the browser's.
export const BROKEN = /not found|no project|there is no project|cannot get|could not load|something went wrong|404|this page isn.t working|refused to connect/i

/** Which links a page offers, by where the app draws them. Runs in the page. */
const collectLinks = () => {
    const out = []
    const add = (el, kind) => {
        const href = el.getAttribute('href')
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
        const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
        out.push({ href: new URL(href, location.href).href, kind, label })
    }
    document.querySelectorAll('nav[aria-label="rig versions"] a').forEach((a) => add(a, 'switch'))
    document.querySelectorAll('.rigsteps a, .rigbar a, .rigsteps-menu a').forEach((a) => add(a, a.classList.contains('rigsteps-next') ? 'next' : a.classList.contains('rigsteps-back') ? 'back' : 'step'))
    document.querySelectorAll('a.studio-rig-link').forEach((a) => add(a, 'studio-rig'))
    document.querySelectorAll('#kit-rig-builder a').forEach((a) => add(a, 'tools-card'))
    for (const id of ['fromBack', 'fromStudio', 'fromNodes', 'fromProjection']) {
        const a = document.getElementById(id)
        if (a && !a.hidden) add(a, id === 'fromBack' ? 'desk-back' : 'desk-tool')
    }
    document.querySelectorAll('nav[aria-label="the way back"] a').forEach((a) => add(a, 'way-back'))
    return out
}

/** What a page showed, in a line. Runs in the page. */
const describePage = () => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim()
    const alert = document.querySelector('[role="alert"]')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    const h = document.querySelector('h1, h2')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    return { title: document.title, heading: h.slice(0, 80), alert: alert.slice(0, 160), text: text.slice(0, 220), canvas: Boolean(document.querySelector('canvas')) }
}

const cpuC = () => {
    try { const m = /Package id 0:\s+\+([\d.]+)/.exec(execSync('sensors', { encoding: 'utf8' })); return m ? Number(m[1]) : null } catch { return null }
}
const waitCool = async (max) => {
    for (;;) {
        const c = cpuC()
        if (c === null || c <= max) return c
        say(`  CPU package ${c} C > ${max} C — waiting`)
        await new Promise((r) => setTimeout(r, 15_000))
    }
}

const launchFlatpak = async (port) => {
    const profile = path.join(os.homedir(), '.var/app/org.chromium.Chromium/cache', `rig-links-${process.pid}`)
    fs.rmSync(profile, { recursive: true, force: true })
    fs.mkdirSync(profile, { recursive: true })
    const child = spawn('flatpak', ['run', 'org.chromium.Chromium', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
        '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', detached: true })
    for (let i = 0; i < 60; i += 1) {
        try {
            const r = await fetch(`http://127.0.0.1:${port}/json/version`)
            if (r.ok) return { child, profile, version: (await r.json()).Browser }
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 500))
    }
    try { process.kill(-child.pid) } catch { /* gone */ }
    die(`the Flatpak Chromium did not open its debugging port ${port}`)
}

const main = async () => {
    const base = String(args.base || die('needs --base')).replace(/\/+$/, '')
    const space = String(args.space || 'moxir')
    const out = path.resolve(String(args.out || die('needs --out <dir>')))
    const max = Number(args.max || 200)
    const port = Number(args.port || 9335)
    const maxC = Number(args['max-cpu-c'] || 85)
    fs.mkdirSync(path.join(out, 'shots'), { recursive: true })
    const origin = new URL(base).origin

    // the rig projects of the space, from its own list
    const list = await (await fetch(`${base}/serverXR/api/spaces/${space}/contents`)).json()
    const all = (list.projects || []).map((p) => p.id)
    const rigProjects = []
    for (const id of all) {
        try {
            const d = (await (await fetch(`${base}/serverXR/api/projects/${id}/document`)).json()).document
            const rig = (d?.entities || []).some((e) => e?.components?.fixture?.type || e?.components?.rentalList || e?.components?.rigVariant)
            if (rig) rigProjects.push(id)
        } catch { /* a project we cannot read is not one we can walk */ }
    }
    say(`${space}: ${all.length} projects, rig projects: ${rigProjects.join(', ')}`)

    const queue = []
    const seen = new Map() // url → record
    const enqueue = (href, from, kind, label) => {
        let u
        try { u = new URL(href, base) } catch { return }
        if (u.origin !== origin) return
        u.hash = ''
        const key = u.href
        if (seen.has(key)) { seen.get(key).from.push({ from, kind, label }); return }
        const rec = { url: key, from: [{ from, kind, label }] }
        seen.set(key, rec)
        queue.push(rec)
    }
    const only = args.only ? String(args.only).split(',').filter(Boolean) : null
    if (only) for (const u of only) enqueue(new URL(u, base).href, 'start', 'only', u)
    else enqueue(`${base}/${space}`, 'start', 'room', 'the space')
    if (!only) enqueue(`${base}/tools`, 'start', 'tools', '/tools')
    for (const p of only ? [] : rigProjects) {
        enqueue(`${base}/${space}/p/${p}`, 'start', 'room', p)
        enqueue(`${base}/${space}/studio/projects/${p}`, 'start', 'studio', p)
        for (const step of ['equipment', 'build', 'plot', 'cards', 'patch', 'crew']) {
            enqueue(`${base}/light/?space=${space}&project=${p}&label=${encodeURIComponent(p)}&from=${step}`, 'start', 'desk', `${p} from ${step}`)
        }
    }

    const { chromium } = await import('playwright')
    await waitCool(maxC)
    const { child, profile, version } = await launchFlatpak(port)
    say(`browser: ${version} (Flatpak org.chromium.Chromium, default flags, throwaway profile)`)
    let browser
    const records = []
    try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
        const context = browser.contexts()[0]
        let n = 0
        while (queue.length && n < max) {
            const rec = queue.shift()
            n += 1
            if (n % 10 === 0) await waitCool(maxC)
            const page = await context.newPage()
            const errors = []
            page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
            page.on('pageerror', (e) => errors.push(`THREW ${e.message.slice(0, 160)}`))
            let status = null
            try {
                const res = await page.goto(rec.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
                status = res ? res.status() : null
                // a 3D page: until its canvas, then a little; any other: a little
                const canvas = await page.waitForSelector('canvas', { timeout: 12_000 }).then(() => true).catch(() => false)
                await page.waitForTimeout(canvas ? 4000 : 2500)
                const shown = await page.evaluate(describePage)
                const links = await page.evaluate(collectLinks)
                const shot = path.join(out, 'shots', `${String(n).padStart(3, '0')}.jpg`)
                await page.screenshot({ path: shot, type: 'jpeg', quality: 60 }).catch(() => {})
                const said = `${shown.alert} ${shown.heading} ${shown.text}`
                const broken = (status !== null && status >= 400) || BROKEN.test(shown.alert || '') || /Project not found|There is no project|Cannot GET/i.test(said)
                Object.assign(rec, { n, status, finalUrl: page.url(), ...shown, consoleErrors: errors.length, errors: errors.slice(0, 3), links: links.length, shot, broken })
                if (!only) for (const l of links) enqueue(l.href, rec.url, l.kind, l.label)
                say(`${broken ? 'BROKEN' : 'ok    '} ${status} ${rec.url.replace(origin, '')} — ${(shown.alert || shown.heading || shown.title).slice(0, 70)}${shown.canvas ? ' [3D]' : ''} · ${links.length} links${errors.length ? ` · ${errors.length} console errors` : ''}`)
            } catch (error) {
                Object.assign(rec, { n, status, error: error.message.split('\n')[0], broken: true })
                say(`BROKEN ${rec.url.replace(origin, '')} — ${error.message.split('\n')[0]}`)
            }
            records.push(rec)
            await page.close()
        }
        if (queue.length) say(`stopped at --max ${max}; ${queue.length} not visited`)
    } finally {
        await browser?.close().catch(() => {})
        try { process.kill(-child.pid, 'SIGTERM') } catch { /* gone */ }
        await new Promise((r) => setTimeout(r, 1500))
        try { execSync(`pkill -f -- "--remote-debugging-port=${port}"`) } catch { /* none left */ }
        fs.rmSync(profile, { recursive: true, force: true })
    }

    const rel = (u) => u.replace(origin, '')
    const rows = records.map((r) => `| ${r.n} | ${r.broken ? '**BROKEN**' : 'ok'} | ${r.status ?? '—'} | \`${rel(r.url)}\`${r.finalUrl && r.finalUrl !== r.url ? ` → \`${rel(r.finalUrl)}\`` : ''} | ${(r.error || r.alert || r.heading || r.title || '').replace(/\|/g, '/').slice(0, 70)}${r.canvas ? ' (3D)' : ''} | ${r.consoleErrors ?? '—'} | ${[...new Set(r.from.map((f) => f.kind))].join(', ')} |`)
    const md = [`# rig links — ${space} @ ${base}`, '', `${new Date().toISOString()} · ${records.length} pages · ${records.filter((r) => r.broken).length} broken · rig projects: ${rigProjects.join(', ')}`, '',
        '| # | | status | url | what it showed | console errors | reached as |', '|---|---|---|---|---|---|---|', ...rows].join('\n')
    fs.writeFileSync(path.join(out, 'links.md'), md + '\n')
    fs.writeFileSync(path.join(out, 'links.json'), JSON.stringify({ tool: 'scripts/rigbuild/rig-links.mjs', at: new Date().toISOString(), base, space, rigProjects, records }, null, 2))
    const broken = records.filter((r) => r.broken)
    say(`${records.length} pages, ${broken.length} broken — ${path.join(out, 'links.md')}`)
    if (broken.length) process.exitCode = 1
}

if (isMainModule(import.meta.url)) {
    main().catch((error) => die(error.stack || error.message))
}
