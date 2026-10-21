import { useCallback, useEffect, useRef, useState } from 'react'
import LiveTextureView, { isLiveTexture } from './LiveTextureView.jsx'
import { drawPicture, pictureMediaOf, takeFileName } from '../utils/recording.js'

const defaultCanvas = () => globalThis.document?.createElement('canvas') || null

const toPngBlob = (canvas) => new Promise((resolve) => {
    if (typeof canvas?.toBlob !== 'function') { resolve(null); return }
    try { canvas.toBlob((blob) => resolve(blob || null), 'image/png') } catch { resolve(null) }
})

// Still: one PNG of a picture wire, on the button or on a rising Take. The
// window owns the canvas; the file lands through the editor's own upload path
// (onSave → uploadProjectAsset, or this browser's store for a local
// workspace), and what happened is reported back for the graph to read
// (stream.still/runtime.js) — Status and File.
export default function StillPanelWindow({
    node,
    values = {},
    sourceLabel = '',
    onSave = null,
    onReport = null,
    createCanvas = defaultCanvas,
    now = () => new Date(),
}) {
    const nodeId = node?.id
    const picture = values?.picture
    const [state, setState] = useState({ status: '', file: '', busy: false })
    const busyRef = useRef(false)
    const pictureRef = useRef(picture)
    useEffect(() => { pictureRef.current = picture })

    const report = useCallback((next) => {
        setState(next)
        onReport?.(nodeId, { status: next.status, file: next.file })
    }, [nodeId, onReport])

    const take = useCallback(async () => {
        if (busyRef.current) return
        const media = pictureMediaOf(pictureRef.current)
        if (!media) {
            report({ status: 'No picture is arriving — nothing taken.', file: state.file, busy: false })
            return
        }
        const canvas = createCanvas()
        if (!canvas || !drawPicture(media, canvas)) {
            report({ status: 'The picture has no frame yet — nothing taken.', file: state.file, busy: false })
            return
        }
        busyRef.current = true
        setState((prev) => ({ ...prev, busy: true, status: 'Saving…' }))
        const name = takeFileName({ kind: 'still', source: sourceLabel, date: now() })
        try {
            const blob = await toPngBlob(canvas)
            if (!blob) throw new Error('no png')
            const file = new File([blob], name, { type: 'image/png' })
            const asset = onSave ? await onSave(nodeId, file) : null
            if (!asset?.id) throw new Error('not saved')
            report({ status: `Saved ${asset.name || name}.`, file: asset.name || name, busy: false })
        } catch {
            report({ status: `Could not save ${name}.`, file: state.file, busy: false })
        } finally {
            busyRef.current = false
        }
    }, [createCanvas, nodeId, now, onSave, report, sourceLabel, state.file])

    // A rising Take takes one picture; holding it high takes no more.
    const takeRef = useRef(Boolean(values?.take))
    const takeNowRef = useRef(take)
    useEffect(() => { takeNowRef.current = take })
    useEffect(() => {
        const high = Boolean(values?.take)
        const rose = high && !takeRef.current
        takeRef.current = high
        if (rose) takeNowRef.current()
    }, [values?.take])

    const live = isLiveTexture(picture)
    return (
        <div className="raw-window-stack raw-take-panel">
            <div className="raw-take-preview">
                {live
                    ? <LiveTextureView texture={picture} label="Picture to take" className="raw-take-media" />
                    : <p className="raw-take-empty">Wire a picture into Picture — a Scene’s Picture or a Picture Out.</p>}
            </div>
            <div className="raw-take-controls">
                <button type="button" className="raw-take-button" onClick={take} disabled={state.busy}>
                    {state.busy ? 'Saving…' : 'Take'}
                </button>
            </div>
            <p className="raw-take-status" role="status">{state.status || 'Take saves one PNG to this project’s files.'}</p>
        </div>
    )
}
