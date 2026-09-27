// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PIECES_GLB_DIR, pieceGlb, pieceMesh } from '../../scripts/rigbuild/pieces-glb.mjs'
import { PIECES } from './pieces.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('the pieces\' bodies', () => {
    it('are what the generator makes from pieces.js (never edited by hand)', async () => {
        for (const piece of Object.values(PIECES)) {
            const committed = fs.readFileSync(path.join(ROOT, PIECES_GLB_DIR, `${piece.kind}.glb`))
            expect((await pieceGlb(piece)).equals(committed), piece.kind).toBe(true)
        }
    })

    // Within 1 cm: the square ends of the diagonal lacing stand a few mm proud.
    it('fit their catalogue size', () => {
        for (const piece of Object.values(PIECES)) {
            const p = pieceMesh(piece).positions
            const span = [0, 1, 2].map((k) => {
                const axis = p.filter((_, i) => i % 3 === k)
                return Math.max(...axis) - Math.min(...axis)
            })
            const want = piece.category === 'tower' ? [piece.plate[0], piece.height, piece.plate[2]] : piece.size
            span.forEach((v, k) => expect(Math.abs(v - want[k]), `${piece.kind} axis ${k}`).toBeLessThan(0.01))
        }
    })
})
