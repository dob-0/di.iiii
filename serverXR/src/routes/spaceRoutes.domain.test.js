import { describe, expect, it, vi } from 'vitest'
import { registerSpaceRoutes } from './spaceRoutes.js'

// A space's metadata carries `domain`: its live own domain, so share links can
// be built on it (docs/architecture/SPEC_space_own_domain.md). Public spaces only.
const makeRouter = () => {
  const routes = {}
  const record = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers }
  return { routes, get: record('get'), post: record('post'), put: record('put'), patch: record('patch'), delete: record('delete'), use: () => {} }
}

const setup = ({ spaces, withHosts = true }) => {
  const router = makeRouter()
  registerSpaceRoutes(router, {
    appendOpsHistory: vi.fn(), applySceneOps: vi.fn(), blankScene: {}, broadcastLiveEvent: vi.fn(),
    deleteSpace: vi.fn(), ensureSpaceScene: vi.fn(), ensureSpaceWritable: vi.fn(), findProjectById: vi.fn(),
    getLiveBucket: vi.fn(), getSpacePaths: vi.fn(), hydrateSceneAssetManifest: (s) => s,
    isValidAssetId: () => true, maxOpHistory: 500, normalizeIncomingOps: vi.fn(), normalizeProjectId: (id) => id,
    normalizeSpaceId: (v) => String(v || '').toLowerCase() || null,
    loadSpaceMeta: vi.fn(async (id) => spaces.find((s) => s.id === id) || null),
    listSpaces: vi.fn(async () => spaces),
    readJson: vi.fn(), readOpsHistory: vi.fn(), removeAssetThumbnails: vi.fn(), saveSpaceMeta: vi.fn(),
    serveAsset: vi.fn(), spacesDir: '/nonexistent', spaceExists: vi.fn().mockResolvedValue(true),
    upsertSpaceMeta: vi.fn(), upload: { single: () => (req, res, next) => next() }, writeJson: vi.fn(), writeOpsHistory: vi.fn(),
    ...(withHosts
      ? {
          findPrimaryHostForSpace: (id) => (id === 'taronx' || id === 'secret' ? 'yokozo.xyz' : null),
          mapPrimaryHosts: () => new Map([['taronx', 'yokozo.xyz'], ['secret', 'secret.example.com']])
        }
      : {})
  })
  const run = async (key, req) => {
    const [handler] = router.routes[key].slice(-1)
    const json = vi.fn()
    await handler({ authState: { type: 'guest' }, query: {}, ...req }, { json, status: vi.fn(() => ({ json })) }, vi.fn())
    return json.mock.calls.at(-1)[0]
  }
  return run
}

const spaces = [
  { id: 'taronx', label: 'Taron', isPublic: true, kind: 'normal' },
  { id: 'secret', label: 'Secret', isPublic: false, kind: 'normal' },
  { id: 'plain', label: 'Plain', isPublic: true, kind: 'normal' }
]

describe('space metadata carries its own domain', () => {
  it('GET one: the live domain for a public space', async () => {
    const run = setup({ spaces })
    expect((await run('get /api/spaces/:spaceId', { params: { spaceId: 'taronx' } })).space.domain).toBe('yokozo.xyz')
  })

  it('GET one: null with no domain, and null for a private space even when it has one', async () => {
    const run = setup({ spaces })
    expect((await run('get /api/spaces/:spaceId', { params: { spaceId: 'plain' } })).space.domain).toBe(null)
    expect((await run('get /api/spaces/:spaceId', { params: { spaceId: 'secret' } })).space.domain).toBe(null)
  })

  it('GET one: null when no domain store is wired', async () => {
    const run = setup({ spaces, withHosts: false })
    expect((await run('get /api/spaces/:spaceId', { params: { spaceId: 'taronx' } })).space.domain).toBe(null)
  })

  it('GET list: each item carries it, private ones do not', async () => {
    const run = setup({ spaces })
    const { spaces: out } = await run('get /api/spaces', {})
    const byId = Object.fromEntries(out.map((s) => [s.id, s.domain]))
    expect(byId).toEqual({ taronx: 'yokozo.xyz', secret: null, plain: null })
  })
})
