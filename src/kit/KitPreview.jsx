import { useEffect, useRef, useState } from 'react'
import { PREVIEW_READY_MESSAGE, PREVIEW_STUB_MESSAGE } from '../utils/previewMode.js'

// The picture on a Kit card.
//
// Three kinds. A `still` is a real screenshot and nothing more. A `text` is
// lines of real output — a command's help, a file's contents — for a tool that
// has no picture on the web. A `frame` starts as a still and, when the card is
// the one live card on the page, becomes the tool itself: the real route,
// framed at ?preview=1 — still camera, no toolbar, no presence announced — laid
// out at a desk's width and scaled down to the card, the same way the space
// cards on /spaces do it (SpaceCardPreview in SpaceHub.jsx).
//
// The still stays on top until the frame says it has painted
// (dii:preview-ready), so a card never shows a black box while its scene
// loads; a frame that paints without a canvas (a page of text) counts as ready
// a moment after it loads. Only ONE frame is live at a time, decided by the
// page: a preview is a whole app instance, and browsers stop giving out WebGL
// contexts at about sixteen.

export const PREVIEW_VIEWPORT_WIDTH = 1024
export const PREVIEW_VIEWPORT_HEIGHT = 576
// A frame that never reports (a page without a canvas, an old build) is shown
// anyway after this long.
const PREVIEW_BACKSTOP_MS = 8000
// A frame whose route has no canvas — /login, /for-apps — paints well before
// this after `load`; the paint watcher only reports canvases and iframes.
const PLAIN_PAGE_READY_MS = 1200

export const previewFrameSrc = (path) => `${path}${path.includes('?') ? '&' : '?'}preview=1`

export default function KitPreview({ tool, live = false, onAskLive = null }) {
    const { preview, name } = tool
    const hostRef = useRef(null)
    const frameRef = useRef(null)
    const [scale, setScale] = useState(0)
    const [painted, setPainted] = useState(false)
    const [stub, setStub] = useState(false)
    const isFrame = preview.kind === 'frame'
    const framed = isFrame && live && !stub

    useEffect(() => {
        const node = hostRef.current
        if (!node || !isFrame) return undefined
        const measure = () => setScale(node.clientWidth / PREVIEW_VIEWPORT_WIDTH)
        measure()
        if (typeof ResizeObserver !== 'function') return undefined
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => observer.disconnect()
    }, [isFrame])

    // The still comes back the moment this card stops being the live one.
    useEffect(() => {
        if (!framed) setPainted(false)
    }, [framed])

    useEffect(() => {
        if (!framed) return undefined
        const onMessage = (event) => {
            if (event.origin !== window.location.origin) return
            const type = event.data?.type
            if (type !== PREVIEW_READY_MESSAGE && type !== PREVIEW_STUB_MESSAGE) return
            if (event.source !== frameRef.current?.contentWindow) return
            if (type === PREVIEW_STUB_MESSAGE) setStub(true)
            else setPainted(true)
        }
        window.addEventListener('message', onMessage)
        const backstop = setTimeout(() => setPainted(true), PREVIEW_BACKSTOP_MS)
        return () => {
            window.removeEventListener('message', onMessage)
            clearTimeout(backstop)
        }
    }, [framed])

    const onFrameLoad = () => {
        // A route with nothing that draws never posts ready; give it a moment
        // to lay out and show it. A scene that IS drawing posts sooner.
        setTimeout(() => setPainted(true), PLAIN_PAGE_READY_MS)
    }

    if (preview.kind === 'text') {
        return (
            <div className="kit-see kit-see--text" ref={hostRef}>
                <pre className="kit-text" aria-label={`${name}, as it prints`}>{preview.lines.join('\n')}</pre>
            </div>
        )
    }

    const poster = (
        <img
            className={`kit-poster${framed && painted ? ' is-behind' : ''}`}
            src={preview.poster}
            alt={`${name}, as it looks`}
            width={PREVIEW_VIEWPORT_WIDTH}
            height={PREVIEW_VIEWPORT_HEIGHT}
            loading="lazy"
            decoding="async"
        />
    )

    return (
        <div className={`kit-see${framed ? ' is-live' : ''}`} ref={hostRef}>
            {framed ? (
                <iframe
                    ref={frameRef}
                    className="kit-frame"
                    src={previewFrameSrc(preview.path)}
                    title={`${name} — live preview`}
                    loading="lazy"
                    tabIndex={-1}
                    aria-hidden="true"
                    onLoad={onFrameLoad}
                    style={{
                        width: `${PREVIEW_VIEWPORT_WIDTH}px`,
                        height: `${PREVIEW_VIEWPORT_HEIGHT}px`,
                        transform: `scale(${scale})`
                    }}
                />
            ) : null}
            {poster}
            {isFrame && !framed && onAskLive ? (
                <button
                    type="button"
                    className="kit-live-button"
                    onClick={() => onAskLive(tool.id)}
                    aria-label={`Show ${name} live`}
                >
                    live
                </button>
            ) : null}
            {framed && painted ? <span className="kit-live-mark" aria-hidden="true">live</span> : null}
        </div>
    )
}
