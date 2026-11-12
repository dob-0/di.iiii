import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import K2LayoutPanel from './K2LayoutPanel.jsx'
import { createK2Monitor } from './k2Monitor.js'
import { effectiveMap } from './deckBinding.js'
import { consoleOf, defaultMap } from './xoneK2.js'
import { APC40_CONSOLE_ID } from './apc40.js'

// The APC40 layout inside the deck's controller panel: every control with its job, effect knobs named after the
// deck's own effects, and a touch lights only the control on ITS channel (five faders share CC 7).
const deck = {
    effects: [{ type: 'top.freeze' }],
    layers: [
        { name: '1 BACK', effects: [{ type: 'top.glow' }, { type: 'top.feedback' }] },
        { name: '2 BODY', effects: [] },
        { name: '3 CAM', effects: [{ type: 'top.pixelate' }] }
    ]
}
const overrides = [{ match: { kind: 'cc', number: 20, channel: 1 }, action: 'fx', args: { layer: 2, effect: 0, param: 'mix' } }]
const map = effectiveMap(defaultMap(APC40_CONSOLE_ID), overrides)
const mount = (monitor = createK2Monitor()) => ({ monitor, ...render(<K2LayoutPanel map={map} monitor={monitor} deck={deck} console={consoleOf(APC40_CONSOLE_ID)} onClose={() => {}} />) })
const cell = (id) => document.querySelector(`[data-apc="${id}"]`)

afterEach(cleanup)

describe('APC40 layout panel', () => {
    it('labels the effect knob with the layer and effect name, and the default controls with their jobs', () => {
        mount()
        expect(screen.getByRole('region', { name: 'APC40 mkII layout' })).toBeTruthy()
        expect(cell('cc:20@1').textContent).toContain('CAM pixelate mix')
        expect(cell('note:32@1').textContent).toContain('Play column 1')   // top pad row = columns
        expect(cell('cc:7@3').textContent).toContain('Layer 3 level')
        expect(cell('note:48@2').textContent).toContain('Bypass L2')
        expect(cell('cc:55@1').textContent).toContain('not used')
        expect(document.querySelector('.k2-body')).toBeNull()                // no K2 rows for the APC
    })

    it('a fader move lights only that fader (same CC, other channels stay dark)', () => {
        const { monitor } = mount()
        act(() => monitor.push({ kind: 'cc', channel: 3, cc: 7, value: 64 }))
        expect(cell('cc:7@3').className).toContain('is-lit')
        expect(cell('cc:7@1').className).not.toContain('is-lit')
        expect(cell('cc:7@3').getAttribute('style')).toContain('50%')
    })
})
