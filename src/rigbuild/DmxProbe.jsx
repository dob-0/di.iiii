import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { installVisProbe, visProbe } from './visProbe.js'

// THE VISUALISER'S STOPWATCH (RIG_BUILD.md §18.6) — inside the room's canvas, so the
// moment it records is a FRAME BEING DRAWN with the lamp already changed, not a React
// commit or a network event. Mounted beside the lamps' bodies; it does nothing unless
// the page asked for it (window.__diVis, set by the visualiser or ?probe=1): then it
// counts frames (fps) and resolves the harness's expectations — "lamp X's desk values
// satisfy P" — on the first frame that draws them, with a performance.mark.
export default function DmxProbe({ entities }) {
    const latest = useRef(entities)
    useEffect(() => { latest.current = entities }, [entities])
    useEffect(() => { installVisProbe() }, [])
    useFrame((state) => {
        const probe = visProbe()
        if (!probe) return
        probe.scene = state.scene // for a harness that must check what the renderer holds
        probe.frame(latest.current)
    })
    return null
}
