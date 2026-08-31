import { useEffect, useMemo, useRef, useState } from 'react'
import {
    RIG_STATUS,
    createThrottledSender,
    isRigBlocked,
    readRigStatus,
    rigBaseUrl,
    sendRigCommand,
    toDmxByte,
} from '../utils/dmxRigClient.js'

const POLL_MS = 3000

// Module-level, not an inline default: the editor re-renders constantly, and a
// fresh arrow per render in the poll effect's dependencies restarts the poll
// on every one of them — the panel then says "Looking…" for ever while the
// rig answers behind its back (the keeper's inline-arrow lesson, seen live).
const defaultFetch = (...args) => fetch(...args)

// The graph's hand on a lighting rig — a vizzz node on the LAN, spoken to
// over its own HTTP routes. The MIDI Out contract, worn by DMX: levels go
// out when a number CHANGES, nothing is sent for a value that merely keeps
// being itself, and Status is the honest meter.
export default function DmxOutPanelWindow({
    node,
    values,
    onStatus,
    onConfigChange,
    fetchImpl = defaultFetch,
    pageProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:',
}) {
    const host = values?.host ?? node.values?.host ?? ''
    const base = rigBaseUrl(host)
    const blocked = isRigBlocked(base, pageProtocol)
    const live = Boolean(base) && !blocked

    const [rig, setRig] = useState({ status: base ? RIG_STATUS.CHECKING : RIG_STATUS.UNSET, name: '', universe: 0 })

    // Same defence against a caller's inline arrow: the poll depends on the
    // host, never on the function's identity.
    const fetchRef = useRef(fetchImpl)
    useEffect(() => { fetchRef.current = fetchImpl })

    // Poll /status — the one route whose answer the page may read. The poll is
    // the truth about reachability; commands below are fire-and-forget.
    useEffect(() => {
        if (!base) { setRig({ status: RIG_STATUS.UNSET, name: '', universe: 0 }); return undefined }
        if (blocked) { setRig({ status: RIG_STATUS.BLOCKED, name: '', universe: 0 }); return undefined }
        let alive = true
        setRig({ status: RIG_STATUS.CHECKING, name: '', universe: 0 })
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        const look = async () => {
            const result = await readRigStatus(base, { fetchImpl: fetchRef.current, signal: controller?.signal })
            if (!alive) return
            setRig(result.ok
                ? { status: RIG_STATUS.ANSWERING, name: result.name, universe: result.universe }
                : { status: RIG_STATUS.UNREACHABLE, name: '', universe: 0 })
        }
        look()
        const timer = setInterval(look, POLL_MS)
        return () => {
            alive = false
            clearInterval(timer)
            controller?.abort()
        }
    }, [base, blocked])

    const statusText = useMemo(() => {
        if (rig.status === RIG_STATUS.UNSET) return 'No rig named'
        if (rig.status === RIG_STATUS.BLOCKED) return 'A https page cannot reach a http rig — open the local editor'
        if (rig.status === RIG_STATUS.CHECKING) return `Looking for ${host}…`
        if (rig.status === RIG_STATUS.ANSWERING) {
            return `Sending to ${rig.name || host} (universe ${rig.universe})`
        }
        return `No answer from ${host}`
    }, [rig, host])

    // The parent passes an inline arrow; held in a ref so the unmount cleanup
    // depends only on node.id (the keeper's abort lesson).
    const onStatusRef = useRef(onStatus)
    useEffect(() => { onStatusRef.current = onStatus })
    useEffect(() => {
        onStatusRef.current?.(node.id, statusText)
    }, [node.id, statusText])
    useEffect(() => () => {
        onStatusRef.current?.(node.id, null)
    }, [node.id])

    const send = useRef(null)
    if (send.current === null || send.current.base !== base) {
        send.current?.master.cancel()
        send.current?.level.cancel()
        const out = (path) => sendRigCommand(base, path, { fetchImpl: fetchRef.current })
        send.current = {
            base,
            out,
            // One throttle per lane: an oscillator on Value must not starve
            // Master, and neither may hammer an ESP32 at frame rate.
            master: createThrottledSender(out, 100),
            level: createThrottledSender(out, 100),
        }
    }
    useEffect(() => () => {
        send.current?.master.cancel()
        send.current?.level.cancel()
    }, [])

    const master = values?.master
    const lastMaster = useRef(master)
    useEffect(() => {
        const was = lastMaster.current
        lastMaster.current = master
        if (!live || master === was || master === undefined || master === null) return
        send.current.master(`/master?v=${toDmxByte(master)}`)
    }, [live, master])

    const channel = Math.min(240, Math.max(1, Math.round(Number(values?.channel) || 1)))
    const value = values?.value
    const lastValue = useRef(value)
    useEffect(() => {
        const was = lastValue.current
        lastValue.current = value
        if (!live || value === was || value === undefined || value === null) return
        send.current.level(`/set?ch=${channel}&v=${toDmxByte(value)}`)
    }, [live, value, channel])

    // Rising edge kills the lights, immediately and unthrottled — and cancels
    // any queued level so a stale brightness cannot land after the blackout.
    const blackout = values?.blackout
    const lastBlackout = useRef(blackout)
    useEffect(() => {
        const was = lastBlackout.current
        lastBlackout.current = blackout
        if (!live || !blackout || Boolean(was)) return
        send.current.master.cancel()
        send.current.level.cancel()
        send.current.out('/blackout')
    }, [live, blackout])

    return (
        <div className="raw-dmx-panel">
            {rig.status === RIG_STATUS.UNSET && (
                <div className="raw-dmx-panel-setup">
                    Name the rig to light &mdash; a vizzz node on this network.
                </div>
            )}
            <label className="raw-dmx-panel-field">
                <span className="raw-dmx-panel-label">Host</span>
                <input
                    className="raw-dmx-panel-input"
                    type="text"
                    value={host}
                    placeholder="192.168.1.40"
                    onChange={(event) => onConfigChange?.(node.id, { host: event.target.value })}
                />
            </label>
            <div className="raw-dmx-panel-status" role="status">{statusText}</div>
        </div>
    )
}
