import { useEffect, useRef, useState } from 'react'
import { getSocketConfigForRuntime } from '../../hooks/useSpaceSocket.js'
import {
    MESH_STATE,
    checkMeshPayload,
    cleanMeshGroup,
    createMeshClient,
    createSendGate,
} from '../utils/meshClient.js'

// The two hands on the mesh — no window, one per Mesh In / Mesh Out node (the
// MidiOutFeed shape). Each holds its own socket from meshClient.js and writes
// what the graph can read back through onLiveOutput(nodeId, portId, value).

export const MIN_INTERVAL_MS = 50

const defaultServer = () => {
    const hasWindow = typeof window !== 'undefined'
    return getSocketConfigForRuntime({
        configuredBase: import.meta.env.VITE_API_BASE_URL || '',
        token: '',
        isDev: Boolean(import.meta.env.DEV),
        locationOrigin: hasWindow ? window.location.origin : '',
    })
}

// Empty Group: the project's own, so every screen on the same project meets.
export const resolveMeshGroup = (group, fallbackGroup) =>
    cleanMeshGroup(group) || cleanMeshGroup(fallbackGroup) || 'default'

const linkText = (link, group) => {
    if (!link) return ''
    if (link.state === MESH_STATE.UP) {
        const others = Math.max(0, (link.members?.length || 1) - 1)
        return `Up in ${group}, ${others} other${others === 1 ? '' : 's'} here`
    }
    if (link.state === MESH_STATE.CONNECTING) return `Connecting to ${group}…`
    const why = link.lastClose?.reason ? ` (${link.lastClose.reason})` : ''
    return link.retryInMs
        ? `Down${why}, trying again in ${Math.round(link.retryInMs / 1000)} s`
        : `Down${why}`
}

// One client for as long as the group stays the same; a new group is a new
// socket. `server` and `WebSocketImpl` are seams for tests.
function useMeshLink({ group, server, WebSocketImpl, onEvent }) {
    const [link, setLink] = useState(null)
    const clientRef = useRef(null)
    const onEventRef = useRef(onEvent)
    useEffect(() => { onEventRef.current = onEvent })
    useEffect(() => {
        const { serverUrl, path } = server || defaultServer()
        const client = createMeshClient({
            serverUrl,
            path,
            group,
            ...(WebSocketImpl ? { WebSocketImpl } : {}),
            onState: setLink,
            onEvent: (message) => onEventRef.current?.(message),
        })
        clientRef.current = client
        return () => {
            clientRef.current = null
            client.close()
            setLink(null)
        }
    }, [group, server, WebSocketImpl])
    return { link, clientRef }
}

export function MeshOutFeed({ node, inputs, fallbackGroup, onLiveOutput, server, WebSocketImpl, now = () => Date.now() }) {
    const group = resolveMeshGroup(inputs?.group, fallbackGroup)
    const channel = String(inputs?.channel || 'value')
    const interval = Math.max(MIN_INTERVAL_MS, Number(inputs?.interval) || 200)
    const value = inputs?.value
    const { link, clientRef } = useMeshLink({ group, server, WebSocketImpl })
    const up = link?.state === MESH_STATE.UP

    const gate = useRef({ interval: 0, gate: null, timer: null, lastJson: null })
    const latest = useRef({ value, channel })
    // Before the send effect below, so a send reads this render's value.
    useEffect(() => { latest.current = { value, channel } })
    const [sentCount, setSentCount] = useState(0)

    // Publish the latest value now if the gate allows, else once it opens.
    // Down means drop — nothing is queued for a link that is not there.
    useEffect(() => {
        const g = gate.current
        if (g.interval !== interval) {
            g.interval = interval
            g.gate = createSendGate(interval)
        }
        if (!up || value === undefined) return undefined
        const send = () => {
            g.timer = null
            const { value: v, channel: c } = latest.current
            // A wire re-evaluated every frame hands over an equal value in a
            // new array; only a value that actually changed goes out again.
            const json = `${c}\u0000${JSON.stringify(v)}`
            if (json === g.lastJson) return
            if (clientRef.current?.publish(c, v)) {
                g.lastJson = json
                g.gate.sent(now())
                setSentCount((n) => n + 1)
            }
        }
        if (g.timer !== null) return undefined
        const wait = g.gate.waitFor(now())
        if (wait === 0) send()
        else g.timer = setTimeout(send, wait)
        return undefined
    }, [value, channel, interval, up, clientRef, now])
    useEffect(() => () => {
        if (gate.current?.timer !== null) clearTimeout(gate.current.timer)
    }, [])
    useEffect(() => {
        if (up) return
        // Down: drop what was waiting, and send the current value afresh
        // once the link is back, so a screen that joined meanwhile gets it.
        if (gate.current.timer !== null) clearTimeout(gate.current.timer)
        gate.current.timer = null
        gate.current.lastJson = null
    }, [up])

    const status = link
        ? `${linkText(link, group)}${up ? ` · ${sentCount} sent on ${channel}` : ''}`
        : ''
    useEffect(() => {
        onLiveOutput?.(node.id, 'up', up ? 1 : 0)
        onLiveOutput?.(node.id, 'status', status)
    }, [node.id, up, status, onLiveOutput])
    useEffect(() => () => {
        onLiveOutput?.(node.id, 'up', null)
        onLiveOutput?.(node.id, 'status', null)
    }, [node.id, onLiveOutput])
    return null
}

export const MESH_IN_PORTS = ['value', 'from', 'time', 'signal', 'up', 'status']

export function MeshInFeed({ node, inputs, fallbackGroup, onLiveOutput, server, WebSocketImpl }) {
    const group = resolveMeshGroup(inputs?.group, fallbackGroup)
    const channel = String(inputs?.channel || 'value')
    const checks = useRef({})
    const { min, max, allowed, maxLength } = inputs || {}
    useEffect(() => { checks.current = { min, max, allowed, maxLength } }, [min, max, allowed, maxLength])
    const [heard, setHeard] = useState({ count: 0, refused: 0, reason: '' })
    const countRef = useRef(0)

    const onEvent = (message) => {
        if (message.channel !== channel) return
        const verdict = checkMeshPayload(message.payload, checks.current)
        if (!verdict.ok) {
            setHeard((h) => ({ ...h, refused: h.refused + 1, reason: verdict.reason }))
            return
        }
        countRef.current += 1
        onLiveOutput?.(node.id, 'value', message.payload)
        onLiveOutput?.(node.id, 'from', String(message.from ?? ''))
        onLiveOutput?.(node.id, 'time', Number(message.ts) || 0)
        onLiveOutput?.(node.id, 'signal', countRef.current)
        setHeard((h) => ({ ...h, count: countRef.current }))
    }
    const { link } = useMeshLink({ group, server, WebSocketImpl, onEvent })
    const up = link?.state === MESH_STATE.UP

    const status = link
        ? [
            linkText(link, group),
            up ? `${heard.count} heard on ${channel}` : '',
            heard.refused ? `${heard.refused} refused, last: ${heard.reason}` : '',
        ].filter(Boolean).join(' · ')
        : ''
    useEffect(() => {
        onLiveOutput?.(node.id, 'up', up ? 1 : 0)
        onLiveOutput?.(node.id, 'status', status)
    }, [node.id, up, status, onLiveOutput])
    useEffect(() => () => {
        for (const port of MESH_IN_PORTS) onLiveOutput?.(node.id, port, null)
    }, [node.id, onLiveOutput])
    return null
}
