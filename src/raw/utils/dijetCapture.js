import { useEffect, useRef, useState } from 'react'

// di.jet is a Yahboom ROSMASTER on a Jetson Nano. It exposes rosbridge over a
// plain WebSocket, so the page can read it directly — no local bridge, the same
// reason Web MIDI was the cheapest proof of the provider contract.
//
// Deliberately READ-ONLY. This subscribes and never advertises or publishes, so
// a node graph cannot drive the robot by accident. The panel that steers it is
// the robot's own, which has a dead-man heartbeat and a stop-on-hide; a Raw
// node quietly gaining motor control would route around both.

export const DIJET_STATUS = {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    ACTIVE: 'active',
    UNREACHABLE: 'unreachable'
}

export const DIJET_DEFAULT_HOST = '192.168.1.11'
const PORT = 9090

// Throttles are the robot's, not ours. Its link is about 5 Mbit/s and the
// camera already wants most of it, so these are the rates the robot's own panel
// settled on: /scan carries 260 floats, /odom two 36-float covariance matrices.
const TOPICS = [
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

export function useDijet({ host, enabled = true, onSample }) {
    const [status, setStatus] = useState(DIJET_STATUS.IDLE)
    const [last, setLast] = useState(null)
    const onSampleRef = useRef(onSample)
    onSampleRef.current = onSample

    useEffect(() => {
        if (!enabled) {
            setStatus(DIJET_STATUS.IDLE)
            return undefined
        }
        const target = (host || DIJET_DEFAULT_HOST).trim()
        if (!target) {
            setStatus(DIJET_STATUS.IDLE)
            return undefined
        }

        let socket = null
        let closed = false
        let retryTimer = null
        // The robot goes away often — it is battery powered and its wifi link
        // is the only route in. Back off rather than hammering a machine that
        // is simply off.
        let backoff = 1500

        const open = () => {
            if (closed) return
            setStatus(DIJET_STATUS.CONNECTING)
            let sock
            try {
                sock = new WebSocket(`ws://${target}:${PORT}`)
            } catch {
                setStatus(DIJET_STATUS.UNREACHABLE)
                return
            }
            socket = sock

            sock.onopen = () => {
                if (closed || sock !== socket) return
                backoff = 1500
                setStatus(DIJET_STATUS.ACTIVE)
                for (const t of TOPICS) {
                    try {
                        sock.send(JSON.stringify({
                            op: 'subscribe', topic: t.topic, type: t.type,
                            throttle_rate: t.throttle, queue_length: 1
                        }))
                    } catch { /* a closing socket is not an error worth surfacing */ }
                }
            }

            sock.onmessage = (event) => {
                if (closed || sock !== socket) return
                let msg
                try { msg = JSON.parse(event.data) } catch { return }
                if (msg.op !== 'publish') return
                if (msg.topic === '/scan') {
                    const nearest = nearestReturn(msg.msg)
                    setLast((prev) => ({ ...prev, nearest }))
                    onSampleRef.current?.({ nearest })
                } else if (msg.topic === '/voltage') {
                    const battery = msg.msg?.data ?? null
                    setLast((prev) => ({ ...prev, battery }))
                    onSampleRef.current?.({ battery })
                } else if (msg.topic === '/vel_raw') {
                    const speed = speedFrom(msg.msg)
                    setLast((prev) => ({ ...prev, speed }))
                    onSampleRef.current?.({ speed })
                }
            }

            const fail = () => {
                if (closed || sock !== socket) return
                setStatus(DIJET_STATUS.UNREACHABLE)
                retryTimer = setTimeout(open, backoff)
                backoff = Math.min(backoff * 2, 20000)
            }
            sock.onclose = fail
            sock.onerror = () => { try { sock.close() } catch { /* already gone */ } }
        }

        open()

        return () => {
            closed = true
            if (retryTimer) clearTimeout(retryTimer)
            try { socket?.close() } catch { /* already gone */ }
        }
    }, [host, enabled])

    return { status, last }
}
