import { useEffect, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry } from 'three'
import { laserApiBase } from '../raw/utils/dmxRigClient.js'
import { laserCubesOf, laserSegments } from './laserView.js'

// The room's laser view (laserView.js): while the room holds LaserCubes, the frames the laser server
// keeps (GET /laser/api/frames) are drawn as beams from each cube. Only a server that has the lasers
// answers (a local install; a hosted tier is 404): no answer, nothing drawn, and the next try waits
// ABSENT_RETRY_MS, as the desk mirror does for an absent desk.
const POLL_MS = 80
const ABSENT_RETRY_MS = 30000

export const useLaserFrames = (enabled, { fetchImpl = (...a) => fetch(...a), base = laserApiBase() } = {}) => {
    const [frames, setFrames] = useState(null)
    useEffect(() => {
        if (!enabled) { setFrames(null); return undefined }
        let alive = true
        let timer = null
        let last = ''
        const step = async () => {
            let wait = POLL_MS
            try {
                const res = await fetchImpl(`${base}/frames`, { cache: 'no-store' })
                const body = res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null
                if (!body) { wait = ABSENT_RETRY_MS; if (alive) setFrames(null) } else {
                    const key = JSON.stringify([body.all, body.byCube])
                    if (alive && key !== last) { last = key; setFrames(body) }
                }
            } catch { wait = ABSENT_RETRY_MS; if (alive) setFrames(null) }
            if (alive) timer = setTimeout(step, wait)
        }
        step()
        return () => { alive = false; clearTimeout(timer) }
    }, [enabled, fetchImpl, base])
    return frames
}

export default function LaserView({ entities }) {
    const hasCubes = useMemo(() => laserCubesOf(entities || []).length > 0, [entities])
    const frames = useLaserFrames(hasCubes)
    const geometry = useRef(new BufferGeometry())
    const segments = useMemo(() => laserSegments(entities || [], frames), [entities, frames])
    useEffect(() => {
        const g = geometry.current
        g.setAttribute('position', new BufferAttribute(segments.positions, 3))
        g.setAttribute('color', new BufferAttribute(segments.colors, 3))
        g.computeBoundingSphere()
    }, [segments])
    useEffect(() => () => geometry.current.dispose(), [])
    if (!hasCubes || !segments.count) return null
    return (
        <lineSegments geometry={geometry.current} frustumCulled={false} renderOrder={10}>
            <lineBasicMaterial vertexColors transparent opacity={0.3} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </lineSegments>
    )
}
