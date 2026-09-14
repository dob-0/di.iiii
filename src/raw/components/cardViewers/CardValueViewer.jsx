import { useRef } from 'react'
import { useLiveOutput } from './useLiveOutput.js'
import { createValueHistory } from './valueHistory.js'
import Sparkline from './Sparkline.jsx'
import './cardViewers.css'

// TouchDesigner-style "you always see what you do", for the 38 number/
// logic/vector/colour types and every device the audit found silent
// (docs/ai/audits/2026-09-14-raw-nodes.md, cross-cutting defect #1). One
// viewer per card, below the ports, same slot rule as TopThumbnail and
// CardPreview — this never moves a port.
const formatNumber = (value) => {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return '—'
    const digits = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2
    return n.toFixed(digits)
}

const HEX_RE = /^#[0-9a-f]{3,8}$/i
const asHex = (value) => (typeof value === 'string' && HEX_RE.test(value) ? value : null)

export default function CardValueViewer({ node, port, kind, top, readOutput }) {
    const historyRef = useRef(null)
    if (!historyRef.current) historyRef.current = createValueHistory()

    const value = useLiveOutput(() => {
        const raw = typeof readOutput === 'function' && node?.id && port?.id
            ? readOutput(node.id, port.id)
            : undefined
        if (kind === 'number' || kind === 'signal') {
            historyRef.current.push(typeof raw === 'number' ? raw : Number(raw), Date.now())
        }
        return raw
    })

    const label = port?.label || port?.id || ''
    let body

    if (kind === 'number') {
        body = (
            <>
                <span className="raw-card-viewer-value">{formatNumber(value)}</span>
                <Sparkline values={historyRef.current.values()} />
            </>
        )
    } else if (kind === 'boolean') {
        const on = Boolean(value)
        body = (
            <span className={`raw-card-viewer-lamp${on ? ' is-on' : ''}`}>
                <span className="raw-card-viewer-lamp-dot" aria-hidden="true" />
                {on ? 'On' : 'Off'}
            </span>
        )
    } else if (kind === 'signal') {
        body = (
            <span className="raw-card-viewer-pulse">
                <span className="raw-card-viewer-pulse-tick" aria-hidden="true" />
                <span>{formatNumber(value)}</span>
            </span>
        )
    } else if (kind === 'color') {
        const hex = asHex(value) || '#000000'
        body = (
            <span className="raw-card-viewer-swatch-row">
                <span className="raw-card-viewer-swatch" style={{ background: hex }} aria-hidden="true" />
                <span className="raw-card-viewer-swatch-value">{hex}</span>
            </span>
        )
    } else if (kind === 'vec3') {
        const v = Array.isArray(value) ? value : [0, 0, 0]
        body = (
            <span className="raw-card-viewer-vec3">
                <span>{formatNumber(v[0])}</span>
                <span>{formatNumber(v[1])}</span>
                <span>{formatNumber(v[2])}</span>
            </span>
        )
    } else if (kind === 'string') {
        body = <span className="raw-card-viewer-text">{value ? String(value) : '—'}</span>
    } else if (kind === 'device') {
        // The status convention this codebase already uses (device.dmx.out,
        // device.midi.out, device.osc.out runtime.js): an unmounted panel
        // reports the empty string, which means "nothing to report yet", not
        // an error — so it reads as a neutral wait, never a fabricated state.
        let text
        if (typeof value === 'string') text = value || 'No report yet'
        else if (typeof value === 'boolean') text = `${label}: ${value ? 'on' : 'off'}`
        else if (typeof value === 'number') text = `${label}: ${formatNumber(value)}`
        else text = 'No report yet'
        body = <span className="raw-card-viewer-device">{text}</span>
    } else {
        return null
    }

    return (
        <div className={`raw-card-value-viewer raw-card-value-viewer--${kind}`} style={{ top }} aria-hidden="true">
            {body}
        </div>
    )
}
