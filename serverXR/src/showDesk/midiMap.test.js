// @vitest-environment node
// The show desk's MIDI rules on their own (ui/midiMap.js): the K2 table against the maker's chart, today's assignments kept,
// the matcher on any channel or on one, the merge of a stored map, the words of the In line, and the docs table kept equal to
// the code. The page itself (the channel picker, the In line lit for 300 ms, the presses) is in showDesk.test.js.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const M = require('./ui/midiMap.js')
const chart = JSON.parse(fs.readFileSync(path.join(here, 'ui/midi/xone-k2.json'), 'utf8'))
const noteOn = (ch, num, val = 127) => ({ type: 'note-on', kind: 'note', ch, num, val })
const cc = (ch, num, val = 64) => ({ type: 'cc', kind: 'cc', ch, num, val })

// What the crew knew before 2026-11-01 (MIDI_DEFAULT of 63d9dc1dd): kept exactly. The three spare rows (CC 13, 14, 19) were
// "no action": CC 13 and 14 now have one; CC 19 (fader 4) stays spare, it is dead on the owner's K2 (ledger N1653).
const TODAY = [
    ['cc', 16, 'lamp:0'], ['cc', 17, 'lamp:1'], ['cc', 18, 'lamp:2'],
    ['cc', 4, 'live:level'], ['cc', 5, 'live:size'], ['cc', 6, 'live:height'], ['cc', 7, 'live:copies'],
    ['cc', 8, 'live:spin'], ['cc', 9, 'live:pulse'], ['cc', 10, 'live:sweep'], ['cc', 11, 'laser-master'],
    ['cc', 12, 'size:0'], ['cc', 15, 'light-master'],
    ['cc', 0, 'live:rotation', true], ['cc', 1, 'live:x', true], ['cc', 2, 'live:cycle', true], ['cc', 3, 'live:phase', true],
    ['note', 36, 'scene:0'], ['note', 37, 'scene:1'], ['note', 38, 'scene:2'], ['note', 39, 'scene:3'],
    ['note', 32, 'scene:4'], ['note', 33, 'scene:5'], ['note', 34, 'scene:6'], ['note', 35, 'scene:7'],
    ['note', 28, 'scene:8'], ['note', 29, 'scene:9'], ['note', 27, 'blackout']
]

describe('the K2 table against the maker\'s chart (Xone:K2 user guide AP8509)', () => {
    it('holds every control of the chart once, with its kind, number and relative turn', () => {
        expect(chart.length).toBe(58)
        expect(M.K2.length).toBe(58)
        expect(new Set(M.K2.map((c) => c.control)).size).toBe(58)
        expect(M.K2.map((c) => c.control).sort()).toEqual(chart.map((c) => c.control).sort())
        for (const c of chart) {
            expect(M.K2.find((r) => r.control === c.control), c.control).toMatchObject({ kind: c.kind, num: c.number, relative: c.mode === 'relative' })
        }
    })
    it('is on the maker\'s default channel, 15 as the K2 counts it, 14 on the wire', () => {
        expect(M.K2_CHANNEL).toBe(14)
        expect(chart.every((c) => c.channel === 15 && c.channel0 === 14)).toBe(true)
        expect(M.defaultMap().every((r) => r.ch === 14)).toBe(true)
    })
    it('gives every control an action but fader 4 (CC 19: dead on the owner\'s K2, never mapped, spare); none twice, every row one the page may take', () => {
        const rows = M.defaultMap()
        expect(rows.length).toBe(58)
        expect(rows.every(M.validRow)).toBe(true)
        expect(rows.filter((r) => r.target === 'spare')).toEqual([{ kind: 'cc', ch: 14, num: 19, target: 'spare' }])
        expect(new Set(rows.map((r) => `${r.kind}:${r.num}`)).size).toBe(58)
        const acting = rows.filter((r) => r.target !== 'spare')
        expect(acting.length).toBe(57)
        expect(new Set(acting.map((r) => r.target)).size).toBe(57) // no target twice
        expect(rows.some((r) => r.target === 'lamp:3')).toBe(false) // no lamp 4 on the dead fader (the first build of 2026-11-01 had one)
        expect(M.sheet().find((r) => r.control === 'fader 4')).toMatchObject({ midi: 'CC 19', target: 'spare', does: 'Spare, no action' }) // still listed
    })
    it('keeps every assignment the crew knew, exactly', () => {
        const rows = M.defaultMap()
        for (const [kind, num, target, relative] of TODAY) {
            expect(rows.find((r) => r.kind === kind && r.num === num), `${kind} ${num}`).toEqual({ kind, ch: 14, num, target, ...(relative ? { relative: true } : {}) })
        }
    })
    it('puts the new actions where the face of the unit suggests', () => {
        const at = (control) => M.K2.find((r) => r.control === control).target
        expect(at('fader 4')).toBe('spare') // dead on the owner's K2 (N1653): listed, never mapped
        expect(['pot 10', 'pot 11'].map(at)).toEqual(['size:1', 'size:2'])
        expect(['matrix K', 'matrix L', 'matrix M', 'matrix N', 'matrix O'].map(at)).toEqual(['scene:10', 'scene:11', 'scene:12', 'scene:13', 'scene:14'])
        expect(['encoder 5', 'encoder 6'].map(at)).toEqual(['live:pulseBeats', 'live:sweepBeats'])
        expect([at('layer button'), at('exit setup button')]).toEqual(['scene:prev', 'scene:next'])
        for (const n of [1, 2, 3, 4, 5, 6]) {
            const push = M.K2.find((r) => r.control === `encoder ${n} push`)
            const turn = M.K2.find((r) => r.control === `encoder ${n}`)
            expect(push.target).toBe(`reset:${turn.target.slice(5)}`) // a push resets what its own turn moves
        }
        for (let n = 1; n <= 12; n += 1) {
            const pot = M.K2.find((r) => r.control === `pot ${n}`)
            expect(M.K2.find((r) => r.control === `pot switch ${n}`).target).toBe(`park:${pot.target}`) // a switch parks the pot above it
        }
    })
})

describe('what MIDI may reach (unchanged since 2026-10-31)', () => {
    it('names no On, Off, lift, Undo, Save, Release or arm, and no brightness can be reset', () => {
        for (const t of ['on', 'off', 'lift', 'lift:lights', 'lift:laser', 'undo', 'save', 'release', 'arm', 'cube:0:on', 'reset:level', 'reset:size', 'reset:light-master', 'park:blackout', 'park:scene:0', 'scene:x', 'blackout:off', '']) {
            expect(M.isTarget(t), t).toBe(false)
        }
        for (const r of M.defaultMap()) expect(r.target).not.toMatch(/(^|:)(on|off|lift|undo|save|release|arm)/i)
    })
    it('takes a button for a press and a fader or knob for a continuous target, nothing else', () => {
        expect(M.validRow({ kind: 'note', ch: 0, num: 1, target: 'scene:next' })).toBe(true)
        expect(M.validRow({ kind: 'cc', ch: 0, num: 1, target: 'scene:next' })).toBe(false)
        expect(M.validRow({ kind: 'note', ch: 0, num: 1, target: 'lamp:0' })).toBe(false)
        expect(M.validRow({ kind: 'cc', ch: 16, num: 1, target: 'lamp:0' })).toBe(false)
        expect(M.validRow({ kind: 'cc', ch: 0, num: 128, target: 'lamp:0' })).toBe(false)
        expect(M.validRow({ kind: 'note', ch: 0, num: 1, target: 'spare' })).toBe(true)
    })
})

describe('which row a message takes', () => {
    const map = M.defaultMap()
    it('on its own channel it is the row itself', () => {
        expect(M.find(map, noteOn(14, 37), 'any')).toMatchObject({ why: 'exact', row: { target: 'scene:1' } })
    })
    it('on any other channel the same kind and number takes the row: any channel is the default', () => {
        for (let ch = 0; ch < 16; ch += 1) expect(M.find(map, noteOn(ch, 37), 'any').row.target, `ch ${ch + 1}`).toBe('scene:1')
        expect(M.find(map, noteOn(0, 37), 'any').why).toBe('other-channel')
    })
    it('a kind is not a number: CC 37 is not note 37, and a number the map lacks takes nothing', () => {
        expect(M.find(map, cc(14, 37), 'any')).toEqual({ row: null, why: 'unmapped' })
        expect(M.find(map, noteOn(14, 99), 'any')).toEqual({ row: null, why: 'unmapped' })
    })
    it('a picked channel hears that channel only; Channel 15 is the old way', () => {
        expect(M.find(map, noteOn(0, 37), 14)).toEqual({ row: null, why: 'channel' })
        expect(M.find(map, noteOn(14, 37), 14)).toMatchObject({ why: 'exact', row: { target: 'scene:1' } })
        for (const r of map) {
            const msg = r.kind === 'cc' ? cc(14, r.num) : noteOn(14, r.num)
            expect(M.find(map, msg, 14).row, `${r.kind} ${r.num}`).toBe(r) // as before: every control of the map answers on 15
            expect(M.find(map, { ...msg, ch: 3 }, 14).why).toBe('channel')
        }
    })
    it('a K2 set to channel 3 works when channel 3 is picked, whatever channel the rows say', () => {
        expect(M.find(map, noteOn(2, 37), 2)).toMatchObject({ why: 'other-channel', row: { target: 'scene:1' } })
    })
    it('a learned row on its own channel wins over the default row of the same number', () => {
        const learned = [{ kind: 'note', ch: 2, num: 37, target: 'scene:5' }, ...map]
        expect(M.find(learned, noteOn(2, 37), 'any').row.target).toBe('scene:5')
        expect(M.find(learned, noteOn(14, 37), 'any').row.target).toBe('scene:1')
        expect(M.find(learned, noteOn(9, 37), 'any').row.target).toBe('scene:5') // another channel: the first row of that number, the stored one
    })
    it('what is not channel input is not input: clock, active sensing, sysex, a data byte, nothing', () => {
        for (const bytes of [[0xf8], [0xfe], [0xf0, 1, 2, 0xf7], [0x40, 1, 2], []]) expect(M.parse(Uint8Array.from(bytes)), bytes.join(',')).toBeNull()
        expect(M.parse(null)).toBeNull()
    })
    it('reads the kinds the page acts on: CC, note on; a note on with velocity 0 is a release', () => {
        expect(M.parse(Uint8Array.from([0xbe, 4, 87]))).toEqual({ type: 'cc', kind: 'cc', ch: 14, num: 4, val: 87 })
        expect(M.parse(Uint8Array.from([0x90, 37, 127]))).toEqual({ type: 'note-on', kind: 'note', ch: 0, num: 37, val: 127 })
        expect(M.parse(Uint8Array.from([0x9e, 37, 0]))).toEqual({ type: 'note-off', kind: null, ch: 14, num: 37, val: 0 })
        expect(M.parse(Uint8Array.from([0x8e, 37, 64])).type).toBe('note-off')
    })
})

describe('a stored map and the defaults', () => {
    const defaults = M.defaultMap()
    it('keeps a stored map whole and adds the default rows it does not hold', () => {
        const stored = defaults.filter((r) => TODAY.some(([k, n]) => k === r.kind && n === r.num)).map((r) => ({ ...r }))
        const merged = M.mergeMaps(stored, defaults)
        expect(merged.slice(0, stored.length)).toEqual(stored)
        expect(merged.length).toBe(58)
        expect(merged.every(M.validRow)).toBe(true)
    })
    it('lets a stored spare row (an old default, not a choice) go, so its control gets its action; fader 4 (dead) stays spare', () => {
        const merged = M.mergeMaps([{ kind: 'cc', ch: 14, num: 19, target: 'spare' }, { kind: 'cc', ch: 14, num: 13, target: 'spare' }], defaults)
        expect(merged.filter((r) => r.target === 'spare')).toEqual([{ kind: 'cc', ch: 14, num: 19, target: 'spare' }]) // the default row of fader 4 only
        expect(merged.find((r) => r.kind === 'cc' && r.num === 13).target).toBe('size:1')
        expect(merged.some((r) => r.target === 'lamp:3')).toBe(false)
    })
    it('keeps what Learn chose: a default row stays out when its target or its control is taken', () => {
        const stored = [{ kind: 'cc', ch: 0, num: 7, target: 'lamp:0' }, { kind: 'note', ch: 14, num: 52, target: 'scene:3' }]
        const merged = M.mergeMaps(stored, defaults)
        expect(merged.filter((r) => r.target === 'lamp:0')).toEqual([stored[0]])
        expect(merged.filter((r) => r.kind === 'note' && r.ch === 14 && r.num === 52)).toEqual([stored[1]])
        expect(merged.some((r) => r.target === 'reset:rotation')).toBe(false)
        expect(merged.every(M.validRow)).toBe(true)
    })
    it('is the defaults when nothing is stored', () => {
        expect(M.mergeMaps(null, defaults)).toEqual(defaults)
        expect(M.mergeMaps([], defaults)).toEqual(defaults)
    })
})

describe('the channel setting and the In line', () => {
    it('reads the picker: any, or 1 to 16 (the K2\'s count) as 0 to 15 on the wire; anything else is any', () => {
        expect(M.channelOf('any')).toBe('any')
        expect(M.channelOf('15')).toBe(14)
        expect(M.channelOf('1')).toBe(0)
        expect(M.channelOf('16')).toBe(15)
        for (const bad of ['0', '17', 'x', '', null, undefined, '1.5']) expect(M.channelOf(bad), String(bad)).toBe('any')
        expect(M.CHANNEL_CHOICES).toEqual(['any', ...Array.from({ length: 16 }, (_, i) => String(i + 1))])
        expect([M.channelText(14), M.channelText('any'), M.channelLabel(14), M.channelLabel('any')]).toEqual(['15', 'any', 'channel 15', 'any channel'])
    })
    const map = M.defaultMap()
    const line = (bytes, channel = 'any') => { const msg = M.parse(Uint8Array.from(bytes)); return M.heard(msg, M.find(map, msg, channel), channel) }
    it('says channel, kind, number, value and where it went', () => {
        expect(line([0xbe, 4, 87])).toBe('ch 15 · CC 4 · 87 → live:level')
        expect(line([0x9e, 37, 127])).toBe('ch 15 · note 37 · 127 → scene:1')
    })
    it('says when it came on a channel the map is not on, when nothing holds the number, and when the channel is not the picked one', () => {
        expect(line([0x90, 37, 127])).toBe('ch 1 · note 37 · 127 → scene:1 (map: ch 15)')
        expect(line([0xb3, 99, 10])).toBe('ch 4 · CC 99 · 10 → unmapped')
        expect(line([0x90, 37, 127], 14)).toBe('ch 1 · note 37 · 127 → ignored, desk on ch 15')
    })
    it('says spare for a spare row, names the kinds it does not use, and stays silent for a release', () => {
        const spare = [{ kind: 'cc', ch: 14, num: 77, target: 'spare' }]
        const msg = M.parse(Uint8Array.from([0xbe, 77, 1]))
        expect(M.heard(msg, M.find(spare, msg), 'any')).toBe('ch 15 · CC 77 · 1 → spare, no action')
        expect(line([0xe1, 0, 64])).toBe('ch 2 · pitch bend 8192 → not used')
        expect(line([0xc0, 5])).toBe('ch 1 · program 5 → not used')
        expect(line([0x9e, 37, 0])).toBeNull()
        expect(line([0x8e, 37, 64])).toBeNull()
    })
    it('names every K2 control: none comes out unmapped, and fader 4 says it is spare', () => {
        for (const c of M.K2) {
            const bytes = c.kind === 'cc' ? [0xb0 | 14, c.num, 64] : [0x90 | 14, c.num, 127]
            const goes = c.target === 'spare' ? 'spare, no action' : c.target
            expect(line(bytes), c.control).toBe(`ch 15 · ${c.kind === 'cc' ? 'CC' : 'note'} ${c.num} · ${bytes[2]} → ${goes}`)
        }
        expect(M.K2.filter((c) => c.target === 'spare').map((c) => c.control)).toEqual(['fader 4'])
    })
})

describe('the reset values and the page', () => {
    it('are the laser desk\'s own defaults (laserDesk.js LOOK_DEFAULTS), which its state serves as `defaults`', () => {
        const { LOOK_DEFAULTS } = require('../laser/laserDesk.js')
        for (const key of M.RESET_KEYS.split('|')) expect(M.RESET_TO[key], key).toBe(LOOK_DEFAULTS[key])
        expect(Object.keys(M.RESET_TO).sort()).toEqual(M.RESET_KEYS.split('|').sort())
    })
    it('are loaded by the page before show.js, with the places it fills', () => {
        const html = fs.readFileSync(path.join(here, 'ui/index.html'), 'utf8')
        expect(html.indexOf('<script src="midiMap.js">')).toBeGreaterThan(0)
        expect(html.indexOf('<script src="midiMap.js">')).toBeLessThan(html.indexOf('<script src="show.js">'))
        for (const id of ['midiIn', 'midiChannel', 'midiSheetBtn', 'midiSheet', 'midiLine', 'midiLearn']) expect(html).toContain(`id="${id}"`)
    })
})

describe('the docs say what the code does', () => {
    it('the K2 table in midi/README.md is the one midiMap.js makes (the help in the page reads the same rows)', () => {
        const readme = fs.readFileSync(path.join(here, 'ui/midi/README.md'), 'utf8')
        const block = readme.split('<!-- k2-map:start -->')[1].split('<!-- k2-map:end -->')[0].trim()
        expect(block).toBe(M.sheetMarkdown())
    })
})
