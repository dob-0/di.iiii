import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLocalFileUrl } from './useLocalFileUrl.js'

afterEach(() => { vi.restoreAllMocks() })

describe('useLocalFileUrl', () => {
    it('revokes the previous blob URL on replace and the last one on unmount', () => {
        let n = 0
        URL.createObjectURL = vi.fn(() => `blob:fake-${++n}`)
        URL.revokeObjectURL = vi.fn()
        const { result, unmount } = renderHook(() => useLocalFileUrl())

        act(() => result.current[1](new Blob(['a'])))
        expect(result.current[0]).toBe('blob:fake-1')
        expect(URL.revokeObjectURL).not.toHaveBeenCalled()

        act(() => result.current[1](new Blob(['b'])))
        expect(result.current[0]).toBe('blob:fake-2')
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-1')

        unmount()
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-2')
    })
})
