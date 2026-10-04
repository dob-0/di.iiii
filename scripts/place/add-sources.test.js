import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sourceWall } from './import.mjs'
import { runAddSources, planFiles, addOps, exitCodeFor, bareName } from './add-sources.mjs'

// A wall as import.mjs built it: 37 pictures, the total known, so row 0 is the TOP row.
const hungAssets = Array.from({ length: 37 }, (_, i) => ({ id: `h${i}`, name: `${String(i + 1).padStart(3, '0')}-shot_${i}.jpg`, mimeType: 'image/jpeg' }))
const wall = sourceWall(hungAssets)
const documentOf = () => ({ assets: structuredClone(hungAssets), entities: structuredClone(wall) })

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'add-sources-'))
const file = (name, bytes = 8) => {
    const full = path.join(tmp, name)
    fs.writeFileSync(full, Buffer.alloc(bytes, 1))
    return full
}

// A stand-in for the server: serves the document, takes uploads, can refuse by name.
const fakeClient = (document, { refuse = {} } = {}) => {
    const sent = { uploads: [], ops: [] }
    return {
        sent,
        get: async () => ({ ok: true, status: 200, body: { version: 5, document }, text: '' }),
        post: async (route, body) => {
            if (route.endsWith('/assets')) {
                const upload = body.get('asset')
                if (refuse[upload.name]) return { ok: false, status: refuse[upload.name], body: null, text: 'too big' }
                sent.uploads.push(upload.name)
                return { ok: true, status: 200, body: { asset: { id: `new-${upload.name}`, name: upload.name, mimeType: upload.type, size: upload.size, url: '/x' } }, text: '' }
            }
            sent.ops.push(...body.ops)
            return { ok: true, status: 200, body: { version: 6 }, text: '' }
        }
    }
}
const quiet = { say: () => {}, warn: () => {} }

describe('add-sources', () => {
    it('hangs new files in rows ABOVE the last row, same tile and distance', async () => {
        const client = fakeClient(documentOf())
        await runAddSources({ client, projectId: 'p', files: [file('DSCF0001.JPG'), file('DSCF0002.JPG')], ...quiet })
        const creates = client.sent.ops.filter((o) => o.type === 'createEntity').map((o) => o.payload.entity)
        expect(creates).toHaveLength(2)
        const top = Math.max(...wall.map((e) => e.components.transform.position[1]))
        for (const e of creates) {
            expect(e.components.transform.position[1]).toBeGreaterThan(top)
            expect(e.components.transform.position[2]).toBe(wall[0].components.transform.position[2])
            expect(e.components.transform.scale).toEqual(wall[0].components.transform.scale)
        }
        expect(creates[0].components.transform.position[1]).toBeCloseTo(top + 1.4, 6)
        expect(creates[0].id).toBe('source-38')
        expect(creates[0].name).toBe('DSCF0001.JPG')
    })

    it('moves NOTHING already hung: only createEntity ops, no id of the wall in them', async () => {
        const client = fakeClient(documentOf())
        await runAddSources({ client, projectId: 'p', files: [file('DSCF0003.JPG')], ...quiet })
        const ids = new Set(wall.map((e) => e.id))
        for (const op of client.sent.ops) {
            expect(['createEntity', 'upsertAsset']).toContain(op.type)
            if (op.type === 'createEntity') expect(ids.has(op.payload.entity.id)).toBe(false)
        }
        // and the layout the wall already has is exactly what it was, byte for byte
        expect(JSON.stringify(documentOf().entities)).toBe(JSON.stringify(wall))
    })

    it('wraps to a further row after a full row of eight', () => {
        const assets = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, name: `n${i}.jpg`, mimeType: 'image/jpeg' }))
        const ys = addOps(assets, documentOf()).map((o) => o.payload.entity.components.transform.position[1])
        expect(new Set(ys).size).toBe(2)
        expect(ys[8]).toBeCloseTo(ys[0] + 1.4, 6)
    })

    it('skips a name already hung, also with a numeric prefix off either side', () => {
        const { fresh, skipped } = planFiles(
            [file('001-shot_0.jpg'), file('shot_1.jpg'), file('999-shot_2.jpg'), file('new-one.jpg')],
            documentOf()
        )
        expect(skipped.map((s) => s.name)).toEqual(['001-shot_0.jpg', 'shot_1.jpg', '999-shot_2.jpg'])
        expect(fresh.map((f) => path.basename(f))).toEqual(['new-one.jpg'])
        expect(bareName('037-File_81.JPG')).toBe('file_81.jpg')
    })

    it('uploads only the new files', async () => {
        const client = fakeClient(documentOf())
        await runAddSources({ client, projectId: 'p', files: [file('001-shot_0.jpg'), file('fresh.jpg')], ...quiet })
        expect(client.sent.uploads).toEqual(['fresh.jpg'])
    })

    it('reports a refused upload by name, size and reason, hangs the rest, and exits non-zero', async () => {
        const client = fakeClient(documentOf(), { refuse: { 'big.mp4': 413 } })
        const result = await runAddSources({ client, projectId: 'p', files: [file('big.mp4', 2048), file('ok.jpg')], ...quiet })
        expect(result.refused).toEqual([expect.objectContaining({ name: 'big.mp4', size: 2048, status: 413 })])
        expect(result.hung.map((a) => a.name)).toEqual(['ok.jpg'])
        expect(exitCodeFor(result.refused, false)).toBe(2)
        expect(exitCodeFor(result.refused, true)).toBe(0)
        expect(exitCodeFor([], false)).toBe(0)
    })

    it('--dry-run uploads nothing and writes nothing', async () => {
        const client = fakeClient(documentOf())
        const lines = []
        const result = await runAddSources({ client, projectId: 'p', files: [file('d1.jpg'), file('001-shot_0.jpg')], dryRun: true, say: (l) => lines.push(l), warn: () => {} })
        expect(client.sent.uploads).toHaveLength(0)
        expect(client.sent.ops).toHaveLength(0)
        expect(result.planned).toBe(1)
        expect(lines.join('\n')).toMatch(/would upload\+hang\s+d1\.jpg/)
        expect(lines.join('\n')).toMatch(/skip\s+001-shot_0\.jpg/)
    })
})
