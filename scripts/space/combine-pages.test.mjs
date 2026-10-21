// @vitest-environment node
// combine-pages.mjs and the helpers it shares with apply-structure.mjs. The command runs for real against a fake
// serverXR that files an unidentified program the way the real one does (it uses the server's own classifier),
// so a script that forgets to say who it is fails here, not at the 31st request.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { ALLOW, MARK, buildCombinedPage, isCombined, relinkHtml, repointAssets, userAgent } from './pages-lib.mjs'

const require = createRequire(import.meta.url)
const { classifyUserAgent } = require('../../serverXR/src/appVisitors.js')
const here = path.dirname(fileURLToPath(import.meta.url))
const COMBINE = path.join(here, 'combine-pages.mjs')

const H1 = 'a'.repeat(64) // the yard's asset
const H2 = 'b'.repeat(64) // the wall's asset
const back = (to) => `<a href="${to}" target="_top" onclick="event.preventDefault();window.open('${to}','_top')">back</a>`
const yardHtml = `<html><body>${back('/dilijan/worlds')}<script>fetch("https://di-studio.xyz/serverXR/api/projects/the-yard/assets/${H1}")</script></body></html>`
const wallHtml = `<html><body>${back('/dilijan/worlds')}<script>fetch("https://staging.di-studio.xyz/serverXR/api/projects/elevation/assets/${H2}")</script></body></html>`
const airHtml = '<html><body>air canvas</body></html>'
const docOf = (html) => ({ version: 1, projectMeta: { spaceId: 'dilijan' }, nodes: [{ id: 'keep-me' }], presentationState: { mode: 'code', entryView: 'code', codeHtml: html } })

// A fake serverXR: documents, assets, and the unidentified-program refusal.
function fakeApi({ docs, assets = {} }) {
  const log = []
  const created = []
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      const kind = classifyUserAgent(req.headers['user-agent']).kind
      log.push({ method: req.method, url: req.url, kind })
      const send = (code, data, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(type === 'application/json' ? JSON.stringify(data) : data) }
      if (kind === 'anonymous') return send(429, { error: 'Too many requests from this address by an unidentified program — retry in 28s.' })
      let m
      if ((m = req.url.match(/^\/api\/projects\/([^/]+)\/document$/))) {
        if (req.method === 'GET') return docs[m[1]] ? send(200, { document: docs[m[1]] }) : send(404, { error: 'Project not found.' })
        if (req.method === 'PUT') { docs[m[1]] = JSON.parse(body.toString()); return send(200, { ok: true }) }
      }
      if ((m = req.url.match(/^\/api\/projects\/([^/]+)\/assets\/([0-9a-f]{64})(\/meta)?$/)) && req.method === 'GET') {
        const bytes = assets[`${m[1]}/${m[2]}`]
        if (!bytes) return send(404, { error: 'Asset not found.' })
        return m[3] ? send(200, { id: m[2] }) : send(200, bytes, 'application/octet-stream')
      }
      if ((m = req.url.match(/^\/api\/spaces\/([^/]+)\/projects$/)) && req.method === 'POST') {
        const b = JSON.parse(body.toString())
        if (docs[b.slug]) return send(409, { error: 'that name is taken on this di.iiii — try another' })
        docs[b.slug] = { version: 1, projectMeta: { id: b.slug, spaceId: m[1], title: b.title }, presentationState: {} }
        created.push({ space: m[1], slug: b.slug, visibility: b.visibility })
        return send(200, { project: { id: b.slug } })
      }
      if ((m = req.url.match(/^\/api\/projects\/([^/]+)\/assets$/)) && req.method === 'POST') {
        const id = /name="assetId"\r\n\r\n([0-9a-f]{64})/.exec(body.toString('latin1'))
        if (!id) return send(400, { error: 'no asset id' })
        // like the real server, a photo is re-encoded (its metadata stripped) and stored under the id of its new bytes
        const stored = body.toString('latin1').includes('PHOTO-BYTES') ? 'c'.repeat(64) : id[1]
        assets[`${m[1]}/${stored}`] = Buffer.from('copied')
        return send(200, { ok: true, asset: { id: stored } })
      }
      return send(404, { error: `no route ${req.method} ${req.url}` })
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, log, docs, assets, created, url: `http://127.0.0.1:${server.address().port}` })))
}

const run = (argv) => new Promise((resolve) => execFile(process.execPath, [COMBINE, ...argv], { timeout: 20000 }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr })))
const pagesIn = (html) => JSON.parse(/const PAGES=(\[.*?\]),ALLOW=/s.exec(html)[1])

describe('the program says who it is', () => {
  it('is an identified app to the real server classifier, and without the contact it is not', () => {
    expect(classifyUserAgent(userAgent('di-combine-pages')).kind).toBe('app')
    expect(classifyUserAgent(userAgent('di-apply-structure')).kind).toBe('app')
    // the control: the user agent these scripts sent before, and the 429 it earned
    expect(classifyUserAgent('di-combine-pages/1.0').kind).toBe('anonymous')
  })
})

describe('relinkHtml', () => {
  it('repoints an href, a window.open and the same link inside a JSON-embedded page', () => {
    const embedded = JSON.stringify([yardHtml])
    for (const html of [yardHtml, embedded]) {
      const r = relinkHtml(html, '/dilijan/worlds', '/dilijan#works')
      expect(r.count).toBe(2)
      expect(r.html).not.toContain('/dilijan/worlds')
      expect(r.html.match(/\/dilijan#works/g)).toHaveLength(2)
    }
  })
  it('leaves a longer path and text alone', () => {
    const html = '<a href="/dilijan/worlds/extra">x</a> see /dilijan/worlds in the text'
    expect(relinkHtml(html, '/dilijan/worlds', '/dilijan').count).toBe(0)
  })
  it('refuses a target that could break out of the attribute', () => {
    expect(() => relinkHtml('<a href="/a">', '/a', '/b" onclick="x')).toThrow()
  })
})

describe('repointAssets', () => {
  it('makes a hard-coded host relative and moves the asset to the target project', () => {
    const r = repointAssets(wallHtml, 'elevation', 'the-yard')
    expect(r.hashes).toEqual([H2])
    expect(r.html).toContain(`fetch("/serverXR/api/projects/the-yard/assets/${H2}")`)
    expect(r.html).not.toContain('staging.di-studio.xyz')
  })
  it('does not touch another project\'s assets', () => {
    const other = `/serverXR/api/projects/orange-room/assets/${H1}`
    expect(repointAssets(`x ${other} y`, 'elevation', 'the-yard')).toEqual({ html: `x ${other} y`, hashes: [] })
  })
  it('sees every asset the repo page spaces/dilijan/aren/yard.html names, so a combine copies them all', () => {
    // An asset URL built as PREFIX + hash is invisible to repointAssets: the combine would neither check nor copy it.
    const html = fs.readFileSync(path.join(here, '../../spaces/dilijan/aren/yard.html'), 'utf8')
    const named = new Set(html.match(/[0-9a-f]{64}/g))
    expect(named.size).toBe(4) // cloud, fragment pack, yard mesh, wall_mid photo
    expect(repointAssets(html, 'the-yard', 'the-yard').hashes.sort()).toEqual([...named].sort())
  })
})

describe('buildCombinedPage', () => {
  const pages = [{ label: 'AirCanvas', html: airHtml }, { label: 'Բակը · Yard', html: yardHtml }, { label: '<b>Wall</b>', html: wallHtml }]

  it('one tab per page, the pages kept whole, labels escaped', () => {
    const html = buildCombinedPage({ title: 'Արեն · Aren', pages })
    expect(isCombined(html)).toBe(true)
    expect(html).toContain(MARK)
    expect(html.match(/<button /g)).toHaveLength(3)
    expect(html).toContain('&lt;b&gt;Wall&lt;/b&gt;')
    expect(pagesIn(html)).toEqual([airHtml, yardHtml, wallHtml])
  })
  it('a page cannot close the script that carries it', () => {
    const evil = '<script>alert(1)</script><!-- x -->'
    const html = buildCombinedPage({ title: 't', pages: [{ label: 'a', html: evil }, { label: 'b', html: airHtml }] })
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(pagesIn(html)[0]).toBe(evil)
  })
  it('hands the camera and the microphone on to the page inside (AirCanvas needs both)', () => {
    expect(buildCombinedPage({ pages }).includes(JSON.stringify(ALLOW))).toBe(true)
    expect(ALLOW).toMatch(/camera/)
    expect(ALLOW).toMatch(/microphone/)
  })
  it('switching a tab replaces the frame: one live frame, the right page, the right button pressed', () => {
    const dom = new JSDOM(buildCombinedPage({ title: 't', pages, start: 1 }), { runScripts: 'dangerously' })
    const { document } = dom.window
    const state = () => ({ frames: document.querySelectorAll('iframe').length, srcdoc: document.querySelector('iframe').srcdoc, allow: document.querySelector('iframe').allow, pressed: [...document.querySelectorAll('nav button')].map((b) => b.getAttribute('aria-pressed')) })
    expect(state()).toMatchObject({ frames: 1, srcdoc: yardHtml, pressed: ['false', 'true', 'false'] })
    const first = document.querySelector('iframe')
    document.querySelectorAll('nav button')[0].click()
    expect(state()).toMatchObject({ frames: 1, srcdoc: airHtml, pressed: ['true', 'false', 'false'] })
    expect(state().allow).toContain('camera')
    expect(first.isConnected).toBe(false) // the old page was unloaded, not hidden
  })
  it('refuses an empty list', () => {
    expect(() => buildCombinedPage({ pages: [] })).toThrow()
  })
})

describe('combine-pages.mjs against a fake serverXR', () => {
  let api, tmp
  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'combine-pages-'))
    api = await fakeApi({
      docs: { 'the-yard': docOf(yardHtml), elevation: docOf(wallHtml), aircanvas: docOf(airHtml) },
      assets: { [`the-yard/${H1}`]: Buffer.from('yard'), [`elevation/${H2}`]: Buffer.from('wall') }
    })
  })
  afterEach(() => { api.server.close(); fs.rmSync(tmp, { recursive: true, force: true }) })
  const argv = (extra = []) => ['--api', api.url, '--into', 'the-yard', '--tab', 'AirCanvas=aircanvas', '--tab', 'Yard=the-yard', '--tab', 'Wall=elevation', '--relink', '/dilijan/worlds=/dilijan#works', ...extra]

  it('says who it is on every request (a refused program would exit non-zero here)', async () => {
    const r = await run(argv())
    expect(r.code).toBe(0)
    expect(api.log.length).toBeGreaterThan(0)
    expect(api.log.every((l) => l.kind === 'app')).toBe(true)
  })

  it('a dry run reads and changes nothing', async () => {
    const r = await run(argv())
    expect(r.stdout).toMatch(/would replace the-yard's page with 3 tabs/)
    expect(r.stdout).toMatch(/dry run/)
    expect(api.log.filter((l) => l.method !== 'GET')).toEqual([])
    expect(isCombined(api.docs['the-yard'].presentationState.codeHtml)).toBe(false)
  })

  it('--apply combines the pages, copies the wall asset, repoints links, keeps the document and writes a backup', async () => {
    const backup = path.join(tmp, 'backup.json')
    const r = await run(argv(['--apply', '--backup', backup, '--title', 'Արեն · Aren']))
    expect(r.code).toBe(0)
    const doc = api.docs['the-yard']
    const combined = doc.presentationState.codeHtml
    expect(isCombined(combined)).toBe(true)
    expect(doc.nodes).toEqual([{ id: 'keep-me' }])
    const pages = pagesIn(combined)
    expect(pages).toHaveLength(3)
    expect(pages.join('')).not.toContain('/dilijan/worlds') // href and window.open, both
    expect(pages.join('')).not.toContain('staging.di-studio.xyz')
    expect(pages[2]).toContain(`/serverXR/api/projects/the-yard/assets/${H2}`)
    expect(api.assets[`the-yard/${H2}`]).toBeDefined() // the wall's data now lives in the combined project
    expect(JSON.parse(fs.readFileSync(backup, 'utf8')).document.presentationState.codeHtml).toBe(yardHtml)
  })

  it('refuses a project that is already combined, and --undo puts the original back', async () => {
    const backup = path.join(tmp, 'backup.json')
    expect((await run(argv(['--apply', '--backup', backup]))).code).toBe(0)
    const again = await run(argv(['--apply']))
    expect(again.code).toBe(1)
    expect(again.stderr).toMatch(/already a combined page/)
    expect((await run(['--api', api.url, '--undo', backup, '--apply'])).code).toBe(0)
    expect(api.docs['the-yard'].presentationState.codeHtml).toBe(yardHtml)
  })

  it('names the missing asset and changes nothing when the server does not have it', async () => {
    delete api.assets[`elevation/${H2}`]
    const r = await run(argv(['--apply', '--backup', path.join(tmp, 'b.json')]))
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/is not on .* for elevation/)
    expect(isCombined(api.docs['the-yard'].presentationState.codeHtml)).toBe(false)
  })

  it('--assets-from takes the missing asset from another server', async () => {
    delete api.assets[`elevation/${H2}`]
    const source = await fakeApi({ docs: {}, assets: { [`elevation/${H2}`]: Buffer.from('wall') } })
    try {
      const r = await run(argv(['--apply', '--backup', path.join(tmp, 'b.json'), '--assets-from', source.url]))
      expect(r.code).toBe(0)
      expect(api.assets[`the-yard/${H2}`]).toBeDefined()
      expect(source.log.every((l) => l.kind === 'app')).toBe(true)
    } finally { source.server.close() }
  })

  it('a tab can be a page kept in the repo: read relative to the spec, its assets checked on the target, its links repointed', async () => {
    const one = `<html><body>${back('/dilijan/worlds')}<script>fetch("/serverXR/api/projects/the-yard/assets/${H1}")</script>one view</body></html>`
    fs.mkdirSync(path.join(tmp, 'aren'))
    fs.writeFileSync(path.join(tmp, 'aren', 'one.html'), one)
    const spec = path.join(tmp, 'spec.json')
    fs.writeFileSync(spec, JSON.stringify({ into: 'the-yard', tabs: [{ label: 'AirCanvas', id: 'aircanvas' }, { label: 'Yard · Wall', file: 'aren/one.html' }], relink: { '/dilijan/worlds': '/dilijan#works' } }))
    const r = await run(['--api', api.url, '--spec', spec, '--apply', '--backup', path.join(tmp, 'b.json')])
    expect(r.code).toBe(0)
    expect(pagesIn(api.docs['the-yard'].presentationState.codeHtml)).toEqual([airHtml, relinkHtml(one, '/dilijan/worlds', '/dilijan#works').html])
    expect(api.log.some((l) => l.url === `/api/projects/the-yard/assets/${H1}/meta`)).toBe(true)
  })

  it('the command line takes a file tab too, and a missing file is named', async () => {
    fs.writeFileSync(path.join(tmp, 'one.html'), '<html>one</html>')
    const ok = await run(['--api', api.url, '--into', 'the-yard', '--tab', 'AirCanvas=aircanvas', '--tab', `One=file:${path.join(tmp, 'one.html')}`])
    expect(ok.code).toBe(0)
    expect(ok.stdout).toMatch(/would replace the-yard's page with 2 tabs \(AirCanvas \| One\)/)
    const missing = await run(['--api', api.url, '--into', 'the-yard', '--tab', 'AirCanvas=aircanvas', '--tab', `One=file:${path.join(tmp, 'nope.html')}`])
    expect(missing.code).toBe(1)
    expect(missing.stderr).toMatch(/nope\.html: no such page/)
  })

  it('--keep-as keeps the target\'s own page as a private project (assets copied, links repointed); --undo empties it again', async () => {
    api.assets[`the-yard/${H1}`] = Buffer.from('PHOTO-BYTES') // a photo: the server stores its copy under a new id
    const H3 = 'c'.repeat(64)
    fs.writeFileSync(path.join(tmp, 'one.html'), '<html>one</html>')
    const args = ['--api', api.url, '--into', 'the-yard', '--tab', 'AirCanvas=aircanvas', '--tab', `One=file:${path.join(tmp, 'one.html')}`, '--relink', '/dilijan/worlds=/dilijan#works', '--keep-as', 'yard-original']
    const dry = await run(args)
    expect(dry.code).toBe(0)
    expect(dry.stdout).toMatch(/would keep the-yard's own page as project yard-original in dilijan \(private\)/)
    expect(api.docs['yard-original']).toBeUndefined()
    const backup = path.join(tmp, 'b.json')
    expect((await run([...args, '--apply', '--backup', backup])).code).toBe(0)
    const kept = api.docs['yard-original'].presentationState
    expect(kept.codeHtml).toContain(`/serverXR/api/projects/yard-original/assets/${H3}`) // the id the server gave
    expect(kept.codeHtml).not.toContain(H1)
    expect(kept.codeHtml).not.toContain('di-studio.xyz')
    expect(kept.codeHtml).not.toContain('/dilijan/worlds')
    expect(kept.entryView).toBe('code')
    expect(api.assets[`yard-original/${H3}`]).toBeDefined()
    expect(api.created).toEqual([{ space: 'dilijan', slug: 'yard-original', visibility: 'private' }])
    expect(isCombined(api.docs['the-yard'].presentationState.codeHtml)).toBe(true)
    // undo: the target has its page again, the kept copy goes empty (the project stays), and the combine can run again
    expect((await run(['--api', api.url, '--undo', backup, '--apply'])).code).toBe(0)
    expect(api.docs['the-yard'].presentationState.codeHtml).toBe(yardHtml)
    expect(api.docs['yard-original'].presentationState.codeHtml).toBe('')
    const backup2 = path.join(tmp, 'b2.json')
    expect((await run([...args, '--apply', '--backup', backup2])).code).toBe(0)
    expect(api.docs['yard-original'].presentationState.codeHtml).toBe(kept.codeHtml)
    // a kept page someone changed is never emptied, and never overwritten
    api.docs['yard-original'].presentationState.codeHtml = '<html>edited</html>'
    const undo2 = await run(['--api', api.url, '--undo', backup2, '--apply'])
    expect(undo2.stdout).toMatch(/left yard-original as it is/)
    expect(api.docs['yard-original'].presentationState.codeHtml).toBe('<html>edited</html>')
    const before = JSON.stringify(api.docs)
    const again = await run([...args, '--apply'])
    expect(again.code).toBe(1)
    expect(again.stderr).toMatch(/yard-original already holds a page/)
    expect(JSON.stringify(api.docs)).toBe(before)
  })
})
