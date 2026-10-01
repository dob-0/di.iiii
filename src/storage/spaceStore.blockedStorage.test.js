import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpace, deleteSpace } from './spaceStore.js'

describe('spaceStore with a store that refuses writes', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('createSpace returns the record instead of throwing when setItem throws', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('full', 'QuotaExceededError')
        })
        let record
        expect(() => { record = createSpace({ label: 'Quota Room' }) }).not.toThrow()
        expect(record.label).toBe('Quota Room')
    })

    it('deleteSpace does not throw when setItem throws', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('blocked', 'SecurityError')
        })
        expect(() => deleteSpace('anything')).not.toThrow()
    })
})
