import { describe, expect, it } from 'vitest'
import { applyMidi, ledsFor } from './deckBinding.js'
import { createDeck, setClip } from '../../project/tops/vjDeck.js'
import { XONE_K2_LEDS, XONE_K2_CONTROLS, consoleOf, defaultMap } from './xoneK2.js'
import { jobsFor } from './k2Jobs.js'

const LETTERS = 'ABCDEFGHIJKLMNOP'.split('')
const noteOf = (letter) => XONE_K2_CONTROLS.find((item) => item.control === `matrix ${letter}`).number
const press = (letter) => ({ kind: 'noteOn', channel: 15, note: noteOf(letter), velocity: 127 })
const fourByFour = () => {
    let deck = createDeck({ layers: 4, columns: 4 })
    for (let l = 0; l < 4; l += 1) for (let c = 0; c < 4; c += 1) deck = setClip(deck, l, c, { kind: 'asset', asset: `a${l}${c}` })
    return deck
}
// the row of four buttons -> the 1-based layer it plays, read from the map
const rowLayers = (id) => [0, 1, 2, 3].map((row) => {
    const entry = consoleOf(id).map.find((item) => item.control === `matrix ${LETTERS[row * 4]}`)
    return entry.args.layer + 1
})

describe('the button rows of the two K2 consoles', () => {
    it('prints the row to layer table', () => {
        for (const id of ['k2', 'k2-1.9']) console.log(`${id}: top row to bottom row plays layers ${rowLayers(id).join(', ')}`)
    })

    it('K2 (older console) keeps its order: top row = layer 1, going up', () => {
        expect(rowLayers('k2')).toEqual([1, 2, 3, 4])
        const map = defaultMap('k2')
        const deck = fourByFour()
        expect(applyMidi(deck, press('A'), map).layers[0].active).toBe(0)
        expect(applyMidi(deck, press('H'), map).layers[1].active).toBe(3)
        expect(applyMidi(deck, press('M'), map).layers[3].active).toBe(0)
        expect(jobsFor(consoleOf('k2').map, consoleOf('k2'))['matrix A']).toBe('L1 clip 1')
    })

    it('K2 (1.9): top row = layer 4, then 3, 2, 1 (presses)', () => {
        expect(rowLayers('k2-1.9')).toEqual([4, 3, 2, 1])
        const map = defaultMap('k2-1.9')
        const deck = fourByFour()
        expect(applyMidi(deck, press('A'), map).layers[3].active).toBe(0)
        expect(applyMidi(deck, press('D'), map).layers[3].active).toBe(3)
        expect(applyMidi(deck, press('F'), map).layers[2].active).toBe(1)
        expect(applyMidi(deck, press('K'), map).layers[1].active).toBe(2)
        expect(applyMidi(deck, press('P'), map).layers[0].active).toBe(3)
        expect(applyMidi(deck, press('A'), map).layers[0].active).toBe(-1)
        const k2 = consoleOf('k2-1.9')
        const jobs = jobsFor(k2.map, k2)
        expect([jobs['matrix A'], jobs['matrix H'], jobs['matrix I'], jobs['matrix P']]).toEqual(['L4 clip 1', 'L3 clip 4', 'L2 clip 1', 'L1 clip 4'])
    })

    it('K2 (1.9): the lights follow the same rows', () => {
        const map = defaultMap('k2-1.9')
        const base = fourByFour()
        const playing = { ...base, layers: base.layers.map((layer, i) => (i === 3 ? { ...layer, active: 0 } : layer)) }
        const lit = (letter) => ledsFor(playing, map, XONE_K2_LEDS).filter((led) => led.velocity > 0 && Object.values(XONE_K2_LEDS[noteOf(letter)]).includes(led.note)).length
        expect(lit('A')).toBe(1) // layer 4 clip 1 plays: top-left button lit
        expect(lit('M')).toBe(1) // layer 1 clips are loaded: bottom-left lit (amber)
        const colour = (letter) => ledsFor(playing, map, XONE_K2_LEDS).find((led) => led.velocity > 0 && led.note === XONE_K2_LEDS[noteOf(letter)].green)
        expect(colour('A')).toBeTruthy()
        expect(colour('M')).toBeUndefined()
    })
})
