import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const uploadProjectAsset = vi.fn()
vi.mock('../project/services/projectsApi.js', () => ({
    uploadProjectAsset: (...args) => uploadProjectAsset(...args)
}))

import { usePieceAssets } from './usePieceAssets.js'

afterEach(() => { vi.restoreAllMocks(); uploadProjectAsset.mockReset() })

describe('usePieceAssets.ensureAsset', () => {
    it('uploads once when two calls for the same kind run concurrently', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['glb']) })))
        let release
        uploadProjectAsset.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ id: 'asset-1' }) }))
        const applyOps = vi.fn()
        const { result } = renderHook(() => usePieceAssets({ projectId: 'p', document: { assets: [] }, applyOps }))

        const a = result.current.ensureAsset('truss-1m')
        const b = result.current.ensureAsset('truss-1m')
        await vi.waitFor(() => expect(uploadProjectAsset).toHaveBeenCalled())
        release()
        expect(await a).toBe('asset-1')
        expect(await b).toBe('asset-1')
        expect(uploadProjectAsset).toHaveBeenCalledTimes(1)
        expect(applyOps).toHaveBeenCalledTimes(1)
        vi.unstubAllGlobals()
    })

    it('does not upload a failed fetch (404 page) as a model, and allows a retry', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob(['<html>']) })))
        const { result } = renderHook(() => usePieceAssets({ projectId: 'p', document: { assets: [] }, applyOps: vi.fn() }))
        await expect(result.current.ensureAsset('tower')).rejects.toThrow()
        expect(uploadProjectAsset).not.toHaveBeenCalled()
        vi.unstubAllGlobals()
    })
})
