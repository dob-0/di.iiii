// How many OTHER tabs of this site are open right now, asked over a
// BroadcastChannel (same origin only): send a ping, count the pongs that
// come back inside a short window. Used by the loading ring to name the real
// cause of a stalled live stream — the browser's per-host connection ceiling
// (src/map/transportCeiling.js) — instead of waiting for ever in silence.
import { useEffect, useState } from 'react'
import { isMultiplexedOrigin, originProtocol } from '../map/transportCeiling.js'

export const TAB_CHANNEL = 'di-tabs'
export const TAB_COUNT_WINDOW_MS = 400
// Over HTTP/1.1 a host gets about six connections; each room tab holds one
// live stream, so this many other tabs starve a new one.
export const CROWDED_OTHER_TABS = 5
// The document arrived but the live stream has not opened after this long.
export const STREAM_STALL_MS = 6000

export const crowdedTabsLine = 'too many tabs of this site are open — close one'

export const countOtherTabs = ({ windowMs = TAB_COUNT_WINDOW_MS, Channel = globalThis.BroadcastChannel } = {}) => {
    if (typeof Channel !== 'function') return Promise.resolve(0)
    return new Promise((resolve) => {
        const probe = `${Date.now()}-${Math.random()}`
        const channel = new Channel(TAB_CHANNEL)
        const seen = new Set()
        channel.onmessage = ({ data }) => {
            if (data?.type === 'pong' && data.probe === probe) seen.add(data.id)
        }
        channel.postMessage({ type: 'ping', probe })
        setTimeout(() => {
            channel.close()
            resolve(seen.size)
        }, windowMs)
    })
}

// Every tab answers pings for as long as it lives. Returns the stop function.
export const answerTabPings = ({ Channel = globalThis.BroadcastChannel } = {}) => {
    if (typeof Channel !== 'function') return () => {}
    const id = `${Date.now()}-${Math.random()}`
    const channel = new Channel(TAB_CHANNEL)
    channel.onmessage = ({ data }) => {
        if (data?.type === 'ping') channel.postMessage({ type: 'pong', probe: data.probe, id })
    }
    return () => channel.close()
}

// True only when the stream is stalled AND the evidence says tabs are why.
export const isCrowded = ({ otherTabs, protocol = originProtocol() }) => (
    otherTabs >= CROWDED_OTHER_TABS && !isMultiplexedOrigin(protocol)
)

// `waiting`: the document is here but the live stream has not opened.
// Mounted once per page for its whole life, so a tab that finished loading still answers.
export function useAnswerTabPings() {
    useEffect(() => answerTabPings(), [])
}

export function useCrowdedTabs(waiting, stallMs = STREAM_STALL_MS) {
    const [crowded, setCrowded] = useState(false)
    useEffect(() => {
        if (!waiting) {
            setCrowded(false)
            return undefined
        }
        let live = true
        const timer = setTimeout(async () => {
            const otherTabs = await countOtherTabs()
            if (live) setCrowded(isCrowded({ otherTabs }))
        }, stallMs)
        return () => {
            live = false
            clearTimeout(timer)
        }
    }, [waiting, stallMs])
    return crowded
}
