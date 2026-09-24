// What the machines on this desk can show, read for the map.
//
// A stream surface names an input ("OBS Virtual Camera") and an NDI® surface
// names a source ("AYLMO (td_out_windows)"); each machine looks for it among
// its OWN. So the question the desk has to answer is never "does this machine
// have it" but "does ANY machine showing this space have it" — and when none
// does, to say so on the desk, before it is a black rectangle on a wall in
// another room.
//
// The matching rule is src/shared/nameMatch.js — the one the wall itself uses
// (matchStreamDevice and MapNdiSource in MapSourceView) and the one serverXR
// uses to resolve a name against the NDI finder's list. One function, so the
// desk cannot promise a resolution the wall then refuses.

import { pickByLabel } from '../shared/nameMatch.js'

const camerasOf = (machine) => (machine?.devices || []).filter((device) => device.kind === 'camera' && device.label)

/**
 * The NDI sources this machine's own serverXR can see. Empty on a machine with
 * no NDI runtime, and empty is all it ever is — there is no error state here,
 * because most machines will never have one installed.
 */
export const ndiOf = (machine) => (machine?.devices || []).filter((device) => device.kind === 'ndi' && device.label)

/** Does this machine have an input the name would resolve to? Returns its label, or ''. */
export const inputOnMachine = (machine, name) => pickByLabel(camerasOf(machine), name)?.label || ''

/** Does this machine's receiver see an NDI source by that name? Returns its name, or ''. */
export const ndiOnMachine = (machine, name) => pickByLabel(ndiOf(machine), name)?.label || ''

/** Every name any machine offers of one device kind, each with the machines that have it. */
const optionsOf = (machines, read) => {
    const byLabel = new Map()
    for (const machine of machines) {
        for (const device of read(machine)) {
            if (!byLabel.has(device.label)) byLabel.set(device.label, [])
            const names = byLabel.get(device.label)
            const who = machine.self ? 'this machine' : machine.name
            if (!names.includes(who)) names.push(who)
        }
    }
    return [...byLabel.entries()]
        .map(([label, on]) => ({ label, on }))
        .sort((a, b) => a.label.localeCompare(b.label))
}

/** Every input name any machine offers, each with the machines that have it. */
export const streamInputOptions = (machines = []) => optionsOf(machines, camerasOf)

/** Every NDI source name any machine can see, each with the machines that see it. */
export const ndiSourceOptions = (machines = []) => optionsOf(machines, ndiOf)

/**
 * For one stream name: which machines can show it, and which cannot.
 * `known` is false when no machine has reported any named camera yet — a page
 * that was never allowed a camera reports "Camera 1", and "missing" would be a lie.
 */
export const streamInputStatus = (machines = [], name = '') => {
    const found = []
    const missing = []
    let known = false
    for (const machine of machines) {
        const cameras = camerasOf(machine)
        if (cameras.some((device) => !/^Camera \d+$/.test(device.label))) known = true
        const who = machine.self ? 'this machine' : machine.name
        if (inputOnMachine(machine, name)) found.push(who)
        else missing.push(who)
    }
    return { found, missing, known }
}

/**
 * For one NDI source name: which machines can see it, and which cannot.
 *
 * `known` is false until at least one machine has reported an NDI source at
 * all. A machine with no NDI runtime reports nothing, which is exactly what a
 * machine that has simply not answered yet reports — so with nothing in hand
 * the desk says nothing rather than accusing a name that may be perfectly
 * right. (The camera list has the same shape of hole, and the same answer.)
 */
export const ndiSourceStatus = (machines = [], name = '') => {
    const found = []
    const missing = []
    let known = false
    for (const machine of machines) {
        if (ndiOf(machine).length) known = true
        const who = machine.self ? 'this machine' : machine.name
        if (ndiOnMachine(machine, name)) found.push(who)
        else missing.push(who)
    }
    return { found, missing, known }
}

/** One line per machine for the desk: screens, inputs, NDI, and how many pages are open there. */
export const describeMachine = (machine) => {
    const screens = (machine.devices || []).filter((device) => device.kind === 'screen')
    return {
        id: machine.id,
        name: machine.self ? `${machine.name} · this machine` : machine.name,
        pages: machine.pages || 0,
        screens: screens.map((screen) => (screen.width ? `${screen.width}×${screen.height}` : screen.label)),
        inputs: camerasOf(machine).map((device) => device.label),
        ndi: ndiOf(machine).map((device) => device.label)
    }
}

const RESOLVERS = {
    stream: { status: streamInputStatus, noun: 'an input' },
    ndi: { status: ndiSourceStatus, noun: 'an NDI source' }
}

/**
 * Surfaces whose named input NO machine can resolve — the black rectangles
 * waiting to happen. Covers both kinds that name a live input rather than
 * pointing at one: `stream` (a camera by label) and `ndi` (a source by name).
 * `kind` travels with each row so the desk can say the right noun.
 */
export const unresolvedInputs = (surfaces = [], machines = []) => surfaces
    .filter((surface) => RESOLVERS[surface?.source?.kind] && surface.enabled !== false)
    .map((surface) => ({ surface, status: RESOLVERS[surface.source.kind].status(machines, surface.source.ref) }))
    .filter(({ surface, status }) => !surface.source.ref || (status.known && status.found.length === 0))
    .map(({ surface }) => ({
        id: surface.id,
        kind: surface.source.kind,
        name: surface.name || surface.id,
        input: surface.source.ref || ''
    }))

// ── which display shows this mapping ────────────────────────────────────────
//
// `output.show` names a machine and one of its screens (or 'all'). The desk
// offers exactly what the machines hub has reported — each machine's screens
// by label and size — because a screen the desk cannot see is a screen the
// stage box will have to hunt for by whatever of label, index and size the
// document kept. `di stage run` matches with the same order everywhere a
// live input is named: exact label, contains, size, index (src/shared/nameMatch.js).

const screensOf = (machine) => (machine?.devices || []).filter((device) => device.kind === 'screen')

const ANY = ''
const showKey = (machineId, screen) => `${machineId}::${screen === 'all' ? 'all' : screen}`

/** The `<select>` value for a stored show, so the desk can show what the document says. */
export const showValue = (show) => {
    if (!show?.machine) return ANY
    if (show.screen === 'all' || !show.screen) return showKey(show.machine, 'all')
    return showKey(show.machine, Number.isInteger(show.screen.index) ? show.screen.index : (show.screen.label || 'all'))
}

/**
 * Every choice the desk can offer: nothing (any screen — today's single
 * kiosk), then per machine "all its screens" and each screen by name. A
 * document that names a machine or screen no machine on the desk reports
 * right now keeps its choice visible, marked, rather than silently snapping
 * to "any".
 */
export const showOptions = (machines = [], show = null) => {
    const options = [{ value: ANY, label: 'any screen' }]
    for (const machine of machines) {
        const who = machine.self ? `${machine.name} · this machine` : machine.name
        const screens = screensOf(machine)
        options.push({ value: showKey(machine.id, 'all'), label: `${who} · all screens` })
        screens.forEach((screen, index) => {
            const size = screen.width ? ` ${screen.width}×${screen.height}` : ''
            options.push({ value: showKey(machine.id, index), label: `${who} · ${screen.label || `screen ${index + 1}`}${size}` })
        })
    }
    const current = showValue(show)
    if (current && !options.some((option) => option.value === current)) {
        const screenText = show.screen === 'all' ? 'all screens' : (show.screen?.label || (Number.isInteger(show.screen?.index) ? `screen ${show.screen.index + 1}` : 'a screen'))
        options.push({ value: current, label: `${show.name || show.machine.slice(0, 8)} · ${screenText} — not on the desk now` })
    }
    return options
}

/** The show to write for a chosen value, or null for "any screen". */
export const showFromValue = (value, machines = []) => {
    const text = String(value || '')
    if (!text) return null
    const at = text.lastIndexOf('::')
    if (at < 0) return null
    const machineId = text.slice(0, at)
    const which = text.slice(at + 2)
    const machine = machines.find((entry) => entry.id === machineId) || null
    const base = { machine: machineId, ...(machine?.name ? { name: machine.name } : {}) }
    if (which === 'all') return { ...base, screen: 'all' }
    const index = Number(which)
    const screen = Number.isInteger(index) ? screensOf(machine)[index] : null
    if (!screen) return { ...base, screen: { label: which, index: null, size: null } }
    return {
        ...base,
        screen: {
            label: screen.label || '',
            index,
            size: screen.width && screen.height ? [screen.width, screen.height] : null
        }
    }
}
