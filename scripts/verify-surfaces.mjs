/**
 * verify-surfaces.mjs — drive the real product in a real browser, desktop AND
 * mobile, and report what a careful human would notice.
 *
 * WHY THIS EXISTS
 * The unit suite cannot see the failures this repo actually ships. Of the 134
 * rows in docs/ai/known-fixes.md, the largest class (43) is *silent failure* —
 * a 200 response carrying the wrong bytes, a swallowed catch, an element that
 * renders but is invisible or covered. Every one of those passes a green test
 * run. 29 rows are mobile/touch-specific, which a desktop-only check never
 * reaches. See docs/ai/verification-charter.md.
 *
 * WHAT IT CHECKS (per page × per device)
 *   - page errors, console errors, HTTP >= 400
 *   - asset responses whose content-type is HTML  <- the "blank prod images" class
 *   - horizontal overflow and any element escaping the viewport
 *   - CROSS-DOCUMENT occlusion: platform chrome painted over a project iframe
 *   - tap-target sizes on coarse pointers
 *   - published-project iframes, reached across the origin boundary
 *   - a screenshot per combo, for a human to actually look at
 *
 * USAGE
 *   node scripts/verify-surfaces.mjs --base https://di-studio.xyz
 *   node scripts/verify-surfaces.mjs --base http://localhost:5173 --desktop-only
 *   node scripts/verify-surfaces.mjs --pages /,/wiki,/br_id_ge/field
 *
 * Exit code is non-zero if any combo has problems, so CI can gate on it.
 */
import { chromium, devices } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildAllNodesExample } from '../src/project/graph/examples/allNodesExample.js'
import { normalizeProjectDocument } from '../src/shared/projectSchema.js'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : (process.argv.includes(`--${name}`) ? true : fallback)
}

const BASE = arg('base', 'https://di-studio.xyz')
const OUT = arg('out', '.verify-surfaces')
const DESKTOP_ONLY = !!arg('desktop-only', false)
const MOBILE_ONLY = !!arg('mobile-only', false)
const SETTLE_MS = Number(arg('settle', 7000))

// Default surfaces: one per thing a visitor can actually reach.
const PAGES = String(arg('pages', '/,/wiki,/studio,/main,/raw')).split(',').filter(Boolean)

// /raw is the local node workspace, and it opens EMPTY. Every graph-editor
// defect therefore sat outside this tool's reach even though the route was
// listed: there were no nodes, no ports and no wires on the page to audit.
// Seeding the workspace with the all-nodes example puts the whole registry on
// screen before the audit runs. --no-seed-raw restores the empty-editor pass.
const SEED_RAW = !arg('no-seed-raw', false)
// Editor lanes sit behind AuthGate. Without a session the audit silently
// inspects the sign-in card instead of the editor and reports ALL CLEAN — a
// perfect example of the silent-failure class this script exists to catch.
// Pass --token (or VERIFY_API_TOKEN) to sign in first; the run then says which
// routes were audited signed-out so a clean result can never be misread.
const API_TOKEN = arg('token', null) || process.env.VERIFY_API_TOKEN || null
const RAW_WORKSPACE_KEY = 'dii.localNodeWorkspace.main'
const rawSeedDocument = () => {
  const { nodes, edges } = buildAllNodesExample({ workspaceTop: 64 })
  return normalizeProjectDocument({ nodes, edges })
}

// The shapes that break: narrowest phone still in use, a tall notched phone,
// Android, a tablet, and one landscape (rotation is its own layout).
const DESKTOP = [['desktop-1440', { viewport: { width: 1440, height: 900 } }]]
const MOBILE = [
  ['iphone-se', devices['iPhone SE']],
  ['iphone-15', devices['iPhone 15 Pro']],
  ['pixel-7', devices['Pixel 7']],
  ['ipad-mini', devices['iPad Mini']],
  ['iphone-15-landscape', devices['iPhone 15 Pro landscape']],
]
const PROFILES = DESKTOP_ONLY ? DESKTOP : MOBILE_ONLY ? MOBILE : [...DESKTOP, ...MOBILE]

// Asset-ish URLs must never come back as HTML. nginx's SPA fallback answers
// 200 text/html for an unmatched path, which every `response.ok` check passes.
const ASSET_RE = /\.(png|jpe?g|webp|gif|svg|glb|gltf|mp4|webm|mp3|wav|hdr|exr)(\?|$)|\/assets\/|\/api\/.*\/assets\//i

const auditPage = () => {
  const de = document.documentElement
  const vw = de.clientWidth
  const vh = de.clientHeight

  const overflow = de.scrollWidth - vw
  const escaping = []
  const smallTaps = []
  const occluded = []

  const visible = (el, r) => {
    if (r.width < 2 || r.height < 2) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }

  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (!visible(el, r)) continue
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed' && (r.right > vw + 2 || r.left < -2)) {
      escaping.push(`<${el.tagName.toLowerCase()} class="${String(el.className || '').slice(0, 40)}"> right=${Math.round(r.right)} vw=${vw}`)
    }
  }

  for (const el of document.querySelectorAll('a,button,[role="button"],input,select,summary')) {
    const r = el.getBoundingClientRect()
    if (!visible(el, r)) continue
    if (r.width < 32 || r.height < 32) {
      const label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ')
      smallTaps.push(`${el.tagName.toLowerCase()}"${label.slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
  }

  // NOTE: intra-document occlusion via elementFromPoint was tried and removed.
  // It answers "what would receive this click", not "what is painted on top",
  // so any text with pointer-events:none reports the canvas *behind* it as a
  // cover. It produced only false positives on this codebase. Cross-document
  // occlusion (platform chrome over a project iframe) is checked geometrically
  // below, where it is exact. Everything else: look at the screenshot.

  const vp = document.querySelector('meta[name=viewport]')
  return {
    vw, vh, overflow,
    escaping: escaping.slice(0, 5),
    smallTaps: smallTaps.slice(0, 8),
    viewportMeta: vp ? vp.getAttribute('content') : null,
    coarse: matchMedia('(pointer: coarse)').matches,
    canvases: document.querySelectorAll('canvas').length,
    text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
  }
}

const main = async () => {
  await fs.mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const results = []

  for (const [profileName, profile] of PROFILES) {
    for (const route of PAGES) {
      const ctx = await browser.newContext(profile)
      // ctx.request shares the context's cookie jar, so this session cookie is
      // the one the page will carry.
      let authState = 'signed-out'
      if (API_TOKEN) {
        try {
          const res = await ctx.request.post(`${BASE}/serverXR/api/auth/session`, {
            data: { token: API_TOKEN }
          })
          authState = res.ok() ? 'signed-in' : `auth-failed(${res.status()})`
        } catch (e) {
          authState = 'auth-error ' + String(e.message).slice(0, 60)
        }
      }
      const page = await ctx.newPage()
      const pageErrors = [], consoleErrors = [], httpErrors = [], htmlAssets = []

      page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 160)))
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)) })
      page.on('response', async r => {
        const url = r.url()
        if (r.status() >= 400) httpErrors.push(`${r.status()} ${url.slice(0, 90)}`)
        if (r.status() === 200 && ASSET_RE.test(url)) {
          const ct = (r.headers()['content-type'] || '')
          if (/text\/html|application\/xhtml/i.test(ct)) htmlAssets.push(`${url.slice(0, 90)} -> ${ct}`)
        }
      })

      // /raw is the local node workspace and it loads EMPTY, so every graph
      // defect — 8px port dots, wires that cannot be dragged with a finger,
      // panel windows wider than the screen — was outside this tool's reach
      // even though the route was in the list. Seed the workspace's own
      // localStorage before first paint so the audit sees a populated editor.
      if (SEED_RAW && /(^|\/)raw\/?$/.test(route)) {
        await page.addInitScript(({ key, doc }) => {
          try { window.localStorage.setItem(key, JSON.stringify(doc)) } catch { /* private mode */ }
        }, { key: RAW_WORKSPACE_KEY, doc: rawSeedDocument() })
      }

      let nav = 'ok'
      try { await page.goto(BASE + route, { waitUntil: 'load', timeout: 45000 }) }
      catch (e) { nav = 'NAV-FAIL ' + String(e.message).slice(0, 90) }
      await page.waitForTimeout(SETTLE_MS)

      const audit = await page.evaluate(auditPage).catch(e => ({ evalError: String(e.message).slice(0, 120) }))

      // Published projects render in sandboxed srcdoc iframes with an opaque
      // origin. Playwright crosses that boundary; the browser extension cannot.
      const frames = []
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue
        try { frames.push(await f.evaluate(auditPage)) } catch { /* opaque or gone */ }
      }

      // CROSS-DOCUMENT occlusion: the platform's own fixed chrome (the space
      // chip, the "Made with di.iiii" footer) is painted OVER the iframe, so
      // neither document's elementFromPoint can see the collision. This is a
      // real defect class — the chip covering a project's heading on a narrow
      // phone — and it is invisible to every per-document check.
      const crossDoc = await page.evaluate(async () => {
        const de = document.documentElement
        const viewportArea = de.clientWidth * de.clientHeight
        // The published viewer fills the page with the project iframe, so any
        // painted element in the PARENT document that sits over it is chrome.
        // Two traps learned the hard way:
        //   - the chip's positioned wrapper is transparent; the pill is painted
        //     by a descendant, so filtering on "positioned AND painted" finds
        //     nothing. Filter on painted alone.
        //   - the iframe's own ancestors paint the page background and would
        //     match everything; `!el.querySelector('iframe')` drops them.
        const chrome = [...document.querySelectorAll('body *')]
          .filter(el => el.tagName !== 'IFRAME' && !el.querySelector('iframe'))
          .filter(el => {
            const cs = getComputedStyle(el)
            if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) return false
            const bg = cs.backgroundColor || ''
            const alpha = (bg.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/) || [])[1]
            const paints = bg && !/transparent/.test(bg) && (alpha === undefined || Number(alpha) > 0.1)
            const r = el.getBoundingClientRect()
            // Small enough to be chrome, not a full-page backdrop.
            return paints && r.width > 8 && r.height > 8 && (r.width * r.height) < viewportArea * 0.5
          })
          .map(el => {
            const r = el.getBoundingClientRect()
            return { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 30),
                     label: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24),
                     x: r.left, y: r.top, w: r.width, h: r.height }
          })
        const frames = [...document.querySelectorAll('iframe')].map(f => {
          const r = f.getBoundingClientRect()
          return { x: r.left, y: r.top, w: r.width, h: r.height }
        })
        return { chrome, frames }
      }).catch(() => ({ chrome: [], frames: [] }))

      const covered = []
      const frameEls = await page.$$('iframe')
      for (let i = 0; i < frameEls.length; i++) {
        const box = await frameEls[i].boundingBox().catch(() => null)
        if (!box) continue
        const inner = await frameEls[i].contentFrame()
          .then(f => f && f.evaluate(() => {
            const out = []
            for (const el of document.querySelectorAll('h1,h2,h3,h4,p,a,button,span,li,div,small,strong,em,label')) {
              if (el.children.length) continue
              const t = (el.textContent || '').trim()
              if (t.length < 2) continue
              const r = el.getBoundingClientRect()
              const cs = getComputedStyle(el)
              if (r.width < 4 || r.height < 4 || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue
              out.push({ t: t.replace(/\s+/g, ' ').slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height })
              if (out.length > 250) break
            }
            return out
          }))
          .catch(() => null)
        if (!inner) continue
        for (const t of inner) {
          const tx = box.x + t.x, ty = box.y + t.y
          for (const c of crossDoc.chrome) {
            const ox = Math.max(0, Math.min(tx + t.w, c.x + c.w) - Math.max(tx, c.x))
            const oy = Math.max(0, Math.min(ty + t.h, c.y + c.h) - Math.max(ty, c.y))
            const overlapArea = ox * oy
            // A long heading whose first words are covered is still unreadable,
            // so flag either a substantial overlap OR the leading edge going
            // under the chrome. A strict area ratio alone missed exactly that.
            const coversStart = ox > 20 && oy > 0.5 * t.h && c.x <= tx + 4
            if (overlapArea > 0.2 * (t.w * t.h) || coversStart) {
              covered.push(`project text "${t.t}" covered by platform <${c.tag} class="${c.cls}">${c.label ? ` "${c.label}"` : ''}`)
              break
            }
          }
          if (covered.length > 5) break
        }
      }

      const slug = `${profileName}--${route.replace(/[^a-z0-9]+/gi, '_') || 'root'}`
      await page.screenshot({ path: path.join(OUT, `${slug}.png`) })

      const problems = []
      if (nav !== 'ok') problems.push(nav)
      if (pageErrors.length) problems.push(`page-errors ${JSON.stringify(pageErrors.slice(0, 2))}`)
      if (consoleErrors.length) problems.push(`console-errors ${JSON.stringify(consoleErrors.slice(0, 2))}`)
      if (httpErrors.length) problems.push(`http>=400 ${JSON.stringify(httpErrors.slice(0, 3))}`)
      if (htmlAssets.length) problems.push(`ASSET-SERVED-AS-HTML ${JSON.stringify(htmlAssets.slice(0, 2))}`)
      for (const scope of [audit, ...frames]) {
        if (!scope || scope.evalError) continue
        if (scope.overflow > 2) problems.push(`h-overflow ${scope.overflow}px ${JSON.stringify(scope.escaping)}`)
      }
      if (covered.length) problems.push(`platform-chrome-covers-project ${JSON.stringify(covered.slice(0, 3))}`)
      if (!audit.viewportMeta || !/width=device-width/.test(audit.viewportMeta || '')) {
        problems.push(`viewport-meta ${audit.viewportMeta}`)
      }

      // Did we actually reach the surface, or just its sign-in card? A clean
      // audit of AuthGate looks identical to a clean audit of the editor.
      const gated = await page.evaluate(() => Boolean(
        [...document.querySelectorAll('button')]
          .some((b) => /^(sign in|open the public view)$/i.test((b.innerText || '').trim()))
      )).catch(() => false)
      if (gated) problems.push(`AUTH-GATED (${authState}) — audited the sign-in card, not the surface`)

      results.push({ profileName, route, nav, audit, frames, covered, problems, htmlAssets, authState, gated })
      console.log(`${problems.length ? 'XX' : 'ok'} ${profileName.padEnd(20)} ${route.padEnd(18)} vw=${audit.vw} ovf=${audit.overflow} taps<32=${(audit.smallTaps || []).length}${gated ? '  [AUTH-GATED]' : ''}`)
      for (const p of problems) console.log(`     ! ${p}`)
      await ctx.close()
    }
  }

  await browser.close()
  await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2))

  const bad = results.filter(r => r.problems.length)
  console.log(`\n${bad.length ? `${bad.length}/${results.length} combos with problems` : `ALL CLEAN (${results.length} combos)`}`)
  console.log(`screenshots + report.json in ${OUT}/ — LOOK AT THEM. A clean report is not a verified surface.`)
  process.exitCode = bad.length ? 1 : 0
}

main()
