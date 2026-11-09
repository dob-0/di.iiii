// @vitest-environment node
// The share door against a fake HTTP server: every adapter, the store, the
// retry rule, and the three failure paths (missing token, API 4xx, media too big).

import { createRequire } from 'node:module'
import http from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { initDb, closeDb } = require('../db.js')
const store = require('./postStore.js')
const { createTelegramChannel } = require('./telegram.js')
const { createBlueskyChannel, linkFacets } = require('./bluesky.js')
const { createMastodonChannel } = require('./mastodon.js')
const { createInstagramChannel } = require('./instagram.js')
const { createShareService, normalizeMedia } = require('./shareService.js')

let server, base
let seen = []
let handlers = {}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      const entry = { method: req.method, url: req.url, headers: req.headers, body }
      seen.push(entry)
      const key = Object.keys(handlers).find((k) => req.url.startsWith(k))
      if (!key) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"no handler"}') }
      const out = handlers[key](entry)
      res.writeHead(out.status || 200, { 'content-type': out.type || 'application/json' })
      res.end(Buffer.isBuffer(out.body) ? out.body : JSON.stringify(out.body ?? {}))
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(() => new Promise((r) => server.close(r)))
beforeEach(() => { initDb(':memory:'); seen = []; handlers = {} })
afterEach(() => { closeDb() })

const PNG = Buffer.from('89504e470d0a1a0a', 'hex')
const hit = (prefix) => seen.filter((s) => s.url.startsWith(prefix))
const loadMedia = async (item) => {
  const r = await fetch(item.url)
  return { buffer: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type'), name: 'pic.png' }
}
const SECRET = 'tg-secret-9876:ABCdef'

describe('telegram', () => {
  const make = (over = {}) => createTelegramChannel({ config: { botToken: SECRET, chat: '@diiii_news', apiBase: base, ...over } })

  it('sends text with sendMessage and returns the t.me link', async () => {
    handlers[`/bot${SECRET}/sendMessage`] = () => ({ body: { ok: true, result: { message_id: 42, chat: { username: 'diiii_news' } } } })
    const done = await make().send({ text: 'A new space', link: 'https://diiii.xyz/x', media: [] }, { loadMedia })
    expect(done).toEqual({ id: '42', url: 'https://t.me/diiii_news/42' })
    const sent = JSON.parse(hit('/bot')[0].body.toString())
    expect(sent).toEqual({ chat_id: '@diiii_news', text: 'A new space\nhttps://diiii.xyz/x' })
  })

  it('sends one image as multipart sendPhoto with the caption', async () => {
    handlers['/img.png'] = () => ({ type: 'image/png', body: PNG })
    handlers[`/bot${SECRET}/sendPhoto`] = () => ({ body: { ok: true, result: { message_id: 7 } } })
    await make().send({ text: 'look', media: [{ kind: 'image', url: `${base}/img.png` }] }, { loadMedia })
    const req = hit('/bot')[0]
    expect(req.headers['content-type']).toMatch(/^multipart\/form-data/)
    const text = req.body.toString('latin1')
    expect(text).toContain('name="caption"')
    expect(text).toContain('look')
    expect(text).toContain('name="photo"')
  })

  it('sends two images as one album', async () => {
    handlers['/img.png'] = () => ({ type: 'image/png', body: PNG })
    handlers[`/bot${SECRET}/sendMediaGroup`] = () => ({ body: { ok: true, result: [{ message_id: 8 }, { message_id: 9 }] } })
    const done = await make().send({ text: 'two', media: [{ kind: 'image', url: `${base}/img.png` }, { kind: 'image', url: `${base}/img.png` }] }, { loadMedia })
    expect(done.id).toBe('8')
    expect(hit('/bot')[0].body.toString('latin1')).toContain('attach://file1')
  })

  it('FAIL missing token: status says missing, send refuses, nothing is called', async () => {
    const channel = make({ botToken: '' })
    expect(channel.status().state).toBe('missing')
    await expect(channel.send({ text: 'x', media: [] }, { loadMedia })).rejects.toMatchObject({ code: 'missing-token' })
    expect(seen).toHaveLength(0)
  })

  it('status never carries the token', () => {
    expect(JSON.stringify(make().status())).not.toContain(SECRET)
  })

  it('FAIL API 4xx: the API words come back, the token does not', async () => {
    handlers['/bot'] = () => ({ status: 400, body: { ok: false, description: `Bad Request: chat not found ${SECRET}` } })
    const error = await make().send({ text: 'x', media: [] }, { loadMedia }).catch((e) => e)
    expect(error.code).toBe('api-error')
    expect(error.status).toBe(400)
    expect(error.message).toContain('chat not found')
    expect(error.message).not.toContain(SECRET)
  })

  it('FAIL media too big: a photo over 10 MB is refused before any call', async () => {
    handlers['/big.png'] = () => ({ type: 'image/png', body: Buffer.alloc(10 * 1024 * 1024 + 1) })
    await expect(make().send({ text: 'x', media: [{ kind: 'image', url: `${base}/big.png` }] }, { loadMedia })).rejects.toMatchObject({ code: 'media-too-big' })
    expect(hit('/bot')).toHaveLength(0)
  })
})

describe('bluesky', () => {
  const make = (over = {}) => createBlueskyChannel({
    config: { handle: 'di.example.com', appPassword: 'abcd-efgh-ijkl-mnop', pds: base, ...over },
    now: () => new Date('2026-10-21T10:00:00Z')
  })
  const ready = () => {
    handlers['/xrpc/com.atproto.server.createSession'] = () => ({ body: { accessJwt: 'jwt1', did: 'did:plc:abc', handle: 'di.example.com' } })
    handlers['/xrpc/com.atproto.repo.uploadBlob'] = () => ({ body: { blob: { $type: 'blob', ref: { $link: 'bafy' }, mimeType: 'image/png', size: 8 } } })
    handlers['/xrpc/com.atproto.repo.createRecord'] = () => ({ body: { uri: 'at://did:plc:abc/app.bsky.feed.post/3kabc', cid: 'c' } })
    handlers['/img.png'] = () => ({ type: 'image/png', body: PNG })
  }

  it('creates a session, uploads the image, posts with an images embed and a link facet', async () => {
    ready()
    const done = await make().send({ text: 'é 🎉 new', link: 'https://diiii.xyz/s', media: [{ kind: 'image', url: `${base}/img.png`, alt: 'a hall' }] }, { loadMedia })
    expect(done.url).toBe('https://bsky.app/profile/di.example.com/post/3kabc')
    const session = JSON.parse(hit('/xrpc/com.atproto.server.createSession')[0].body.toString())
    expect(session).toEqual({ identifier: 'di.example.com', password: 'abcd-efgh-ijkl-mnop' })
    expect(hit('/xrpc/com.atproto.repo.uploadBlob')[0].headers.authorization).toBe('Bearer jwt1')
    const created = JSON.parse(hit('/xrpc/com.atproto.repo.createRecord')[0].body.toString())
    expect(created.collection).toBe('app.bsky.feed.post')
    expect(created.record.embed.images).toEqual([{ alt: 'a hall', image: expect.objectContaining({ mimeType: 'image/png' }) }])
    const [facet] = created.record.facets
    const bytes = Buffer.from(created.record.text, 'utf8')
    expect(bytes.subarray(facet.index.byteStart, facet.index.byteEnd).toString()).toBe('https://diiii.xyz/s')
  })

  it('link facets count UTF-8 bytes, not characters', () => {
    const text = '🎉 see https://a.example/x.'
    const [f] = linkFacets(text)
    expect(Buffer.from(text).subarray(f.index.byteStart, f.index.byteEnd).toString()).toBe('https://a.example/x')
  })

  it('FAIL missing token', async () => {
    const channel = make({ appPassword: '' })
    expect(channel.status()).toMatchObject({ state: 'missing' })
    await expect(channel.send({ text: 'x', media: [] }, { loadMedia })).rejects.toMatchObject({ code: 'missing-token' })
  })

  it('FAIL API 4xx at sign-in', async () => {
    handlers['/xrpc/com.atproto.server.createSession'] = () => ({ status: 401, body: { error: 'AuthenticationRequired', message: 'Invalid identifier or password' } })
    const error = await make().send({ text: 'x', media: [] }, { loadMedia }).catch((e) => e)
    expect(error).toMatchObject({ code: 'api-error', status: 401 })
    expect(error.message).not.toContain('abcd-efgh-ijkl-mnop')
  })

  it('FAIL media too big: an image over 1,000,000 bytes is refused before sign-in', async () => {
    ready()
    handlers['/big.png'] = () => ({ type: 'image/png', body: Buffer.alloc(1000001) })
    await expect(make().send({ text: 'x', media: [{ kind: 'image', url: `${base}/big.png` }] }, { loadMedia })).rejects.toMatchObject({ code: 'media-too-big' })
    expect(hit('/xrpc/')).toHaveLength(0)
  })

  it('refuses text over 300 characters and video', async () => {
    ready()
    await expect(make().send({ text: 'a'.repeat(301), media: [] }, { loadMedia })).rejects.toMatchObject({ code: 'text-too-long' })
    await expect(make().send({ text: 'x', media: [{ kind: 'video', url: `${base}/v.mp4` }] }, { loadMedia })).rejects.toMatchObject({ code: 'unsupported-media' })
  })
})

describe('mastodon', () => {
  const make = (over = {}) => createMastodonChannel({ config: { url: base, token: 'masto-tok-1234', ...over } })

  it('uploads media to /api/v2/media then posts the status with media_ids', async () => {
    handlers['/img.png'] = () => ({ type: 'image/png', body: PNG })
    handlers['/api/v2/media'] = () => ({ status: 200, body: { id: '555' } })
    handlers['/api/v1/statuses'] = () => ({ body: { id: '9001', url: 'https://m.example/@di/9001' } })
    const done = await make().send({ id: 'p1', text: 'hello', link: 'https://diiii.xyz', media: [{ kind: 'image', url: `${base}/img.png`, alt: 'x' }] }, { loadMedia })
    expect(done).toEqual({ id: '9001', url: 'https://m.example/@di/9001' })
    expect(hit('/api/v2/media')[0].headers.authorization).toBe('Bearer masto-tok-1234')
    const status = hit('/api/v1/statuses')[0]
    expect(JSON.parse(status.body.toString())).toMatchObject({ status: 'hello\nhttps://diiii.xyz', media_ids: ['555'], visibility: 'public' })
    expect(status.headers['idempotency-key']).toBe('p1')
  })

  it('FAIL missing token', async () => {
    const channel = make({ token: '' })
    expect(channel.status().state).toBe('missing')
    await expect(channel.send({ text: 'x', media: [] }, { loadMedia })).rejects.toMatchObject({ code: 'missing-token' })
  })

  it('FAIL API 4xx', async () => {
    handlers['/api/v1/statuses'] = () => ({ status: 422, body: { error: 'Validation failed: Text character limit of 500 exceeded' } })
    const error = await make().send({ text: 'x', media: [] }, { loadMedia }).catch((e) => e)
    expect(error).toMatchObject({ code: 'api-error', status: 422 })
    expect(error.message).toContain('character limit')
  })

  it('FAIL media too big: video over 99 MB', async () => {
    handlers['/v.mp4'] = () => ({ type: 'video/mp4', body: Buffer.alloc(99 * 1024 * 1024 + 1) })
    await expect(make().send({ text: 'x', media: [{ kind: 'video', url: `${base}/v.mp4` }] }, { loadMedia })).rejects.toMatchObject({ code: 'media-too-big' })
    expect(hit('/api/')).toHaveLength(0)
  })
})

describe('instagram', () => {
  const make = (over = {}) => createInstagramChannel({ config: { token: 'EAA-secret-9999', accountId: '1784', apiBase: base, ...over }, wait: async () => {} })
  const IMG = 'https://cdn.example/pic.jpg'

  it('creates a container then publishes it and returns the permalink', async () => {
    handlers['/1784/media_publish'] = () => ({ body: { id: 'M1' } })
    handlers['/1784/media'] = () => ({ body: { id: 'C1' } })
    handlers['/M1'] = () => ({ body: { permalink: 'https://www.instagram.com/p/abc/' } })
    const done = await make().send({ text: 'hello', link: 'https://diiii.xyz', media: [{ kind: 'image', url: IMG, alt: 'x' }] }, { loadMedia })
    expect(done).toEqual({ id: 'M1', url: 'https://www.instagram.com/p/abc/' })
    const container = hit('/1784/media')[0]
    expect(container.headers.authorization).toBe('Bearer EAA-secret-9999')
    expect(JSON.parse(container.body.toString())).toMatchObject({ image_url: IMG, caption: 'hello\nhttps://diiii.xyz', alt_text: 'x' })
    expect(JSON.parse(hit('/1784/media_publish')[0].body.toString())).toEqual({ creation_id: 'C1' })
  })

  it('waits for a reel to finish processing before publishing', async () => {
    let polls = 0
    handlers['/1784/media_publish'] = () => ({ body: { id: 'M2' } })
    handlers['/1784/media'] = () => ({ body: { id: 'C2' } })
    handlers['/C2'] = () => { polls += 1; return { body: { status_code: polls < 3 ? 'IN_PROGRESS' : 'FINISHED' } } }
    handlers['/M2'] = () => ({ body: { permalink: 'https://www.instagram.com/reel/r/' } })
    const done = await make().send({ text: 'reel', media: [{ kind: 'video', url: 'https://cdn.example/v.mp4' }] }, { loadMedia })
    expect(done.id).toBe('M2')
    expect(polls).toBe(3)
    expect(JSON.parse(hit('/1784/media')[0].body.toString())).toMatchObject({ media_type: 'REELS', video_url: 'https://cdn.example/v.mp4' })
  })

  it('FAIL missing token or account', async () => {
    const channel = make({ token: '', accountId: '' })
    expect(channel.status()).toMatchObject({ state: 'missing', detail: 'set SHARE_INSTAGRAM_TOKEN and SHARE_INSTAGRAM_ACCOUNT' })
    await expect(channel.send({ text: 'x', media: [] }, { loadMedia })).rejects.toMatchObject({ code: 'missing-token' })
  })

  it('FAIL text-only post and a non-public media URL', async () => {
    await expect(make().send({ text: 'x', media: [] }, { loadMedia })).rejects.toMatchObject({ code: 'needs-media' })
    await expect(make().send({ text: 'x', media: [{ kind: 'image', ref: 'space/asset' }] }, { loadMedia })).rejects.toMatchObject({ code: 'bad-media' })
    expect(hit('/1784/media')).toHaveLength(0)
  })

  it('FAIL caption over 2200 characters', async () => {
    await expect(make().send({ text: 'a'.repeat(2201), media: [{ kind: 'image', url: IMG }] }, { loadMedia })).rejects.toMatchObject({ code: 'text-too-long' })
  })

  it('FAIL API 4xx says Meta\'s words and never the token', async () => {
    handlers['/1784/media'] = () => ({ status: 400, body: { error: { message: 'Invalid token EAA-secret-9999' } } })
    const error = await make().send({ text: 'x', media: [{ kind: 'image', url: IMG }] }, { loadMedia }).catch((e) => e)
    expect(error).toMatchObject({ code: 'api-error', status: 400 })
    expect(error.message).not.toContain('EAA-secret-9999')
    expect(error.message).toContain('Invalid token')
    expect(error.message).not.toContain('[object Object]')
  })

  it('FAIL two media in one post is refused, nothing is sent', async () => {
    await expect(make().send({ text: 'x', media: [{ kind: 'video', url: IMG }, { kind: 'image', url: IMG }] }, { loadMedia })).rejects.toMatchObject({ code: 'too-many-media' })
    expect(hit('/1784/media')).toHaveLength(0)
  })

  it('FAIL publish with no id is not reported as sent; an http API base is refused', async () => {
    handlers['/1784/media_publish'] = () => ({ body: {} })
    handlers['/1784/media'] = () => ({ body: { id: 'C3' } })
    await expect(make().send({ text: 'x', media: [{ kind: 'image', url: IMG }] }, { loadMedia })).rejects.toMatchObject({ code: 'api-error' })
    expect(() => createInstagramChannel({ config: { token: 't', accountId: '1', apiBase: 'http://example.com/v1' }, fetchImpl: fetch })).toThrow(/https/)
  })
})

describe('postStore', () => {
  it('draft → approved → sent keeps one result per channel', () => {
    const post = store.createPost({ text: 't', channels: ['a', 'b'], createdBy: 'me' })
    expect(post.status).toBe('draft')
    expect(store.approve(post.id, 'me').status).toBe('approved')
    expect(store.recordResults(post.id, { a: { ok: true, url: 'u' } }).status).toBe('failed')
    const done = store.recordResults(post.id, { b: { ok: true } })
    expect(done.status).toBe('sent')
    expect(Object.keys(done.results)).toEqual(['a', 'b'])
    expect(done.sentAt).toBeGreaterThan(0)
  })

  it('only a draft can be edited; the list is newest first', () => {
    const a = store.createPost({ text: 'a', channels: ['x'] })
    const b = store.createPost({ text: 'b', channels: ['x'] })
    expect(store.listPosts().map((p) => p.id)).toEqual([b.id, a.id])
    expect(store.updateDraft(a.id, { text: 'a2' }).post.text).toBe('a2')
    store.approve(a.id, 'me')
    expect(store.updateDraft(a.id, { text: 'a3' }).error).toBe('not-draft')
    expect(store.getPost('nope')).toBeNull()
  })
})

describe('shareService', () => {
  const fake = (name, impl) => ({ name, capabilities: { text: true, image: true, video: true, link: true, maxText: 100 }, status: () => ({ name, state: 'connected', detail: '' }), send: impl })
  const cfg = { telegram: { botToken: SECRET }, bluesky: {}, mastodon: {} }

  it('retry sends only the channels that have not posted, and never twice', async () => {
    let bFails = true
    const calls = { a: 0, b: 0 }
    const service = createShareService({ config: cfg, channels: [fake('a', async () => { calls.a += 1; return { url: 'ua' } }), fake('b', async () => { calls.b += 1; if (bFails) throw Object.assign(new Error(`down ${SECRET}`), { code: 'api-error' }); return { url: 'ub' } })] })
    const post = store.createPost({ text: 't', channels: ['a', 'b'] })
    const first = await service.send(post.id, 'me')
    expect(first.status).toBe('failed')
    expect(first.results.b.error).not.toContain(SECRET)
    bFails = false
    const second = await service.send(post.id, 'me')
    expect(second.status).toBe('sent')
    expect(calls).toEqual({ a: 1, b: 2 })
    expect((await service.send(post.id, 'me')).status).toBe('sent')
    expect(calls).toEqual({ a: 1, b: 2 })
  })

  it('validates drafts: channel, link, media', () => {
    const service = createShareService({ config: cfg, channels: [fake('a', async () => ({}))] })
    expect(() => service.validateDraft({ text: 'x', channels: [] })).toThrow(/at least one channel/)
    expect(() => service.validateDraft({ text: 'x', channels: ['zz'] })).toThrow(/Unknown channel/)
    expect(() => service.validateDraft({ text: 'x', link: 'javascript:1', channels: ['a'] })).toThrow(/absolute http/)
    expect(() => service.validateDraft({ text: 'x', media: ['file:///etc/passwd'], channels: ['a'] })).toThrow(/not an absolute/)
    expect(() => service.validateDraft({ channels: ['a'] })).toThrow(/no words/)
    expect(service.validateDraft({ text: ' x ', media: ['space_1/abc.png', { url: 'https://h/v.mp4' }], channels: ['a', 'a'] })).toMatchObject({ text: 'x', channels: ['a'], media: [{ ref: 'space_1/abc.png', kind: 'image' }, { url: 'https://h/v.mp4', kind: 'video' }] })
  })

  it('normalizeMedia rejects a path that climbs out of an asset reference', () => {
    expect(() => normalizeMedia('../etc/passwd')).toThrow()
    expect(() => normalizeMedia('a/../b')).toThrow()
  })

  it('a space asset reference loads through readAsset', async () => {
    const service = createShareService({ config: cfg, channels: [], readAsset: async (s, a) => (a === 'ok.png' ? { buffer: PNG, mime: 'image/png' } : null) })
    expect((await service.loadMedia({ ref: 's1/ok.png' })).buffer.length).toBe(8)
    await expect(service.loadMedia({ ref: 's1/none.png' })).rejects.toMatchObject({ code: 'bad-media' })
  })
})
