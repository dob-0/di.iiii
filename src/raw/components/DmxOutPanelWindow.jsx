import { useEffect, useMemo, useRef, useState } from 'react'
import {
    DESK_ABSENT_TEXT,
    DESK_COMMANDS,
    DESK_FORBIDDEN_TEXT,
    DESK_STATUS,
    RIG_KINDS,
    RIG_STATUS,
    VIZZZ_COMMANDS,
    createThrottledSender,
    deskApiBase,
    deskHomeUrl,
    deskStatusText,
    isRigBlocked,
    readDeskScenes,
    readDeskSummary,
    readRigStatus,
    resolveRigKind,
    resolveSceneId,
    rigBaseUrl,
    sendDeskCommand,
    sendRigCommand,
    toDmxByte,
} from '../utils/dmxRigClient.js'

const POLL_MS = 3000

// Module-level, not an inline default: the editor re-renders constantly, and a
// fresh arrow per render in the poll effect's dependencies restarts the poll
// on every one of them — the panel then says "Looking…" for ever while the
// rig answers behind its back (the keeper's inline-arrow lesson, seen live).
const defaultFetch = (...args) => fetch(...args)

// The graph's hand on a lighting rig — either di.iiii's own lighting desk at
// /light (the default: the graph is a project, and the desk is where that
// project's rig lives) or a vizzz node on the LAN. The MIDI Out contract, worn
// by DMX: levels go out when a number CHANGES, nothing is sent for a value
// that merely keeps being itself, and Status is the honest meter.
export default function DmxOutPanelWindow({
    node,
    values,
    onStatus,
    onConfigChange,
    fetchImpl = defaultFetch,
    pageProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:',
    pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
}) {
    const host = values?.host ?? node.values?.host ?? ''
    const rigKind = resolveRigKind({ rig: values?.rig ?? node.values?.rig, host })
    const deskMode = rigKind === RIG_KINDS.DESK

    const deskBase = useMemo(() => deskApiBase(pageOrigin), [pageOrigin])
    const base = deskMode ? '' : rigBaseUrl(host)
    const blocked = isRigBlocked(base, pageProtocol)

    const [rig, setRig] = useState({ status: base ? RIG_STATUS.CHECKING : RIG_STATUS.UNSET, name: '', universe: 0 })
    const [desk, setDesk] = useState({ status: DESK_STATUS.CHECKING, summary: null })

    // A desk that answered 404 is a di.iiii with no desk in it; sending into
    // that is noise. Everything else — including "not answering yet" — sends,
    // the same latitude the vizzz lane takes.
    const live = deskMode
        ? desk.status !== DESK_STATUS.ABSENT
        : Boolean(base) && !blocked

    // Same defence against a caller's inline arrow: the polls depend on the
    // rig, never on the function's identity.
    const fetchRef = useRef(fetchImpl)
    useEffect(() => { fetchRef.current = fetchImpl })

    // Poll /status — the one vizzz route whose answer the page may read. The
    // poll is the truth about reachability; commands are fire-and-forget.
    useEffect(() => {
        if (deskMode) return undefined
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
    }, [deskMode, base, blocked])

    // The desk's own cheap read, at the same cadence: a few hundred bytes that
    // carry the whole rig — size, active scene, FX, and whether output is on.
    useEffect(() => {
        if (!deskMode) return undefined
        let alive = true
        setDesk({ status: DESK_STATUS.CHECKING, summary: null })
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        const look = async () => {
            const result = await readDeskSummary(deskBase, { fetchImpl: fetchRef.current, signal: controller?.signal })
            if (!alive) return
            setDesk({ status: result.status, summary: result.summary ?? null })
        }
        look()
        const timer = setInterval(look, POLL_MS)
        return () => {
            alive = false
            clearInterval(timer)
            controller?.abort()
        }
    }, [deskMode, deskBase])

    // The scene library, for turning a name on a wire into an id. Read once on
    // mount and again whenever a recall misses.
    const [scenes, setScenes] = useState([])
    const scenesRef = useRef(scenes)
    useEffect(() => { scenesRef.current = scenes }, [scenes])
    useEffect(() => {
        if (!deskMode) return undefined
        let alive = true
        readDeskScenes(deskBase, { fetchImpl: fetchRef.current }).then((result) => {
            if (alive && result.ok) setScenes(result.scenes)
        })
        return () => { alive = false }
    }, [deskMode, deskBase])

    const statusText = useMemo(() => {
        if (deskMode) {
            if (desk.status === DESK_STATUS.ABSENT) return DESK_ABSENT_TEXT
            if (desk.status === DESK_STATUS.FORBIDDEN) return DESK_FORBIDDEN_TEXT
            if (desk.status === DESK_STATUS.ANSWERING) return deskStatusText(desk.summary)
            if (desk.status === DESK_STATUS.CHECKING) return 'Looking for the lighting desk…'
            return 'The lighting desk is not answering'
        }
        if (rig.status === RIG_STATUS.UNSET) return 'No rig named'
        if (rig.status === RIG_STATUS.BLOCKED) return 'A https page cannot reach a http rig — open the local editor'
        if (rig.status === RIG_STATUS.CHECKING) return `Looking for ${host}…`
        if (rig.status === RIG_STATUS.ANSWERING) {
            return `Sending to ${rig.name || host} (universe ${rig.universe})`
        }
        return `No answer from ${host}`
    }, [deskMode, desk, rig, host])

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
    const lane = deskMode ? `desk:${deskBase}` : `vizzz:${base}`
    if (send.current === null || send.current.lane !== lane) {
        send.current?.master.cancel()
        send.current?.level.cancel()
        const out = deskMode
            ? (command) => { sendDeskCommand(deskBase, command, { fetchImpl: fetchRef.current }) }
            : (path) => sendRigCommand(base, path, { fetchImpl: fetchRef.current })
        send.current = {
            lane,
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
        send.current.master(deskMode ? DESK_COMMANDS.master(master) : VIZZZ_COMMANDS.master(master))
    }, [live, deskMode, master])

    const channel = Math.min(240, Math.max(1, Math.round(Number(values?.channel) || 1)))
    const value = values?.value
    const lastValue = useRef(value)
    useEffect(() => {
        const was = lastValue.current
        lastValue.current = value
        if (!live || value === was || value === undefined || value === null) return
        send.current.level(deskMode ? DESK_COMMANDS.level(channel, value) : VIZZZ_COMMANDS.level(channel, value))
    }, [live, deskMode, value, channel])

    // Rising edge kills the lights, immediately and unthrottled — and cancels
    // any queued level so a stale brightness cannot land after the blackout.
    // The two rigs differ here: vizzz /blackout is a PULSE, the desk's blackout
    // is a STATE that stays on until something lifts it, so on the desk the
    // falling edge has to be sent too.
    const blackout = values?.blackout
    const lastBlackout = useRef(blackout)
    useEffect(() => {
        const was = lastBlackout.current
        lastBlackout.current = blackout
        if (!live) return
        const now = Boolean(blackout)
        if (now === Boolean(was)) return
        if (now) {
            send.current.master.cancel()
            send.current.level.cancel()
        }
        if (deskMode) {
            send.current.out(DESK_COMMANDS.blackout(now))
            return
        }
        if (now) send.current.out(VIZZZ_COMMANDS.blackout())
    }, [live, deskMode, blackout])

    // Scene: a wire carrying an id or the name written on the desk. Fires when
    // the word CHANGES, like every other input here.
    const scene = values?.scene
    const lastScene = useRef(scene)
    useEffect(() => {
        const was = lastScene.current
        lastScene.current = scene
        if (!deskMode || !live) return undefined
        const wanted = String(scene ?? '').trim()
        if (!wanted || wanted === String(was ?? '').trim()) return undefined
        let cancelled = false
        const recall = async () => {
            const id = resolveSceneId(scenesRef.current, wanted)
            const first = await sendDeskCommand(deskBase, DESK_COMMANDS.recall(id), { fetchImpl: fetchRef.current })
            if (cancelled || first.ok) return
            // A name this panel had not seen: re-read the library and try once
            // more, so a scene saved after the node mounted still fires.
            const fresh = await readDeskScenes(deskBase, { fetchImpl: fetchRef.current })
            if (cancelled || !fresh.ok) return
            setScenes(fresh.scenes)
            const retry = resolveSceneId(fresh.scenes, wanted)
            if (retry !== id) sendDeskCommand(deskBase, DESK_COMMANDS.recall(retry), { fetchImpl: fetchRef.current })
        }
        recall()
        return () => { cancelled = true }
    }, [deskMode, live, scene, deskBase])

    const outputOff = deskMode
        && desk.status === DESK_STATUS.ANSWERING
        && !desk.summary?.output?.enabled

    return (
        <div className="raw-dmx-panel">
            {deskMode && (
                <div className="raw-dmx-panel-setup">
                    This di.iiii&rsquo;s own lighting desk &mdash; its rig, its scenes, its effects.
                </div>
            )}
            {!deskMode && rig.status === RIG_STATUS.UNSET && (
                <div className="raw-dmx-panel-setup">
                    Name the rig to light &mdash; a vizzz node on this network.
                </div>
            )}
            <label className="raw-dmx-panel-field">
                <span className="raw-dmx-panel-label">Rig</span>
                <select
                    className="raw-dmx-panel-input"
                    value={rigKind}
                    onChange={(event) => onConfigChange?.(node.id, { rig: event.target.value })}
                >
                    <option value={RIG_KINDS.DESK}>The lighting desk</option>
                    <option value={RIG_KINDS.VIZZZ}>A vizzz node on the network</option>
                </select>
            </label>
            {!deskMode && (
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
            )}
            <div className="raw-dmx-panel-status" role="status">{statusText}</div>
            {outputOff && (
                <div className="raw-dmx-panel-setup">
                    Output is off: the desk is rendering, but nothing leaves this machine until
                    you switch it on under OUTPUT on the desk.
                </div>
            )}
            {deskMode && (
                <a
                    className="raw-dmx-panel-status raw-dmx-panel-link"
                    href={deskHomeUrl(pageOrigin)}
                    target="_blank"
                    rel="noreferrer"
                >
                    Open the desk &rarr;
                </a>
            )}
        </div>
    )
}
