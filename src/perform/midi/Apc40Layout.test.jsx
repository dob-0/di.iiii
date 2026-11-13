import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import K2LayoutPanel from './K2LayoutPanel.jsx'
import { apc40Job } from './Apc40Layout.jsx'
import { createK2Monitor } from './k2Monitor.js'
import { effectiveMap } from './deckBinding.js'
import { consoleOf, defaultMap } from './xoneK2.js'
import { APC40_CONSOLE_ID } from './apc40.js'

// The APC40 layout inside the deck's controller panel: every control with its job, effect knobs named after the
// deck's own effects, and a touch lights only the control on ITS channel (five faders share CC 7).
const deck = {
    effects: [{ type: 'top.freeze' }, { type: 'top.glow', on: false }],
    layers: [
        { name: '1 BACK', clips: [{ label: 'HEAT' }, { label: 'ICE' }], effects: [{ type: 'top.glow' }, { type: 'top.feedback' }] },
        { name: '2 BODY', clips: [], effects: [] },
        { name: '3 CAM', clips: [], effects: [{ type: 'top.pixelate' }] }
    ]
}
const overrides = [
    { match: { kind: 'cc', number: 20, channel: 1 }, action: 'fx', args: { layer: 2, effect: 0, param: 'mix' } },
    { match: { kind: 'cc', number: 21, channel: 1 }, action: 'fx', args: { layer: -1, effect: 1, param: 2 } },
    { match: { kind: 'cc', number: 22, channel: 1 }, action: 'fx', args: { layer: -1, effect: 4, param: 0 } },
    { match: { kind: 'note', number: 0, channel: 1 }, action: 'fxPress', args: { type: 'top.cuts', param: 'hit' } },
    { match: { kind: 'note', number: 1, channel: 1 }, action: 'fxPress', args: { type: 'top.cuts', param: 'multi' } }
]
const map = effectiveMap(defaultMap(APC40_CONSOLE_ID), overrides)
const mount = (monitor = createK2Monitor()) => ({ monitor, ...render(<K2LayoutPanel map={map} monitor={monitor} deck={deck} console={consoleOf(APC40_CONSOLE_ID)} onClose={() => {}} />) })
const cell = (id) => document.querySelector(`[data-apc="${id}"]`)

afterEach(cleanup)

describe('APC40 layout panel', () => {
    it('labels the effect knob with the layer and effect name, and the default controls with their jobs', () => {
        mount()
        expect(screen.getByRole('region', { name: 'APC40 mkII layout' })).toBeTruthy()
        expect(cell('cc:20@1').textContent).toContain('CAM · Pixelate · amount')
        expect(cell('note:32@1').textContent).toContain('HEAT')   // top pad row = scenes, named by layer 1's clips
        expect(cell('cc:7@3').textContent).toContain('Layer 3 level')
        expect(cell('note:48@2').textContent).toContain('Bypass L2')
        expect(cell('cc:55@1').textContent).toContain('free')
        expect(document.querySelector('.k2-body')).toBeNull()                // no K2 rows for the APC
    })

    it('says in plain words what scene pads, master knobs and hold pads do', () => {
        mount()
        expect(cell('note:33@1').textContent).toContain('ICE')
        expect(cell('note:34@1').textContent).toContain('Scene 3')                      // no label: Scene N
        expect(cell('cc:21@1').textContent).toContain('Glow · Amount (off)')      // master effect off
        expect(cell('cc:22@1').textContent).toContain('nothing here')                   // no such master effect
        expect(cell('note:0@1').textContent).toContain('HOLD burst')
        expect(cell('note:1@1').textContent).toContain('HOLD screens')
        expect(cell('note:96@1').textContent).toContain('Next scene')
        expect(cell('note:94@1').textContent).toContain('Previous 8 scenes')
    })

    it('a fader move lights only that fader (same CC, other channels stay dark)', () => {
        const { monitor } = mount()
        act(() => monitor.push({ kind: 'cc', channel: 3, cc: 7, value: 64 }))
        expect(cell('cc:7@3').className).toContain('is-lit')
        expect(cell('cc:7@1').className).not.toContain('is-lit')
        expect(cell('cc:7@3').getAttribute('style')).toContain('50%')
    })
})

describe('apc40Job fxSet', () => {
    it('names the key by its label, else by effect, param and value', () => {
        const args = { type: 'top.angles', param: 'screens', value: 3 }
        expect(apc40Job({ action: 'fxSet', args: { ...args, label: 'Screens 3' } }, deck)).toBe('Screens 3')
        expect(apc40Job({ action: 'fxSet', args }, deck)).toBe('Angles · screens 3')
    })
})
