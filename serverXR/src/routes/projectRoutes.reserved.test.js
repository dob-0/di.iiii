// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerProjectRoutes } = require('./projectRoutes.js')
const { normalizeProjectId, normalizeProjectSlug } = require('../projectStore.js')
const { RESERVED_PROJECT_SLUGS } = require('../../../shared/reservedSegments.cjs')

// A router built WITHOUT the reserved-word check, the way a builder that forgot
// to pass `isReservedProjectSlug` would mount it. Until 2026-10-26 the factory
// defaulted that argument to `() => false`, so a missing line in index.js turned
// the PATCH guard off with no error anywhere, and the create route had no guard
// to turn on. The default is now the shared list itself (shared/reservedSegments.cjs),
// so the words stay reserved however the router is built.
//
// No server process and no database: the routes are mounted over express with
// fakes for the store, which is all the guard needs. The end-to-end proof, with
// the real wiring, is projectContracts.test.js.
describe('a router mounted with no reserved-word wiring still refuses the shared list', () => {
  const ID_SHAPE = /^[a-z0-9-]{3,64}$/
  // `p` (under three letters) and `open_jam` (an underscore) can never be a project
  // id, so there is nothing for the guard to stop; every other word is checked.
  const idShaped = [...RESERVED_PROJECT_SLUGS].filter((word) => ID_SHAPE.test(word))

  let server
  let base
  let made
  let taken

  beforeEach(async () => {
    made = []
    taken = new Set()
    const router = express.Router()
    router.use(express.json())
    registerProjectRoutes(router, {
      normalizeSpaceId: (value) => String(value || '').toLowerCase() || null,
      normalizeProjectId,
      normalizeProjectSlug,
      spaceExists: async () => true,
      ensureSpaceWritable: async () => {},
      resolveProjectContext: async (id) => (taken.has(id) ? { spaceId: 'main', projectId: id, meta: {} } : null),
      findProjectBySlug: async () => null,
      ensureProject: async (_dir, spaceId, id, overrides) => {
        made.push(id)
        return { id, spaceId, ...overrides }
      },
      readProjectDocument: async () => ({}),
      spacesDir: '/nowhere',
      upload: { single: () => (req, res, next) => next() }
      // isReservedProjectSlug: not passed, on purpose.
    })
    const app = express()
    app.use(router)
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
    base = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  const send = (method, path, body) => fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  it('has words to check (a loop over nothing proves nothing)', () => {
    expect(idShaped.length).toBeGreaterThan(25)
    expect(idShaped).toContain('privacy')
  })

  it('refuses to create a project under any of them, and never reaches the store', async () => {
    for (const word of idShaped) {
      const answer = await send('POST', '/api/spaces/main/projects', { title: word, slug: word })
      expect(answer.status, word).toBe(400)
      expect((await answer.json()).error, word).toBe(`"${word}" is a reserved address and can't be a project name — try another.`)
    }
    expect(made).toEqual([])
  })

  it('refuses them as a short name on PATCH too, the guard that used to fail open', async () => {
    taken.add('my-project')
    for (const word of idShaped) {
      const answer = await send('PATCH', '/api/projects/my-project', { slug: word })
      expect(answer.status, word).toBe(400)
      expect((await answer.json()).error, word).toBe(`"${word}" is a reserved word and can't be used as a slug.`)
    }
  })

  it('still makes a project whose name is not reserved', async () => {
    const answer = await send('POST', '/api/spaces/main/projects', { title: 'Privacy Policy' })
    expect(answer.status).toBe(201)
    expect(made).toEqual(['privacy-policy'])
  })

  it('keeps a reserved id when the body says `carried: true`, on the caller\'s word', async () => {
    const answer = await send('POST', '/api/spaces/main/projects', { slug: 'privacy', title: 'Privacy Policy', carried: true })
    expect(answer.status).toBe(201)
    expect(made).toEqual(['privacy'])
  })
})
