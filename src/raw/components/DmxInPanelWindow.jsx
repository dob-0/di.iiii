import { useEffect, useMemo, useRef, useState } from 'react'
import {
    DESK_ABSENT_TEXT,
    DESK_FORBIDDEN_TEXT,
    DESK_NOT_RUNNING_TEXT,
    DESK_STATUS,
    deskApiBase,
    deskHomeUrl,
} from '../utils/dmxRigClient.js'
import {
    deskUniverseOf,
    dmxChannelOf,
    dmxInStateText,
    levelOf,
    readDeskInputLevels,
} from '../utils/oscBridgeClient.js'

// 50 ms, twenty reads a second: the desk's own input runs at the console's rate
// (an Art-Net console sends up to 44 frames a second), and this poll is the
// latency a fader on the console reaches the graph with.
export const DMX_IN_POLL_MS = 50

const defaultFetch = (...args) => fetch(...args)

// The graph's ear on a lighting console. The console sends Art-Net or sACN to
// this di.iiii's lighting desk (Setup → Input there); this panel reads one
// channel of one universe from the desk and hands the graph a 0..1 Value. On
// loss of signal Value HOLDS the last level it read — a fader does not drop to
// zero because a cable was pulled — and Status says so.
export default function DmxInPanelWindow({
    node,
    values,
    onLevelChange,
    fetchImpl = defaultFetch,
    pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
    pollMs = DMX_IN_POLL_MS,
}) {
    const universe = Math.max(1, Math.round(Number(values?.universe) || 1))
    const channel = dmxChannelOf(values?.channel)
    const deskBase = useMemo(() => deskApiBase(pageOrigin), [pageOrigin])

    const [read, setRead] = useState({ status: DESK_STATUS.CHECKING, state: '', value: null, held: null })
    // The held value outlives a change of universe or channel on purpose: the
    // graph keeps the last thing it was told until something new is read.
    const held = useRef(null)

    const fetchRef = useRef(fetchImpl)
    useEffect(() => { fetchRef.current = fetchImpl })
    const reportRef = useRef(onLevelChange)
    useEffect(() => { reportRef.current = onLevelChange })

    useEffect(() => {
        let alive = true
        let timer = null
        let shown = ''
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        const look = async () => {
            const result = await readDeskInputLevels(deskBase, deskUniverseOf(universe), { fetchImpl: fetchRef.current, signal: controller?.signal })
            if (!alive) return
            const value = result.levels ? levelOf(result.levels, channel) : null
            if (value !== null) held.current = value
            const key = `${result.status}|${result.state || ''}|${value}`
            if (key !== shown) {
                shown = key
                setRead({ status: result.status, state: result.state || '', value, held: held.current })
            }
            timer = setTimeout(look, pollMs)
        }
        look()
        return () => { alive = false; clearTimeout(timer); controller?.abort() }
    }, [deskBase, universe, channel, pollMs])

    const statusText = useMemo(() => {
        if (read.status === DESK_STATUS.ABSENT) return DESK_ABSENT_TEXT
        if (read.status === DESK_STATUS.FORBIDDEN) return DESK_FORBIDDEN_TEXT
        if (read.status === DESK_STATUS.UNREACHABLE) return DESK_NOT_RUNNING_TEXT
        if (read.status === DESK_STATUS.CHECKING) return 'Looking for the lighting desk…'
        return dmxInStateText({ state: read.state, universe, channel, value: read.value, held: read.held })
    }, [read, universe, channel])

    const value = read.value ?? read.held ?? 0
    useEffect(() => {
        reportRef.current?.(node.id, { value, status: statusText })
    }, [node.id, value, statusText])
    useEffect(() => () => { reportRef.current?.(node.id, null) }, [node.id])

    return (
        <div className="raw-dmx-panel">
            <div className="raw-dmx-panel-setup">
                Universe {universe}, channel {channel} of this di.iiii&rsquo;s lighting desk input.
            </div>
            <div className="raw-dmx-panel-status" role="status">{statusText}</div>
            <a
                className="raw-dmx-panel-status raw-dmx-panel-link"
                href={deskHomeUrl(pageOrigin)}
                target="_blank"
                rel="noreferrer"
            >
                Open the desk &rarr;
            </a>
        </div>
    )
}
