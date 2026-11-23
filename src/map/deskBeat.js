// THE DESK'S BEAT — the one beat number every LFO on the mapper reads.
//
// Like Resolume's BPM: when something leads the tempo, the desk follows it;
// when nothing does, the desk keeps its own. Here the leader is the bar show's
// engine (http://127.0.0.1:4780, emily-e3's), heard read-only over its SSE
// stream; the desk's own tempo is `mapping.tempo` ({ bpm, zero }), tapped or
// typed on the desk and saved with the mapping, so the desk and /out — two
// pages, one document — count the same beats.
//
// beat = (now − zero) · bpm / 60000, the engine's own formula, so beat 0, 4,
// 8 … land on the show's downbeats and an LFO's "top on beat one" hits with
// the music.
//
// A tempo change never jumps an LFO: the beat shown eases onto the new clock
// over EASE_MS instead (bar.html does the same for its visuals).

export const ENGINE_URL = 'http://127.0.0.1:4780'
export const DEFAULT_BPM = 120
const EASE_MS = 600
// While the engine is down, look for it again this often. Each look is one
// small request; EventSource's own retry would log an error every 3 s.
const PROBE_MS = 10000

const now = () => Date.now()
const beatsOf = (clock, at) => ((at - clock.zero) * clock.bpm) / 60000
const validClock = (clock) => Boolean(clock)
    && Number.isFinite(Number(clock.bpm)) && Number(clock.bpm) > 0
    && Number.isFinite(Number(clock.zero))

const state = {
    desk: { bpm: DEFAULT_BPM, zero: 0 },
    show: null,
    // The eased difference between the beat shown and the clock's own, and when it was taken.
    slip: 0,
    slipAt: 0,
    listeners: new Set()
}

const target = (at) => beatsOf(state.show || state.desk, at)

const slipNow = (at) => {
    if (!state.slip) return 0
    const left = 1 - ((at - state.slipAt) / EASE_MS)
    if (left <= 0) { state.slip = 0; return 0 }
    // Smooth start and end, so the swing bends onto the new tempo.
    return state.slip * left * left * (3 - (2 * left))
}

// The beat right now, as a float. Beat 0 is the clock's zero.
export const deskBeat = (at = now() + deskLeadMs()) => target(at) + slipNow(at)

// Swap the clock under the beat without a jump.
const reclock = (apply, { snap = false } = {}) => {
    const at = now()
    const before = deskBeat(at)
    apply()
    const slip = before - target(at)
    // A small correction (the engine's clock nudged by a few ms) slides; a
    // real change — a tap, Bar 1, another show — lands at once, as Resolume's
    // resync does: sliding through beats would sweep every LFO.
    state.slip = !snap && Math.abs(slip) < 0.5 && Math.abs(slip) > 1e-9 ? slip : 0
    state.slipAt = at
    state.listeners.forEach((listener) => listener())
}

// Who sets the tempo now, for the desk's tempo box. The same object until
// something changes (useSyncExternalStore compares snapshots by identity).
let snapshot = null
export const deskTempo = () => {
    const clock = state.show || state.desk
    const from = state.show ? 'show' : 'desk'
    if (!snapshot || snapshot.bpm !== clock.bpm || snapshot.zero !== clock.zero || snapshot.from !== from) {
        snapshot = { bpm: clock.bpm, zero: clock.zero, from }
    }
    return snapshot
}

export const subscribeDeskTempo = (listener) => {
    state.listeners.add(listener)
    return () => state.listeners.delete(listener)
}

// The mapping's own tempo (or none: the default 120 from a zero of 0).
export const setDeskTempo = (tempo) => {
    const next = validClock(tempo)
        ? { bpm: Number(tempo.bpm), zero: Number(tempo.zero) }
        : { bpm: DEFAULT_BPM, zero: 0 }
    if (next.bpm === state.desk.bpm && next.zero === state.desk.zero) return
    reclock(() => { state.desk = next })
}

// A new desk tempo that keeps the beat where it is — what typing a bpm does.
export const tempoKeepingBeat = (bpm, at = now()) => {
    const beat = deskBeat(at)
    return { bpm, zero: Math.round(at - ((beat * 60000) / bpm)) }
}

// Tap tempo: the gaps between the last few taps, and beat one on the last.
const TAP_KEEP = 6
const TAP_GAP_MAX = 2000
let taps = []
export const tapTempo = (at = now()) => {
    if (taps.length && at - taps[taps.length - 1] > TAP_GAP_MAX) taps = []
    taps = [...taps.slice(-(TAP_KEEP - 1)), at]
    if (taps.length < 2) return null
    const gaps = taps.slice(1).map((tap, index) => tap - taps[index])
    const gap = gaps.reduce((sum, value) => sum + value, 0) / gaps.length
    const bpm = Math.min(300, Math.max(20, Math.round((60000 / gap) * 100) / 100))
    return { bpm, zero: Math.round(at) }
}
export const forgetTaps = () => { taps = [] }

// --- the bar show's engine, heard read-only ---------------------------------
//
// emily-e3's engine (bar-show/engine.cjs, 2026-11-11): everything comes on the
// default message event as {"type": …}. 'hello' carries `clock` and `state`;
// 'clock' IS the clock ({ bpm, zero, locked, hand, phraseZero, desk }), sent
// only when the tempo or phase changes — linear in between. Audio goes to
// every client at ~30 Hz, so lines are skipped by their start before any
// parse. The role must not be the default ('visual' = a projection window to
// the pad) nor 'desk' (the laser desk there).

const FALL_BACK_MS = 5000

// phraseZero is the beat of bar 1 ("Bar 1" on the pad, or by ear). Beats are
// counted from it, so an LFO restarts on the one.
// `snap`: a fresh engine's hello. A restarted engine (e3's handover) does not
// carry its clock over — it starts again at beat 0 from its boot tempo — so
// its hello is a new clock, never a correction to ease onto.
const setShowClock = (clock, { snap = false } = {}) => {
    const next = validClock(clock)
        ? { bpm: Number(clock.bpm), zero: Number(clock.zero) + ((Number(clock.phraseZero) || 0) * 60000) / Number(clock.bpm) }
        : null
    const same = next && state.show && next.bpm === state.show.bpm && Math.abs(next.zero - state.show.zero) < 1e-6
    if (same || (!next && !state.show)) return
    reclock(() => { state.show = next }, { snap })
}

let users = 0
let role = 'mapdesk'
let wantsLead = false
let leadMs = 0
let source = null
let probe = 0
let gap = 0
let stopped = true

// /out draws this far ahead of now, like the bar show's own projection
// windows (state.projAheadMs, 60 ms, set on the pad), so its LFOs land on the
// same beat as the clips; the desk tab needs no lead.
export const deskLeadMs = () => (state.show && wantsLead ? leadMs : 0)

const hearState = (body) => {
    const ahead = Number(body?.projAheadMs)
    if (Number.isFinite(ahead)) leadMs = Math.min(500, Math.max(0, ahead))
    if (body && typeof body.auto === 'boolean') seeAutopilot(body.auto)
}

// The engine's autopilot (its state.auto: the pad's "Autopilot on/off"), so the
// desk's Autopilot button shows and sets the same switch — on, the patterns
// change with the music; off, the one playing stays until someone picks
// another (Emily, 11-12). null while no engine is heard.
let autopilot = null
const autopilotListeners = new Set()
const seeAutopilot = (value) => {
    const next = typeof value === 'boolean' ? value : null
    if (next === autopilot) return
    autopilot = next
    autopilotListeners.forEach((listener) => listener())
}
export const engineAutopilot = () => autopilot
export const subscribeEngineAutopilot = (listener) => {
    autopilotListeners.add(listener)
    return () => autopilotListeners.delete(listener)
}
// Shown at once, then confirmed (or put back) by the engine's own 'state'.
export const setEngineAutopilot = (on, { fetchImpl = typeof fetch === 'function' ? fetch : null } = {}) => {
    if (!fetchImpl) return Promise.resolve(false)
    const before = autopilot
    seeAutopilot(Boolean(on))
    return Promise.resolve()
        .then(() => fetchImpl(`${ENGINE_URL}/api/set`, {
            method: 'POST',
            // X-Bar: pad, as the pad sends it (the engine answers 403 without).
            // Only ever sent on a click: state.auto is saved by the engine, so a
            // write on load or reconnect would undo the pad's choice (e3, 11-12).
            headers: { 'Content-Type': 'application/json', 'X-Bar': 'pad' },
            body: JSON.stringify({ patch: { auto: Boolean(on) } })
        }))
        .then((response) => {
            if (!response?.ok) throw new Error('refused')
            return true
        })
        .catch(() => { seeAutopilot(before); return false })
}

const giveUp = () => {
    gap = 0
    source?.close()
    source = null
    setShowClock(null)
    seeAutopilot(null)
    schedule()
}

const listen = () => {
    if (stopped || source || typeof EventSource === 'undefined') return
    try {
        source = new EventSource(`${ENGINE_URL}/events?role=${encodeURIComponent(role)}`)
    } catch {
        source = null
        schedule()
        return
    }
    source.onmessage = (event) => {
        const data = String(event.data || '')
        const kind = data.startsWith('{"type":"clock"') ? 'clock'
            : data.startsWith('{"type":"hello"') ? 'hello'
                : data.startsWith('{"type":"state"') ? 'state' : ''
        if (!kind) return
        let message
        try { message = JSON.parse(data) } catch { return }
        if (gap) { clearTimeout(gap); gap = 0 }
        if (kind === 'clock') setShowClock(message)
        else {
            if (message.state) hearState(message.state)
            if (kind === 'hello' && message.clock) setShowClock(message.clock, { snap: true })
        }
    }
    source.onerror = () => {
        // The engine restarts by handover (a ~1 s gap, then EventSource is
        // back with a fresh hello): keep the last clock through it, and fall
        // back to the desk's own tempo only when it stays away.
        if (!gap) gap = setTimeout(giveUp, FALL_BACK_MS)
    }
}

const look = () => {
    probe = 0
    if (stopped || source) return
    fetch(`${ENGINE_URL}/state`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
            if (stopped) return
            if (body?.clock && validClock(body.clock)) {
                if (body.state) hearState(body.state)
                setShowClock(body.clock)
                listen()
            } else schedule()
        })
        .catch(() => { if (!stopped) schedule() })
}

const schedule = () => {
    if (stopped || probe) return
    probe = setTimeout(look, PROBE_MS)
}

// A page that shows LFOs calls this once (refcounted) and gets its stop back.
// `out: true` for /out, which draws ahead of now.
export const followShowClock = ({ out = false } = {}) => {
    users += 1
    if (out) { wantsLead = true; role = 'mapdesk-out' }
    if (users === 1) {
        stopped = false
        if (typeof fetch === 'function') look()
    }
    return () => {
        users = Math.max(0, users - 1)
        if (users) return
        stopped = true
        if (probe) clearTimeout(probe)
        if (gap) clearTimeout(gap)
        probe = 0
        gap = 0
        source?.close()
        source = null
        wantsLead = false
        role = 'mapdesk'
        setShowClock(null)
        seeAutopilot(null)
    }
}

// For tests: back to a fresh desk.
export const resetDeskBeat = () => {
    state.desk = { bpm: DEFAULT_BPM, zero: 0 }
    state.show = null
    state.slip = 0
    taps = []
    autopilot = null
}
export const _setShowClockForTest = setShowClock
export const _hearStateForTest = hearState
