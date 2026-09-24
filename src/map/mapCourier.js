import { useCallback, useEffect, useRef } from 'react'

// THE COURIER between windows on one machine.
//
// The op layer already syncs the output window, but it round-trips through the
// server and coalesces at 50ms, and dragging a corner — or taking a cue —
// while watching the wall is the interaction where that delay is the whole
// experience. Same-origin windows on one machine get the change immediately;
// the op layer still carries it to disk, and to any window that is not on this
// machine. The channel is a courier, never the record — an output window that
// never hears it is late, not wrong.
//
// It lives in its own file because the mapper is no longer the only tool that
// writes to a mapping: the 3D scene fires cues too, and a cue taken there has
// to reach the wall as fast as one taken at the mapper's own desk.
export const mapChannelName = (projectId) => `di-map-${projectId}`

export function useMapOpCourier(projectId, applyLocalOps) {
    const channelRef = useRef(null)

    useEffect(() => {
        if (!projectId || typeof BroadcastChannel === 'undefined') return undefined
        const channel = new BroadcastChannel(mapChannelName(projectId))
        channelRef.current = channel
        return () => {
            channelRef.current = null
            channel.close()
        }
    }, [projectId])

    return useCallback((ops) => {
        const list = Array.isArray(ops) ? ops : [ops]
        if (!list.length) return
        applyLocalOps(list)
        channelRef.current?.postMessage({ kind: 'ops', ops: list })
    }, [applyLocalOps])
}
