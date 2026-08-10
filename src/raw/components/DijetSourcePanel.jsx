import { useCallback, useEffect, useRef, useState } from 'react'
import { DIJET_DEFAULT_HOST, DIJET_STATUS, useDijet } from '../utils/dijetCapture.js'

const STATUS_MESSAGE = {
    [DIJET_STATUS.IDLE]: 'Not connected. Give it the robot’s address to start.',
    [DIJET_STATUS.CONNECTING]: 'Reaching the robot…',
    // Being blunt about the usual cause: the robot serves its own wifi and has
    // no internet, so a browser on any other network cannot see it at all.
    [DIJET_STATUS.UNREACHABLE]: 'No answer. This page has to be on the same network as the robot — its own wifi, or a mesh routed to it.'
}

const fmt = (v, unit, digits = 2) =>
    (typeof v === 'number' && Number.isFinite(v)) ? `${v.toFixed(digits)} ${unit}` : '—'

export default function DijetSourcePanel({ node, values, onSignalChange, onConfigChange }) {
    const host = values?.host ?? node.values?.host ?? DIJET_DEFAULT_HOST
    const [draft, setDraft] = useState(host)
    useEffect(() => { setDraft(host) }, [host])

    const [seen, setSeen] = useState({})
    // `trigger` is declared `signal`, and the runtime computes no signal
    // outputs — so it carries a monotonically rising count, the same idiom as
    // device.midi.in and time.beat. A consumer sees an event because the
    // number changed, not by catching a pulse between frames.
    const triggerRef = useRef(0)

    const handleSample = useCallback((sample) => {
        triggerRef.current += 1
        setSeen((prev) => ({ ...prev, ...sample }))
        onSignalChange?.(node.id, { ...sample, trigger: triggerRef.current })
    }, [node.id, onSignalChange])

    const { status, last } = useDijet({ host, onSample: handleSample })

    useEffect(() => () => onSignalChange?.(node.id, null), [node.id, onSignalChange])

    const commit = () => {
        const next = draft.trim()
        if (next !== host) onConfigChange?.(node.id, { host: next })
    }

    const showStatus = status !== DIJET_STATUS.ACTIVE

    return (
        <div className="raw-dijet-panel">
            {showStatus && (
                <div className="raw-dijet-panel-status" role="status">
                    {STATUS_MESSAGE[status]}
                </div>
            )}

            <label className="raw-dijet-panel-field">
                <span className="raw-dijet-panel-label">Robot</span>
                <input
                    className="raw-dijet-panel-input"
                    value={draft}
                    spellCheck={false}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commit}
                    onKeyDown={(event) => { if (event.key === 'Enter') commit() }}
                />
            </label>

            <dl className="raw-dijet-panel-readout">
                <dt>Nearest</dt>
                <dd>{fmt(last?.nearest ?? seen.nearest, 'm')}</dd>
                <dt>Battery</dt>
                <dd>{fmt(last?.battery ?? seen.battery, 'V')}</dd>
                <dt>Speed</dt>
                <dd>{fmt(last?.speed ?? seen.speed, 'm/s')}</dd>
            </dl>

            <div className="raw-dijet-panel-note">
                Reads only — this node never drives the robot.
            </div>
        </div>
    )
}
