// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createGithubSync } = require('./githubSync.js')
const spaceSyncPlan = require('./spaceSyncPlan.js')

const INTERNAL_TOKEN = 'internal-token-under-test'

const fakeGithubApp = () => ({
  installationToken: async () => 'gh-install-token',
  getInstallationForRepo: async () => ({ installationId: 1, token: 'gh-install-token' }),
  repoDefaultBranch: async () => 'main',
  fetchRepoFile: async (_t, _o, _r, _ref, file) => {
    if (file === 'di-space.json') throw new Error('404')
    return '<!doctype html><title>synced</title>'
  },
  fetchRepoFileBuffer: async () => Buffer.from(''),
  repoTree: async () => []
})

const recordingHttp = () => {
  const calls = []
  const httpRequest = async (url, options = {}) => {
    calls.push({ url, authorization: options.headers?.Authorization || null })
    return { ok: true, status: 200, json: () => ({ document: {}, asset: { url: '/x' } }) }
  }
  return { calls, httpRequest }
}

const makeSync = (env) => {
  const http = recordingHttp()
  const sync = createGithubSync({
    githubApp: fakeGithubApp(),
    httpRequest: http.httpRequest,
    spaceSyncPlan,
    config: { port: 4777, basePath: '/serverXR', internalApiToken: INTERNAL_TOKEN },
    env,
    logger: { warn: () => {} }
  })
  return { ...sync, calls: http.calls }
}

const link = { spaceId: 'linked', owner: 'o', repo: 'r', projectId: 'p1', entry: 'index.html', installationId: 1 }

describe('github sync — where the internal token goes', () => {
  it('writes through this machine by default', async () => {
    const sync = makeSync({})
    await sync.syncLinkedSpace(link)
    const tokenCalls = sync.calls.filter(c => c.authorization === `Bearer ${INTERNAL_TOKEN}`)
    expect(tokenCalls.length).toBeGreaterThan(0)
    for (const call of tokenCalls) expect(new URL(call.url).origin).toBe('http://127.0.0.1:4777')
    expect(tokenCalls[0].url.startsWith('http://127.0.0.1:4777/serverXR/')).toBe(true)
  })

  it.each([
    ['http://127.0.0.1:5000/serverXR', 'http://127.0.0.1:5000'],
    ['http://127.8.9.10:5000', 'http://127.8.9.10:5000'],
    ['http://[::1]:5000/serverXR/', 'http://[::1]:5000'],
    ['http://localhost:5000/serverXR', 'http://localhost:5000']
  ])('accepts SELF_API_URL=%s (this machine)', async (selfApiUrl, origin) => {
    const sync = makeSync({ SELF_API_URL: selfApiUrl })
    await sync.syncLinkedSpace(link)
    const tokenCalls = sync.calls.filter(c => c.authorization)
    expect(tokenCalls.length).toBeGreaterThan(0)
    for (const call of tokenCalls) expect(new URL(call.url).origin).toBe(origin)
  })

  it.each([
    ['https://elsewhere.example/serverXR'],
    ['https://di-studio.xyz/serverXR'],
    ['http://10.0.0.5:4000'],
    ['http://127.0.0.1.elsewhere.example/serverXR'],
    ['http://user@elsewhere.example'],
    ['file:///etc/passwd'],
    ['not a url']
  ])('refuses SELF_API_URL=%s and sends the token nowhere', async (selfApiUrl) => {
    const sync = makeSync({ SELF_API_URL: selfApiUrl })
    await expect(sync.syncLinkedSpace(link)).rejects.toThrow(/SELF_API_URL/)
    expect(sync.calls.filter(c => c.authorization)).toEqual([])
  })
})
