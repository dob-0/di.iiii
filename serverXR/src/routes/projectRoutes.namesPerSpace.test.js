// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerProjectRoutes } = require('./projectRoutes.js')
const { normalizeProjectId, normalizeProjectSlug } = require('../projectStore.js')

// The create route over fakes for the store (the same harness as
// projectRoutes.reserved.test.js), so the rule is checked with no server process.
// The end-to-end proof is projectContracts.test.js, "names per space".
// Decision: docs/ai/decisions/2026-10-29-project-names-per-space.md.
describe('a project name is unique only inside its own space', () => {
  let server
  let base
  let rows

  beforeEach(async () => {
    rows = []
    const router = express.Router()
    router.use(express.json())
    registerProjectRoutes(router, {
      normalizeSpaceId: (value) => String(value || '').toLowerCase() || null,
      normalizeProjectId,
      normalizeProjectSlug,
      spaceExists: async () => true,
      ensureSpaceWritable: async () => {},
      resolveProjectContext: async (id) => {
        const row = rows.find((r) => r.id === id && !r.deletedAt)
        return row ? { spaceId: row.spaceId, projectId: id, meta: row } : null
      },
      findAnyProjectById: async (id) => {
        const row = rows.find((r) => r.id === id)
        return row ? { spaceId: row.spaceId, trashed: Boolean(row.deletedAt) } : null
      },
      findProjectBySlug: async (spaceId, slug) => rows.find((r) => r.spaceId === spaceId && r.slug === slug) || null,
      listProjectsInSpace: async (_dir, spaceId) => rows.filter((r) => r.spaceId === spaceId && !r.deletedAt),
      ensureProject: async (_dir, spaceId, id, overrides) => {
        const row = { id, spaceId, slug: overrides.slug || null, title: overrides.title }
        rows.push(row)
        return row
      },
      readProjectDocument: async () => ({}),
      spacesDir: '/nowhere',
      upload: { single: () => (req, res, next) => next() }
    })
    const app = express()
    app.use(router)
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
    base = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  const make = (spaceId, body) => fetch(`${base}/api/spaces/${spaceId}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  it('twenty spaces can each have "my scene": each gets its own id and keeps the name as its address', async () => {
    const ids = []
    for (let n = 1; n <= 20; n += 1) {
      const answer = await make(`kid-${n}`, { title: 'my scene' })
      expect(answer.status, `kid-${n}`).toBe(201)
      const { project } = await answer.json()
      expect(project.title).toBe('my scene')
      ids.push(project.id)
      if (n > 1) expect(project.slug).toBe('my-scene')
    }
    expect(ids[0]).toBe('my-scene')
    expect(new Set(ids).size).toBe(20)
  })

  it('the same name twice in one space is a plain 409 that names it', async () => {
    expect((await make('kid-1', { title: 'My Room' })).status).toBe(201)
    const twice = await make('kid-1', { title: 'my room' })
    expect(twice.status).toBe(409)
    expect(await twice.json()).toEqual({
      error: 'This space already has a project called "My Room". Pick another name.',
      code: 'name-taken-in-space'
    })
  })

  it('an empty name gets a real one, "Untitled" then "Untitled 2", in every space', async () => {
    const titles = []
    for (const spaceId of ['kid-1', 'kid-1', 'kid-2']) {
      const answer = await make(spaceId, { title: '' })
      expect(answer.status).toBe(201)
      titles.push((await answer.json()).project.title)
    }
    expect(titles).toEqual(['Untitled', 'Untitled 2', 'Untitled'])
  })

  it('a name with no latin letters still makes a project', async () => {
    const answer = await make('kid-1', { title: 'Իմ տեսարան' })
    expect(answer.status).toBe(201)
    const { project } = await answer.json()
    expect(project.title).toBe('Իմ տեսարան')
    expect(project.id).toMatch(/^project-\d+$/)
  })

  it('never takes the id of a trashed project of another space', async () => {
    rows.push({ id: 'my-scene', spaceId: 'kid-1', title: 'my scene', deletedAt: 1 })
    const answer = await make('kid-2', { title: 'my scene' })
    expect(answer.status).toBe(201)
    expect((await answer.json()).project.id).toBe('my-scene-2')
  })

  it('a caller that names the id keeps the old answer: that id, or a 409', async () => {
    expect((await make('kid-1', { title: 'Copy', slug: 'copy-of-it' })).status).toBe(201)
    const elsewhere = await make('kid-2', { title: 'Copy', slug: 'copy-of-it' })
    expect(elsewhere.status).toBe(409)
    expect((await elsewhere.json()).error).toBe('that name is taken on this di.iiii — try another')
    const carried = await make('kid-2', { title: 'Copy', slug: 'copy-of-it', carried: true })
    expect(carried.status).toBe(409)
  })
})
