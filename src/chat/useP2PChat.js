import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { getSocketConfigForRuntime } from '../hooks/useSpaceSocket.js'
import {
    createIdentity,
    decrypt,
    deriveConversationKey,
    encrypt,
    exportIdentity,
    exportPublicKey,
    fingerprint,
    importIdentity,
    importPublicKey
} from './p2pCrypto.js'

// A conversation between two people with no server in the middle of it.
//
// The server's whole part is the introduction: it holds public keys, and it
// carries WebRTC's offer and answer between two browsers. The words themselves
// go browser to browser over a data channel, sealed before they leave with a
// key derived from both halves — so there is nothing to intercept at di.iiii
// and nothing to subpoena from it.
//
// THREE HONEST LIMITS, and the interface says all three out loud:
//
//   1. Both people must be online at the same moment. There is no mailbox,
//      because a mailbox is a server holding your words.
//   2. The conversation does not follow you to another device. Each device has
//      its own key pair and they share no secret.
//   3. Clearing this browser's storage loses the history and the identity.
//      Nobody else has a copy — that is the point, and it is also the cost.

const IDENTITY_KEY = 'dii.dm.identity'
const HISTORY_PREFIX = 'dii.dm.with.'
const MAX_KEPT = 500

// Host candidates alone cover two machines on one network — a studio, a camp,
// an install with the internet cut. A STUN server is what gets two people
// across the open internet to each other, and it is CONFIGURED rather than
// assumed: an offline install must not sit waiting on a name it cannot resolve.
const iceServers = () => {
    const configured = String(import.meta.env.VITE_STUN_URLS || '').trim()
    if (!configured) return []
    return configured.split(',').map((url) => ({ urls: url.trim() })).filter((s) => s.urls)
}

const readStored = (key) => {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null') } catch { return null }
}
const writeStored = (key, value) => {
    try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* a browser with storage off keeps nothing */ }
}

export default function useP2PChat({ withUserId, myAccountId }) {
    const [identity, setIdentity] = useState(null)
    const [myPublicKey, setMyPublicKey] = useState(null)
    const [state, setState] = useState('idle')
    const [words, setWords] = useState(null)
    const [messages, setMessages] = useState([])
    const [problem, setProblem] = useState(null)

    const socketRef = useRef(null)
    const peerRef = useRef(null)
    const channelRef = useRef(null)
    const keyRef = useRef(null)
    const theirKeyRef = useRef(null)

    const historyKey = useMemo(() => `${HISTORY_PREFIX}${withUserId || 'nobody'}`, [withUserId])

    // ── this device's identity ──────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const stored = readStored(IDENTITY_KEY)
                const pair = stored ? await importIdentity(stored) : await createIdentity()
                if (!stored) writeStored(IDENTITY_KEY, await exportIdentity(pair))
                if (cancelled) return
                setIdentity(pair)
                const publicKey = await exportPublicKey(pair)
                setMyPublicKey(publicKey)
                // Publishing is how anybody can start a conversation with me.
                // Only the public half goes; the private one has never left.
                await fetch('/serverXR/api/dm/devices', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ publicKey, label: navigator.userAgent.slice(0, 60) })
                }).catch(() => {})
            } catch (error) {
                if (!cancelled) setProblem(error.message)
            }
        })()
        return () => { cancelled = true }
    }, [])

    // History is kept HERE, in this browser, and nowhere else.
    useEffect(() => {
        setMessages(readStored(historyKey) || [])
    }, [historyKey])

    const remember = useCallback((entry) => {
        setMessages((current) => {
            const next = [...current, entry].slice(-MAX_KEPT)
            writeStored(historyKey, next)
            return next
        })
    }, [historyKey])

    const receive = useCallback(async (raw) => {
        try {
            const sealed = JSON.parse(raw)
            const text = keyRef.current ? await decrypt(keyRef.current, sealed) : null
            remember({
                id: sealed.id || `in-${Date.now()}`,
                mine: false,
                // A message that will not open is SHOWN as such rather than
                // dropped: silence would look like nothing was sent.
                text: text === null ? null : text,
                at: Date.now()
            })
        } catch {
            remember({ id: `in-${Date.now()}`, mine: false, text: null, at: Date.now() })
        }
    }, [remember])

    const attachChannel = useCallback((channel) => {
        channelRef.current = channel
        channel.onopen = () => setState('open')
        channel.onclose = () => setState('closed')
        channel.onmessage = (event) => receive(event.data)
    }, [receive])

    // ── the connection ──────────────────────────────────────────────────
    useEffect(() => {
        if (!withUserId || !identity || !myAccountId || !myPublicKey) return undefined
        const myKey = myPublicKey
        let cancelled = false
        setState('connecting')

        const hasWindow = typeof window !== 'undefined'
        const { serverUrl, path, auth } = getSocketConfigForRuntime({
            configuredBase: import.meta.env.VITE_API_BASE_URL || '',
            token: '',
            isDev: Boolean(import.meta.env.DEV),
            locationOrigin: hasWindow ? window.location.origin : ''
        })
        const socket = io(serverUrl, { path, auth, reconnection: true, reconnectionDelayMax: 15000 })
        socketRef.current = socket

        const peer = new RTCPeerConnection({ iceServers: iceServers() })
        peerRef.current = peer
        peer.onicecandidate = (event) => {
            if (event.candidate) socket.emit('dm-signal', { to: withUserId, signal: { candidate: event.candidate } })
        }
        peer.ondatachannel = (event) => attachChannel(event.channel)
        peer.onconnectionstatechange = () => {
            if (['failed', 'disconnected'].includes(peer.connectionState)) setState('lost')
        }

        // Who opens the channel has to be decided without asking: both sides
        // run this same code. The larger id offers — an arbitrary rule that
        // both arrive at independently, so exactly one offer is made.
        const iOffer = String(myAccountId) > String(withUserId)

        // Whoever opens the conversation first arrives before the other has
        // published a key — that is the ordinary case, not an edge one, and the
        // first version treated it as a dead end. So: look again, patiently,
        // until they turn up. `started` keeps the offer from being made twice
        // if a retry and a signal land together.
        let attempts = 0
        let started = false
        let retryTimer = null

        const start = async () => {
            if (started || cancelled) return
            try {
                const answer = await fetch(`/serverXR/api/dm/devices/${encodeURIComponent(withUserId)}`, { credentials: 'include' })
                if (!answer.ok) {
                    setProblem('That person cannot be reached from here — you may not share a space.')
                    setState('unreachable')
                    return
                }
                const body = await answer.json()
                const device = (body.devices || [])[0]
                if (!device) {
                    attempts += 1
                    setState('waiting')
                    setProblem('Waiting for them to open this conversation — both of you have to be here.')
                    // Every two seconds for two minutes. Long enough for somebody
                    // to be called to their laptop, short of running forever.
                    if (attempts < 60) retryTimer = setTimeout(start, 2000)
                    else setProblem('They never opened it. A conversation with no server in it needs both people at once.')
                    return
                }
                started = true
                if (cancelled) return
                socket.emit('dm-here')
                if (iOffer) {
                    attachChannel(peer.createDataChannel('iiii'))
                    const offer = await peer.createOffer()
                    await peer.setLocalDescription(offer)
                    // My public key rides WITH the offer. See useKeyFrom below:
                    // the registry says a person has a device, it does not say
                    // which one is on the other end of THIS connection.
                    socket.emit('dm-signal', {
                        to: withUserId,
                        signal: { sdp: peer.localDescription, publicKey: myKey }
                    })
                }
            } catch (error) {
                if (!cancelled) { setProblem(error.message); setState('lost') }
            }
        }

        socket.on('connect', () => { socket.emit('dm-here'); start() })
        socket.on('dm-unreachable', () => {
            setState('waiting')
            setProblem('They are not here right now. A conversation with no server in it needs both people at once.')
        })
        socket.on('dm-forbidden', (payload) => {
            setState('unreachable')
            setProblem(payload?.message || 'Sign in with an account to talk privately.')
        })
        // The key that matters is the one the OTHER END presents, not whichever
        // device the registry happens to list first. A person with two devices
        // has two key pairs, and a stale row would have us encrypting to a
        // laptop that is not in this conversation — measured, on the first
        // two-browser run: both sides connected and their fingerprints did not
        // match, which is precisely the alarm those words exist to raise.
        // NOT named useSomething: a plain function whose name starts with `use` is
        // read as a hook by the linter, and this one is called from a socket
        // callback where a hook would be a genuine error.
        const adoptKeyFrom = async (theirPublicKey) => {
            if (!theirPublicKey || theirKeyRef.current === theirPublicKey) return
            theirKeyRef.current = theirPublicKey
            keyRef.current = await deriveConversationKey(identity, await importPublicKey(theirPublicKey))
            setWords(await fingerprint(myKey, theirPublicKey))
        }

        socket.on('dm-signal', async ({ from, signal }) => {
            if (String(from) !== String(withUserId)) return
            // They are demonstrably here. If we were still waiting on their key,
            // stop waiting and look now rather than on the next tick.
            if (!started) start()
            try {
                if (signal?.publicKey) await adoptKeyFrom(signal.publicKey)
                if (signal?.sdp) {
                    await peer.setRemoteDescription(signal.sdp)
                    if (signal.sdp.type === 'offer') {
                        const reply = await peer.createAnswer()
                        await peer.setLocalDescription(reply)
                        socket.emit('dm-signal', {
                            to: withUserId,
                            signal: { sdp: peer.localDescription, publicKey: myKey }
                        })
                    }
                } else if (signal?.candidate) {
                    await peer.addIceCandidate(signal.candidate).catch(() => {})
                }
            } catch (error) {
                setProblem(error.message)
            }
        })

        return () => {
            cancelled = true
            if (retryTimer) clearTimeout(retryTimer)
            try { channelRef.current?.close() } catch { /* already gone */ }
            try { peer.close() } catch { /* already gone */ }
            socket.disconnect()
            socketRef.current = null
            peerRef.current = null
            channelRef.current = null
        }
    }, [withUserId, identity, myAccountId, myPublicKey, attachChannel])

    const send = useCallback(async (text) => {
        const trimmed = String(text || '').trim()
        if (!trimmed || !keyRef.current) return false
        const channel = channelRef.current
        if (!channel || channel.readyState !== 'open') return false
        const sealed = await encrypt(keyRef.current, trimmed)
        const id = `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        channel.send(JSON.stringify({ ...sealed, id }))
        remember({ id, mine: true, text: trimmed, at: Date.now() })
        return true
    }, [remember])

    // Their half of "this conversation is gone" is their own to do: there is no
    // command that reaches into somebody else's browser, and there should not be.
    const forget = useCallback(() => {
        try { window.localStorage.removeItem(historyKey) } catch { /* nothing to clear */ }
        setMessages([])
    }, [historyKey])

    return { state, words, messages, problem, send, forget, myPublicKey }
}
