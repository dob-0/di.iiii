import { describe, it, expect } from 'vitest'
import { SCENES, sceneView } from './showState.mjs'
import { dmxChannels, toBytes } from './mapping.mjs'

describe('red scene (owner 2026-11-07)', () => {
    it('is a known scene', () => { expect(SCENES.red).toBeTruthy() })
    it('drives all 4 fixtures steady full red at any time', () => {
        for (const t of [0, 0.7, 3.3, 61]) {
            expect(Array.from(toBytes(dmxChannels(sceneView('red', t), t)))).toEqual([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0])
        }
    })
})
