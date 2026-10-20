import { describe, expect, it, vi } from 'vitest'
import { instancePick } from './FixtureBodies.jsx'
import { pickLampBody } from '../studio/utils/selectionTools.js'

describe('lamp bodies are clickable', () => {
    const poses = [{ id: 'l0' }, { id: 'l1' }, { id: 'l2' }]
    it('instance k reports lamps[k].id and stops the click', () => {
        const onPick = vi.fn()
        const e = { instanceId: 1, stopPropagation: vi.fn() }
        instancePick(poses, onPick)(e)
        expect(onPick).toHaveBeenCalledWith('l1', e)
        expect(e.stopPropagation).toHaveBeenCalled()
    })
    it('no handler, no behaviour change; unknown instance does nothing', () => {
        expect(instancePick(poses, undefined)).toBeUndefined()
        const onPick = vi.fn()
        instancePick(poses, onPick)({ instanceId: 9, stopPropagation: vi.fn() })
        expect(onPick).not.toHaveBeenCalled()
    })
    it('Studio layer: select, Shift toggles, locked is ignored', () => {
        const ents = [{ id: 'a', components: {} }, { id: 'b', components: { runtime: { locked: true } } }]
        const h = { onSelect: vi.fn(), onToggle: vi.fn() }
        expect(pickLampBody(ents, 'a', { nativeEvent: {} }, h)).toBe(true)
        expect(h.onSelect).toHaveBeenCalledWith('a')
        pickLampBody(ents, 'a', { nativeEvent: { shiftKey: true } }, h)
        expect(h.onToggle).toHaveBeenCalledWith('a')
        expect(pickLampBody(ents, 'b', { nativeEvent: {} }, h)).toBe(false)
        expect(h.onSelect).toHaveBeenCalledTimes(1)
    })
})
