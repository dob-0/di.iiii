import { useEffect, useRef, useState } from 'react'
import { LINK_STATUS, acquireLink, releaseLink } from './dijetLink.js'

// di.jet is a Yahboom ROSMASTER on a Jetson Nano. It exposes rosbridge over a
// plain WebSocket, so the page can read and drive it directly — no local
// bridge, the same reason Web MIDI was the cheapest proof of the provider
// contract.

export const DIJET_STATUS = {
    IDLE: 'idle',
    CONNECTING: LINK_STATUS.CONNECTING,
    ACTIVE: LINK_STATUS.ACTIVE,
    UNREACHABLE: LINK_STATUS.UNREACHABLE
}

export const DIJET_DEFAULT_HOST = '192.168.1.11'

// Throttles are the robot's, not ours. Its link is about 5 Mbit/s and the
// camera already wants most of it, so these are the rates the robot's own panel
// settled on: /scan carries 260 floats, /odom two 36-float covariance matrices.
const SENSOR_TOPICS = [
    { topic: '/scan', type: 'sensor_msgs/LaserScan', throttle: 200 },
    { topic: '/voltage', type: 'std_msgs/Float32', throttle: 2000 },
    { topic: '/vel_raw', type: 'geometry_msgs/Twist', throttle: 500 }
]

// A LaserScan is 260 numbers; a node graph wants one. "How close is the nearest
// thing" is the number a graph can act on. inf/NaN mean "no return", which is
// NOT the same as zero — zero would read as "touching", the exact confusion the
// robot's depth camera already causes.
export const nearestReturn = (scan) => {
    if (!scan || !Array.isArray(scan.ranges)) return null
    const min = typeof scan.range_min === 'number' ? scan.range_min : 0
    const max = typeof scan.range_max === 'number' ? scan.range_max : Infinity
    let nearest = null
    for (const r of scan.ranges) {
        if (typeof r !== 'number' || Number.isNaN(r) || !Number.isFinite(r)) continue
        if (r <= min || r >= max) continue
        if (nearest === null || r < nearest) nearest = r
    }
    return nearest
}

export const speedFrom = (twist) => {
    const x = twist?.linear?.x ?? 0
    const y = twist?.linear?.y ?? 0
    return Math.sqrt(x * x + y * y)
}

export const clamp = (v, limit) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return Math.max(-limit, Math.min(limit, n))
}

// Shared plumbing: hold a link for as long as the component lives, and report
// its status. Every di.jet node uses this.
export function useDijetLink(host) {
    const [status, setStatus] = useState(DIJET_STATUS.IDLE)
    const linkRef = useRef(null)

    useEffect(() => {
        const target = (host || '').trim()
        if (!target) {
            linkRef.current = null
            setStatus(DIJET_STATUS.IDLE)
            return undefined
        }
        const link = acquireLink(target)
        linkRef.current = link
        const off = link.onStatus(setStatus)
        return () => {
            off()
            // The ref is deliberately NOT cleared here. React runs cleanups in
            // declaration order, so this one runs before the cleanup of any
            // effect that uses the link -- and a drive node being deleted
            // mid-drive needs to publish its stop from that later cleanup.
            // Nulling the ref here made that stop silently a no-op. The link's
            // own close is deferred a tick to match (see releaseLink).
            releaseLink(target)
        }
    }, [host])

    return { status, linkRef }
}

export function useDijet({ host, onSample }) {
    const { status, linkRef } = useDijetLink(host || DIJET_DEFAULT_HOST)
    const [last, setLast] = useState(null)
    const onSampleRef = useRef(onSample)
    onSampleRef.current = onSample

    useEffect(() => {
        const link = linkRef.current
        if (!link) return undefined
        const offs = SENSOR_TOPICS.map((t) => link.subscribe(t.topic, t.type, t.throttle, (msg) => {
            let sample = null
            if (t.topic === '/scan') sample = { nearest: nearestReturn(msg) }
            else if (t.topic === '/voltage') sample = { battery: msg?.data ?? null }
            else if (t.topic === '/vel_raw') sample = { speed: speedFrom(msg) }
            if (!sample) return
            setLast((prev) => ({ ...prev, ...sample }))
            onSampleRef.current?.(sample)
        }))
        return () => offs.forEach((off) => off())
        // linkRef is a ref; status changing is what tells us a link exists
    }, [status, linkRef])

    return { status, last }
}
