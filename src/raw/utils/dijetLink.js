// One rosbridge socket per robot, shared by every di.jet node in the graph.
//
// A graph can easily hold a sensor node, a drive node, a lights node and a
// speech node all pointed at the same machine. Four sockets to one Jetson over
// a ~5 Mbit/s wifi link would be four reconnect storms when the robot blinks,
// and four copies of every subscription. So the socket is refcounted per host
// and the nodes share it.
//
// Publishing lives here too, but ARMING does not: see DijetDrivePanel. Nothing
// in this module decides when the robot may move.

export const LINK_STATUS = {
    CONNECTING: 'connecting',
    ACTIVE: 'active',
    UNREACHABLE: 'unreachable'
}

const PORT = 9090
const links = new Map()

const makeLink = (host) => {
    const link = {
        host,
        refs: 0,
        socket: null,
        status: LINK_STATUS.CONNECTING,
        closed: false,
        backoff: 1500,
        retryTimer: null,
        advertised: new Set(),
        // topic -> Set(handler). Several nodes may want the same topic; the
        // socket subscribes once and fans out here.
        handlers: new Map(),
        statusListeners: new Set()
    }

    const setStatus = (next) => {
        if (link.status === next) return
        link.status = next
        for (const cb of link.statusListeners) cb(next)
    }

    const send = (payload) => {
        if (!link.socket || link.socket.readyState !== 1) return false
        try {
            link.socket.send(JSON.stringify(payload))
            return true
        } catch {
            return false
        }
    }

    const subscribeOnSocket = (topic) => {
        const meta = link.handlers.get(topic)
        if (!meta) return
        send({
            op: 'subscribe', topic, type: meta.type,
            throttle_rate: meta.throttle, queue_length: 1
        })
    }

    const open = () => {
        if (link.closed) return
        setStatus(LINK_STATUS.CONNECTING)
        let sock
        try {
            sock = new WebSocket(`ws://${host}:${PORT}`)
        } catch {
            setStatus(LINK_STATUS.UNREACHABLE)
            return
        }
        link.socket = sock

        sock.onopen = () => {
            if (link.closed || sock !== link.socket) return
            link.backoff = 1500
            setStatus(LINK_STATUS.ACTIVE)
            // A reconnect must restore everything, or the graph goes quietly
            // dead while looking connected.
            for (const topic of link.handlers.keys()) subscribeOnSocket(topic)
            for (const [topic, type] of link.advertised) {
                send({ op: 'advertise', topic, type })
            }
        }

        sock.onmessage = (event) => {
            if (link.closed || sock !== link.socket) return
            let msg
            try { msg = JSON.parse(event.data) } catch { return }
            if (msg.op !== 'publish') return
            const meta = link.handlers.get(msg.topic)
            if (!meta) return
            for (const handler of meta.handlers) {
                try { handler(msg.msg) } catch { /* one bad consumer must not stop the rest */ }
            }
        }

        const fail = () => {
            if (link.closed || sock !== link.socket) return
            setStatus(LINK_STATUS.UNREACHABLE)
            link.retryTimer = setTimeout(open, link.backoff)
            link.backoff = Math.min(link.backoff * 2, 20000)
        }
        sock.onclose = fail
        sock.onerror = () => { try { sock.close() } catch { /* already gone */ } }
    }

    link.start = open
    link.send = send

    link.onStatus = (cb) => {
        link.statusListeners.add(cb)
        cb(link.status)
        return () => link.statusListeners.delete(cb)
    }

    link.subscribe = (topic, type, throttle, handler) => {
        let meta = link.handlers.get(topic)
        if (!meta) {
            meta = { type, throttle, handlers: new Set() }
            link.handlers.set(topic, meta)
            meta.handlers.add(handler)
            subscribeOnSocket(topic)
        } else {
            meta.handlers.add(handler)
        }
        return () => {
            const current = link.handlers.get(topic)
            if (!current) return
            current.handlers.delete(handler)
            if (current.handlers.size === 0) {
                link.handlers.delete(topic)
                send({ op: 'unsubscribe', topic })
            }
        }
    }

    // Advertise is idempotent per topic. rosbridge accepts a publish to an
    // advertised topic whether or not anything subscribes, so a publish that
    // "succeeds" proves nothing about the robot having heard it — the panel
    // learned that the hard way and it is worth repeating here.
    link.advertise = (topic, type) => {
        for (const [t] of link.advertised) if (t === topic) return
        link.advertised.add([topic, type])
        send({ op: 'advertise', topic, type })
    }

    link.publish = (topic, msg) => send({ op: 'publish', topic, msg })

    return link
}

export const acquireLink = (host) => {
    const key = String(host || '').trim()
    if (!key) return null
    let link = links.get(key)
    if (!link) {
        link = makeLink(key)
        links.set(key, link)
        link.start()
    }
    link.refs += 1
    return link
}

export const releaseLink = (host) => {
    const key = String(host || '').trim()
    const link = links.get(key)
    if (!link) return
    link.refs -= 1
    if (link.refs > 0) return
    if (link.retryTimer) clearTimeout(link.retryTimer)
    links.delete(key)
    // The close is deferred by one macrotask ON PURPOSE. React runs effect
    // cleanups in declaration order, so the hook that HOLDS this link tears
    // down before the hook that uses it -- which meant a drive node being
    // deleted mid-drive closed the socket before its own cleanup could publish
    // the stop. The robot would still have halted, because it stops when the
    // heartbeat stops, but relying on a timeout to end motion when an explicit
    // stop was available is the wrong way round. One tick lets that last
    // message out.
    setTimeout(() => {
        link.closed = true
        try { link.socket?.close() } catch { /* already gone */ }
    }, 0)
}

// tests only: the module map would otherwise leak between cases
export const __resetLinks = () => {
    for (const link of links.values()) {
        link.closed = true
        if (link.retryTimer) clearTimeout(link.retryTimer)
        try { link.socket?.close() } catch { /* already gone */ }
    }
    links.clear()
}
