// @vitest-environment node
//
// GET /ai/context (aiContext.js): the caller's level from their auth state,
// and a 403 — never a quieter lower level — for a level above it. The level
// table is pure; the route runs on a real express app over a real port, with
// the auth state set by a stand-in for index.js's middleware.

import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { LEVELS, levelForAuthState, registerAiContextRoutes, DEFAULT_PUBLIC_FILE } = require('./aiContext')

const signedIn = (extra) => ({ authenticated: true, type: 'session', role: 'editor', subject: 'u-1', isUnrestricted: false, ...extra })
const actToken = (actTier, extra = {}) => signedIn({ actor: 'di.bo', actTier, ...extra })

describe('the caller\'s level', () => {
  it('orders the levels low to high, owner on top', () => {
    expect(LEVELS).toEqual(['public', 'registered', 'partner', 'crew', 'core', 'owner'])
  })

  it.each([
    ['no auth state at all', undefined, 'public'],
    ['not signed in', { authenticated: false, type: 'session' }, 'public'],
    ['a dead act token', { authenticated: false, type: 'act-token' }, 'public'],
    ['auth switched off (every request is "admin")', { authenticated: true, type: 'disabled', role: 'admin', subject: 'auth-disabled' }, 'public'],
    ['a guest', { authenticated: true, type: 'guest', role: 'editor', subject: 'guest-abc' }, 'public'],
    ['the person at this machine', { authenticated: true, type: 'session', role: 'admin', subject: 'local-owner', isUnrestricted: true }, 'owner'],
    ['act token, tier root', actToken('root', { role: 'admin', isUnrestricted: true }), 'owner'],
    ['act token, tier admin', actToken('admin', { role: 'admin', isUnrestricted: true }), 'core'],
    ['act token, tier member, no group', actToken('member'), 'registered'],
    ['an API key, unrestricted admin', { authenticated: true, type: 'token', role: 'admin', subject: 'ops', isUnrestricted: true }, 'core'],
    ['an API key scoped to some spaces', { authenticated: true, type: 'token', role: 'editor', subject: 'ci', isUnrestricted: false }, 'registered'],
    ['an admin key that is not unrestricted', { authenticated: true, type: 'token', role: 'admin', subject: 'x', isUnrestricted: false }, 'registered'],
    ['a terminal login (capped like a member)', signedIn({ actor: 'di.cli' }), 'registered'],
    ['a per-space sync key', { authenticated: true, type: 'sync-key', role: 'editor', subject: 'sync:abc' }, 'registered'],
    ['a browser session, admin', signedIn({ role: 'admin', isUnrestricted: true }), 'core']
  ])('%s → %s', (_label, state, level) => {
    expect(levelForAuthState(state, { isGuestSubject: (s) => String(s).startsWith('guest-') })).toBe(level)
  })

  it.each([
    ['team', 'crew'], ['crew', 'crew'], ['partner', 'partner'], ['registered', 'registered'], [null, 'registered'],
    // Two keys: a group of core or owner in the database does not lift a
    // member-tier token; the env list has to agree (actTokenTier.js).
    ['core', 'registered'], ['owner', 'registered']
  ])('a member-tier act token with group %s → %s', (group, level) => {
    expect(levelForAuthState(actToken('member'), { groupOf: () => group })).toBe(level)
  })

  it('the group never lifts a root or admin tier, nor lowers it', () => {
    expect(levelForAuthState(actToken('admin'), { groupOf: () => 'partner' })).toBe('core')
    expect(levelForAuthState(actToken('root'), { groupOf: () => 'registered' })).toBe('owner')
  })

  it('a group lookup that throws is no group, not a crash', () => {
    expect(levelForAuthState(actToken('member'), { groupOf: () => { throw new Error('no such column') } })).toBe('registered')
  })
})

const servers = []
const tmpDirs = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))))
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

// One bundle per non-public level, each naming its own level, so a test can
// tell exactly which one came back.
const contextDirWith = async (levels) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-ai-context-'))
  tmpDirs.push(dir)
  for (const level of levels) {
    await mkdir(path.join(dir, level), { recursive: true })
    await writeFile(path.join(dir, level, 'CONTEXT.md'), `# context — ${level}\n`)
  }
  await writeFile(path.join(dir, 'core', 'STAMP.json'), JSON.stringify({ time: '2026-10-27T22:00:00Z' })).catch(() => {})
  return dir
}

// The caller is named by a test header; the stand-in turns it into the state
// index.js's middleware would have set.
const STATES = {
  owner: actToken('root', { role: 'admin', isUnrestricted: true }),
  core: actToken('admin', { role: 'admin', isUnrestricted: true }),
  crew: actToken('member', { subject: 'u-team' }),
  partner: actToken('member', { subject: 'u-partner' }),
  registered: actToken('member', { subject: 'u-plain' }),
  apikey: { authenticated: true, type: 'token', role: 'admin', subject: 'ops', isUnrestricted: true }
}
const GROUPS = { 'u-team': 'team', 'u-partner': 'partner' }

const start = async (options = {}) => {
  const app = express()
  app.use((req, _res, next) => { req.authState = STATES[req.get('x-test-caller')]; next() })
  registerAiContextRoutes(app, { groupOf: (id) => GROUPS[id] || null, ...options })
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  servers.push(server)
  const base = `http://127.0.0.1:${server.address().port}`
  return (query = '', caller) => fetch(`${base}/ai/context${query}`, { headers: caller ? { 'x-test-caller': caller } : {} })
}

describe('GET /ai/context', () => {
  it('no key: the public bundle, from the repo, as markdown and never cached', async () => {
    const get = await start({ contextDir: await contextDirWith(['core']) })
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('vary')).toMatch(/Authorization/)
    expect(res.headers.get('x-di-context-level')).toBe('public')
    expect(await res.text()).toBe(await readFile(DEFAULT_PUBLIC_FILE, 'utf8'))
  })

  it('no key asking for any higher level: 403, and nothing of the bundle', async () => {
    const get = await start({ contextDir: await contextDirWith(['registered', 'partner', 'crew', 'core', 'owner']) })
    for (const level of LEVELS.slice(1)) {
      const res = await get(`?level=${level}`)
      expect(res.status, level).toBe(403)
      const body = await res.json()
      expect(body).toMatchObject({ error: 'level_refused', level, yours: 'public' })
      expect(JSON.stringify(body)).not.toContain('# context')
    }
  })

  it.each([
    ['owner', 'owner'], ['core', 'core'], ['crew', 'crew'], ['partner', 'partner'], ['registered', 'registered'], ['apikey', 'core']
  ])('a %s key gets its own level by default (%s)', async (caller, level) => {
    const get = await start({ contextDir: await contextDirWith(['registered', 'partner', 'crew', 'core', 'owner']) })
    const res = await get('', caller)
    expect(res.status).toBe(200)
    expect(res.headers.get('x-di-context-level')).toBe(level)
    expect(await res.text()).toBe(`# context — ${level}\n`)
  })

  it('every level above the caller\'s is a 403; every level at or below is served', async () => {
    const get = await start({ contextDir: await contextDirWith(['registered', 'partner', 'crew', 'core', 'owner']) })
    for (const caller of ['registered', 'partner', 'crew', 'core', 'owner']) {
      for (const level of LEVELS) {
        const res = await get(`?level=${level}`, caller)
        const expected = LEVELS.indexOf(level) <= LEVELS.indexOf(caller) ? 200 : 403
        expect(res.status, `${caller} asking ${level}`).toBe(expected)
        if (expected === 403) expect(await res.json()).toMatchObject({ error: 'level_refused', level, yours: caller })
        else expect(res.headers.get('x-di-context-level')).toBe(level)
      }
    }
  })

  it('names when the bundle was built, from its STAMP', async () => {
    const get = await start({ contextDir: await contextDirWith(['core']) })
    const res = await get('', 'core')
    expect(res.headers.get('x-di-context-built')).toBe('2026-10-27T22:00:00Z')
  })

  it('a level with no bundle on this server is a 404, not another level', async () => {
    const get = await start({ contextDir: await contextDirWith(['core']) })
    const res = await get('?level=crew', 'owner')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'no_bundle', level: 'crew' })
  })

  it('an unknown level is a 400 that lists the real ones', async () => {
    const get = await start()
    for (const level of ['admin', 'root', '../core', '']) {
      const res = await get(`?level=${encodeURIComponent(level)}`, 'owner')
      expect(res.status, level).toBe(400)
      expect((await res.json()).levels).toEqual(LEVELS)
    }
  })

  it('with no data folder configured, only public answers', async () => {
    const get = await start({ contextDir: null })
    expect((await get()).status).toBe(200)
    expect((await get('', 'core')).status).toBe(404)
  })
})
