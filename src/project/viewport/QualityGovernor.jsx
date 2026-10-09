import { useEffect, useRef } from 'react'
import { useFrame, useStore, useThree } from '@react-three/fiber'
import { useRenderDemand } from '../../studio/utils/renderDemand.jsx'
import { hazeUniformsFor } from '../../objectComponents/hazeUniforms.js'
import { setBloomAllowed } from '../../objectComponents/atmosphereStore.js'
import { HITCH_MS, QUALITY_STEPS, RAISE_FPS, WARMUP_MS, WINDOW_MS, cappedDpr, mayRaiseTo, nextQuality, qualityDpr } from './qualityGovernor.js'

// The frame-rate governor (qualityGovernor.js) at work in a room with a physical haze:
// counts frames, decides a notch every WINDOW_MS, and applies it — the beams' sample
// count (a shared uniform: no recompile), the drawing resolution (R3F's setDpr), and
// whether bloom runs (HdrBloom reads it). Idle in a headset (the XR frame rate is the
// headset's) and under an on-demand frame loop (frames there are not a rate).
// The notch is on the canvas as data-quality, for a person or a probe to read.
export default function QualityGovernor({ renderSettings }) {
    const { gl, viewport } = useThree()
    const store = useStore()
    const frameloop = useThree((s) => s.frameloop)
    const level = useRef(0)
    const cap = useRef(Infinity)
    const tooSlowAt = useRef({})
    const win = useRef({ start: 0, frames: 0, goodSince: 0, born: 0, last: 0 })
    const deviceDpr = useRef(viewport.initialDpr || viewport.dpr || 1)

    const apply = (n) => {
        const step = QUALITY_STEPS[n]
        hazeUniformsFor(gl).uSamples.value = step.samples
        setBloomAllowed(gl, step.bloom)
        cap.current = qualityDpr(n, renderSettings, deviceDpr.current)
        store.getState().setDpr(cap.current)
        gl.domElement.dataset.quality = String(n)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at the room's full quality
    useEffect(() => { apply(0) }, [gl])
    // Hold R3F's own re-apply of the Canvas `dpr` under the notch (cappedDpr).
    useEffect(() => {
        const setDpr = store.getState().setDpr
        store.setState({ setDpr: (dpr) => setDpr(cappedDpr(dpr, cap.current, window.devicePixelRatio || 1)) })
        return () => store.setState({ setDpr })
    }, [store])
    // Leaving the room: the next one starts at full quality.
    useEffect(() => () => {
        hazeUniformsFor(gl).uSamples.value = QUALITY_STEPS[0].samples
        setBloomAllowed(gl, true)
    }, [gl])

    // Studio's on-demand loop: quality may drop only while the picture is moving. When a burst
    // ends (the loop is about to go idle), put full quality back and draw ONE final frame at it
    // (progressive refinement), so a scene at rest looks the same as a fresh load.
    const demand = useRenderDemand()
    useEffect(() => {
        if (!demand) return undefined
        let timer = null
        const off = demand.subscribe(() => {
            if (demand.isActive() || level.current === 0) return
            level.current = 0
            apply(0)
            const w = win.current
            w.start = 0; w.frames = 0; w.goodSince = 0; w.last = 0
            clearTimeout(timer)
            timer = setTimeout(() => store.getState().invalidate(), 120)
        })
        return () => { off(); clearTimeout(timer) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [demand, gl])

    useFrame(() => {
        if (gl.xr.isPresenting || frameloop !== 'always') return
        const now = performance.now()
        const w = win.current
        if (!w.born) w.born = now
        const gap = w.last ? now - w.last : 0
        w.last = now
        // warming up (compiles, uploads), or a hitch: start the window again
        if (now - w.born < WARMUP_MS || gap > HITCH_MS) { w.start = now; w.frames = 0; return }
        if (!w.start) { w.start = now; w.frames = 0; return }
        w.frames += 1
        const elapsed = now - w.start
        if (elapsed < WINDOW_MS) return
        const fps = (w.frames * 1000) / elapsed
        if (fps > RAISE_FPS) { if (!w.goodSince) w.goodSince = now } else w.goodSince = 0
        let next = nextQuality(level.current, fps, w.goodSince ? now - w.goodSince : 0)
        if (next > level.current) tooSlowAt.current[level.current] = now
        if (next < level.current && !mayRaiseTo(next, tooSlowAt.current, now)) next = level.current
        if (next !== level.current) {
            level.current = next
            apply(next)
            w.goodSince = 0
        }
        w.start = now
        w.frames = 0
    })
    return null
}
