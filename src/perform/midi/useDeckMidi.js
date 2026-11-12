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
    ledClears,
    ledsFor,
    holdTargets,
    setFreezeHold,
    bindingFor,
    describeMatch,
    shortMatch,
    withoutOverride,
    learnEntry,
    normalizeOverrides,
    targetFromKey,
    withOverride
} from './deckBinding.js'
import { useMidiPorts } from './midiPorts.js'
import { createK2Monitor } from './k2Monitor.js'
import { createK2Publisher, eventOf, lightsOf, namedValues } from './k2Channel.js'
import { jobsFor, linesFor } from './k2Jobs.js'
import { K2_CHANNEL, CONSOLES, K2_NAME, XONE_K2_LEDS, consoleOf, defaultMap, isK2, k2IsRelative, pickInputId } from './xoneK2.js'
import { isApc40, APC40_CONSOLE_ID, APC40_COLUMNS, apc40BankCount, apc40Banked, apc40LedChanges, apc40LedClears, apc40Leds } from './apc40.js'

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
// fxLayer    the layer whose effects pots 9-12 drive (-1 = master)
// console    node.values.midiConsole: the id of the K2 console (missing or unknown = k2); pickConsole(id) patches { midiConsole }
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

export function useDeckMidi({ deck, write, stored, onPatch, onTap, enabled = true, deckId = '', console: consoleId, fxLayer = -1, fxEffect = 0, onFxLayer, onFxEffect, onColumn }) {
    // SHOW FIX: no console chosen yet (the deck has no stored midiConsole) and an APC40 is the only controller plugged in:
    // use the APC40 console, so the pads work the moment the page loads, with nothing to pick. A console that was chosen
    // by hand (k2, k2-1.9, apc40) always wins, and with a K2 plugged in nothing changes.
    const [autoConsole, setAutoConsole] = useState('')
    const k2Console = consoleOf(consoleId || autoConsole)
    const isApcConsole = k2Console.id === APC40_CONSOLE_ID
    const defaults = useMemo(() => defaultMap(k2Console.id), [k2Console.id])
    const overrides = useMemo(() => normalizeOverrides(stored), [stored])
    // APC40: which bank of 8 columns sits under the pads (the bank arrows change it, a scene step takes the pads along)
    const [bank, setBank] = useState(0)
    const bankCount = isApcConsole ? apc40BankCount(deck?.columns) : 1
    const bankNow = Math.min(bank, bankCount - 1)
    const map = useMemo(() => {
        const plain = effectiveMap(defaults, overrides)
        return isApcConsole ? apc40Banked(plain, bankNow) : plain
    }, [defaults, overrides, isApcConsole, bankNow])

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
    useEffect(() => { live.current = { write, onTap, onPatch, map, stored, isRelative: k2Console.isRelative || k2IsRelative, jump: isApcConsole, enabled: active, fx: { layer: fxLayer, effect: fxEffect }, onFxLayer, onFxEffect, onColumn, bankCount } })
    const tapState = useRef({ taps: [] })
    const abStates = useRef(new Map())
    const statefulKey = useCallback((control) => control?.kind === 'note'
        && (control.number === 48 || control.number === 49 || (control.number === 66 && (control.press ? control.value === 1 || control.value === 2 : abStates.current.get(control.channel) === true))), [])

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
    const [once, setOnce] = useState(false) // "Map to MIDI" from the right-click menu: learn ends after its one binding
    const learnRef = useRef({ learning, target, once })
    useEffect(() => { learnRef.current = { learning, target, once } }, [learning, target, once])

    // The K2's MIDI channel is a setting on the device (15 from the factory, 2 on the owner's, measured N3636).
    // The map is written for K2_CHANNEL, so a K2 message is read as if it came on that channel, and the
    // lights are sent back on the channel the device was last heard on.
    const k2Live = useRef(false)
    const [heard, setHeard] = useState(K2_CHANNEL)
    const heardRef = useRef(K2_CHANNEL)
    const monitorRef = useRef(null) // set by the monitor effect at the end of the hook
    const publisherRef = useRef(null) // the controller window's courier, set at the end of the hook
    // FREEZE while held (the K2's EXIT SETUP): the layer the hold was pressed on, null = not held.
    const holdLayerRef = useRef(null)
    const [holdNote, setHoldNote] = useState('')

    const onMessage = useCallback((raw) => {
        const current = live.current
        if (!current.enabled) return
        let message = raw
        if (k2Live.current && Number.isInteger(raw?.channel) && raw.channel !== K2_CHANNEL) {
            if (heardRef.current !== raw.channel) { heardRef.current = raw.channel; setHeard(raw.channel) }
            message = { ...raw, channel: K2_CHANNEL }
        } else if (k2Live.current && raw?.channel === K2_CHANNEL && heardRef.current !== K2_CHANNEL) {
            heardRef.current = K2_CHANNEL; setHeard(K2_CHANNEL)
        }
        // APC40 mkII, generic mode: the 8 device knobs (CC 16-23) send on the channel of the selected track
        // (1-8, master 9). The map is written for channel 1, so after a track-select press they went dead.
        if (current.jump && raw?.kind === 'cc' && raw.cc >= 16 && raw.cc <= 23 && raw.channel >= 2 && raw.channel <= 9) message = { ...raw, channel: 1 }
        // APC40: the activator key (note 50) is a toggle in the controller, so every second press arrives as a
        // note-off. Its job here is a plain press (stop that layer's clip), so both count as one.
        if (current.jump && raw?.kind === 'noteOff' && raw.note === 50) message = { ...raw, kind: 'noteOn', velocity: 127 }
        // the A|B key: remember whether it speaks in states (velocity 1 = A, 2 = B), so its note-off means "none"
        if (current.jump && raw?.kind === 'noteOn' && raw.note === 66) abStates.current.set(raw.channel, raw.velocity === 1 || raw.velocity === 2)
        monitorRef.current?.push(message) // the K2 panel's live picture; no deck write, no render here
        // the controller window (k2Channel.js): nothing at all unless a window asked for it
        const publisher = publisherRef.current
        if (publisher?.isListening()) {
            const event = eventOf(controlOf(message))
            if (event) publisher.push(event)
        }
        const { learning: isLearning, target: wanted, once: justOne } = learnRef.current
        if (isLearning) {
            // While learning, a message never plays the deck: it binds the picked control.
            const entry = learnEntry(wanted, message, { relative: current.isRelative })
            if (entry) {
                current.onPatch?.({ midiMap: withOverride(current.stored, entry) })
                setTarget(null)
                if (justOne) { setLearning(false); setOnce(false) }
            }
            return
        }
        const base = ahead.current
        let holdLayer
        const bound = entryFor(message, current.map)
        const heldNow = bound?.action === 'hold'
        if (heldNow) {
            const press = controlOf(message)?.press
            if (press && !holdTargets(base, current.fx.layer).length) { setHoldNote('no Freeze effect to hold'); return }
            if (press) { holdLayerRef.current = current.fx.layer; setHoldNote('') } else holdLayer = holdLayerRef.current ?? undefined
        }
        let stepped = null
        const next = applyMidi(base, message, current.map, {
            onColumnStep: (to) => { stepped = to },
            onBank: (dir) => setBank((now) => ((Math.min(now, current.bankCount - 1) + dir) % current.bankCount + current.bankCount) % current.bankCount),
            // APC40: a fader or knob takes its value at once, as in Resolume (no soft takeover); the K2 consoles keep pickup
            onTap: () => current.onTap?.(), tapState: tapState.current, pickup: current.jump ? undefined : pickup.current, fx: current.fx, holdLayer,
            // APC40 mkII, generic mode: record-arm (48) and solo (49) are toggles IN the controller (on = note-on, off =
            // note-off; acting on presses only made every second press do nothing), and A|B (66) when it speaks in states
            stateful: current.jump ? statefulKey : undefined,
            onFxLayer: (index) => current.onFxLayer?.(index), onFxEffect: (index) => current.onFxEffect?.(index)
        })
        if (heldNow && !controlOf(message)?.press) { holdLayerRef.current = null; setHoldNote('') }
        if (next === base) return
        const continuous = isContinuousEntry(entryFor(message, current.map))
        if (!continuous) flush() // keep the order: a pending fader value goes out first
        ahead.current = next
        if (continuous) schedule()
        else { dirty.current = true; flush() }
        // A column launched by MIDI (the K2's encoder pushes): reported after its write, once per launch.
        if (bound?.action === 'column' && Number.isInteger(bound.args?.column)) current.onColumn?.(bound.args.column)
        // A scene step is a column launch too, and the pads go with it to its bank.
        if (Number.isInteger(stepped)) {
            current.onColumn?.(stepped)
            if (current.jump) setBank(Math.floor(stepped / APC40_COLUMNS))
        }
    }, [flush, schedule])

    // One MIDI access, only while this instance owns the deck.
    const ports = useMidiPorts({ active, onMessage, console: k2Console.id })
    // the input the ports hook listens on: the console's controller by name, else the first (K2 consoles: as before)
    const inputNames = ports.inputs.map((item) => String(item.name || '')).join('|')
    useEffect(() => {
        if (consoleId) { setAutoConsole(''); return }
        // while MIDI is being (re)opened the input list is empty: that is not "the APC went away". Switching console
        // reopens MIDI, so deciding on that empty list flipped the console back and forth forever.
        if (ports.status === MIDI_STATUS.REQUESTING) return
        const hasK2 = ports.inputs.some(isK2)
        const hasApc = ports.inputs.some(isApc40)
        setAutoConsole(!hasK2 && hasApc ? APC40_CONSOLE_ID : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the input names, not the array identity
    }, [consoleId, inputNames, ports.status])
    const pickedId = pickInputId(ports.inputs, k2Console.id)
    const device = ports.inputs[0] ? ports.inputs.find((item) => item.id === pickedId) || ports.inputs[0] : null
    // LEDs go to the console's own controller: the APC40's output for the apc40 console, the K2's for the K2 ones
    const k2Output = ports.outputs.find(isApcConsole ? isApc40 : isK2) || null
    useEffect(() => { k2Live.current = Boolean(device) && isK2(device) })
    const outputKey = k2Output ? `${k2Output.id}:${k2Output.state}:${ports.generation}:${isApcConsole ? 'apc40' : heard}` : ''

    // LEDs go to the K2's output only, never to another device. The "already sent" cache
    // is forgotten whenever the output goes away or its state changes, so a K2 that was
    // unplugged and plugged back gets every LED again.
    const sentRef = useRef(new Map())
    const sentKey = useRef('')
    const sendRef = useRef(ports.send)
    useEffect(() => { sendRef.current = ports.send })
    const leds = useMemo(() => {
        const ctx = { fx: { layer: fxLayer, effect: fxEffect } }
        return isApcConsole ? apc40Leds(deck, map, ctx) : ledsFor(deck, map, k2Console.leds || XONE_K2_LEDS, heard, ctx)
    }, [deck, map, heard, fxLayer, fxEffect, k2Console, isApcConsole])
    useEffect(() => {
        if (sentKey.current !== outputKey) { sentRef.current = new Map(); sentKey.current = outputKey }
        if (!outputKey || !active || !k2Output) return
        // a button that lost its binding goes dark first, then the new picture
        const clears = isApcConsole ? apc40LedClears(leds, sentRef.current) : ledClears(leds, sentRef.current, heard)
        for (const led of clears) sendRef.current(k2Output.id, ledBytes(led))
        const changes = isApcConsole ? apc40LedChanges(leds, sentRef.current) : ledChanges(leds, sentRef.current)
        for (const led of changes) sendRef.current(k2Output.id, ledBytes(led))
    }, [leds, outputKey, active, k2Output, heard, isApcConsole])

    let state = 'absent'
    if (device) state = isK2(device) ? 'k2' : isApc40(device) ? 'apc40' : 'listening'
    else if (ports.status === MIDI_STATUS.ACTIVE) state = 'listening'
    if (learning) state = 'learn'

    const toggleLearn = useCallback(() => { setLearning((on) => !on); setTarget(null); setOnce(false) }, [])
    const pickTarget = useCallback((key) => {
        const found = targetFromKey(key)
        setTarget(found ? { key, ...found } : null)
        return Boolean(found)
    }, [])
    // The right-click path: learn on with this control already picked; ends after its one binding.
    const mapOnce = useCallback((key) => {
        const found = targetFromKey(key)
        if (!found) return false
        setLearning(true)
        setOnce(true)
        setTarget({ key, ...found })
        return true
    }, [])
    // What takes a control now, in words: { text, short, learned } or null.
    const bindingOf = useCallback((key) => {
        const found = bindingFor(defaults, overrides, targetFromKey(key))
        return found ? { text: describeMatch(found.entry.match), short: shortMatch(found.entry.match), learned: found.learned } : null
    }, [defaults, overrides])
    // Remove the learned binding of one control (a default K2 binding is not removable).
    const unmap = useCallback((key) => {
        const found = targetFromKey(key)
        if (!found) return false
        live.current.onPatch?.({ midiMap: withoutOverride(live.current.stored, found) })
        return true
    }, [])
    // Pick the K2 console: only { midiConsole } is patched; the learned midiMap stays on top of either one.
    const pickConsole = useCallback((id) => {
        if (!CONSOLES.some((item) => item.id === id)) return false
        pickup.current = new Map()
        live.current.onPatch?.({ midiConsole: id })
        return true
    }, [])
    const reset = useCallback(() => {
        live.current.onPatch?.({ midiMap: null })
        setTarget(null)
    }, [])

    // The live monitor for the K2 panel (kept last: added after the hooks above).
    const [k2Monitor] = useState(() => createK2Monitor())
    // A hold whose release never comes (controller unplugged, deck unmounted, page hidden) lets go.
    const releaseHold = useCallback(() => {
        const layer = holdLayerRef.current
        if (layer === null) return
        holdLayerRef.current = null
        setHoldNote('')
        const base = ahead.current
        const next = setFreezeHold(base, layer, 0)
        if (next === base) return
        ahead.current = next
        dirty.current = true
        flush()
    }, [flush])
    const present = Boolean(device)
    useEffect(() => { if (!present || !active) releaseHold() }, [present, active, releaseHold])
    useEffect(() => {
        const onHide = () => { if (document.hidden) releaseHold() }
        document.addEventListener('visibilitychange', onHide)
        window.addEventListener('pagehide', releaseHold)
        return () => {
            document.removeEventListener('visibilitychange', onHide)
            window.removeEventListener('pagehide', releaseHold)
            releaseHold()
        }
    }, [releaseHold])
    useEffect(() => { monitorRef.current = k2Monitor; return () => k2Monitor.dispose() }, [k2Monitor])

    // The controller window's courier (k2Channel.js). One BroadcastChannel is opened while this
    // instance owns the deck (it only listens for a request); a snapshot is built only when a window
    // asked, and publishing per MIDI event is one flag test while none did. No render, no state.
    const [feed] = useState(() => ({ build: null }))
    const [k2Publisher] = useState(() => createK2Publisher({ source: () => feed.build?.() ?? null }))
    useEffect(() => {
        feed.build = () => ({
            controller: k2Console.controller || K2_NAME,
            consoleId: k2Console.id,
            consoleName: k2Console.name,
            labels: jobsFor(map, k2Console, fxEffect),
            lines: linesFor(map, k2Console, fxEffect),
            lights: lightsOf(leds),
            ...namedValues(k2Monitor.getSnapshot())
        })
    })
    useEffect(() => {
        publisherRef.current = k2Publisher
        if (active) k2Publisher.ensure()
        return () => { publisherRef.current = null; k2Publisher.dispose() }
    }, [k2Publisher, active])
    useEffect(() => { k2Publisher.changed() }, [k2Publisher, leds, map, k2Console, fxEffect])

    return {
        state,
        deviceName: device?.name || '',
        learning,
        target,
        bindings: overrides.length,
        toggleLearn,
        pickTarget,
        mapOnce,
        bindingOf,
        unmap,
        reset,
        k2Console,
        consoles: CONSOLES,
        pickConsole,
        controlOf,
        map,
        k2Monitor,
        k2Publisher,
        bank: bankNow,
        bankCount,
        note: holdNote
    }
}
