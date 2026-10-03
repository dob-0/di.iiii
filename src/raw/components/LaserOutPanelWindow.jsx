import { useEffect, useMemo, useRef, useState } from 'react'
import {
    LASER_STATUS,
    laserApiBase,
    laserStatusText,
    readLaserPreview,
    readLaserState,
    sendLaserOff,
    sendLaserUpdate,
} from '../utils/laserClient.js'

// Half a second: well inside the lane's 3 s dead-man, and a look that changes on a
// wire reaches the cube within one beat.
const BEAT_MS = 500
const POLL_MS = 1000
// The picture: 10 frames a second is enough to watch a shape turn.
const PREVIEW_MS = 100

const defaultFetch = (...args) => fetch(...args)

// The graph's hand on a LaserCube — this di.iiii's own server draws the look it is
// given (serverXR/src/lighting/laser). The rules the panel keeps:
//   - ON only by a click or by a wire changing. Opening a saved project never
//     switches a laser on, whatever the project last did.
//   - While the panel is open it says so every half second; close it (or the tab, or
//     the laptop sleeps) and the server switches the cube off within 3 s by itself.
//   - Blackout wins over everything and turns the cube off.
export default function LaserOutPanelWindow({
    node,
    values,
    onStatus,
    onConfigChange,
    fetchImpl = defaultFetch,
    pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
}) {
    const host = String(values?.host ?? node.values?.host ?? '192.168.1.1')
    const rate = Number(values?.rate ?? node.values?.rate ?? 30000)
    const look = values?.look && typeof values.look === 'object' ? values.look : null
    const base = useMemo(() => laserApiBase(pageOrigin), [pageOrigin])

    const fetchRef = useRef(fetchImpl)
    useEffect(() => { fetchRef.current = fetchImpl })

    const [lane, setLane] = useState({ status: LASER_STATUS.CHECKING, state: null })
    const [error, setError] = useState('')
    // What this page wants. Starts OFF on every mount.
    const wantOn = useRef(false)
    const [wantOnView, setWantOnView] = useState(false)
    const setWant = (on) => { wantOn.current = on; setWantOnView(on) }

    // The latest settings, read by the beat without restarting it.
    const latest = useRef({ host, rate, look })
    useEffect(() => { latest.current = { host, rate, look } })

    const push = async (extra = {}) => {
        const { host: ip, rate: r, look: l } = latest.current
        const body = { ip, rate: r, ...(l ? { look: l } : {}), ...extra }
        const result = await sendLaserUpdate(base, body, { fetchImpl: fetchRef.current })
        if (result.state) setLane({ status: LASER_STATUS.ANSWERING, state: result.state })
        else setLane((prev) => ({ status: result.status, state: prev.state }))
        setError(result.ok ? '' : result.error)
        return result
    }

    // Read once on mount — asking never builds the lane — then poll.
    useEffect(() => {
        let alive = true
        const look = async () => {
            const result = await readLaserState(base, { fetchImpl: fetchRef.current })
            if (alive) setLane(result)
        }
        look()
        const timer = setInterval(look, POLL_MS)
        return () => { alive = false; clearInterval(timer) }
    }, [base])

    // The beat: only while this page wants the laser on. When it stops, the lane's
    // dead-man takes the cube off.
    useEffect(() => {
        if (!wantOnView) return undefined
        const timer = setInterval(() => { push() }, BEAT_MS)
        return () => clearInterval(timer)
        // push reads `latest`; restarting on every value would only add requests
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wantOnView, base])

    // Closing the panel switches the cube off now, not 3 s from now.
    useEffect(() => () => {
        if (wantOn.current) sendLaserOff(base, { fetchImpl: fetchRef.current })
    }, [base])

    const switchOn = () => { setWant(true); push({ on: true }) }
    const switchOff = () => { setWant(false); push({ on: false }) }

    // A wire on On: its rising edge switches on, its falling edge off. Its first value
    // (the project opening) does nothing.
    const onInput = values?.on
    const lastOn = useRef(onInput)
    useEffect(() => {
        const was = lastOn.current
        lastOn.current = onInput
        if (Boolean(onInput) === Boolean(was)) return
        if (onInput) switchOn()
        else switchOff()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onInput])

    const blackout = Boolean(values?.blackout)
    useEffect(() => {
        if (blackout && wantOn.current) switchOff()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blackout])

    const statusText = laserStatusText(lane.status, lane.state)
    const onStatusRef = useRef(onStatus)
    useEffect(() => { onStatusRef.current = onStatus })
    useEffect(() => { onStatusRef.current?.(node.id, statusText) }, [node.id, statusText])
    useEffect(() => () => { onStatusRef.current?.(node.id, null) }, [node.id])

    // The picture of what is drawn: lit points as lines, blank moves as a faint dash.
    const canvasRef = useRef(null)
    const startedAt = useRef(0)
    useEffect(() => {
        if (lane.status !== LASER_STATUS.ANSWERING) return undefined
        if (!startedAt.current) startedAt.current = Date.now()
        let alive = true
        const draw = async () => {
            const points = await readLaserPreview(base, latest.current.look, (Date.now() - startedAt.current) / 1000, { fetchImpl: fetchRef.current })
            const canvas = canvasRef.current
            if (!alive || !points || !canvas) return
            const ctx = canvas.getContext('2d')
            const w = canvas.width
            const h = canvas.height
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, w, h)
            ctx.strokeStyle = 'rgba(255,255,255,0.08)'
            ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
            const at = ([x, y]) => [(x + 1) * 0.5 * (w - 8) + 4, (1 - (y + 1) * 0.5) * (h - 8) + 4]
            ctx.lineWidth = 2
            for (let i = 1; i < points.length; i++) {
                const [r, g, b] = points[i].slice(2)
                const litPoint = r + g + b > 0
                const [x0, y0] = at(points[i - 1])
                const [x1, y1] = at(points[i])
                ctx.strokeStyle = litPoint
                    ? `rgb(${Math.round(Math.min(1, r * 2) * 255)},${Math.round(Math.min(1, g * 2) * 255)},${Math.round(Math.min(1, b * 2) * 255)})`
                    : 'rgba(255,255,255,0.06)'
                ctx.beginPath()
                ctx.moveTo(x0, y0)
                ctx.lineTo(x1, y1)
                ctx.stroke()
            }
        }
        draw()
        const timer = setInterval(draw, PREVIEW_MS)
        return () => { alive = false; clearInterval(timer) }
    }, [lane.status, base])

    const isOn = Boolean(lane.state?.on)
    const usable = lane.status === LASER_STATUS.ANSWERING || lane.status === LASER_STATUS.CHECKING

    return (
        <div className="raw-dmx-panel raw-laser-panel">
            <button
                type="button"
                className={`raw-laser-panel-switch${isOn ? ' is-on' : ''}`}
                disabled={!usable || (blackout && !isOn)}
                onClick={() => (isOn || wantOnView ? switchOff() : switchOn())}
                aria-pressed={isOn}
            >
                {isOn ? 'LASER ON — click for OFF' : 'Laser off — click for ON'}
            </button>
            <canvas
                ref={canvasRef}
                className="raw-laser-panel-preview"
                width={320}
                height={200}
                aria-label="What the laser draws"
            />
            <div className="raw-dmx-panel-status" role="status">{statusText}</div>
            {error && <div className="raw-dmx-panel-setup">{error}</div>}
            {!look && (
                <div className="raw-dmx-panel-setup">
                    Nothing on Look — it draws a small green circle. Wire a Laser node into Look.
                </div>
            )}
            <label className="raw-dmx-panel-field">
                <span className="raw-dmx-panel-label">Cube IP</span>
                <input
                    className="raw-dmx-panel-input"
                    type="text"
                    value={host}
                    placeholder="192.168.1.1"
                    onChange={(event) => onConfigChange?.(node.id, { host: event.target.value.trim() })}
                />
            </label>
            <label className="raw-dmx-panel-field">
                <span className="raw-dmx-panel-label">Rate (pps)</span>
                <input
                    className="raw-dmx-panel-input"
                    type="number"
                    min={1000}
                    max={40000}
                    step={500}
                    value={rate}
                    onChange={(event) => onConfigChange?.(node.id, { rate: Number(event.target.value) })}
                />
            </label>
            {isOn && lane.state && (
                <div className="raw-dmx-panel-setup">
                    Frames {lane.state.frames} · skipped {lane.state.framesSkipped} · buffer free {lane.state.bufferFree}
                </div>
            )}
            <div className="raw-dmx-panel-setup">
                OFF tells the cube to stop. Keep this tab in front during a show: if the page goes
                quiet for 3 s the server switches the cube off by itself. A person on the cube&rsquo;s
                power is still the last stop.
            </div>
        </div>
    )
}
