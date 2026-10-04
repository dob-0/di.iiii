import { useEffect, useMemo, useRef, useState } from 'react'
import { ALL_CUBES, normaliseFramePoints } from '../../shared/laserFrame.js'
import { createThrottledSender, laserApiBase } from '../utils/dmxRigClient.js'

const POLL_MS = 3000
// 25 frames a second at most: a cube cannot show more, and the server should
// not be asked for more.
const SEND_MS = 40
const PREVIEW_PX = 240

// Module-level for the DMX panel's reason: a fresh arrow per render would
// restart the poll on every render.
const defaultFetch = (...args) => fetch(...args)

const SERVER = {
    CHECKING: 'checking',
    ANSWERING: 'answering',
    ABSENT: 'absent',
    FORBIDDEN: 'forbidden',
    UNREACHABLE: 'unreachable',
}

const answeredJson = (res) => /^application\/json\b/i.test(res?.headers?.get?.('content-type') || '')

// 404 and a non-JSON 200 (a hosted edge answering with the app's own page) both
// mean no laser server here; 403 is the local-machine-only rule.
const readLaserState = async (base, { fetchImpl, signal }) => {
    try {
        const res = await fetchImpl(`${base}/state`, { signal })
        if (res?.status === 404) return { status: SERVER.ABSENT }
        if (res?.status === 403) return { status: SERVER.FORBIDDEN }
        if (!res?.ok) return { status: SERVER.UNREACHABLE }
        if (!answeredJson(res)) return { status: SERVER.ABSENT }
        const state = await res.json()
        if (!state || typeof state.armed !== 'boolean') return { status: SERVER.UNREACHABLE }
        return { status: SERVER.ANSWERING, state }
    } catch {
        return { status: SERVER.UNREACHABLE }
    }
}

const postJson = (base, path, body, fetchImpl) => {
    try {
        const sent = fetchImpl(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        // Fire and forget: the poll is the truth about the server.
        sent?.catch?.(() => {})
    } catch { /* the poll reports it */ }
}

const lit = (p) => p[2] + p[3] + p[4] > 0

const drawPreview = (canvas, points) => {
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return
    const size = canvas.width
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    // The server's keep-in zone (serverXR/src/laser/laserEngine.js, default y ≥ 0): below the
    // cube's own aim a point is blanked, so that half is shaded and its edge marked — a shape
    // drawn there is cut, by design (no beam may aim lower than the cube, toward the crowd).
    ctx.fillStyle = 'rgba(255, 60, 60, 0.12)'
    ctx.fillRect(0, size / 2, size, size / 2)
    ctx.strokeStyle = 'rgba(255, 90, 90, 0.7)'
    ctx.lineWidth = 1
    ctx.setLineDash?.([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, size / 2)
    ctx.lineTo(size, size / 2)
    ctx.stroke()
    ctx.setLineDash?.([])
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    const px = (v) => ((v + 1) / 2) * size
    const py = (v) => ((1 - v) / 2) * size
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]
        const b = points[i]
        // A blank move is the beam travelling dark: not drawn.
        if (!lit(a) || !lit(b)) continue
        ctx.strokeStyle = `rgb(${Math.round(b[2] * 255)}, ${Math.round(b[3] * 255)}, ${Math.round(b[4] * 255)})`
        ctx.beginPath()
        ctx.moveTo(px(a[0]), py(a[1]))
        ctx.lineTo(px(b[0]), py(b[1]))
        ctx.stroke()
    }
}

const cubesText = (state) => {
    const cubes = Array.isArray(state?.cubes) ? state.cubes : []
    const connected = cubes.filter((cube) => cube?.connected).length
    return `${cubes.length} cube${cubes.length === 1 ? '' : 's'}, ${connected} connected`
}

// The graph's hand on the LaserCubes, by way of this di.iiii's own server. It
// draws the frame it is given so you can see the shape, sends it when it
// CHANGES (paced), and says plainly whether the server is armed — a disarmed
// server sends nothing to the cubes.
export default function LaserOutPanelWindow({
    node,
    values,
    onStatus,
    fetchImpl = defaultFetch,
    pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
}) {
    const base = useMemo(() => laserApiBase(pageOrigin), [pageOrigin])
    const fetchRef = useRef(fetchImpl)
    useEffect(() => { fetchRef.current = fetchImpl })

    const [server, setServer] = useState({ status: SERVER.CHECKING, state: null })
    useEffect(() => {
        let alive = true
        setServer({ status: SERVER.CHECKING, state: null })
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        const look = async () => {
            const result = await readLaserState(base, { fetchImpl: fetchRef.current, signal: controller?.signal })
            if (!alive) return
            setServer({ status: result.status, state: result.state ?? null })
        }
        look()
        const timer = setInterval(look, POLL_MS)
        return () => {
            alive = false
            clearInterval(timer)
            controller?.abort()
        }
    }, [base])

    // The frame, cleaned the way the server will clean it. The wire hands a new
    // object every evaluation, so "changed" is judged by content.
    const raw = values?.frame
    const points = useMemo(
        () => normaliseFramePoints(Array.isArray(raw) ? raw : raw?.points).points,
        [raw]
    )
    const pointsKey = useMemo(() => JSON.stringify(points), [points])
    const cube = String(values?.cube ?? '').trim() || ALL_CUBES
    const blackout = Boolean(values?.blackout)

    const canvasRef = useRef(null)
    useEffect(() => {
        drawPreview(canvasRef.current, points)
        // pointsKey, not points: same content, same picture.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pointsKey])

    const send = useRef(null)
    if (send.current === null || send.current.base !== base) {
        send.current = {
            base,
            frame: createThrottledSender((body) => postJson(base, '/frame', body, fetchRef.current), SEND_MS),
        }
    }
    useEffect(() => {
        const mine = send.current
        return () => mine?.frame.cancel()
    }, [base])

    // Frames go out when they change, and not at all while Blackout is held.
    // When it lets go the standing frame goes out again.
    useEffect(() => {
        if (blackout || points.length === 0) return
        send.current.frame({ cube, points })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pointsKey, cube, blackout, base])

    // Rising edge: blackout at once, ahead of any queued frame.
    const lastBlackout = useRef(false)
    useEffect(() => {
        const was = lastBlackout.current
        lastBlackout.current = blackout
        if (!blackout || was) return
        send.current.frame.cancel()
        postJson(base, '/blackout', {}, fetchRef.current)
    }, [blackout, base])

    const armed = server.status === SERVER.ANSWERING ? server.state.armed : null
    const statusText = useMemo(() => {
        if (server.status === SERVER.ABSENT) return 'The laser server lives on a local di.iiii — run di up or npm run dev'
        if (server.status === SERVER.FORBIDDEN) return 'The laser server answers a browser on its own machine only'
        if (server.status === SERVER.UNREACHABLE) return 'No answer from the laser server'
        if (server.status === SERVER.CHECKING) return 'Looking for the laser server…'
        const state = server.state
        return `${state.armed ? 'Armed' : 'Disarmed — lasers off'}: ${cubesText(state)}${state.sim ? ', simulated' : ''}`
    }, [server])

    const onStatusRef = useRef(onStatus)
    useEffect(() => { onStatusRef.current = onStatus })
    useEffect(() => {
        onStatusRef.current?.(node.id, statusText)
    }, [node.id, statusText])
    useEffect(() => () => {
        onStatusRef.current?.(node.id, null)
    }, [node.id])

    return (
        <div className="raw-dmx-panel">
            <canvas
                ref={canvasRef}
                className="raw-laser-panel-canvas"
                width={PREVIEW_PX}
                height={PREVIEW_PX}
                aria-label="Preview of the laser frame"
            />
            {armed !== null && (
                <div className="raw-dmx-panel-status raw-laser-panel-armed" role="status">
                    {armed ? 'ARMED' : 'DISARMED'}
                </div>
            )}
            {armed === false && (
                <div className="raw-dmx-panel-setup">
                    Lasers off &mdash; disarmed on the server. The preview shows the shape; nothing reaches the cubes.
                </div>
            )}
            <div className="raw-dmx-panel-status">{statusText}</div>
            {server.status === SERVER.ANSWERING && server.state.sim && (
                <div className="raw-dmx-panel-setup">Simulated: no real cubes are being driven.</div>
            )}
        </div>
    )
}
