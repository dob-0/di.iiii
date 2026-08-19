import { describe, expect, it, vi } from 'vitest'
import { createDiskWriteGuard } from './diskGuard.js'

const GiB = 1024 * 1024 * 1024
const MiB = 1024 * 1024

const makeRes = () => {
  const res = { statusCode: null, body: null }
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  res.json = vi.fn((body) => { res.body = body; return res })
  return res
}

const run = async (guard, { method = 'POST', headers = {}, path = '/api/spaces/x/assets' } = {}) => {
  const res = makeRes()
  const next = vi.fn()
  await guard({ method, headers, path }, res, next)
  return { res, next }
}

const statfsFree = (bytes, bsize = 4096) =>
  vi.fn(async () => ({ bavail: Math.floor(bytes / bsize), bsize }))

describe('createDiskWriteGuard', () => {
  it('lets writes through while free disk is above the floor', async () => {
    const guard = createDiskWriteGuard({ dir: '/data', minFreeBytes: 512 * MiB, statfs: statfsFree(2 * GiB) })
    const { res, next } = await run(guard)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('refuses POST/PUT/PATCH with 507 below the floor', async () => {
    const guard = createDiskWriteGuard({ dir: '/data', minFreeBytes: 512 * MiB, statfs: statfsFree(100 * MiB) })
    for (const method of ['POST', 'PUT', 'PATCH']) {
      const { res, next } = await run(guard, { method })
      expect(next).not.toHaveBeenCalled()
      expect(res.statusCode).toBe(507)
      expect(res.body.code).toBe('insufficient_storage')
    }
  })

  it('never touches reads or deletes — DELETE is how a full disk empties', async () => {
    const statfs = statfsFree(0)
    const guard = createDiskWriteGuard({ dir: '/data', minFreeBytes: 512 * MiB, statfs })
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'DELETE']) {
      const { next } = await run(guard, { method })
      expect(next).toHaveBeenCalled()
    }
    expect(statfs).not.toHaveBeenCalled()
  })

  it('counts the announced body against the headroom', async () => {
    // 700 MiB free clears a bare 512 MiB floor, but not floor + a 300 MiB upload.
    const guard = createDiskWriteGuard({ dir: '/data', minFreeBytes: 512 * MiB, statfs: statfsFree(700 * MiB) })
    const ok = await run(guard, { headers: { 'content-length': String(10 * MiB) } })
    expect(ok.next).toHaveBeenCalled()
    const refused = await run(guard, { headers: { 'content-length': String(300 * MiB) } })
    expect(refused.res.statusCode).toBe(507)
  })

  it('caches statfs inside the TTL and re-checks after it', async () => {
    let at = 0
    const statfs = statfsFree(2 * GiB)
    const guard = createDiskWriteGuard({ dir: '/data', minFreeBytes: 512 * MiB, statfs, cacheTtlMs: 5000, now: () => at })
    await run(guard)
    await run(guard)
    expect(statfs).toHaveBeenCalledTimes(1)
    at = 6000
    await run(guard)
    expect(statfs).toHaveBeenCalledTimes(2)
  })

  it('drops the cache on refusal so a freed disk recovers immediately', async () => {
    let free = 100 * MiB
    const statfs = vi.fn(async () => ({ bavail: free / 4096, bsize: 4096 }))
    let at = 0
    const guard = createDiskWriteGuard({ dir: '/data', minFreeBytes: 512 * MiB, statfs, cacheTtlMs: 5000, now: () => at })
    const refused = await run(guard)
    expect(refused.res.statusCode).toBe(507)
    free = 2 * GiB
    const recovered = await run(guard)
    expect(recovered.next).toHaveBeenCalled()
  })

  it('fails open when statfs itself fails', async () => {
    const statfs = vi.fn(async () => { throw Object.assign(new Error('nope'), { code: 'ENOSYS' }) })
    const guard = createDiskWriteGuard({ dir: '/data', minFreeBytes: 512 * MiB, statfs })
    const { next, res } = await run(guard)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })
})
