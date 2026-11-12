import { describe, it, expect } from 'vitest'
import { hazeFor } from './hazePolicy.js'
import { encodeDmx } from './dmxDecode.js'

const chart = ['fog', 'volume', 'fan', 'duration', 'interval'].map((role) => ({ role }))

describe('haze policy (Magma Prime 5ch)', () => {
    it('is out in the house looks and the stress looks, low and steady in a show look, stronger on the drop', () => {
        for (const id of ['rig-black', 'rig-work-light', 'rig-doors', 'rig-wait', 'rig-entry', 'rig-stress-all-white']) expect(hazeFor(id), id).toEqual({ fog: 0, volume: 0, fan: 0, duration: 0, interval: 0 })
        expect(hazeFor('rig-magenta-room')).toEqual({ fog: 255, volume: 51, fan: 0, duration: 0, interval: 0 })
        expect(hazeFor('rig-drop-hit').volume).toBe(128)
    })
    it('fog is on (>= 6) exactly when volume is above 0', () => {
        for (const id of ['black', 'magenta-room', 'drop-hit']) { const h = hazeFor(id); expect(h.fog >= 6).toBe(h.volume > 0) }
    })
    it('the encoder writes raw roles the chart has and ignores the rest', () => {
        expect(encodeDmx(chart, { raw: hazeFor('magenta-room') })).toEqual({ fog: 255, volume: 51, fan: 0, duration: 0, interval: 0 })
        expect(encodeDmx([{ role: 'dimmer' }], { raw: { fog: 255 } })).toEqual({})
        expect(encodeDmx(chart, { raw: { volume: 999 } }).volume).toBe(255)
    })
})
