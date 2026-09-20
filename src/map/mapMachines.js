// What the machines on this desk can show, read for the map.
//
// A stream surface names an input ("OBS Virtual Camera") and each machine looks
// for it among its OWN cameras. So the question the desk has to answer is never
// "does this machine have it" but "does ANY machine showing this space have it"
// — and when none does, to say so on the desk, before it is a black rectangle on
// a wall in another room. The matching rule here must stay the one the wall
// uses (matchStreamDevice in MapSourceView): exact name first, then "contains".

const lower = (value) => String(value || '').trim().toLowerCase()

const camerasOf = (machine) => (machine?.devices || []).filter((device) => device.kind === 'camera' && device.label)

/** Does this machine have an input the name would resolve to? Returns its label, or ''. */
export const inputOnMachine = (machine, name) => {
    const wanted = lower(name)
    if (!wanted) return ''
    const cameras = camerasOf(machine)
    const hit = cameras.find((device) => lower(device.label) === wanted)
        || cameras.find((device) => lower(device.label).includes(wanted))
    return hit ? hit.label : ''
}

/** Every input name any machine offers, each with the machines that have it. */
export const streamInputOptions = (machines = []) => {
    const byLabel = new Map()
    for (const machine of machines) {
        for (const device of camerasOf(machine)) {
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

/** One line per machine for the desk: screens, inputs, and how many pages are open there. */
export const describeMachine = (machine) => {
    const screens = (machine.devices || []).filter((device) => device.kind === 'screen')
    return {
        id: machine.id,
        name: machine.self ? `${machine.name} · this machine` : machine.name,
        pages: machine.pages || 0,
        screens: screens.map((screen) => (screen.width ? `${screen.width}×${screen.height}` : screen.label)),
        inputs: camerasOf(machine).map((device) => device.label)
    }
}

/** Stream surfaces whose name NO machine can resolve — the black rectangles waiting to happen. */
export const unresolvedStreams = (surfaces = [], machines = []) => surfaces
    .filter((surface) => surface?.source?.kind === 'stream' && surface.enabled !== false)
    .map((surface) => ({ surface, status: streamInputStatus(machines, surface.source.ref) }))
    .filter(({ surface, status }) => !surface.source.ref || (status.known && status.found.length === 0))
    .map(({ surface }) => ({ id: surface.id, name: surface.name || surface.id, input: surface.source.ref || '' }))
