// @vitest-environment node

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const { createPrList, shape, CACHE_MS, FAIL_CACHE_MS } = createRequire(import.meta.url)('./monitorPrs')

const pr = { number: 7, title: 'x', head: { ref: 'feat/a' }, base: { ref: 'dev' }, user: { login: 'dob-0' }, draft: false, updated_at: '2026-11-17T10:00:00Z', html_url: 'https://github.com/dob-0/di.iiii/pull/7' }

describe('monitorPrs', () => {
  it('shapes a pull request to the fields the page shows', () => {
    expect(shape(pr)).toEqual({ number: 7, title: 'x', branch: 'feat/a', base: 'dev', author: 'dob-0', draft: false, updatedAt: '2026-11-17T10:00:00Z', url: pr.html_url })
  })
  it('lists open PRs and caches the answer for a minute', async () => {
    let calls = 0
    let t = 1000
    const list = createPrList({ getInstallation: async () => ({ token: 't' }), fetchPrs: async () => { calls += 1; return [shape(pr)] }, now: () => t })
    const a = await list.list()
    expect(a.ok).toBe(true)
    expect(a.prs.length).toBe(1)
    await list.list()
    expect(calls).toBe(1)
    t += CACHE_MS + 1
    await list.list()
    expect(calls).toBe(2)
  })
  it('says so when the App is not installed', async () => {
    const out = await createPrList({ getInstallation: async () => null }).list()
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('no-app')
  })
  it('says so when the App lacks the permission', async () => {
    const e = Object.assign(new Error('Resource not accessible'), { status: 403 })
    const out = await createPrList({ getInstallation: async () => ({ token: 't' }), fetchPrs: async () => { throw e } }).list()
    expect(out.reason).toBe('no-permission')
    expect(out.message).toMatch(/Pull requests: read/)
  })
  it('keeps a failure only briefly and asks GitHub once for concurrent callers', async () => {
    let calls = 0
    let t = 0
    const list = createPrList({ getInstallation: async () => ({ token: 't' }), fetchPrs: async () => { calls += 1; throw new Error('5xx') }, now: () => t })
    await Promise.all([list.list(), list.list(), list.list()])
    expect(calls).toBe(1)
    t += FAIL_CACHE_MS + 1
    await list.list()
    expect(calls).toBe(2)
  })
  it('does not link anything but a github.com page', () => {
    expect(shape({ ...pr, html_url: 'javascript:alert(1)' }).url).toBe('')
  })
  it('flags a list cut at the limit', async () => {
    const many = Array.from({ length: 51 }, (_, i) => shape({ ...pr, number: i }))
    const out = await createPrList({ getInstallation: async () => ({ token: 't' }), fetchPrs: async () => many }).list()
    expect(out.truncated).toBe(true)
    expect(out.prs.length).toBe(50)
    const exact = await createPrList({ getInstallation: async () => ({ token: 't' }), fetchPrs: async () => many.slice(0, 50) }).list()
    expect(exact.truncated).toBe(false)
  })
  it('never throws on a GitHub outage', async () => {
    const out = await createPrList({ getInstallation: async () => { throw new Error('boom') } }).list()
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('github-error')
  })
})
