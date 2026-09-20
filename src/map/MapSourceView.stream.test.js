import { describe, expect, it } from 'vitest'
import { matchStreamDevice } from './MapSourceView.jsx'
import { normalizeMappingSurface } from '../shared/projectSchema.js'

// A stream surface names its input; each machine resolves the name to its OWN
// device. These are the rules that resolution has to keep.
const devices = [
    { kind: 'audioinput', label: 'OBS Virtual Camera audio', deviceId: 'a1' },
    { kind: 'videoinput', label: 'Integrated Camera (13d3:56b2)', deviceId: 'v1' },
    { kind: 'videoinput', label: 'OBS Virtual Camera', deviceId: 'v2' },
    { kind: 'videoinput', label: 'OBS Virtual Camera 2', deviceId: 'v3' }
]

describe('matchStreamDevice', () => {
    it('finds an input by its exact name before a longer one that contains it', () => {
        expect(matchStreamDevice(devices, 'OBS Virtual Camera')?.deviceId).toBe('v2')
    })
    it('accepts part of the name, in any case', () => {
        expect(matchStreamDevice(devices, 'integrated')?.deviceId).toBe('v1')
        expect(matchStreamDevice(devices, 'obs')?.deviceId).toBe('v2')
    })
    it('never answers with a microphone that happens to share the name', () => {
        expect(matchStreamDevice(devices, 'audio')).toBeNull()
    })
    it('answers nothing for an empty name or a name no machine has', () => {
        expect(matchStreamDevice(devices, '')).toBeNull()
        expect(matchStreamDevice(devices, 'Cam Link')).toBeNull()
    })
    it('cannot match before permission, when every label is blank', () => {
        expect(matchStreamDevice([{ kind: 'videoinput', label: '', deviceId: 'x' }], 'obs')).toBeNull()
    })
})

describe('a stream surface in the document', () => {
    it('keeps its kind and the input name through normalization', () => {
        const surface = normalizeMappingSurface({ id: 's1', source: { kind: 'stream', ref: 'OBS Virtual Camera' } })
        expect(surface.source).toEqual({ kind: 'stream', ref: 'OBS Virtual Camera' })
    })
})
