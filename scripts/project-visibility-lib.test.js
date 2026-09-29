import { describe, expect, it } from 'vitest'
import { ensureDestinationVisibility, visibilityCreateFields } from './project-visibility-lib.mjs'

// A fake destination: answers the GET / PATCH the helper makes, and records them.
const destination = ({ meta = null, patchOk = true, keepsField = true } = {}) => {
    const calls = []
    const request = async (method, pathname, body) => {
        calls.push({ method, pathname, body })
        if (method === 'GET') return { ok: Boolean(meta), status: meta ? 200 : 404, body: meta ? { project: meta } : null }
        if (!patchOk) return { ok: false, status: 403, body: { error: 'Only the space owner or an admin can change who sees a project.' } }
        const next = keepsField ? { ...meta, visibility: body.visibility } : { id: meta?.id }
        return { ok: true, status: 200, body: { project: next } }
    }
    return { calls, request }
}

describe('carrying visibility between tiers', () => {
    it('asks for a private create only when the source is private', () => {
        expect(visibilityCreateFields({ visibility: 'private' })).toEqual({ visibility: 'private' })
        expect(visibilityCreateFields({ visibility: 'public' })).toEqual({})
        expect(visibilityCreateFields(null)).toEqual({})
    })

    it('a public source writes nothing extra, and never widens a private destination', async () => {
        const dest = destination({ meta: { id: 'p', visibility: 'private' } })
        const out = await ensureDestinationVisibility({ request: dest.request, projectId: 'p', sourceMeta: { visibility: 'public' }, destMeta: { id: 'p', visibility: 'private' } })
        expect(out.ok).toBe(true)
        expect(out.note).toContain('never widened')
        expect(dest.calls).toEqual([])
    })

    it('a create the destination answered private needs nothing more', async () => {
        const dest = destination()
        const out = await ensureDestinationVisibility({ request: dest.request, projectId: 'p', sourceMeta: { visibility: 'private' }, destMeta: { id: 'p', visibility: 'private' } })
        expect(out).toEqual({ ok: true, note: 'private' })
        expect(dest.calls).toEqual([])
    })

    it('an existing public copy is made private before anything is written', async () => {
        const dest = destination({ meta: { id: 'p', visibility: 'public' } })
        const out = await ensureDestinationVisibility({ request: dest.request, projectId: 'p', sourceMeta: { visibility: 'private' } })
        expect(out).toEqual({ ok: true, note: 'made private' })
        expect(dest.calls.map((c) => c.method)).toEqual(['GET', 'PATCH'])
    })

    it('refuses when the destination is older than the field — it would answer public', async () => {
        const dest = destination()
        const out = await ensureDestinationVisibility({ request: dest.request, projectId: 'p', sourceMeta: { visibility: 'private' }, destMeta: { id: 'p', title: 'x' } })
        expect(out.ok).toBe(false)
        expect(out.error).toContain('older')
    })

    it('refuses when the destination will not make it private', async () => {
        const dest = destination({ meta: { id: 'p', visibility: 'public' }, patchOk: false })
        const out = await ensureDestinationVisibility({ request: dest.request, projectId: 'p', sourceMeta: { visibility: 'private' } })
        expect(out.ok).toBe(false)
        expect(out.error).toContain('HTTP 403')
        expect(out.error).toContain('Nothing was written')
    })
})
