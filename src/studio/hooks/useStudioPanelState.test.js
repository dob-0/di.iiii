import { describe, it, expect } from 'vitest'
import { panelFromAddress } from './useStudioPanelState.js'

describe('panelFromAddress', () => {
    it('reads the two panels the plain project view links to', () => {
        expect(panelFromAddress('?open=files')).toBe('files')
        expect(panelFromAddress('?open=create')).toBe('create')
    })
    it('ignores anything else', () => {
        expect(panelFromAddress('?open=publish')).toBeNull()
        expect(panelFromAddress('')).toBeNull()
        expect(panelFromAddress(undefined)).toBeNull()
    })
})
