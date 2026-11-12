#!/usr/bin/env node
/**
 * reach-check.mjs — picture-and-click check for PR #1278 (doors and shelves) and batch 2 (Nodes on the bar opens the last project).
 *
 * Walks a stack seeded by scripts/seed-reach-check.mjs (space navtest) on a
 * desktop and a phone viewport, with direct addresses only, and writes one
 * screenshot and one record per step.
 *
 * Steps (each on both viewports):
 *   a  member  /navtest/projects      alpha's strip has Perform, Studio, Nodes; shelves read Show, Archive, Not on a shelf
 *   b  member  click alpha's Perform  lands on /navtest/perform/scene-alpha in ONE click
 *   c  member  /navtest/raw/projects  tool line says "in Nodes."; alpha's card strip has no Nodes door
 *   d  member  /navtest/studio        tool line says "in Studio."; alpha's card strip has no Studio door
 *   e  visitor /navtest/projects      no door strips, no shelf headings
 *   f  member  opens alpha in Nodes, then (in a NEW tab, same device) the space page; the bar's Nodes opens alpha's Nodes
 *   g  member  /navtest/raw/projects/gone-since, then the space page: the bar's Nodes falls back to the list
 *
 * Usage: node scripts/reach-check.mjs [--base <url>] [--token <tok>] [--out <dir>]
 *   defaults: --base http://localhost:5173, --token $REACH_CHECK_TOKEN, --out .reach-check
 *   The server must run with REQUIRE_AUTH=true, or every visitor counts as a member
 *   and step e cannot tell. Member = the admin token posted to /serverXR/api/auth/session.
 * Output: <out>/report.json, <out>/*.png; one "PASS|FAIL <step> <viewport> <detail>" line per step.
 * Exit 1 if any step fails or any page throws.
 */
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null }
const BASE = (opt('base') || 'http://localhost:5173').replace(/\/+$/, '')
const TOKEN = opt('token') || process.env.REACH_CHECK_TOKEN || ''
const OUT = opt('out') || '.reach-check'
const WAIT = 20000
const SPACE = 'navtest'

if (!TOKEN) { console.error('reach-check: --token (or REACH_CHECK_TOKEN) is required to sign in as a member'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
    { name: 'desktop', opts: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', opts: { ...devices['iPhone 15 Pro'] } },
]

const records = []
const pageErrors = []
let failed = false

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
const texts = (loc) => loc.allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, ' ').trim()))

const run = async () => {
    const browser = await chromium.launch()
    try {
        for (const vp of VIEWPORTS) {
            const member = await browser.newContext(vp.opts)
            // The request context shares the cookie jar the pages will carry.
            const auth = await member.request.post(`${BASE}/serverXR/api/auth/session`, { data: { token: TOKEN } })
            if (!auth.ok()) throw new Error(`member sign-in failed HTTP ${auth.status()} (viewport ${vp.name})`)
            const visitor = await browser.newContext(vp.opts) // fresh, no cookie

            const track = (page, label) => page.on('pageerror', (e) => pageErrors.push(`${vp.name} ${label}: ${String(e.message).slice(0, 160)}`))

            const step = async (id, role, ctx, fn) => {
                const page = await ctx.newPage()
                track(page, id)
                const rec = { viewport: vp.name, role, step: id, url: '', ok: false, expected: '', got: '', png: '' }
                try {
                    const r = await fn(page)
                    Object.assign(rec, r)
                } catch (e) {
                    rec.got = `threw: ${String(e.message).split('\n')[0].slice(0, 200)}`
                }
                rec.png = path.join(OUT, `${vp.name}-${id}.png`)
                rec.url = rec.url || page.url()
                await page.screenshot({ path: rec.png, fullPage: true }).catch(() => { rec.png = '' })
                await page.close()
                records.push(rec)
                if (!rec.ok) failed = true
                console.log(`${rec.ok ? 'PASS' : 'FAIL'} ${id} ${vp.name} ${rec.ok ? rec.got : `expected ${rec.expected}; got ${rec.got}`}`)
            }

            const goto = async (page, p) => { await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 40000 }); return BASE + p }
            // The alpha row: the list item whose row name is exactly "alpha" (SpaceContentsPage.jsx:291-292).
            const alphaRow = (page) => page.locator('li', { has: page.locator('.sc-row-name', { hasText: /^\s*alpha\s*$/ }) })
            const alphaCard = (page) => page.locator('.sh-project-card', { hasText: /alpha/ }).filter({ hasNotText: /beta/ })

            await step('a', 'member', member, async (page) => {
                const url = await goto(page, `/${SPACE}/projects`)
                const strip = alphaRow(page).locator('.sc-row-doors .sc-door')
                await strip.first().waitFor({ timeout: WAIT })
                await page.locator('h2.sc-shelf').first().waitFor({ timeout: WAIT })
                const doors = await texts(strip)
                const shelves = await texts(page.locator('h2.sc-shelf'))
                const wantDoors = ['Perform', 'Studio', 'Nodes']
                const wantShelves = ['Show', 'Archive', 'Not on a shelf']
                const doorsOk = wantDoors.every((d) => doors.includes(d))
                const shelvesOk = same(shelves, wantShelves)
                return {
                    url, ok: doorsOk && shelvesOk,
                    expected: `doors include ${wantDoors.join('/')}; shelves ${wantShelves.join(', ')}`,
                    got: `doors ${doors.join('/')}; shelves ${shelves.join(', ')}`,
                }
            })

            await step('b', 'member', member, async (page) => {
                await goto(page, `/${SPACE}/projects`)
                const perform = alphaRow(page).locator('.sc-row-doors a.sc-door', { hasText: /^Perform$/ })
                await perform.waitFor({ timeout: WAIT })
                let clicks = 0
                await perform.click(); clicks += 1
                await page.waitForURL((u) => u.pathname === `/${SPACE}/perform/scene-alpha`, { timeout: WAIT })
                const p = new URL(page.url()).pathname
                return { ok: p === `/${SPACE}/perform/scene-alpha` && clicks === 1, expected: `/${SPACE}/perform/scene-alpha after 1 click`, got: `${p} after clicks=${clicks}` }
            })

            await step('c', 'member', member, async (page) => {
                const url = await goto(page, `/${SPACE}/raw/projects`)
                const line = page.locator('p.sh-tool-line')
                await line.waitFor({ timeout: WAIT })
                const card = alphaCard(page).first()
                await card.waitFor({ timeout: WAIT })
                await card.locator('.sh-card-doors .sh-door').first().waitFor({ timeout: WAIT })
                const said = (await texts(line))[0]
                const doors = await texts(card.locator('.sh-card-doors .sh-door'))
                const want = 'Pick a project. A card opens it in Nodes.'
                return { url, ok: said === want && !doors.includes('Nodes') && doors.length > 0, expected: `"${want}" and no Nodes door`, got: `"${said}"; doors ${doors.join('/')}` }
            })

            await step('d', 'member', member, async (page) => {
                const url = await goto(page, `/${SPACE}/studio`)
                const line = page.locator('p.sh-tool-line')
                await line.waitFor({ timeout: WAIT })
                const card = alphaCard(page).first()
                await card.waitFor({ timeout: WAIT })
                await card.locator('.sh-card-doors .sh-door').first().waitFor({ timeout: WAIT })
                const said = (await texts(line))[0]
                const doors = await texts(card.locator('.sh-card-doors .sh-door'))
                return { url, ok: said.endsWith('in Studio.') && !doors.includes('Studio') && doors.length > 0, expected: 'line ends "in Studio." and no Studio door', got: `"${said}"; doors ${doors.join('/')}` }
            })

            await step('e', 'visitor', visitor, async (page) => {
                const url = await goto(page, `/${SPACE}/projects`)
                // Wait for the flat list, then give the member reads time to (not) arrive.
                await page.locator('a.sc-row').first().waitFor({ timeout: WAIT })
                await page.waitForTimeout(3000)
                const strips = await page.locator('.sc-row-doors').count()
                const shelves = await page.locator('h2.sc-shelf').count()
                return { url, ok: strips === 0 && shelves === 0, expected: '0 door strips, 0 shelf headings', got: `${strips} strips, ${shelves} shelf headings` }
            })

            // Batch 2 (N3851.19). A member stood in alpha's Nodes; a NEW page of the same context has its own
            // sessionStorage but shares the device's localStorage, which is the point of "per device".
            await step('f', 'member', member, async (page) => {
                const editor = await member.newPage()
                track(editor, 'f-editor')
                await editor.goto(`${BASE}/${SPACE}/raw/projects/scene-alpha`, { waitUntil: 'domcontentloaded', timeout: 40000 })
                await editor.locator('.sbar-where--project').waitFor({ timeout: WAIT })
                await editor.close()
                const url = await goto(page, `/${SPACE}/projects`)
                const nodes = page.locator('.sbar-links a.sbar-link', { hasText: /^Nodes$/ })
                await nodes.waitFor({ timeout: WAIT })
                // The page waits for the space's own list before it judges a remembered project.
                await page.locator('.sc-row-name', { hasText: /^\s*alpha\s*$/ }).waitFor({ timeout: WAIT })
                const href = await nodes.getAttribute('href')
                await nodes.click()
                await page.waitForURL((u) => u.pathname === `/${SPACE}/raw/projects/scene-alpha`, { timeout: WAIT })
                await page.locator('.sbar-where--project').waitFor({ timeout: WAIT })
                const where = (await texts(page.locator('.sbar-where--project')))[0]
                const p = new URL(page.url()).pathname
                return {
                    url,
                    ok: href === `/${SPACE}/raw/projects/scene-alpha` && p === `/${SPACE}/raw/projects/scene-alpha` && where === 'alpha',
                    expected: `bar Nodes href and landing /${SPACE}/raw/projects/scene-alpha, bar names "alpha"`,
                    got: `href ${href}; landed ${p}; bar names "${where}"`,
                }
            })

            // A remembered project that is no longer in the space: the bar must not send the member to a dead editor.
            await step('g', 'member', member, async (page) => {
                await page.addInitScript(([space]) => {
                    try { window.localStorage.setItem('dii.lastProjectBySpace', JSON.stringify({ [space]: 'gone-since' })) } catch { /* blocked */ }
                }, [SPACE])
                const url = await goto(page, `/${SPACE}/projects`)
                const nodes = page.locator('.sbar-links a.sbar-link', { hasText: /^Nodes$/ })
                await nodes.waitFor({ timeout: WAIT })
                await page.locator('.sc-row-name', { hasText: /^\s*alpha\s*$/ }).waitFor({ timeout: WAIT })
                const href = await nodes.getAttribute('href')
                await nodes.click()
                await page.waitForURL((u) => u.pathname === `/${SPACE}/raw/projects`, { timeout: WAIT })
                const said = await page.locator('p.sh-tool-line').first().waitFor({ timeout: WAIT }).then(() => texts(page.locator('p.sh-tool-line')))
                return {
                    url,
                    ok: href === `/${SPACE}/raw/projects` && said[0] === 'Pick a project. A card opens it in Nodes.',
                    expected: `bar Nodes href /${SPACE}/raw/projects and the list that says "...in Nodes."`,
                    got: `href ${href}; list says "${said[0]}"`,
                }
            })

            await member.close()
            await visitor.close()
        }
    } finally {
        await browser.close()
    }
}

try {
    await run()
} catch (e) {
    failed = true
    console.error(`FAIL setup: ${String(e.message).slice(0, 300)}`)
}
for (const e of pageErrors) console.error(`FAIL pageerror ${e}`)
if (pageErrors.length) failed = true
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ base: BASE, pageErrors, records }, null, 2))
console.log(`reach-check: ${records.filter((r) => r.ok).length}/${records.length} steps passed, ${pageErrors.length} page errors, report ${path.join(OUT, 'report.json')}`)
process.exit(failed ? 1 : 0)
