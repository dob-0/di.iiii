import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MIDI_STATUS, useMidiInput, useMidiOutput } from '../../raw/utils/midiCapture.js'
import {
    applyMidi,
    controlOf,
    effectiveMap,
    ledBytes,
    ledChanges,
    ledsFor,
    learnEntry,
    normalizeOverrides,
    targetFromKey,
    withOverride
} from './deckBinding.js'
import { K2_CHANNEL, XONE_K2_LEDS, defaultMap, isK2, k2IsRelative, pickInputId } from './xoneK2.js'

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
export function useDeckMidi({ deck, write, stored, onPatch, onTap, enabled = true }) {
    const defaults = useMemo(() => defaultMap(), [])
    const overrides = useMemo(() => normalizeOverrides(stored), [stored])
    const map = useMemo(() => effectiveMap(defaults, overrides), [defaults, overrides])

    // Fast fader moves arrive faster than React hands the new deck back: keep the
    // latest we wrote so two messages in one frame both land.
    const deckRef = useRef(deck)
    useEffect(() => { deckRef.current = deck }, [deck])
    const live = useRef({})
    useEffect(() => { live.current = { write, onTap, onPatch, map, stored, enabled } })
    const tapState = useRef({ taps: [] })

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
        const next = applyMidi(deckRef.current, message, current.map, { onTap: () => current.onTap?.(), tapState: tapState.current })
        if (next !== deckRef.current) {
            deckRef.current = next
            current.write?.(next)
        }
    }, [])

    // One input subscription: first every input, then (once the list is known) only the pick.
    const [inputId, setInputId] = useState('')
    const input = useMidiInput({ deviceId: inputId, onMessage })
    const wantedId = pickInputId(input.devices)
    useEffect(() => { setInputId(wantedId) }, [wantedId])
    const device = input.devices.find((item) => item.id === wantedId) || null

    // LEDs go to the K2's output only, never to another device.
    const [outputId, setOutputId] = useState('')
    const output = useMidiOutput({ deviceId: outputId })
    const k2OutputId = output.devices.find(isK2)?.id || ''
    useEffect(() => { setOutputId(k2OutputId) }, [k2OutputId])
    const ready = Boolean(outputId) && outputId === k2OutputId
    const sentRef = useRef(new Map())
    const sendRef = useRef(output.send)
    useEffect(() => { sendRef.current = output.send })
    useEffect(() => { sentRef.current = new Map() }, [outputId])

    const leds = useMemo(() => ledsFor(deck, map, XONE_K2_LEDS, K2_CHANNEL), [deck, map])
    useEffect(() => {
        if (!ready || !enabled) return
        for (const led of ledChanges(leds, sentRef.current)) sendRef.current(ledBytes(led))
    }, [leds, ready, enabled])

    let state = 'absent'
    if (device) state = isK2(device) ? 'k2' : 'listening'
    else if (input.status === MIDI_STATUS.ACTIVE) state = 'listening'
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
