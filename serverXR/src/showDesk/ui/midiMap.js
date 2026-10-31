// The show desk's MIDI as data and as the pure rules around it (no DOM, no storage): the Allen & Heath Xone:K2's controls with
// what the desk does for each one, which row a message takes (on ANY channel, or on one picked channel), what a stored map
// may hold, and the words of the "In" monitor line. show.js draws and acts; this file decides. Loaded by the page as a plain
// script (window.DiShowMidi) and by its tests as a CommonJS module (midiMap.test.js).
//
// Source of the numbers: the maker's Xone:K2 user guide AP8509, pp. 9-16 and p. 11 (Latching Layers off; "by default the MIDI
// Channel number is set to 15"), https://www.allen-heath.com/content/uploads/2023/06/XoneK2_UG_AP8509_3.pdf, fetched
// 2026-11-01. midi/xone-k2.json holds the maker's chart row by row; midiMap.test.js keeps this table equal to it.
//
// The owner, 2026-11-01 (ledger N1718): "make all mapped, that maybe they not trigger the right one". So: every one of the
// K2's 58 controls does something here, except fader 4 (CC 19): it is dead on the owner's unit and he ruled it never to be
// mapped (ledger N1653, 2026-10-31), so its row stays in the table as `spare`. The desk hears the controller on any MIDI channel
// unless one is picked.
//
// Safety, unchanged since 2026-10-31: MIDI never reaches On, Off, a lift, Undo, Save or Release. isTarget() names every
// target there is (and a stored map is read through it); the new ones can only step a scene, set a knob back to its
// start, or park a knob, and none of them lifts a Blackout or arms a cube.
'use strict'

;(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    else root.DiShowMidi = api
})(typeof self !== 'undefined' ? self : this, function () {
    const K2_CHANNEL = 14 // "channel 15" as the K2 counts it, 14 on the wire (AP8509 p. 11)
    const CHANNEL_KEY = 'diShowDesk.midiChannel.v1'

    // ---- what a target is. A fader or a knob takes a continuous target; a button takes a press target.
    const LIVE_KEYS = 'level|size|height|x|copies|rotation|spin|pulse|sweep|cycle|phase|pulseBeats|sweepBeats|points'
    const RESET_KEYS = 'rotation|x|cycle|phase|pulseBeats|sweepBeats' // timing and place: none of them is a brightness
    const CONT = `lamp:\\d{1,3}|size:\\d{1,3}|live:(?:${LIVE_KEYS})|light-master|laser-master`
    const CONTINUOUS = new RegExp(`^(?:${CONT})$`)
    const PRESS = new RegExp(`^(?:scene:(?:\\d{1,3}|next|prev)|blackout|reset:(?:${RESET_KEYS})|park:(?:${CONT}))$`)
    const isContinuous = (t) => typeof t === 'string' && CONTINUOUS.test(t)
    const isPress = (t) => typeof t === 'string' && PRESS.test(t)
    const isTarget = (t) => t === 'spare' || isContinuous(t) || isPress(t)

    // One row of a map: {kind: 'cc'|'note', ch: 0..15 (the wire), num: 0..127, target, relative?}.
    const validRow = (m) => Boolean(m && (m.kind === 'cc' || m.kind === 'note') && Number.isInteger(m.ch) && m.ch >= 0 && m.ch < 16
        && Number.isInteger(m.num) && m.num >= 0 && m.num < 128 && isTarget(m.target)
        && (m.target === 'spare' || isPress(m.target) === (m.kind === 'note')))

    // "Reset" sets a live field to the laser desk's own default (laserDesk.js LOOK_DEFAULTS, which its state also serves as
    // `defaults`; the page prefers that, this copy is the fallback and midiMap.test.js keeps it equal).
    const RESET_TO = Object.freeze({ rotation: 0, x: 0, cycle: 0, phase: 0, pulseBeats: 1, sweepBeats: 4 })

    // ---- the Xone:K2, control by control, in the order of its face: top encoders, the pots with their switches, the faders,
    // the switch matrix, the bottom row. `control` is the name midi/xone-k2.json gives it. A row is kept as the crew knew it
    // (2026-10-31) wherever one existed; the rest is new (2026-11-01).
    const cc = (control, num, target, relative = false) => ({ control, kind: 'cc', num, target, relative })
    const note = (control, num, target) => ({ control, kind: 'note', num, target, relative: false })
    const K2 = Object.freeze([
        cc('encoder 1', 0, 'live:rotation', true), cc('encoder 2', 1, 'live:x', true), cc('encoder 3', 2, 'live:cycle', true), cc('encoder 4', 3, 'live:phase', true),
        note('encoder 1 push', 52, 'reset:rotation'), note('encoder 2 push', 53, 'reset:x'), note('encoder 3 push', 54, 'reset:cycle'), note('encoder 4 push', 55, 'reset:phase'),
        cc('pot 1', 4, 'live:level'), cc('pot 2', 5, 'live:size'), cc('pot 3', 6, 'live:height'), cc('pot 4', 7, 'live:copies'),
        note('pot switch 1', 48, 'park:live:level'), note('pot switch 2', 49, 'park:live:size'), note('pot switch 3', 50, 'park:live:height'), note('pot switch 4', 51, 'park:live:copies'),
        cc('pot 5', 8, 'live:spin'), cc('pot 6', 9, 'live:pulse'), cc('pot 7', 10, 'live:sweep'), cc('pot 8', 11, 'laser-master'),
        note('pot switch 5', 44, 'park:live:spin'), note('pot switch 6', 45, 'park:live:pulse'), note('pot switch 7', 46, 'park:live:sweep'), note('pot switch 8', 47, 'park:laser-master'),
        cc('pot 9', 12, 'size:0'), cc('pot 10', 13, 'size:1'), cc('pot 11', 14, 'size:2'), cc('pot 12', 15, 'light-master'),
        note('pot switch 9', 40, 'park:size:0'), note('pot switch 10', 41, 'park:size:1'), note('pot switch 11', 42, 'park:size:2'), note('pot switch 12', 43, 'park:light-master'),
        // fader 4 is DEAD on the owner's K2 and is never mapped (N1653, 2026-10-31): its row stays listed, as `spare`, the way the first default map kept it
        cc('fader 1', 16, 'lamp:0'), cc('fader 2', 17, 'lamp:1'), cc('fader 3', 18, 'lamp:2'), cc('fader 4', 19, 'spare'),
        note('matrix A', 36, 'scene:0'), note('matrix B', 37, 'scene:1'), note('matrix C', 38, 'scene:2'), note('matrix D', 39, 'scene:3'),
        note('matrix E', 32, 'scene:4'), note('matrix F', 33, 'scene:5'), note('matrix G', 34, 'scene:6'), note('matrix H', 35, 'scene:7'),
        note('matrix I', 28, 'scene:8'), note('matrix J', 29, 'scene:9'), note('matrix K', 30, 'scene:10'), note('matrix L', 31, 'scene:11'),
        note('matrix M', 24, 'scene:12'), note('matrix N', 25, 'scene:13'), note('matrix O', 26, 'scene:14'), note('matrix P', 27, 'blackout'),
        note('layer button', 12, 'scene:prev'),
        cc('encoder 5', 20, 'live:pulseBeats', true), note('encoder 5 push', 13, 'reset:pulseBeats'),
        cc('encoder 6', 21, 'live:sweepBeats', true), note('encoder 6 push', 14, 'reset:sweepBeats'),
        note('exit setup button', 15, 'scene:next')
    ])

    // The map the page starts from: the K2 on its own channel, as plain rows (what Learn changes and Export map shows).
    const defaultMap = () => K2.map((c) => ({ kind: c.kind, ch: K2_CHANNEL, num: c.num, target: c.target, ...(c.relative ? { relative: true } : {}) }))

    // A stored map (Learn) is kept whole and wins; the default rows it does not hold are added after it, so a K2 control
    // that is new to the defaults works in a browser that stored its map before. A default row stays out when the stored map
    // already has a row for its target or one on its control. Stored `spare` rows are old defaults, not choices: they go.
    const mergeMaps = (saved, defaults) => {
        const out = (Array.isArray(saved) ? saved : []).filter((m) => m && m.target !== 'spare').map((m) => ({ ...m }))
        for (const d of defaults) {
            const heldTarget = d.target !== 'spare' && out.some((m) => m.target === d.target)
            const heldControl = out.some((m) => m.kind === d.kind && m.ch === d.ch && m.num === d.num)
            if (!heldTarget && !heldControl) out.push({ ...d })
        }
        return out
    }

    // ---- the channel the page listens on: 'any' (the default) or one wire channel 0..15 (shown and stored as 1..16)
    const CHANNEL_CHOICES = Object.freeze(['any', ...Array.from({ length: 16 }, (_, i) => String(i + 1))])
    const channelOf = (text) => {
        const s = String(text == null ? '' : text).trim().toLowerCase()
        const n = Number(s)
        return s !== '' && Number.isInteger(n) && n >= 1 && n <= 16 ? n - 1 : 'any'
    }
    const channelText = (mode) => (mode === 'any' ? 'any' : String(mode + 1))
    const channelLabel = (mode) => (mode === 'any' ? 'any channel' : `channel ${mode + 1}`)

    // ---- a message in, and the row it takes
    // data: the Web MIDI message bytes. Returns null for what is not channel input (data bytes, clock, active sensing, sysex).
    const parse = (data) => {
        if (!data || data.length < 1) return null
        const status = data[0]
        if (status < 0x80 || status >= 0xf0) return null
        const type = status & 0xf0
        const ch = status & 0x0f
        const a = data.length > 1 ? data[1] : 0
        const b = data.length > 2 ? data[2] : 0
        if (type === 0xb0 && data.length >= 3) return { type: 'cc', kind: 'cc', ch, num: a, val: b }
        if (type === 0x90 && data.length >= 3) return b > 0 ? { type: 'note-on', kind: 'note', ch, num: a, val: b } : { type: 'note-off', kind: null, ch, num: a, val: 0 }
        if (type === 0x80) return { type: 'note-off', kind: null, ch, num: a, val: b }
        const type14 = type === 0xe0 && data.length >= 3
        return { type: { 0xa0: 'key pressure', 0xc0: 'program', 0xd0: 'channel pressure', 0xe0: 'pitch bend' }[type] || 'message', kind: null, ch, num: type14 ? (b << 7) | a : a, val: b }
    }

    // Which row a message takes. The row on its own channel wins; otherwise the same kind and number on any channel does,
    // unless a channel is picked: then a message on another channel takes nothing (why: 'channel').
    const find = (map, msg, channel = 'any') => {
        if (!msg || !msg.kind) return { row: null, why: 'unmapped' }
        if (channel !== 'any' && channel !== msg.ch) return { row: null, why: 'channel' }
        const rows = Array.isArray(map) ? map : []
        const row = rows.find((x) => x.kind === msg.kind && x.ch === msg.ch && x.num === msg.num) || rows.find((x) => x.kind === msg.kind && x.num === msg.num) || null
        if (!row) return { row: null, why: 'unmapped' }
        return { row, why: row.ch === msg.ch ? 'exact' : 'other-channel' }
    }

    // The "In" line: channel, kind, number, value, then where it went. A release (note off) says nothing new: null.
    const heard = (msg, found, channel = 'any') => {
        if (!msg || msg.type === 'note-off') return null
        const what = msg.kind === 'cc' ? `CC ${msg.num} · ${msg.val}` : msg.kind === 'note' ? `note ${msg.num} · ${msg.val}` : `${msg.type} ${msg.num}`
        let to
        if (!msg.kind) to = 'not used'
        else if (found && found.why === 'channel') to = `ignored, desk on ch ${channel + 1}`
        else if (!found || !found.row) to = 'unmapped'
        else if (found.row.target === 'spare') to = 'spare, no action'
        else to = found.why === 'other-channel' ? `${found.row.target} (map: ch ${found.row.ch + 1})` : found.row.target
        return `ch ${msg.ch + 1} · ${what} → ${to}`
    }

    // ---- the K2 sheet: the one table of what each control does (the help in the page and the docs read it from here)
    const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)
    const spaced = (key) => key.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`)
    const wordsOf = (target) => {
        const [kind, rest] = target.split(/:(.*)/s)
        if (target === 'light-master') return 'Lights master'
        if (target === 'laser-master') return 'Laser master'
        if (target === 'blackout') return 'Blackout all (dark only)'
        if (target === 'spare') return 'Spare, no action'
        if (kind === 'lamp') return `Lamp ${Number(rest) + 1} level`
        if (kind === 'size') return `Cube ${Number(rest) + 1} size`
        if (kind === 'live') return `Live look: ${spaced(rest)}`
        if (kind === 'scene') return rest === 'next' ? 'Next scene' : rest === 'prev' ? 'Previous scene' : `Scene ${rest.padStart(2, '0')}`
        if (kind === 'reset') return `Reset ${spaced(rest)}`
        if (kind === 'park') return `Park ${lowerFirst(wordsOf(rest).replace(/^Live look: /, ''))}`
        return target
    }
    const sheet = () => K2.map((c) => ({ control: c.control, midi: `${c.kind === 'cc' ? 'CC' : 'note'} ${c.num}${c.relative ? ' (relative)' : ''}`, target: c.target, does: wordsOf(c.target) }))
    const sheetMarkdown = () => ['| Control | MIDI | Does |', '|---|---|---|', ...sheet().map((r) => `| ${r.control} | ${r.midi} | ${r.does} |`)].join('\n')

    return { K2_CHANNEL, CHANNEL_KEY, CHANNEL_CHOICES, K2, RESET_TO, RESET_KEYS, isContinuous, isPress, isTarget, validRow, defaultMap, mergeMaps, channelOf, channelText, channelLabel, parse, find, heard, wordsOf, sheet, sheetMarkdown }
})
