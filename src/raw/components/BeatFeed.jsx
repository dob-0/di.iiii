import { useEffect, useMemo, useRef } from 'react'
import { proposeLightTempo } from '../../map/lightingLink.js'
import { localTimeline, tapTempo } from '../../timeline/showClock.js'
import { wallToDocumentMs } from '../../project/graph/beatClock.js'

// The Beat node's hands (the MidiOutFeed shape: no window, no mesh, one per
// Beat). The runtime is pure, so what a Beat DOES lives here:
//
// - Tempo from "Light desk": the desk's clock (useShowClock's reading, moved
//   by its measured offset) goes onto liveOutputs as `${id}:light`, in
//   document-clock ms, for the runtime to read. No desk: null, and the Beat
//   keeps its own BPM. Tempo from "This node": nothing is reported, so the
//   desk is never read by a Beat that did not choose it.
// - Tap: with the desk, the tap is forwarded to the desk (its tempo, the
//   moment as its beat), exactly as the deck's Tap does. Otherwise the tapped
//   tempo is written into the node (bpm, epoch) so every window agrees.
// - Reset: beat 0 lands now, tempo kept; on the desk or in the node likewise.
//
// A signal "fires" when it turns truthy, or changes while truthy (a rising
// count from a Counter or MIDI In) — MidiOutFeed's rule.
const fired = (was, now) => Boolean(now) && (!was || now !== was)

export default function BeatFeed({
    node,
    inputs,
    showClock = null,
    clockEpoch = 0,
    onLiveOutput,
    onTempo,
    sendTempo = proposeLightTempo,
    wallNow = () => Date.now()
}) {
    const fromDesk = inputs?.source === 'light'
    const light = fromDesk && showClock?.light?.up ? showClock.light : null
    const offset = Number(showClock?.offset?.offset) || 0

    const deskBpm = light ? Number(light.bpm) : null
    const deskEpoch = light ? Number(light.epoch) : null
    const reading = useMemo(() => {
        if (deskBpm === null || !Number.isFinite(deskBpm) || !Number.isFinite(deskEpoch)) return null
        const local = localTimeline({ bpm: deskBpm, epoch: deskEpoch }, offset)
        return { bpm: local.bpm, epoch: wallToDocumentMs(local.epoch, clockEpoch) }
    }, [deskBpm, deskEpoch, offset, clockEpoch])
    useEffect(() => {
        onLiveOutput?.(node.id, 'light', reading)
    }, [node.id, reading, onLiveOutput])
    useEffect(() => () => onLiveOutput?.(node.id, 'light', null), [node.id, onLiveOutput])

    const taps = useRef([])
    const lastTap = useRef(inputs?.tap)
    const tap = inputs?.tap
    useEffect(() => {
        const was = lastTap.current
        lastTap.current = tap
        if (!fired(was, tap)) return
        const state = tapTempo(taps.current, wallNow())
        taps.current = state.taps
        // One tap is a beat with no tempo yet; the deck's Tap waits for two as well.
        if (state.bpm === null || state.ignored) return
        if (light) sendTempo({ bpm: state.bpm, epoch: state.epoch + offset })
        else onTempo?.(node.id, { bpm: state.bpm, epoch: wallToDocumentMs(state.epoch, clockEpoch) })
    }, [tap, light, offset, clockEpoch, node.id, onTempo, sendTempo, wallNow])

    const lastReset = useRef(inputs?.reset)
    const reset = inputs?.reset
    useEffect(() => {
        const was = lastReset.current
        lastReset.current = reset
        if (!fired(was, reset)) return
        const wall = wallNow()
        if (light) {
            sendTempo({ bpm: Number(light.bpm), epoch: wall + offset })
            return
        }
        onTempo?.(node.id, { epoch: wallToDocumentMs(wall, clockEpoch) })
    }, [reset, light, offset, clockEpoch, node.id, onTempo, sendTempo, wallNow])

    return null
}
