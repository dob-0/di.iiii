// @vitest-environment node
// rehang reused a project's truss model BY NAME, so a regenerated model (the matte steel of 2026-09-30) never
// reached a project that already held one. A body is reused only when its content hash is the current file's.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { pieceAssetOf } from './rehang.mjs'

const shaOfFile = (kind) => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, 'scripts/rigbuild/pieces', `${kind}.glb`))).digest('hex')

describe('pieceAssetOf: the project\'s own body for a piece kind, only when it is the current file', () => {
    const sha = 'a'.repeat(64)
    const other = 'b'.repeat(64)

    it('reuses an asset with the same name AND the same content hash', () => {
        const assets = [{ id: sha, name: 'rigbuild-truss-3m.glb' }]
        expect(pieceAssetOf(assets, 'truss-3m', sha)).toEqual(assets[0])
    })

    it('does NOT reuse a same-named asset whose content is stale', () => {
        expect(pieceAssetOf([{ id: other, name: 'rigbuild-truss-3m.glb' }], 'truss-3m', sha)).toBeNull()
    })

    it('finds the current body among stale ones of the same name', () => {
        const assets = [{ id: other, name: 'rigbuild-truss-3m.glb' }, { id: sha, name: 'rigbuild-truss-3m.glb' }]
        expect(pieceAssetOf(assets, 'truss-3m', sha).id).toBe(sha)
    })

    it('does not mix kinds, and an empty or missing list is null', () => {
        expect(pieceAssetOf([{ id: sha, name: 'rigbuild-deck-2x1.glb' }], 'truss-3m', sha)).toBeNull()
        expect(pieceAssetOf([], 'truss-3m', sha)).toBeNull()
        expect(pieceAssetOf(undefined, 'truss-3m', sha)).toBeNull()
    })

    // the owner's install held this body (hash 8e7bc660…) from before the matte steel; the file now is different
    it('the regenerated truss body is not the stale one the owner\'s projects hold', () => {
        expect(shaOfFile('truss-3m')).not.toBe('8e7bc6605635895ee808369a42b44ee0f33c82bf1d66812d55712ed3f9ff40e7')
        expect(pieceAssetOf([{ id: '8e7bc6605635895ee808369a42b44ee0f33c82bf1d66812d55712ed3f9ff40e7', name: 'rigbuild-truss-3m.glb' }], 'truss-3m', shaOfFile('truss-3m'))).toBeNull()
    })
})
