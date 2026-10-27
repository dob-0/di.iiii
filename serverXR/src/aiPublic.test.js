// @vitest-environment node
//
// /llms.txt and /ai/*.md (aiPublic.js), on a real express app over a real
// port, against the real bundle in docs/ai/public/ and against fixtures. The
// bug this exists for: /llms-full.txt and /ai/… answered 200 with the app's
// HTML shell, and an assistant read the shell as content.

import { createRequire } from 'node:module'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerAiPublicRoutes, DEFAULT_BUNDLE_DIR } = require('./aiPublic')
const { parseLlmsTxt } = require('./llmsTxt')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SHELL = '<!doctype html><div id="root"></div>'

const servers = []
const tmpDirs = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))))
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

// The app as a local install builds it: our routes first, then a shell
// fallback that answers everything else with HTML, like the SPA's.
const start = async (options = {}) => {
  const app = express()
  registerAiPublicRoutes(app, { logger: { error: () => {} }, ...options })
  app.use((req, res) => res.status(200).type('text/html').send(SHELL))
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  servers.push(server)
  return `http://127.0.0.1:${server.address().port}`
}

const fixtureDir = async (files) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-ai-bundle-'))
  tmpDirs.push(dir)
  await Promise.all(Object.entries(files).map(([name, text]) => writeFile(path.join(dir, name), text)))
  return dir
}

describe('the llms.txt reader follows llmstxt.org', () => {
  it('reads a whole file: H1, summary, detail, sections of links', () => {
    const parsed = parseLlmsTxt([
      '# Site', '', '> A summary.', '', 'Some detail.', '',
      '## Docs', '', '- [One](https://e.x/1.md): the first', '- [Two](https://e.x/2.md)', '',
      '## Optional', '', '- [More](https://e.x/more)'
    ].join('\n'))
    expect(parsed.errors).toEqual([])
    expect(parsed.title).toBe('Site')
    expect(parsed.summary).toBe('A summary.')
    expect(parsed.sections.map((s) => [s.name, s.links.length])).toEqual([['Docs', 2], ['Optional', 1]])
    expect(parsed.sections[0].links[0]).toEqual({ name: 'One', url: 'https://e.x/1.md', notes: 'the first' })
  })

  it.each([
    ['no H1', '> summary\n\n## A\n\n- [x](https://e.x)', /open with an H1/],
    ['no blockquote', '# Site\n\n## A\n\n- [x](https://e.x)', /blockquote/],
    ['a heading in the detail', '# Site\n\n> s\n\n### Sub\n\n## A\n\n- [x](https://e.x)', /no headings between/],
    ['a list item that is not a link', '# Site\n\n> s\n\n## A\n\n- `GET /x`: a route', /file list/],
    ['a section with no links', '# Site\n\n> s\n\n## A\n\n## B\n\n- [x](https://e.x)', /lists no links/],
    ['Optional not last', '# Site\n\n> s\n\n## Optional\n\n- [x](https://e.x)\n\n## B\n\n- [y](https://e.x)', /Optional/],
    ['an H3 among sections', '# Site\n\n> s\n\n## A\n\n- [x](https://e.x)\n\n### C', /only H2/]
  ])('refuses %s', (_label, text, error) => {
    const parsed = parseLlmsTxt(text)
    expect(parsed.ok).toBe(false)
    expect(parsed.errors.join('\n')).toMatch(error)
  })
})

describe('the bundle in docs/ai/public/', () => {
  it('holds an llms.txt that parses per the spec', async () => {
    const parsed = parseLlmsTxt(await readFile(path.join(DEFAULT_BUNDLE_DIR, 'llms.txt'), 'utf8'))
    expect(parsed.errors).toEqual([])
    expect(parsed.title).toBe('di.iiii')
    expect(parsed.summary).toMatch(/public spaces on the open web/)
    expect(parsed.sections.length).toBeGreaterThan(1)
  })

  it('links only /ai/ files the bundle has', async () => {
    const parsed = parseLlmsTxt(await readFile(path.join(DEFAULT_BUNDLE_DIR, 'llms.txt'), 'utf8'))
    const aiLinks = parsed.sections.flatMap((s) => s.links).map((l) => l.url).filter((u) => u.includes('/ai/'))
    expect(aiLinks.length).toBeGreaterThan(0)
    const files = new Set(await readdir(DEFAULT_BUNDLE_DIR))
    for (const url of aiLinks) expect(files.has(url.split('/ai/')[1]), url).toBe(true)
  })

  it('every word on words.md is a word of the dictionary (docs/ai/vocabulary.md)', async () => {
    const words = await readFile(path.join(DEFAULT_BUNDLE_DIR, 'words.md'), 'utf8')
    const dictionary = await readFile(path.join(ROOT, 'docs/ai/vocabulary.md'), 'utf8')
    const defined = [...words.matchAll(/^- \*\*([^*]+)\*\*:/gm)].map((m) => m[1])
    expect(defined.length).toBeGreaterThan(10)
    for (const word of defined) expect(dictionary, `"${word}" is not a row of vocabulary.md`).toContain(`| **${word}** |`)
  })
})

describe('serving it', () => {
  it('serves /llms.txt as text, from the bundle', async () => {
    const base = await start()
    const res = await fetch(`${base}/llms.txt`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    const text = await res.text()
    expect(text).toBe(await readFile(path.join(DEFAULT_BUNDLE_DIR, 'llms.txt'), 'utf8'))
    expect(parseLlmsTxt(text).ok).toBe(true)
  })

  it('answers /llms-full.txt with a 404 in text, not the shell', async () => {
    const base = await start()
    const res = await fetch(`${base}/llms-full.txt`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toMatch(/html/)
    expect(await res.text()).toMatch(/llms\.txt/)
  })

  it('serves an /ai/*.md file as markdown, pointing back at llms.txt', async () => {
    const base = await start()
    const res = await fetch(`${base}/ai/about.md`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(res.headers.get('link')).toBe('</llms.txt>; rel="describedby"')
    expect(await res.text()).toMatch(/^# What di\.iiii is/)
  })

  it.each([
    '/ai', '/ai/', '/ai/context', '/ai/nope.md', '/ai/about', '/ai/README.md', '/ai/llms.txt',
    '/ai/..%2Fvocabulary.md', '/ai/sub/about.md', '/ai/.hidden.md', '/ai/setup'
  ])('answers %s with a 404 in text, never the shell', async (url) => {
    const base = await start()
    const res = await fetch(`${base}${url}`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toMatch(/html/)
    expect(await res.text()).not.toContain(SHELL)
  })

  it('refuses a write under /ai/', async () => {
    const base = await start()
    const res = await fetch(`${base}/ai/about.md`, { method: 'POST', body: 'x' })
    expect(res.status).toBe(404)
  })

  it('lets the app answer its own pages under /ai/ when it is the web server', async () => {
    const base = await start({ appPages: true })
    const res = await fetch(`${base}/ai/setup`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(SHELL)
    expect((await fetch(`${base}/ai/elsewhere`)).status).toBe(404)
  })

  it('answers 404 for everything when the build carries no bundle (a local pack)', async () => {
    const base = await start({ bundleDir: path.join(os.tmpdir(), 'dii-no-such-bundle') })
    for (const url of ['/llms.txt', '/ai/about.md']) {
      const res = await fetch(`${base}${url}`)
      expect(res.status, url).toBe(404)
      expect(res.headers.get('content-type'), url).not.toMatch(/html/)
    }
  })

  it('refuses to serve an llms.txt that is not one', async () => {
    const base = await start({ bundleDir: await fixtureDir({ 'llms.txt': 'just words, no heading\n' }) })
    const res = await fetch(`${base}/llms.txt`)
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('just words')
  })
})
