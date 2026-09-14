import { useEffect, useRef } from 'react'
import { formatPortValue } from '../../../project/graph/formatPortValue.js'

// A ten-second scope of what a node gives — a sine you can SEE is a sine,
// where a number flickering every eighth of a second is not. One 2D canvas, a
// ring of samples per output, pushed whenever the node is read (every frame
// while a clock runs, only on change otherwise — an idle desk costs nothing).
//
// Modes by port type: numbers draw lines, booleans and rising counts draw
// steps and ticks, colours draw a strip of their own history, vectors draw
// x, y and z. The readout under the canvas is the same values as text, so the
// scope is never the only way to read them.

export const SCOPE_WINDOW_MS = 10000
const MAX_SAMPLES = 600

export function pushSample(samples, t, value, windowMs = SCOPE_WINDOW_MS) {
    samples.push({ t, v: value })
    while (samples.length > MAX_SAMPLES || (samples.length > 1 && t - samples[0].t > windowMs)) samples.shift()
    return samples
}

const asNumber = (value) => {
    if (typeof value === 'boolean') return value ? 1 : 0
    const next = Number(value)
    return Number.isFinite(next) ? next : null
}

/** The vertical range a set of numeric traces needs, never flat. */
export function scopeRange(traces) {
    let min = Infinity
    let max = -Infinity
    for (const samples of traces) {
        for (const sample of samples) {
            const parts = Array.isArray(sample.v) ? sample.v : [sample.v]
            for (const part of parts) {
                const n = asNumber(part)
                if (n === null) continue
                if (n < min) min = n
                if (n > max) max = n
            }
        }
    }
    if (!Number.isFinite(min)) return { min: 0, max: 1 }
    if (max - min < 1e-6) return { min: min - 0.5, max: max + 0.5 }
    return { min, max }
}

const canDraw = () => typeof window !== 'undefined' && typeof window.WebGLRenderingContext !== 'undefined'

const TRACE_VARS = ['--raw-inside-trace-1', '--raw-inside-trace-2', '--raw-inside-trace-3', '--raw-inside-trace-4']

export default function InsideScope({ series = [], now = 0, label = 'scope' }) {
    const canvasRef = useRef(null)
    const buffersRef = useRef(new Map())

    const key = series.map((entry) => entry.id).join('|')
    useEffect(() => { buffersRef.current = new Map() }, [key])

    useEffect(() => {
        const t = typeof performance !== 'undefined' ? performance.now() : now
        for (const entry of series) {
            if (!buffersRef.current.has(entry.id)) buffersRef.current.set(entry.id, [])
            pushSample(buffersRef.current.get(entry.id), t, entry.value)
        }
        const canvas = canvasRef.current
        if (!canvas || !canDraw()) return
        const context = canvas.getContext('2d')
        if (!context) return
        const width = canvas.clientWidth || 320
        const height = canvas.clientHeight || 120
        const ratio = window.devicePixelRatio || 1
        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
            canvas.width = Math.round(width * ratio)
            canvas.height = Math.round(height * ratio)
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        context.clearRect(0, 0, width, height)
        const styles = getComputedStyle(canvas)
        const colours = TRACE_VARS.map((name) => styles.getPropertyValue(name).trim() || styles.color)
        const xOf = (sampleT) => width - ((t - sampleT) / SCOPE_WINDOW_MS) * width

        const colourSeries = series.filter((entry) => entry.type === 'color')
        const lineSeries = series.filter((entry) => entry.type !== 'color')
        const stripHeight = colourSeries.length ? Math.min(height, lineSeries.length ? height * 0.3 : height) : 0
        colourSeries.forEach((entry, index) => {
            const samples = buffersRef.current.get(entry.id) || []
            const bandH = stripHeight / colourSeries.length
            samples.forEach((sample, i) => {
                const next = samples[i + 1]
                if (typeof sample.v !== 'string') return
                context.fillStyle = sample.v
                const x0 = xOf(sample.t)
                const x1 = next ? xOf(next.t) : width
                context.fillRect(x0, index * bandH, Math.max(1, x1 - x0), bandH)
            })
        })

        const traces = []
        lineSeries.forEach((entry) => {
            const samples = buffersRef.current.get(entry.id) || []
            if (entry.type === 'vec3') {
                for (let axis = 0; axis < 3; axis += 1) traces.push({ samples: samples.map((s) => ({ t: s.t, v: Array.isArray(s.v) ? s.v[axis] : null })), step: false })
            } else {
                traces.push({ samples, step: entry.type === 'boolean' || entry.type === 'signal' })
            }
        })
        const { min, max } = scopeRange(traces.map((trace) => trace.samples))
        const top = stripHeight
        const span = height - stripHeight - 4
        const yOf = (value) => top + 2 + span - ((value - min) / (max - min)) * span
        traces.forEach((trace, index) => {
            context.strokeStyle = colours[index % colours.length]
            context.lineWidth = 1.5
            context.beginPath()
            let started = false
            let lastY = null
            for (const sample of trace.samples) {
                const n = asNumber(sample.v)
                if (n === null) { started = false; continue }
                const x = xOf(sample.t)
                const y = yOf(n)
                if (!started) { context.moveTo(x, y); started = true } else if (trace.step && lastY !== null) { context.lineTo(x, lastY); context.lineTo(x, y) } else { context.lineTo(x, y) }
                lastY = y
            }
            context.stroke()
        })
    })

    return (
        <div className="raw-inside-scope">
            <canvas ref={canvasRef} className="raw-inside-scope-canvas" role="img" aria-label={`${label}: the last ten seconds`} />
            <ul className="raw-inside-scope-readout">
                {series.map((entry) => {
                    const { text, swatch } = formatPortValue(entry.value, entry.type)
                    return (
                        <li key={entry.id}>
                            <span>{entry.label}</span>
                            <strong>
                                {swatch ? <i className="raw-inside-swatch" style={{ background: swatch }} aria-hidden="true" /> : null}
                                {text}
                            </strong>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
