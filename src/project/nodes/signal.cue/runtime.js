import { cueClockAt, cueListOf } from '../../../shared/cueClock.js'
import { risingEdge } from '../edge.js'

// The project's cue list (mappingState.cues) as wires. Where the list is comes
// from the shared cue clock (shared/cueClock.cjs) — the same lines the desk's
// cue runner and the show's clock run — fed with:
//   - the show's start (mappingState.showEpoch) when the document carries one
//     and the document clock is stamped (showState.clockEpoch), so the node
//     reads the cue every viewer's room is on;
//   - this window's presses on Go, Back and Jump, stamped on the document
//     clock the moment this window first sees them.
// Go and Back take a Button's press count (each rise is that many presses), a
// Keyboard's boolean (each rising edge is one) or Time's beat. Jump takes a cue
// index and fires that cue when the number changes. Loop, unwired, is the
// document's own switch (mappingState.loop).
//
// Presses live in context.frameMemory, per window: a window opened later
// starts from the counts it finds, not from the presses before it.

const MAX_EVENTS = 64
const MAX_PRESSES = 16

const pressesOf = (memory, key, value) => {
    if (value === undefined || value === null || typeof value === 'boolean') return risingEdge(memory, key, value) ? 1 : 0
    const count = Number(value)
    if (!Number.isFinite(count)) return 0
    const prev = memory.get(key)
    memory.set(key, count)
    if (typeof prev !== 'number') return 0
    return count > prev ? Math.min(MAX_PRESSES, count - prev) : 0
}

const jumpOf = (memory, key, value) => {
    const index = Number(value)
    if (value === undefined || value === null || value === '' || !Number.isFinite(index)) return null
    const prev = memory.get(key)
    memory.set(key, index)
    return typeof prev === 'number' && prev !== index ? Math.round(index) : null
}

const listOf = (memory, nodeId, cues) => {
    if (!memory) return cueListOf(cues)
    const kept = memory.get(`${nodeId}:list`)
    if (kept && kept.cues === cues) return kept.list
    const list = cueListOf(cues)
    memory.set(`${nodeId}:list`, { cues, list })
    return list
}

// The show's start on this graph's clock: context.now is ms since showState.clockEpoch.
const epochOf = (context) => {
    const showEpoch = Number(context?.mappingState?.showEpoch)
    const clockEpoch = Number(context?.clockEpoch)
    return showEpoch > 0 && clockEpoch > 0 ? showEpoch - clockEpoch : null
}

/** Where this node's list is, this pass. Also kept in frameMemory under `${id}:state` for the window that fires it. */
export const cueStateOf = (node, { input, context }) => {
    const memory = context?.frameMemory || null
    const cues = Array.isArray(context?.mappingState?.cues) ? context.mappingState.cues : []
    const list = listOf(memory, node.id, cues)
    const now = Number.isFinite(context?.now) ? context.now : 0
    const wiredLoop = input('loop')
    const loop = typeof wiredLoop === 'boolean' ? wiredLoop : context?.mappingState?.loop === true
    const epoch = epochOf(context)
    let events = []
    if (memory) {
        const eventsKey = `${node.id}:events`
        events = memory.get(eventsKey) || []
        const fresh = []
        for (let k = pressesOf(memory, `${node.id}:go`, input('go')); k > 0; k -= 1) fresh.push({ at: now, kind: 'go' })
        for (let k = pressesOf(memory, `${node.id}:back`, input('back')); k > 0; k -= 1) fresh.push({ at: now, kind: 'back' })
        const jump = jumpOf(memory, `${node.id}:jump`, input('jump'))
        if (jump !== null) fresh.push({ at: now, kind: 'jump', index: jump })
        if (fresh.length) {
            events = [...events, ...fresh]
            // A long show's presses fold into one jump to where they had put the list.
            if (events.length > MAX_EVENTS) {
                const cut = events.length - MAX_EVENTS / 2
                const head = cueClockAt({ list, epoch, loop, now: events[cut - 1].at, events: events.slice(0, cut) })
                const tail = events.slice(cut)
                events = head && head.index >= 0 ? [{ at: head.firedAt, kind: 'jump', index: head.index }, ...tail] : tail
            }
            memory.set(eventsKey, events)
        }
    }
    const state = cueClockAt({ list, epoch, loop, now, events })
    const answer = state ? { ...state, pressed: events.length > 0 } : null
    memory?.set(`${node.id}:state`, answer)
    return answer
}

export const computeOutput = (node, portId, { input, context }) => {
    const state = cueStateOf(node, { input, context })
    const on = state && state.index >= 0
    if (portId === 'index') return on ? state.index : -1
    if (portId === 'name') return on ? state.name : ''
    if (portId === 'look') return on ? state.lookId : ''
    if (portId === 'progress') return on ? state.progress : 0
    if (portId === 'fading') return on ? state.fading : false
    // Changes each time a cue fires: the moment it fired, on the document clock.
    if (portId === 'fired') return on && Number.isFinite(state.firedAt) ? state.firedAt : 0
    return undefined
}
