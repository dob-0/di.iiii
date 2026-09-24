import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { proposeLightTempo, readLightClock } from '../map/lightingLink.js'
import {
    DEFAULT_BPM,
    DEFAULT_CLOCK_POLICY,
    addOffsetSample,
    bestOffset,
    localTimeline,
    offsetSample,
    pickLeader,
    sanitizeBpm,
    sanitizeEpoch,
    tapTempo
} from '../timeline/showClock.js'

// The show clock as a React hook: ONE per page, handed down by context, read
// by the deck window, the Clock window and the Master window alike.
// The model and every rule are in showClock.js; this file only keeps time.
//
// The leader is read by polling the Light desk's clock (GET /light/api/clock)
// every POLL_MS while the page is visible. Polling, not a socket, because the
// desk is a plain HTTP page with no push channel today, and on a LAN a 500 ms
// poll puts a Light tap on the deck in half a second at worst — measured and
// reported in the decision draft. Hidden tab: no polling at all.

export const POLL_MS = 500
const FOLLOW_KEY = 'dii.perform.followLight'

const readFollow = () => {
    try {
        return window.localStorage.getItem(FOLLOW_KEY) !== 'off'
    } catch {
        return true
    }
}

const writeFollow = (on) => {
    try {
        window.localStorage.setItem(FOLLOW_KEY, on ? 'on' : 'off')
    } catch {
        // A private window: the switch still works for this page.
    }
}

export const ShowClockContext = createContext(null)
export const useShowClockContext = () => useContext(ShowClockContext)

/**
 *   deck         the deck whose tempo is the fallback ({ bpm, epoch } from
 *                node.values.deck), or null when the project has none
 *   onDeckTempo  (bpm, epoch) → write the deck's own tempo, or null (read only)
 *   enabled      false: no polling at all (a surface with no clock on it)
 *   now          injectable time, for tests
 */
export default function useShowClock({ deck = null, onDeckTempo = null, enabled = true, policy = DEFAULT_CLOCK_POLICY, now = () => Date.now(), readClock = readLightClock, sendTempo = proposeLightTempo } = {}) {
    const [light, setLight] = useState(null)
    const [follow, setFollowState] = useState(readFollow)
    const samplesRef = useRef([])
    const [offset, setOffset] = useState(null)
    const tapsRef = useRef([])
    const lastLightRef = useRef(null)
    // Held in refs: a default argument is a new function every render, and an
    // effect that depended on it would restart the poll on every render.
    const nowRef = useRef(now)
    const readRef = useRef(readClock)
    const sendRef = useRef(sendTempo)
    nowRef.current = now
    readRef.current = readClock
    sendRef.current = sendTempo

    useEffect(() => {
        if (!enabled) return undefined
        let cancelled = false
        let timer = null
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
        const tick = async () => {
            timer = null
            const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
            if (!hidden) {
                try {
                    const reading = await readRef.current({ signal: controller?.signal, now: nowRef.current })
                    if (cancelled) return
                    const sample = offsetSample({ sentAt: reading.sentAt, serverNow: reading.serverNow, receivedAt: reading.receivedAt })
                    if (sample) {
                        samplesRef.current = addOffsetSample(samplesRef.current, sample)
                        setOffset(bestOffset(samplesRef.current))
                    }
                    setLight(reading)
                } catch {
                    if (cancelled) return
                }
            }
            if (!cancelled) timer = setTimeout(tick, POLL_MS)
        }
        tick()
        return () => {
            cancelled = true
            controller?.abort()
            if (timer) clearTimeout(timer)
        }
    }, [enabled])

    const leader = pickLeader({ policy, light, follow })

    const deckTimeline = useMemo(() => ({
        bpm: sanitizeBpm(deck?.bpm, DEFAULT_BPM),
        epoch: sanitizeEpoch(deck?.epoch)
    }), [deck?.bpm, deck?.epoch])

    const lightTimeline = useMemo(() => {
        if (!light?.up) return null
        return localTimeline({ bpm: light.bpm, epoch: light.epoch }, offset?.offset || 0)
    }, [light?.up, light?.bpm, light?.epoch, offset?.offset])

    const timeline = leader === 'light' && lightTimeline ? lightTimeline : deckTimeline

    // When the Light desk goes away the deck carries on at the tempo and phase
    // the room was just hearing — Link's rule that a session keeps its tempo
    // when a peer leaves — instead of jumping back to a tempo from last week.
    useEffect(() => {
        if (leader === 'light' && lightTimeline) {
            lastLightRef.current = lightTimeline
            return
        }
        const last = lastLightRef.current
        lastLightRef.current = null
        if (last && onDeckTempo && (last.bpm !== deckTimeline.bpm || Math.abs(last.epoch - deckTimeline.epoch) > 1)) {
            onDeckTempo(last.bpm, Math.round(last.epoch))
        }
    }, [leader, lightTimeline, deckTimeline, onDeckTempo])

    const tap = useCallback(() => {
        const t = nowRef.current()
        const state = tapTempo(tapsRef.current, t)
        tapsRef.current = state.taps
        if (state.ignored || state.bpm === null) return state
        // The deck keeps the tempo too, so it carries on if the desk goes.
        if (onDeckTempo) onDeckTempo(state.bpm, Math.round(state.epoch))
        if (leader === 'light') {
            sendRef.current({ bpm: state.bpm, epoch: state.epoch + (offset?.offset || 0) })
        }
        return state
    }, [onDeckTempo, leader, offset?.offset])

    // Back to the default tempo, with the beat on this instant.
    const reset = useCallback(() => {
        tapsRef.current = []
        const t = nowRef.current()
        if (onDeckTempo) onDeckTempo(DEFAULT_BPM, Math.round(t))
        if (leader === 'light') sendRef.current({ bpm: DEFAULT_BPM, epoch: t + (offset?.offset || 0) })
    }, [onDeckTempo, leader, offset?.offset])

    const setFollow = useCallback((on) => {
        writeFollow(on)
        setFollowState(Boolean(on))
    }, [])

    return useMemo(() => ({
        leader,
        timeline,
        light,
        follow,
        setFollow,
        tap,
        reset,
        offset,
        canTap: Boolean(onDeckTempo) || leader === 'light'
    }), [leader, timeline, light, follow, setFollow, tap, reset, offset, onDeckTempo])
}
