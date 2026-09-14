// Pictures between two pages on two machines, browser to browser.
//
// One RTCPeerConnection per pair of pages. Each side says what it WANTS from
// the other — full video for operators wired into its own, small previews for
// cards it is showing — and the other side sends exactly that:
//
//   video     an operator's picture, as a WebRTC video track (canvas.captureStream)
//   preview   a 160x90 JPEG a couple of times a second, over the data channel
//   numbers   every Analyze reading, over the data channel
//
// Signalling (offer / answer / candidates / wants / which track is which
// operator) travels through the servers via machineLink.js. On one LAN, host
// candidates are enough; no STUN or TURN is configured, on purpose — a room
// with no internet must still work.

const WANT_EVERY_MS = 3000
const PREVIEW_EVERY_MS = 500
const PREVIEW_W = 160
const PREVIEW_H = 90
const VIDEO_FPS = 30

/**
 * @param {object} options
 * @param {ReturnType<import('./machineLink.js').createMachineLink>} options.link
 * @param {(nodeId: string, context: CanvasRenderingContext2D) => boolean} options.drawNode  copy a LOCAL operator's picture into a 2D canvas
 * @param {(nodeId: string, video: HTMLVideoElement|null) => void} options.onVideo
 * @param {(nodeId: string, blob: Blob) => void} options.onPreview
 * @param {(nodeId: string, numbers: object) => void} options.onNumbers
 */
export const createPicturePeers = ({ link, drawNode, onVideo, onPreview, onNumbers }) => {
    const connections = new Map()
    // peerId → { video: [nodeId], preview: [nodeId] } — what THIS page wants from each
    let wants = new Map()

    const connectionFor = (peerId) => {
        let c = connections.get(peerId)
        if (c) return c
        const pc = new RTCPeerConnection({ iceServers: [] })
        // Perfect negotiation: one side yields on a collision, decided by id.
        const polite = link.peerId < peerId
        c = {
            peerId, pc, polite, makingOffer: false, ignoreOffer: false,
            channel: null,
            // what THEY want from us
            theirVideo: new Set(), theirPreview: new Set(),
            // what we send them: nodeId → { canvas, context, stream, sender }
            outgoing: new Map(),
            // incoming: streamId → nodeId (told by them), nodeId → video
            streamToNode: new Map(), incomingVideo: new Map(), pendingStreams: new Map()
        }
        connections.set(peerId, c)

        pc.onicecandidate = ({ candidate }) => { if (candidate) link.send(peerId, { kind: 'ice', candidate }) }
        pc.onnegotiationneeded = async () => {
            try {
                c.makingOffer = true
                await pc.setLocalDescription()
                c.offeredAt = Date.now()
                link.send(peerId, { kind: 'description', description: pc.localDescription })
            } catch { /* the next negotiationneeded retries */ } finally {
                c.makingOffer = false
            }
        }
        pc.ontrack = ({ streams }) => {
            const stream = streams[0]
            if (!stream) return
            const nodeId = c.streamToNode.get(stream.id)
            if (nodeId) attachVideo(c, nodeId, stream)
            else c.pendingStreams.set(stream.id, stream)
        }
        pc.ondatachannel = ({ channel }) => setupChannel(c, channel)
        pc.onconnectionstatechange = () => {
            if (['failed', 'closed'].includes(pc.connectionState)) close(peerId)
        }
        // The side with the larger id opens the data channel; the other receives it.
        if (!polite) setupChannel(c, pc.createDataChannel('pictures'))
        return c
    }

    const attachVideo = (c, nodeId, stream) => {
        let video = c.incomingVideo.get(nodeId)
        if (!video) {
            video = globalThis.document.createElement('video')
            video.muted = true
            video.playsInline = true
            c.incomingVideo.set(nodeId, video)
        }
        if (video.srcObject !== stream) {
            video.srcObject = stream
            video.play().catch(() => {})
        }
        onVideo(nodeId, video)
    }

    const setupChannel = (c, channel) => {
        c.channel = channel
        channel.binaryType = 'arraybuffer'
        channel.onmessage = ({ data }) => {
            if (typeof data === 'string') {
                let message
                try { message = JSON.parse(data) } catch { return }
                if (message.kind === 'numbers') onNumbers(message.nodeId, message.numbers)
                if (message.kind === 'preview-of') c.nextPreviewNode = message.nodeId
                return
            }
            if (c.nextPreviewNode) {
                c.previewsIn = (c.previewsIn || 0) + 1
                onPreview(c.nextPreviewNode, new Blob([data], { type: 'image/jpeg' }))
                c.nextPreviewNode = null
            }
        }
    }

    const close = (peerId) => {
        const c = connections.get(peerId)
        if (!c) return
        connections.delete(peerId)
        for (const nodeId of c.incomingVideo.keys()) onVideo(nodeId, null)
        for (const out of c.outgoing.values()) out.stream.getTracks().forEach((track) => track.stop())
        try { c.pc.close() } catch { /* already */ }
    }

    // --- signalling in
    const offMessage = link.onMessage(async ({ from, payload }) => {
        if (!from || !payload) return
        const c = connectionFor(from)
        const { pc } = c
        try {
            if (payload.kind === 'description') {
                const description = payload.description
                const collision = description.type === 'offer' && (c.makingOffer || pc.signalingState !== 'stable')
                c.ignoreOffer = !c.polite && collision
                if (c.ignoreOffer) return
                await pc.setRemoteDescription(description)
                if (description.type === 'offer') {
                    await pc.setLocalDescription()
                    link.send(from, { kind: 'description', description: pc.localDescription })
                }
            } else if (payload.kind === 'ice') {
                try { await pc.addIceCandidate(payload.candidate) } catch (error) { if (!c.ignoreOffer) throw error }
            } else if (payload.kind === 'want') {
                // Still waiting on an answer after a while: the offer was lost
                // on the way. Say it again — by now the description carries
                // every gathered candidate, so nothing else needs re-sending.
                if (pc.signalingState === 'have-local-offer' && Date.now() - (c.offeredAt || 0) > 4000 && pc.localDescription) {
                    c.offeredAt = Date.now()
                    link.send(from, { kind: 'description', description: pc.localDescription })
                }
                c.theirVideo = new Set(payload.video || [])
                c.theirPreview = new Set(payload.preview || [])
                syncOutgoing(c)
            } else if (payload.kind === 'streams') {
                for (const [streamId, nodeId] of Object.entries(payload.map || {})) {
                    c.streamToNode.set(streamId, nodeId)
                    const pending = c.pendingStreams.get(streamId)
                    if (pending) { c.pendingStreams.delete(streamId); attachVideo(c, nodeId, pending) }
                }
            } else if (payload.kind === 'bye') {
                close(from)
            }
        } catch {
            // A half-finished negotiation recovers on the next want cycle.
        }
    })

    // --- what we send: one captured canvas per wanted operator
    const syncOutgoing = (c) => {
        for (const [nodeId, out] of c.outgoing) {
            if (c.theirVideo.has(nodeId)) continue
            try { c.pc.removeTrack(out.sender) } catch { /* gone */ }
            out.stream.getTracks().forEach((track) => track.stop())
            c.outgoing.delete(nodeId)
        }
        const map = {}
        for (const nodeId of c.theirVideo) {
            let out = c.outgoing.get(nodeId)
            if (!out) {
                const canvas = globalThis.document.createElement('canvas')
                canvas.width = 640
                canvas.height = 360
                const context = canvas.getContext('2d')
                const stream = canvas.captureStream(VIDEO_FPS)
                const sender = c.pc.addTrack(stream.getVideoTracks()[0], stream)
                out = { canvas, context, stream, sender }
                c.outgoing.set(nodeId, out)
            }
            map[out.stream.id] = nodeId
        }
        link.send(c.peerId, { kind: 'streams', map })
    }

    // --- every frame, from the runner: fill the outgoing canvases
    const pump = () => {
        for (const c of connections.values()) {
            for (const [nodeId, out] of c.outgoing) drawNode(nodeId, out.context)
        }
    }

    // --- a couple of times a second: previews and numbers go out
    const previewCanvas = globalThis.document?.createElement('canvas')
    if (previewCanvas) { previewCanvas.width = PREVIEW_W; previewCanvas.height = PREVIEW_H }
    const previewContext = previewCanvas?.getContext('2d')
    const previewTimer = setInterval(() => {
        for (const c of connections.values()) {
            if (c.channel?.readyState !== 'open') continue
            for (const nodeId of c.theirPreview) {
                if (!previewContext || !drawNode(nodeId, previewContext)) continue
                const channel = c.channel
                previewCanvas.toBlob((blob) => {
                    if (!blob || channel.readyState !== 'open') return
                    blob.arrayBuffer().then((buffer) => {
                        if (channel.readyState !== 'open') return
                        channel.send(JSON.stringify({ kind: 'preview-of', nodeId }))
                        channel.send(buffer)
                        c.previewsOut = (c.previewsOut || 0) + 1
                    })
                }, 'image/jpeg', 0.6)
            }
        }
    }, PREVIEW_EVERY_MS)

    const sendNumbers = (nodeId, numbers) => {
        const text = JSON.stringify({ kind: 'numbers', nodeId, numbers })
        for (const c of connections.values()) {
            if (c.channel?.readyState === 'open') c.channel.send(text)
        }
    }

    // --- wants go out on a beat, which is also how a connection starts: the
    // page that wants something opens it, the page that has it answers.
    const told = new Map()
    const announceWants = () => {
        // A page that has left the desk (closed tab, reload) is closed here too.
        // Without this a kiosk kept a connection per page it had ever met and
        // messaged every one of them every few seconds, forever.
        const present = new Set((link.peers || []).map((peer) => peer.peerId))
        for (const peerId of [...connections.keys()]) {
            if (!present.has(peerId)) { close(peerId); told.delete(peerId) }
        }
        for (const [peerId, want] of wants) {
            const empty = !want.video.length && !want.preview.length
            if (empty && !connections.has(peerId)) continue
            connectionFor(peerId)
            // A non-empty want is repeated: it is also the keep-alive that
            // re-opens a connection the other side dropped. An empty one is said once.
            const text = JSON.stringify(want)
            if (empty && told.get(peerId) === text) continue
            told.set(peerId, text)
            link.send(peerId, { kind: 'want', video: want.video, preview: want.preview })
        }
        for (const peerId of connections.keys()) {
            if (wants.has(peerId) || told.get(peerId) === 'none') continue
            told.set(peerId, 'none')
            link.send(peerId, { kind: 'want', video: [], preview: [] })
        }
    }
    const wantTimer = setInterval(announceWants, WANT_EVERY_MS)

    // What the connections are doing, readable from a console on either machine:
    // globalThis.__diPictures(). A picture that does not arrive is otherwise
    // invisible — both pages are fine, and nothing says where it stopped.
    const inspect = () => [...connections.values()].map((c) => ({
        peer: c.peerId,
        polite: c.polite,
        connection: c.pc.connectionState,
        ice: c.pc.iceConnectionState,
        signaling: c.pc.signalingState,
        channel: c.channel?.readyState || null,
        theyWantVideo: [...c.theirVideo],
        theyWantPreview: [...c.theirPreview],
        sending: [...c.outgoing.keys()],
        receiving: [...c.incomingVideo.keys()],
        previewsIn: c.previewsIn || 0,
        previewsOut: c.previewsOut || 0
    }))
    const inspectors = (globalThis.__diPictureInspectors ||= new Set())
    inspectors.add(inspect)
    globalThis.__diPictures = () => ({ wants: [...wants], connections: [...inspectors].flatMap((fn) => fn()) })

    return {
        pump,
        sendNumbers,
        setWants(next) {
            const before = JSON.stringify([...wants])
            wants = next instanceof Map ? next : new Map()
            if (JSON.stringify([...wants]) !== before) announceWants()
        },
        stop() {
            inspectors.delete(inspect)
            clearInterval(previewTimer)
            clearInterval(wantTimer)
            offMessage()
            for (const peerId of [...connections.keys()]) {
                link.send(peerId, { kind: 'bye' })
                close(peerId)
            }
        }
    }
}
