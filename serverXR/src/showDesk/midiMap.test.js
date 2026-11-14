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
    ['note', 28, 'scene:8'], ['note', 29, 'scene:9'], ['note', 27, 'scene:15']
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
    const SPARE = ['encoder 3 push', 'encoder 4 push', 'fader 4'] // the two fx encoders have no safe reset; fader 4 is dead
    it('K2 map v1 (2026-11-13): every turn has a job, every button a safe job (scenes, Blackout, park, reset) but two fx pushes and the dead fader; none twice, every row valid', () => {
        const rows = M.defaultMap()
        expect(rows.length).toBe(58)
        expect(rows.every(M.validRow)).toBe(true)
        expect(new Set(rows.map((r) => `${r.kind}:${r.num}`)).size).toBe(58)
        expect(M.K2.filter((c) => c.target === 'spare').map((c) => c.control).sort()).toEqual([...SPARE].sort())
        const acting = rows.filter((r) => r.target !== 'spare')
        expect(acting.length).toBe(55)
        expect(new Set(acting.map((r) => r.target)).size).toBe(55) // no target twice
        const presses = M.K2.filter((c) => c.kind === 'note' && c.target !== 'spare')
        expect(presses.map((c) => c.target).filter((t) => /^scene:\d+$/.test(t) || false).sort()).toEqual(Array.from({ length: 16 }, (_, i) => `scene:${i}`).sort()) // pads A-O = the 15 scenes (P = Blackout, below)
        expect(M.K2.find((c) => c.control === 'matrix P').target).toBe('scene:15')
        expect(M.K2.filter((c) => /^blackout/.test(c.target)).map((c) => c.control)).toEqual(['exit setup button']) // exactly one Blackout
        expect(M.K2.find((c) => c.control === 'exit setup button').target).toBe('blackout:lights') // the extra Blackout (owner 2026-11-13)
        expect(presses.every((c) => /^(scene:(\d+|prev)|blackout:lights|park:|reset:)/.test(c.target))).toBe(true) // a press is a scene, Blackout, a park or a reset: nothing else
        expect(M.sheet().find((r) => r.control === 'fader 4')).toMatchObject({ midi: 'CC 19', target: 'spare', does: 'Spare, no action' })
    })
    it('keeps the laser controls the crew knew where they were (the controls v1 did not move)', () => {
        const rows = M.defaultMap()
        const moved = new Set(['cc:2', 'cc:3', 'cc:9', 'cc:10', 'cc:12', 'cc:13', 'cc:14', 'cc:17', 'cc:18', 'cc:1', 'cc:6']) // cc 1 + 6: the owner moved them to Phase beats + Rot. pulse (2026-11-14)
        let kept = 0
        for (const [kind, num, target, relative] of TODAY) {
            if (kind === 'note' ? (num < 24 || num > 39) : moved.has(`cc:${num}`)) continue
            expect(rows.find((r) => r.kind === kind && r.num === num), `${kind} ${num}`).toEqual({ kind, ch: 14, num, target, ...(relative ? { relative: true } : {}) })
            kept += 1
        }
        expect(kept).toBe(19) // 21 until 2026-11-14, when the owner moved cc 1 and cc 6 to the new moves
    })
    it('K2 map v1: the owner\'s turn table, control by control', () => {
        const at = (control) => M.K2.find((r) => r.control === control).target
        expect(['fader 1', 'fader 2', 'fader 3', 'fader 4'].map(at)).toEqual(['lamp:0', 'lamp:1+2', 'layer:rhythm:level', 'spare'])
        expect(Array.from({ length: 12 }, (_, i) => at(`pot ${i + 1}`))).toEqual(['live:level', 'live:size', 'live:rotationPulse', 'live:copies', 'live:spin',
            'layer:base:level', 'layer:accent:level', 'laser-master', 'fx:depth', 'fx:bpm', 'live:pulse', 'light-master'])
        expect(Array.from({ length: 6 }, (_, i) => at(`encoder ${i + 1}`))).toEqual(['live:rotation', 'live:phaseBeats', 'fx:mode', 'fx:spatial', 'live:pulseBeats', 'live:sweepBeats'])
        expect(M.K2.filter((r) => /^encoder \d$/.test(r.control)).every((r) => r.relative)).toBe(true)
        expect(M.K2.filter((r) => /^(pot|fader) /.test(r.control)).every((r) => !r.relative)).toBe(true)
    })
    it('the K2 can never arm, Go, resume, raise or switch anything: no default target names it, and the laser targets are the clamped ones', () => {
        for (const r of M.defaultMap()) expect(r.target.split(/[:+]/), r.control).not.toEqual(expect.arrayContaining(['arm']))
        for (const r of M.defaultMap()) expect(r.target, r.control).toMatch(/^(spare|blackout:lights|scene:\d+|lamp:\d+(\+\d+)?|light-master|laser-master|scene:prev|reset:(rotation|x|pulseBeats|sweepBeats|phaseBeats)|park:[a-z:+0-9A-Z-]+|layer:(base|rhythm|accent):level|fx:(depth|bpm|mode|spatial)|live:(level|size|height|x|copies|rotation|spin|pulse|pulseBeats|sweepBeats|rotationPulse|phaseBeats))$/) // the whole default vocabulary: no arm, Go, resume, On, Off, lift, Undo, Save, Release
        expect(M.isTarget('cube:on')).toBe(false)
        for (const t of ['live:size', 'live:x', 'live:height', 'live:copies', 'live:rotation', 'live:spin', 'live:level', 'laser-master']) expect(M.isLaserTarget(t), t).toBe(true)
        for (const t of ['light-master', 'lamp:0', 'layer:base:level', 'fx:depth', 'scene:3', 'blackout']) expect(M.isLaserTarget(t), t).toBe(false)
    })
    it('a laser turn is clamped to the K2 limits whatever the controller sends, and the limits sit inside the engine\'s hard ranges', () => {
        const HARD = { 'live:rotationPulse': [0, 1], 'live:rotationPulseBeats': [0.25, 64], 'live:phaseBeats': [0, 64], 'live:level': [0, 1], 'live:size': [0, 1], 'live:height': [-1, 1], 'live:x': [-1, 1], 'live:rotation': [-1, 1], 'live:spin': [-4, 4],
            'live:copies': [0, 24], 'live:pulse': [0, 1], 'live:pulseBeats': [0.25, 64], 'live:sweepBeats': [0.25, 64], 'laser-master': [0, 1] } // laserDesk.js normaliseLook, read by dob-b3 2026-11-13
        for (const [t, [lo, hi]] of Object.entries(M.LASER_LIMITS)) {
            expect(HARD[t], t).toBeTruthy()
            expect(lo).toBeGreaterThanOrEqual(HARD[t][0]); expect(hi).toBeLessThanOrEqual(HARD[t][1])
            expect(M.clampLaser(t, 1e9)).toBe(hi); expect(M.clampLaser(t, -1e9)).toBe(lo)
            expect(M.clampLaser(t, (lo + hi) / 2)).toBe((lo + hi) / 2)
        }
        for (const c of M.K2.filter((k) => M.isLaserTarget(k.target) && !k.target.startsWith('park:'))) expect(M.LASER_LIMITS[c.target], c.control).toBeTruthy() // no laser knob without a limit
        expect(M.clampLaser('light-master', 7)).toBe(7) // a light target is not the laser's
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
        expect(merged.filter((r) => r.target === 'spare').length).toBe(3) // the default spare rows only (v1: 6 pushes, 12 switches, 2 corners, fader 4)
        expect(merged.find((r) => r.kind === 'cc' && r.num === 13).target).toBe('fx:bpm')
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
    it('a map stored before 2026-11-14 follows the owner\'s move (pot 3 = Rot. pulse, encoder 2 = Phase beats); a control learned onto stays', () => {
        const old = defaults.map((r) => ({ ...r, target: { 'cc:6': 'live:height', 'note:50': 'park:live:height', 'cc:1': 'live:x', 'note:53': 'reset:x' }[`${r.kind}:${r.num}`] || r.target }))
        const merged = M.mergeMaps(old, defaults)
        const at = (kind, num) => merged.filter((r) => r.kind === kind && r.ch === 14 && r.num === num).map((r) => r.target)
        expect([at('cc', 6), at('note', 50), at('cc', 1), at('note', 53)]).toEqual([['live:rotationPulse'], ['park:live:rotationPulse'], ['live:phaseBeats'], ['reset:phaseBeats']])
        expect(merged.length).toBe(58)
        expect(merged.every(M.validRow)).toBe(true)
        const learned = M.mergeMaps([{ kind: 'cc', ch: 14, num: 6, target: 'live:level' }], defaults)
        expect(learned.filter((r) => r.kind === 'cc' && r.num === 6).map((r) => r.target)).toEqual(['live:level'])
        const otherChannel = M.mergeMaps([{ kind: 'cc', ch: 0, num: 6, target: 'live:height' }], defaults)
        expect(otherChannel.filter((r) => r.kind === 'cc' && r.ch === 0 && r.num === 6).map((r) => r.target)).toEqual(['live:height'])
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
        expect(M.K2.filter((c) => c.target === 'spare').length).toBe(3)
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
