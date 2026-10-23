// The Lamp's DMX: its type and mode from the fixture library (lampType.js), its universe and address, and what
// its ports are told, through shared/lampDmx.cjs's browser twin — the same bytes the lighting desk renders for
// the same lamp (src/shared/lampDmx.test.js). `dmx` carries { universe, address, values }, or null when the lamp
// has no type or cannot be sent; `patch` says which, in words.
import { lampFrame } from '../../../shared/lampDmx.js'
import { lampModeOf, lampTypeOf } from './lampType.js'

export const lampOf = (input) => {
    const typeId = String(input('type') ?? '').trim()
    const type = lampTypeOf(typeId)
    const mode = lampModeOf(type, input('mode'))
    const told = {
        dimmer: input('dimmer'),
        colour: input('color'),
        pan: input('pan'),
        tilt: input('tilt'),
        strobe: input('strobe'),
        zoom: input('zoom'),
    }
    if (!typeId) return { type: null, mode: null, frame: null, patch: 'no type: drawn only, sends nothing' }
    if (!type) return { type: null, mode: null, frame: null, patch: `no type "${typeId}" in the fixture library` }
    if (!mode) return { type, mode: null, frame: null, patch: `${type.code} has no mode` }
    const frame = lampFrame({ mode, universe: input('universe') ?? 1, address: input('address') ?? 1, inputs: told })
    if (frame.error) return { type, mode, frame: null, patch: `${type.code} ${mode.name}: ${frame.error}` }
    const last = frame.address + frame.values.length - 1
    const owed = Array.isArray(mode.channels) && mode.channels.length === mode.footprint ? '' : ' (channel list owed)'
    return {
        type,
        mode,
        frame,
        patch: `${type.code} ${mode.name} · U${frame.universe}.${String(frame.address).padStart(3, '0')}-${String(last).padStart(3, '0')}${owed}`,
    }
}

export const computeOutput = (node, portId, { input }) => {
    if (portId !== 'dmx' && portId !== 'patch') return undefined
    const lamp = lampOf(input)
    if (portId === 'patch') return lamp.patch
    return lamp.frame ? { universe: lamp.frame.universe, address: lamp.frame.address, values: lamp.frame.values } : null
}
