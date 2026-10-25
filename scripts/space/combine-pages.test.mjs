// @vitest-environment node
// combine-pages.mjs and the helpers it shares with apply-structure.mjs. The command runs for real against a fake
// serverXR that files an unidentified program the way the real one does (it uses the server's own classifier),
// so a script that forgets to say who it is fails here, not at the 31st request.
import { applyEdits } from './fake-ops.test-helper.mjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { ALLOW, MARK, buildCombinedPage, isCombined, relinkHtml, relinkPortals, repointAssets, userAgent } from './pages-lib.mjs'

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
function fakeApi({ docs, assets = {}, lostPut = {} }) {
  const log = []
  const created = []
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      const kind = classifyUserAgent(req.headers['user-agent']).kind
      log.push({ method: req.method, url: req.url, kind, authorization: req.headers.authorization })
      const send = (code, data, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(type === 'application/json' ? JSON.stringify(data) : data) }
      if (kind === 'anonymous') return send(429, { error: 'Too many requests from this address by an unidentified program — retry in 28s.' })
      let m
      if ((m = req.url.match(/^\/api\/projects\/([^/]+)\/document$/))) {
        if (req.method === 'GET') return docs[m[1]] ? send(200, { document: docs[m[1]], version: 1 }) : send(404, { error: 'Project not found.' })
        if (req.method === 'PUT') {
          docs[m[1]] = JSON.parse(body.toString())
          // the write lands but its answer is lost: the run stops right after it
          return lostPut[m[1]] ? send(502, { error: 'Bad gateway.' }) : send(200, { ok: true })
        }
      }
      if ((m = req.url.match(/^\/api\/projects\/([^/]+)\/ops$/)) && req.method === 'POST') {
        if (!docs[m[1]]) return send(404, { error: 'Project not found.' })
        docs[m[1]] = applyEdits(docs[m[1]], JSON.parse(body.toString()).ops)
        return lostPut[m[1]] ? send(502, { error: 'Bad gateway.' }) : send(200, { ok: true })
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
        // like the real server (assetScrub.js), a photo is re-encoded (its metadata stripped) and stored under the id of its new bytes
        const stored = body.toString('latin1').includes('PHOTO-BYTES') ? 'c'.repeat(64) : id[1]
        assets[`${m[1]}/${stored}`] = Buffer.from('copied')
        return send(200, { ok: true, asset: { id: stored } })
      }
      return send(404, { error: `no route ${req.method} ${req.url}` })
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, log, docs, assets, created, lostPut, url: `http://127.0.0.1:${server.address().port}` })))
}

const run = (argv, env = {}) => new Promise((resolve) => execFile(process.execPath, [COMBINE, ...argv], { timeout: 20000, env: { ...process.env, DI_TOKEN: '', DI_ASSETS_TOKEN: '', ...env } }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr })))
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
    expect(named.size).toBe(5) // cloud, fragment pack, yard mesh, the photos of main and wall_mid (main since N1131)
    expect(repointAssets(html, 'the-yard', 'the-yard').hashes.sort()).toEqual([...named].sort())
  })
})

describe('relinkPortals (a scene\'s doors, N1248)', () => {
  const door = (id, r) => ({ id, type: 'portal', components: { reference: { mode: 'portal', label: id, ...r } } })
  it('repoints a door to a hidden project, with the part of the page, and leaves the rest alone', () => {
    const ents = [door('a', { spaceId: 'dilijan', projectId: 'worlds' }), door('b', { spaceId: 'dilijan', projectId: 'the-yard' }), { id: 'c', type: 'box', components: {} }, door('d', { projectId: 'worlds', mode: 'embed' })]
    const r = relinkPortals(ents, '/dilijan/worlds', '/dilijan#works', 'dilijan')
    expect(r.count).toBe(1)
    expect(r.entities[0].components.reference).toMatchObject({ spaceId: 'dilijan', projectId: '', anchor: 'works', label: 'a' })
    expect(r.entities[1]).toBe(ents[1]); expect(r.entities[3]).toBe(ents[3])
    expect(ents[0].components.reference.projectId).toBe('worlds') // pure
  })
  it('refuses a destination that is not /space[/project][#part]', () => {
    expect(() => relinkPortals([], '/a', 'https://x.test')).toThrow()
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
  // The viewer gives the TOP page window.diiPageOrigin/diiPageQuery (presentationPreviewDocument.js); a tab's srcdoc
  // frame must get them too, or AirCanvas falls back to its hard-coded prod host on every other tier.
  const viewerHands = (html, origin, query) => new JSDOM(html, { runScripts: 'dangerously', beforeParse(w) { w.diiPageOrigin = origin; w.diiPageQuery = query } })
  const runTab = (srcdoc) => new JSDOM(srcdoc, { runScripts: 'dangerously' }).window
  const air = '<!doctype html><html><head><title>air</title><script>window.base=(window.diiPageOrigin||"https://di-studio.xyz");window.room=window.diiPageParams&&window.diiPageParams.get("room")</script></head><body>air</body></html>'
  it('hands the viewer\'s origin and query on to the open tab, before the tab\'s own scripts run', () => {
    const dom = viewerHands(buildCombinedPage({ pages: [{ label: 'AirCanvas', html: air }, { label: 'Yard', html: yardHtml }] }), 'https://dev.diiii.xyz', '?room=r1')
    const tab = runTab(dom.window.document.querySelector('iframe').srcdoc)
    expect(tab.base).toBe('https://dev.diiii.xyz')
    expect(tab.diiPageQuery).toBe('?room=r1')
    expect(tab.room).toBe('r1')
    dom.window.document.querySelectorAll('nav button')[1].click() // a page with no <head> gets one
    const yard = dom.window.document.querySelector('iframe').srcdoc
    expect(yard).toMatch(/^<html><head><script>window\.diiPageOrigin="https:\/\/dev\.diiii\.xyz";/)
    expect(runTab(yard).diiPageOrigin).toBe('https://dev.diiii.xyz')
  })
  it('a value cannot close the script it is handed in; outside the viewer the page is left as it is', () => {
    const query = '?x=</script><script>window.pwned=1</script>'
    const dom = viewerHands(buildCombinedPage({ pages: [{ label: 'a', html: air }, { label: 'b', html: airHtml }] }), 'https://dev.diiii.xyz', query)
    const tab = runTab(dom.window.document.querySelector('iframe').srcdoc)
    expect(tab.pwned).toBeUndefined()
    expect(tab.diiPageQuery).toBe(query)
    const bare = new JSDOM(buildCombinedPage({ pages: [{ label: 'a', html: air }, { label: 'b', html: airHtml }] }), { runScripts: 'dangerously' })
    expect(bare.window.document.querySelector('iframe').srcdoc).toBe(air)
  })
  it('?tab=<key> (or a number from 1) opens that tab: a door into the yard lands in the yard (N1248)', () => {
    const two = [{ label: 'AirCanvas', id: 'aircanvas', html: airHtml }, { label: 'Yard', id: 'yard.html', html: yardHtml }]
    const open = (query) => viewerHands(buildCombinedPage({ pages: two }), '', query).window.document
    const pressed = (doc) => [...doc.querySelectorAll('nav button')].map((b) => b.getAttribute('aria-pressed'))
    expect(pressed(open('?tab=yard'))).toEqual(['false', 'true'])
    expect(open('?tab=yard').querySelector('iframe').srcdoc).toContain(yardHtml.slice(-30))
    expect(pressed(open('?tab=2'))).toEqual(['false', 'true'])
    expect(pressed(open('?tab=nope'))).toEqual(['true', 'false'])
    expect(pressed(open(''))).toEqual(['true', 'false'])
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

  it('a photo the server re-encodes on copy is named by the id the server gives it (it 404s under the old one)', async () => {
    api.assets[`elevation/${H2}`] = Buffer.from('PHOTO-BYTES')
    const H3 = 'c'.repeat(64)
    const r = await run(argv(['--apply', '--backup', path.join(tmp, 'b.json')]))
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/re-encoded by the server/)
    const wall = pagesIn(api.docs['the-yard'].presentationState.codeHtml)[2]
    expect(wall).toContain(`/serverXR/api/projects/the-yard/assets/${H3}`)
    expect(wall).not.toContain(H2)
    expect(api.assets[`the-yard/${H3}`]).toBeDefined()
  })

  it('DI_TOKEN reaches --api only: another --assets-from host gets DI_ASSETS_TOKEN, or no token', async () => {
    delete api.assets[`elevation/${H2}`]
    const source = await fakeApi({ docs: {}, assets: { [`elevation/${H2}`]: Buffer.from('wall') } })
    try {
      const go = (env) => run(argv(['--apply', '--backup', path.join(tmp, 'b.json'), '--assets-from', source.url]), env)
      expect((await go({ DI_TOKEN: 'api-secret' })).code).toBe(0)
      expect(api.log.filter((l) => l.method !== 'GET').every((l) => l.authorization === 'Bearer api-secret')).toBe(true)
      expect(source.log.length).toBeGreaterThan(0)
      expect(source.log.map((l) => l.authorization)).toEqual(source.log.map(() => undefined))
      source.log.length = 0
      api.docs['the-yard'] = docOf(yardHtml)
      delete api.assets[`the-yard/${H2}`]
      expect((await go({ DI_TOKEN: 'api-secret', DI_ASSETS_TOKEN: 'source-secret' })).code).toBe(0)
      expect(source.log.map((l) => l.authorization)).toEqual(source.log.map(() => 'Bearer source-secret'))
    } finally { source.server.close() }
  })

  it('DI_TOKEN still reads assets when --assets-from is --api itself', async () => {
    const r = await run(argv(['--apply', '--backup', path.join(tmp, 'b.json'), '--assets-from', api.url]), { DI_TOKEN: 'api-secret' })
    expect(r.code).toBe(0)
    expect(api.log.find((l) => l.url === `/api/projects/elevation/assets/${H2}`).authorization).toBe('Bearer api-secret')
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

  it('--assets-from on another server never gets the target\'s token; DI_ASSETS_TOKEN is the one it gets', async () => {
    const source = await fakeApi({ docs: {}, assets: { [`elevation/${H2}`]: Buffer.from('wall') } })
    try {
      for (const [env, expected] of [[{ DI_TOKEN: 'target-secret' }, undefined], [{ DI_TOKEN: 'target-secret', DI_ASSETS_TOKEN: 'source-token' }, 'Bearer source-token']]) {
        delete api.assets[`elevation/${H2}`]; delete api.assets[`the-yard/${H2}`]
        api.docs['the-yard'] = docOf(yardHtml); source.log.length = 0; api.log.length = 0
        const r = await run(argv(['--apply', '--backup', path.join(tmp, 'b.json'), '--assets-from', source.url]), env)
        expect(r.code).toBe(0)
        expect(source.log.length).toBeGreaterThan(0)
        expect(source.log.map((l) => l.authorization)).toEqual(source.log.map(() => expected))
        expect(api.log.every((l) => l.authorization === 'Bearer target-secret')).toBe(true) // the target still gets its own
      }
    } finally { source.server.close() }
  })

  it('--assets-from naming the --api server itself still sends its token', async () => {
    delete api.assets[`elevation/${H2}`]
    api.assets[`elevation/${H2}`] = Buffer.from('wall')
    const r = await run(argv(['--apply', '--backup', path.join(tmp, 'b.json'), '--assets-from', `${api.url}/`]), { DI_TOKEN: 'target-secret' })
    expect(r.code).toBe(0)
    expect(api.log.filter((l) => l.url === `/api/projects/elevation/assets/${H2}`).map((l) => l.authorization)).toEqual(['Bearer target-secret'])
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

  it('--keep-as: a run that stops after writing the kept page still leaves a backup, and its --undo empties the page', async () => {
    api.lostPut['yard-original'] = true
    fs.writeFileSync(path.join(tmp, 'one.html'), '<html>one</html>')
    const args = ['--api', api.url, '--into', 'the-yard', '--tab', 'AirCanvas=aircanvas', '--tab', `One=file:${path.join(tmp, 'one.html')}`, '--keep-as', 'yard-original']
    const backup = path.join(tmp, 'b.json')
    const r = await run([...args, '--apply', '--backup', backup])
    expect(r.code).not.toBe(0)
    expect(api.docs['yard-original'].presentationState.codeHtml).toContain('/serverXR/api/projects/yard-original/assets/') // the page was written
    expect(isCombined(api.docs['the-yard'].presentationState.codeHtml)).toBe(false) // the target was not
    expect(JSON.parse(fs.readFileSync(backup, 'utf8')).kept.id).toBe('yard-original')
    delete api.lostPut['yard-original']
    expect((await run(['--api', api.url, '--undo', backup, '--apply'])).code).toBe(0)
    expect(api.docs['yard-original'].presentationState.codeHtml).toBe('')
    expect(api.docs['the-yard'].presentationState.codeHtml).toBe(yardHtml)
    expect((await run([...args, '--apply', '--backup', path.join(tmp, 'b2.json')])).code).toBe(0) // and it can run again
  })
})

describe('structure edits and doors (N1250)', () => {
  it('editHtml changes only the named projects, exactly, and a re-run is a no-op', async () => {
    const { editHtml } = await import('./pages-lib.mjs')
    const edits = [{ projects: ['a'], from: '← W</a>', to: '← W · Worlds</a>', why: 'back' }]
    const once = editHtml('<a>← W</a><a>← W</a>', edits, 'a')
    expect(once.count).toBe(2)
    expect(once.html).toBe('<a>← W · Worlds</a><a>← W · Worlds</a>')
    expect(editHtml(once.html, edits, 'a').count).toBe(0)
    expect(editHtml('<a>← W</a>', edits, 'b').count).toBe(0)
    expect(() => editHtml('x', [{ from: '', to: 'y' }], 'a')).toThrow()
  })
  it('upsertDoors adds a missing door, updates a changed one, leaves the rest', async () => {
    const { upsertDoors } = await import('./pages-lib.mjs')
    const door = (id, label) => ({ id, type: 'portal', components: { reference: { spaceId: 's', projectId: id, mode: 'portal', label } } })
    const keep = door('k', 'K')
    const r = upsertDoors([keep, door('w', 'W')], [door('w', 'W · Worlds'), door('n', 'N')])
    expect(r.count).toBe(2)
    expect(r.entities.map((e) => e.id)).toEqual(['k', 'w', 'n'])
    expect(r.entities[0]).toBe(keep)
    expect(r.entities[1].components.reference.label).toBe('W · Worlds')
    expect(upsertDoors(r.entities, [door('w', 'W · Worlds'), door('n', 'N')]).count).toBe(0)
    expect(() => upsertDoors([], [{ id: 'x', type: 'box' }])).toThrow()
  })
})

describe('extendDoorSet (N1250)', () => {
  it('carries the last two sets one step on the arc: turned parts turn, fixed offsets stay, colours swap', async () => {
    const { extendDoorSet } = await import('./pages-lib.mjs')
    const at = (deg, r = 24) => [r * Math.sin(deg * Math.PI / 180), 2, -r * Math.cos(deg * Math.PI / 180)]
    const ent = (id, p, extra = {}) => ({ id, name: id, components: { transform: { position: p, rotation: [0, 0, 0] }, appearance: { color: '#FFAABB' }, ...extra } })
    const ents = [ent('e-door-4', at(32)), ent('e-door-5', at(64)), ent('e-door-6', at(96)),
      ent('e-pad-3', at(32)), ent('e-pad-4', at(64)),
      ent('e-stone-3-0', at(32, 20)), ent('e-stone-4-0', at(64, 20)),
      ent('e-beacon-3', at(32).map((v, k) => v + [0, 1, -1.9][k])), ent('e-beacon-4', at(64).map((v, k) => v + [0, 1, -1.9][k]))]
    const out = extendDoorSet(ents, { match: '^e-(pad|stone|beacon)-{i}(-|$)', prev: '3', src: '4', next: '5', doorPrev: 'e-door-4', doorSrc: 'e-door-5', doorNext: 'e-door-6', recolor: { '#ffaabb': '#77AADD' } })
    const by = Object.fromEntries(out.map((e) => [e.id, e.components]))
    expect(Object.keys(by).sort()).toEqual(['e-beacon-5', 'e-pad-5', 'e-stone-5-0'])
    const near = (a, b) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], 4))
    near(by['e-pad-5'].transform.position, at(96))
    near(by['e-stone-5-0'].transform.position, at(96, 20))
    near(by['e-beacon-5'].transform.position, at(96).map((v, k) => v + [0, 1, -1.9][k]))
    expect(by['e-pad-5'].appearance.color).toBe('#77AADD')
  })
})
