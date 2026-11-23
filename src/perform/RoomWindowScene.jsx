import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import PublicProjectSceneSurface, { resolveViewerCamera } from '../project/components/PublicProjectSceneSurface.jsx'
import { hasRig } from '../rigbuild/hasRigLamps.js'
import { renderPlan } from '../shared/renderPlan.js'

// The three.js half of the Room 3D block. Loaded only when a project that HAS a
// room opens the block (RoomWindow.jsx lazy-imports this file), so a deck with
// no room pays nothing for three.
//
// It is the room page's scene, unchanged, drawn the way a space-card thumbnail is:
//   isPreview     no navigation, no chrome, no walk, no timelines, no smart view,
//                 pixel ratio 1, 'low-power' GPU hint, and after 8 s frames are
//                 drawn only when the picture changes (StudioViewport `lowPower`)
//   outputMode    Quality Low: the document goes through renderPlan(quality 'low')
//                 as the room page does for a phone (no shadows, no bloom)
// The posed lamps follow the desk's live look (RoomLookFollower, no chip, no
// scene bricks) when the room holds a rig; the document itself is never written.

const RoomLookFollower = lazy(() => import('../rigbuild/RoomLookFollower.jsx'))

// The deck changes the document all the time (a master drag is dozens of ops a
// second) and a look fade posed the lamps about 30 times a second. The tile is a
// preview: it takes the latest of either at most twice a second.
const REFRESH_MS = 500

function useThrottled(value, ms = REFRESH_MS) {
    const [shown, setShown] = useState(value)
    const latest = useRef(value)
    const timer = useRef(0)
    latest.current = value
    useEffect(() => {
        if (value === shown || timer.current) return
        timer.current = setTimeout(() => {
            timer.current = 0
            setShown(latest.current)
        }, ms)
    }, [value, shown, ms])
    useEffect(() => () => clearTimeout(timer.current), [])
    return shown
}

// The tile's own size, so the opening shot is fitted to the tile and not to the
// browser window (resolveViewerCamera defaults to the window's aspect, which would
// crop a tall or wide tile). Measured once; the camera is the surface's after that.
function useBoxAspect(ref) {
    const [aspect, setAspect] = useState(null)
    useEffect(() => {
        const el = ref.current
        if (!el) return undefined
        const read = (w, h) => (w > 0 && h > 0 ? w / h : null)
        if (typeof ResizeObserver === 'undefined') {
            setAspect((current) => current ?? 'window')
            return undefined
        }
        const observer = new ResizeObserver(([entry]) => {
            const next = read(entry.contentRect.width, entry.contentRect.height)
            if (next) setAspect((current) => current ?? next)
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [ref])
    return aspect
}

export default function RoomWindowScene({ document, spaceId, projectId, followLook = true }) {
    const boxRef = useRef(null)
    const aspect = useBoxAspect(boxRef)
    const [lookEntities, setLookEntities] = useState(null)
    const slowDocument = useThrottled(document)
    const slowLook = useThrottled(lookEntities)
    const plan = useMemo(() => renderPlan(slowDocument, { mode: 'show', quality: 'low' }), [slowDocument])
    const viewDocument = plan.document
    const sceneDocument = useMemo(() => (slowLook ? { ...viewDocument, entities: slowLook } : viewDocument), [viewDocument, slowLook])
    const hasLamps = useMemo(() => hasRig(document?.entities || []), [document?.entities])

    // The opening shot, fitted to the tile once it has a size.
    const opening = useRef(undefined)
    if (aspect !== null && opening.current === undefined) {
        try {
            opening.current = resolveViewerCamera(viewDocument, aspect === 'window' ? undefined : aspect) || null
        } catch {
            opening.current = null
        }
    }

    // The opening shot is set once, before the first render that shows the surface (`aspect` keys it).
    // eslint-disable-next-line react-hooks/refs
    const openingView = opening.current
    const surface = useMemo(() => (
        <PublicProjectSceneSurface
            projectId={projectId}
            spaceId={spaceId}
            document={sceneDocument}
            posedEntities={slowLook}
            title="Room"
            entryView="scene"
            navMode="orbit"
            isPreview
            liveScreens
            outputMode
            initialCameraView={openingView}
            xrDefaultMode="off"
            canOfferXrEntry={false}
            viewsBar={false}
        />
    ), [projectId, spaceId, sceneDocument, slowLook, openingView])

    return (
        <div ref={boxRef} className="perform-room-box" style={{ position: 'relative', flex: '1 1 auto', width: '100%', minHeight: 0, overflow: 'hidden', background: '#05070a' }}>
            {aspect !== null ? (
                <div style={{ position: 'absolute', inset: 0 }}>
                    <Suspense fallback={null}>
                        {surface}
                    </Suspense>
                </div>
            ) : null}
            {followLook && hasLamps ? (
                <Suspense fallback={null}>
                    <RoomLookFollower
                        document={viewDocument}
                        onEntities={setLookEntities}
                        showChip={false}
                        scenes={false}
                        spaceId={spaceId}
                        projectId={projectId}
                    />
                </Suspense>
            ) : null}
        </div>
    )
}
