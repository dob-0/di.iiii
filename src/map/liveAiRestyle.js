import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// Live AI restyle: the camera goes to the image model on this machine, and what
// comes back is drawn. The room, as the prompt says it should look.
//
// The model runs in a separate process (scripts/liveai/) and serverXR relays to
// it at /liveai (serverXR/src/liveAi/relay.js) — local installs only, like NDI.
// Everything the page says to it goes through this file.
//
// ONE FRAME IN FLIGHT. A frame is sent, and the next one only after the answer
// arrives. The model is the slow part (tens of milliseconds a frame at best), so
// anything queued behind it is a picture of the past; sending the newest frame
// the moment the model is free is what keeps a hand on the wall with the hand in
// the room. A frame that never comes back is given up on after FRAME_TIMEOUT_MS.
//
// The picture sent is small on purpose: the model works at about 512 wide, and
// the corner-pin scales the result onto the wall anyway.
const { getBasePrefix } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const LIVE_AI_SEND_WIDTH = 512
const JPEG_QUALITY = 0.8
const FRAME_TIMEOUT_MS = 2000
const RECONNECT_MS = 3000

export const liveAiSocketUrl = (location = typeof window !== 'undefined' ? window.location : null) => {
    if (!location?.host) return ''
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${scheme}//${location.host}${joinPath(getBasePrefix(), 'liveai')}`
}

// Model-friendly size: LIVE_AI_SEND_WIDTH wide, height from the camera's own
// shape, both multiples of 8 (what the model's image space divides by).
export const sendSize = (videoWidth, videoHeight, width = LIVE_AI_SEND_WIDTH) => {
    const aspect = videoWidth > 0 && videoHeight > 0 ? videoHeight / videoWidth : 9 / 16
    const w = Math.max(64, Math.round(width / 8) * 8)
    const h = Math.max(64, Math.round((w * aspect) / 8) * 8)
    return { width: w, height: h }
}

const paramsMessage = (params = {}) => JSON.stringify({
    type: 'params',
    prompt: typeof params.prompt === 'string' ? params.prompt : '',
    strength: Number.isFinite(Number(params.strength)) ? Number(params.strength) : 0.5
})

/**
 * Start restyling `video` into `canvas` through the local live-AI engine.
 * Returns { setParams, stop }. Status reaches `onStatus({ state, detail })`:
 *   connecting · waiting (engine loading) · live · no-engine · closed
 * and `onFrame()` fires on every picture drawn — the surface uses the first
 * one to swap its placeholder for the picture.
 */
export const startLiveAiRestyle = ({
    canvas,
    video,
    params = {},
    onStatus = () => {},
    onFrame = () => {},
    url = liveAiSocketUrl(),
    WebSocketImpl = typeof WebSocket !== 'undefined' ? WebSocket : null,
    createBitmap = typeof createImageBitmap === 'function' ? (blob) => createImageBitmap(blob) : null,
    createCanvas = () => document.createElement('canvas')
} = {}) => {
    const context = canvas?.getContext?.('2d')
    if (!context) throw new Error('no canvas on this machine')
    if (!WebSocketImpl || !url) throw new Error('no live-AI connection from this page')

    const grab = createCanvas()
    const grabContext = grab.getContext('2d')
    let current = { ...params }
    let socket = null
    let stopped = false
    let inFlight = false
    let inFlightTimer = null
    let reconnectTimer = null
    let lastStatus = ''

    const status = (state, detail = '') => {
        const key = `${state}|${detail}`
        if (key === lastStatus) return
        lastStatus = key
        onStatus({ state, detail })
    }

    const sendFrame = () => {
        if (stopped || inFlight || !socket || socket.readyState !== 1) return
        if (!video || video.readyState < 2 || !video.videoWidth) {
            // No camera picture yet — look again shortly rather than spin.
            inFlightTimer = setTimeout(sendFrame, 100)
            return
        }
        const size = sendSize(video.videoWidth, video.videoHeight)
        if (grab.width !== size.width || grab.height !== size.height) {
            grab.width = size.width
            grab.height = size.height
        }
        grabContext.drawImage(video, 0, 0, size.width, size.height)
        inFlight = true
        clearTimeout(inFlightTimer)
        inFlightTimer = setTimeout(() => { inFlight = false; sendFrame() }, FRAME_TIMEOUT_MS)
        grab.toBlob((blob) => {
            if (stopped || !blob || !socket || socket.readyState !== 1) { inFlight = false; return }
            blob.arrayBuffer().then((buffer) => {
                if (!stopped && socket?.readyState === 1) socket.send(buffer)
            }).catch(() => { inFlight = false })
        }, 'image/jpeg', JPEG_QUALITY)
    }

    const draw = async (data) => {
        if (!createBitmap) return
        try {
            const blob = data instanceof Blob ? data : new Blob([data], { type: 'image/jpeg' })
            const bitmap = await createBitmap(blob)
            if (stopped) { bitmap.close?.(); return }
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
            bitmap.close?.()
            status('live')
            onFrame()
        } catch {
            // A frame that will not decode is dropped; the next one replaces it.
        }
    }

    const connect = () => {
        if (stopped) return
        status('connecting', 'reaching the live-AI engine…')
        socket = new WebSocketImpl(url)
        socket.binaryType = 'blob'
        socket.onopen = () => {
            socket.send(paramsMessage(current))
            inFlight = false
            sendFrame()
        }
        socket.onmessage = (event) => {
            if (typeof event.data === 'string') {
                let message = null
                try { message = JSON.parse(event.data) } catch { return }
                if (message?.type === 'status') {
                    if (message.state === 'no-engine') status('no-engine', message.detail || 'no live-AI engine on this machine')
                    else if (message.state === 'ready') status('waiting', message.detail || 'engine ready')
                    else status('waiting', message.detail || message.state || '')
                }
                return
            }
            inFlight = false
            clearTimeout(inFlightTimer)
            draw(event.data)
            sendFrame()
        }
        socket.onclose = () => {
            inFlight = false
            clearTimeout(inFlightTimer)
            if (stopped) return
            // Keep what the relay said about a missing engine; say "closed" otherwise.
            if (!lastStatus.startsWith('no-engine|')) status('closed', 'the live-AI engine went away — trying again…')
            reconnectTimer = setTimeout(connect, RECONNECT_MS)
        }
        socket.onerror = () => { /* onclose follows and handles it */ }
    }

    connect()

    return {
        setParams(next = {}) {
            current = { ...current, ...next }
            if (socket?.readyState === 1) socket.send(paramsMessage(current))
        },
        stop() {
            stopped = true
            clearTimeout(inFlightTimer)
            clearTimeout(reconnectTimer)
            if (socket) {
                socket.onclose = null
                socket.close()
            }
        }
    }
}
