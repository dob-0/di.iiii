// Sweep a space as a visitor, page by page (owner 2026-10-25: "check one by one everything, check all bugs").
// For every public project: page errors, console errors, failed loads (>= 400), every link on the page and every door in
// its scene, each followed to say whether it lands (a /space/project path must name a project that exists and is public),
// and a picture on a wide screen and on a phone. A link that names the space by its old id (not its address) is flagged. One page open at a time; ends on about:blank.
//   BASE=https://dev.diiii.xyz SPACE=dilijan-camp OUT=dir di-test-browser run scripts/space/sweep-space.cjs
// BASE is the site, API the server (default BASE + /serverXR), SPACE the address. Writes OUT/report.json and OUT/<project>-{wide,phone}.png.
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(path.join(__dirname, '..', '..', 'node_modules', 'playwright'))

const BASE = (process.env.BASE || 'https://dev.diiii.xyz').replace(/\/$/, '')
const API = (process.env.API || `${BASE}/serverXR`).replace(/\/$/, '')
const SPACE = process.env.SPACE || 'dilijan-camp'
const OUT = process.env.OUT || path.join(process.cwd(), 'sweep')
const SETTLE = Number(process.env.SETTLE_MS || 9000)
const WIDE = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

const getJson = async (url) => { const r = await fetch(url); return r.ok ? r.json() : null }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const space = await getJson(`${API}/api/spaces/${SPACE}`)
  const spaceId = space?.space?.id || space?.id || SPACE
  const listed = (await getJson(`${API}/api/spaces/${SPACE}/projects`))?.projects || []
  const projects = listed.filter((p) => p.visibility === 'public')
  const known = new Map()   // "space/project" -> exists and public
  const names = new Set([SPACE, spaceId])
  // a project answers to its id and to its short name (/network/gevorg-grigoryan is network-gevorg-grigoryan)
  for (const p of listed) { known.set(p.id, p.visibility === 'public'); if (p.slug) known.set(p.slug, p.visibility === 'public') }

  // where a path lands: { ok, why }
  const landing = new Map()
  async function lands(href) {
    if (landing.has(href)) return landing.get(href)
    let out = { ok: true, why: '' }
    const u = new URL(href, BASE)
    if (u.origin !== new URL(BASE).origin) out = { ok: true, why: 'outside' }
    else {
      const parts = u.pathname.split('/').filter(Boolean)
      const r = await fetch(u.href, { redirect: 'follow' }).catch(() => null)
      // a file (/suite/mark.svg, /wcc/artist-works-land/index.html) is judged by its answer alone, not as a space or project
      const file = /\.[a-z0-9]{2,5}$/i.test(u.pathname)
      if (!r || r.status >= 400) out = { ok: false, why: `HTTP ${r ? r.status : 'no answer'}` }
      else if (file) out = { ok: true, why: 'file' }
      else if (parts.length >= 2 && names.has(parts[0]) && !/^(p|serverXR|api|projects|studio|show|scene)$/.test(parts[1])) {
        if (!known.has(parts[1])) out = { ok: false, why: `no project ${parts[1]} in the space` }
        else if (!known.get(parts[1])) out = { ok: false, why: `project ${parts[1]} is private` }
      } else if (parts.length >= 1 && !names.has(parts[0]) && !/^(serverXR|api|assets|wiki|spaces)$/.test(parts[0])) {
        const other = await getJson(`${API}/api/spaces/${parts[0]}`)
        if (!other) out = { ok: false, why: `no space ${parts[0]}` }
      }
      if (out.ok && u.hash && parts.length <= 1) out.why = `part ${u.hash}`
    }
    if (out.ok && u.origin === new URL(BASE).origin && spaceId !== SPACE && u.pathname.split('/')[1] === spaceId) out = { ok: false, why: `old address /${spaceId} (the space is /${SPACE})` }
    landing.set(href, out)
    return out
  }

  const b = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
  const ctx = b.contexts()[0]
  const page = ctx.pages()[0] || await ctx.newPage()
  const report = { base: BASE, space: SPACE, at: new Date().toISOString(), pages: [] }
  try {
    for (const p of projects) {
      const url = p.id === (space?.space?.publishedProjectId || space?.publishedProjectId) ? `${BASE}/${SPACE}` : `${BASE}/${SPACE}/${p.id}`
      const row = { id: p.id, title: p.title, url, pageErrors: [], consoleErrors: [], failedLoads: [], links: [], doors: [], shots: [] }
      const onErr = (e) => row.pageErrors.push(String(e).slice(0, 240))
      const onConsole = (m) => { if (m.type() === 'error') row.consoleErrors.push(m.text().slice(0, 240)) }
      const onResp = (r) => { if (r.status() >= 400) row.failedLoads.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 160)}`) }
      const onFail = (r) => { if (!/net::ERR_ABORTED/.test(r.failure()?.errorText || '')) row.failedLoads.push(`failed ${r.url().replace(BASE, '').slice(0, 160)} ${r.failure()?.errorText || ''}`) }
      page.on('pageerror', onErr); page.on('console', onConsole); page.on('response', onResp); page.on('requestfailed', onFail)
      try {
        await page.setViewportSize(WIDE)
        await page.goto(url, { waitUntil: 'load', timeout: 60000 })
        await page.waitForTimeout(SETTLE)
        row.finalUrl = page.url()
        row.title = await page.title()
        await page.screenshot({ path: path.join(OUT, `${p.id}-wide.png`) }); row.shots.push(`${p.id}-wide.png`)
        const hrefs = new Set()
        for (const f of page.frames()) {
          const hs = await f.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))).catch(() => [])
          for (const h of hs) if (h && !h.startsWith('#') && !h.startsWith('javascript:') && !h.startsWith('mailto:')) hrefs.add(h)
        }
        for (const h of hrefs) row.links.push({ href: h, ...(await lands(h)) })
        await page.setViewportSize(PHONE)
        await page.waitForTimeout(2500)
        await page.screenshot({ path: path.join(OUT, `${p.id}-phone.png`) }); row.shots.push(`${p.id}-phone.png`)
      } catch (e) {
        row.pageErrors.push(`sweep: ${String(e).slice(0, 200)}`)
      } finally {
        page.off('pageerror', onErr); page.off('console', onConsole); page.off('response', onResp); page.off('requestfailed', onFail)
        await page.goto('about:blank').catch(() => {})
      }
      // the doors in its scene, from its document
      const doc = (await getJson(`${API}/api/projects/${p.id}/document`))?.document
      for (const e of doc?.entities || []) {
        const r = e?.components?.reference
        if (e?.type !== 'portal' || !r || r.mode === 'embed') continue
        const href = (r.projectId ? `/${r.spaceId}/${r.projectId}` : `/${r.spaceId}`) + (r.anchor ? `#${r.anchor}` : '')
        row.doors.push({ id: e.id, name: e.name || '', href, ...(await lands(href)) })
      }
      report.pages.push(row)
      console.log(`${p.id}: ${row.pageErrors.length} page errors, ${row.consoleErrors.length} console errors, ${row.failedLoads.length} failed loads, `
        + `${row.links.filter((l) => !l.ok).length}/${row.links.length} links broken, ${row.doors.filter((d) => !d.ok).length}/${row.doors.length} doors broken`)
    }
  } finally {
    await page.goto('about:blank').catch(() => {})
    await page.setViewportSize(WIDE).catch(() => {})
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
    await b.close().catch(() => {})
  }
})()
