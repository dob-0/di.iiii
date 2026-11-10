import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MIDI_STATUS } from '../../raw/utils/midiCapture.js'
import {
    applyMidi,
    controlOf,
    effectiveMap,
    entryFor,
    isContinuousEntry,
    ledBytes,
    ledChanges,
    ledsFor,
    learnEntry,
    normalizeOverrides,
    targetFromKey,
    withOverride
} from './deckBinding.js'
import { useMidiPorts } from './midiPorts.js'
import { K2_CHANNEL, XONE_K2_LEDS, defaultMap, isK2, k2IsRelative } from './xoneK2.js'

// The live half of the MIDI binding: listens on the K2 (else the first input),
// applies messages to the deck, keeps Learn, and lights the K2's buttons.
// The user's overrides live in node.values.midiMap, next to values.deck, so they
// travel with the project. Nothing here is the source of truth for any state.
//
// deck       the normalized deck (what the view shows)
// write      (nextDeck) => void — the view's own deck write (no-op when not editable)
// stored     node.values.midiMap
// onPatch    (patch) => void — onPatchValues, for { midiMap }
// onTap      the view's tap handler (the show clock or the deck's own taps)
// deckId     one mounted hook instance per deck id owns the controller (see below)
//
// Three rules for a live show:
//  1. COALESCE. A fader sweep is up to 127 messages; each one updates the local
//     picture of the deck at once (so none is lost), but the document is written
//     at most once per WRITE_GAP_MS with a guaranteed trailing write. A discrete
//     action (clip, column, bypass, solo, side, tap, clear) flushes any pending
//     continuous value first and then writes at once, so order is kept.
//  2. AHEAD OF THE DOCUMENT. While writes are pending or not yet echoed back by
//     the `deck` prop, the local deck is ahead; an older prop (an echo of an
//     earlier write) must not roll it back. A prop that is not one of our echoes
//     (another window, a click on the deck) is adopted and pickup starts over.
//  3. ONE OWNER PER DECK ID. Two mounted views of one deck would each apply every
//     message (double taps, double encoder ticks) — only the first mounted
//     instance applies messages and sends LEDs; the next takes over on unmount.
//     A read-only view (enabled false) never owns and never opens MIDI.
export const WRITE_GAP_MS = 30
const MAX_INFLIGHT = 64

const owners = new Map() // deckId -> { order: [token], listeners: Set<fn> }
const slot = (id) => {
    if (!owners.has(id)) owners.set(id, { order: [], listeners: new Set() })
    return owners.get(id)
}
const notify = (entry) => { for (const listener of Array.from(entry.listeners)) listener() }
const claim = (id, token, listener) => {
    const entry = slot(id)
    entry.order.push(token)
    entry.listeners.add(listener)
    notify(entry)
    return () => {
        entry.order = entry.order.filter((item) => item !== token)
        entry.listeners.delete(listener)
        notify(entry)
        if (!entry.order.length && !entry.listeners.size) owners.delete(id)
    }
}
const isOwner = (id, token) => slot(id).order[0] === token

export function useDeckMidi({ deck, write, stored, onPatch, onTap, enabled = true, deckId = '' }) {
    const defaults = useMemo(() => defaultMap(), [])
    const overrides = useMemo(() => normalizeOverrides(stored), [stored])
    const map = useMemo(() => effectiveMap(defaults, overrides), [defaults, overrides])

    // --- one owner per deck id ---
    const [token] = useState(() => ({}))
    const [owner, setOwner] = useState(false)
    useEffect(() => {
        if (!enabled) { setOwner(false); return undefined }
        if (!deckId) { setOwner(true); return () => setOwner(false) }
        const refresh = () => setOwner(isOwner(deckId, token))
        const release = claim(deckId, token, refresh)
        return release
    }, [deckId, enabled, token])
    const active = enabled && owner

    // --- the local deck, ahead of the document ---
    const ahead = useRef(deck)       // what the next message computes from
    const dirty = useRef(false)      // a continuous value not yet written
    const inflight = useRef([])      // JSON of decks written but not yet seen back in the prop
    const lastWriteAt = useRef(-Infinity)
    const timer = useRef(null)
    const pickup = useRef(new Map())
    const live = useRef({})
    useEffect(() => { live.current = { write, onTap, onPatch, map, stored, enabled: active } })
    const tapState = useRef({ taps: [] })

    const flush = useCallback(() => {
        if (timer.current !== null) { clearTimeout(timer.current); timer.current = null }
        if (!dirty.current) return
        dirty.current = false
        lastWriteAt.current = Date.now()
        const next = ahead.current
        inflight.current = [...inflight.current, JSON.stringify(next)].slice(-MAX_INFLIGHT)
        live.current.write?.(next)
    }, [])
    const schedule = useCallback(() => {
        dirty.current = true
        if (timer.current !== null) return
        const wait = Math.max(0, lastWriteAt.current + WRITE_GAP_MS - Date.now())
        if (wait === 0) flush()
        else timer.current = setTimeout(flush, wait)
    }, [flush])

    // The prop: an echo of one of our writes is dropped from the in-flight list; the
    // local deck only follows the prop when nothing of ours is pending or in flight,
    // or when the prop is not an echo of ours (someone else changed the deck).
    const propJson = useMemo(() => JSON.stringify(deck), [deck])
    useEffect(() => {
        const at = inflight.current.indexOf(propJson)
        if (at >= 0) {
            inflight.current = inflight.current.slice(at + 1)
            if (!inflight.current.length && !dirty.current) ahead.current = deck
            return
        }
        if (JSON.stringify(ahead.current) === propJson) return
        // not ours: adopt it. A value still waiting to be written was computed from the old deck.
        inflight.current = []
        dirty.current = false
        if (timer.current !== null) { clearTimeout(timer.current); timer.current = null }
        ahead.current = deck
        pickup.current = new Map()
    }, [deck, propJson])
    useEffect(() => () => { flush() }, [flush])

    const [learning, setLearning] = useState(false)
    const [target, setTarget] = useState(null) // { key, action, args }
    const learnRef = useRef({ learning, target })
    useEffect(() => { learnRef.current = { learning, target } }, [learning, target])

    const onMessage = useCallback((message) => {
        const current = live.current
        if (!current.enabled) return
        const { learning: isLearning, target: wanted } = learnRef.current
        if (isLearning) {
            // While learning, a message never plays the deck: it binds the picked control.
            const entry = learnEntry(wanted, message, { relative: k2IsRelative })
            if (entry) {
                current.onPatch?.({ midiMap: withOverride(current.stored, entry) })
                setTarget(null)
            }
            return
        }
        const base = ahead.current
        const next = applyMidi(base, message, current.map, { onTap: () => current.onTap?.(), tapState: tapState.current, pickup: pickup.current })
        if (next === base) return
        const continuous = isContinuousEntry(entryFor(message, current.map))
        if (!continuous) flush() // keep the order: a pending fader value goes out first
        ahead.current = next
        if (continuous) schedule()
        else { dirty.current = true; flush() }
    }, [flush, schedule])

    // One MIDI access, only while this instance owns the deck.
    const ports = useMidiPorts({ active, onMessage })
    const device = ports.inputs[0] ? ports.inputs.find(isK2) || ports.inputs[0] : null
    const k2Output = ports.outputs.find(isK2) || null
    const outputKey = k2Output ? `${k2Output.id}:${k2Output.state}:${ports.generation}` : ''

    // LEDs go to the K2's output only, never to another device. The "already sent" cache
    // is forgotten whenever the output goes away or its state changes, so a K2 that was
    // unplugged and plugged back gets every LED again.
    const sentRef = useRef(new Map())
    const sentKey = useRef('')
    const sendRef = useRef(ports.send)
    useEffect(() => { sendRef.current = ports.send })
    const leds = useMemo(() => ledsFor(deck, map, XONE_K2_LEDS, K2_CHANNEL), [deck, map])
    useEffect(() => {
        if (sentKey.current !== outputKey) { sentRef.current = new Map(); sentKey.current = outputKey }
        if (!outputKey || !active || !k2Output) return
        for (const led of ledChanges(leds, sentRef.current)) sendRef.current(k2Output.id, ledBytes(led))
    }, [leds, outputKey, active, k2Output])

    let state = 'absent'
    if (device) state = isK2(device) ? 'k2' : 'listening'
    else if (ports.status === MIDI_STATUS.ACTIVE) state = 'listening'
    if (learning) state = 'learn'

    const toggleLearn = useCallback(() => { setLearning((on) => !on); setTarget(null) }, [])
    const pickTarget = useCallback((key) => {
        const found = targetFromKey(key)
        setTarget(found ? { key, ...found } : null)
        return Boolean(found)
    }, [])
    const reset = useCallback(() => {
        live.current.onPatch?.({ midiMap: null })
        setTarget(null)
    }, [])

    return {
        state,
        deviceName: device?.name || '',
        learning,
        target,
        bindings: overrides.length,
        toggleLearn,
        pickTarget,
        reset,
        controlOf
    }
}
