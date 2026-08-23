import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LiveProjectScene from '../../components/LiveProjectScene.jsx'
import JamSheet from './JamSheet.jsx'
import JamStandingMarkers from './JamStandingMarkers.jsx'
import { useProjectStore } from '../state/projectStore.js'
import { useProjectDocumentSync } from '../hooks/useProjectDocumentSync.js'
import { useProjectPresence } from '../hooks/useProjectPresence.js'
import { uploadProjectAsset } from '../services/projectsApi.js'
import { buildJamEditorPath } from '../routing/jamRouting.js'
import { buildJamObject, detectJamObjectType } from '../jam/jamObject.js'
import { JAM_NUDGE_STEP, nudgeFromViewer, poseToRay } from '../jam/jamPlacement.js'
import { forgetMineId, isMine, loadMineIds, rememberMineId } from '../jam/jamOwnership.js'
import {
    buildJamCursorPayload,
    countPeopleHere,
    describePeopleHere,
    readStandingVisitors,
    sameStandingVisitors,
    shouldEmitPose
} from '../jam/jamPresence.js'
import './jamSurface.css'

// THE JAM SURFACE — you stand in it, what you add lands where you are looking,
// and you can see the other people.
//
// The jam has always been Studio with about twenty things switched off
// (`jamMinimal` in StudioShell.jsx), which reads as a stripped editor rather
// than an event. On the device the QR code actually targets it was worse than
// that: the whole desktop layer sits behind `!isMobile`, so a phone at
// /open_jam got six controls, no way through to the full toolset, and a
// placement rule that dropped everybody's work into the same six spots around
// one shared saved view. Twenty phones were twenty solo sessions editing one
// document and never seeing each other.
//
// This is its own surface at its own address, deliberately NOT a twenty-first
// conditional inside StudioShell. It writes through the same ops pipeline into
// the same project, so the full editor at /open/studio/projects/open-jam opens
// exactly what was made here, and that link is on this screen — the first time
// a phone has been offered it.
//
// Everything below reuses what already exists: the touch-tuned walker
// (LiveProjectScene + walkModeConfig.js), the reduced palette (JAM_PRIMITIVES),
// the edits JamEditPanel already offered, the presence transport, and
// useProjectDocumentSync. The genuinely new parts are three small pure modules
// under src/project/jam/ — where a new object lands, which objects are yours,
// and what a walker's presence payload looks like — kept pure precisely because
// a scene is the hardest thing in this repo to check without looking at it.

const NUDGE_LIMIT_MESSAGE = 'That is as far as it goes.'

export default function JamSurface({ projectId, spaceId }) {
    const store = useProjectStore()
    const { state } = store
    const { applyLocalOps } = useProjectDocumentSync({
        projectId,
        store,
        clientIdPrefix: 'jam-client',
        opIdPrefix: 'jam-op'
    })
    // The same identity keys Studio uses, so a phone that was in the jam an
    // hour ago is the same person now and the same person if it opens the full
    // editor — a jam where everybody is a new stranger every visit is not a
    // jam.
    const presence = useProjectPresence({
        projectId,
        displayNameStorageKey: 'dii.studio.displayName',
        userIdStorageKey: 'dii.studio.userId',
        anonymousLabel: 'Guest',
        userIdPrefix: 'studio-user'
    })

    // The walker's own pose object, mutated in place every frame by the walker
    // itself. Read at the moment of a tap; never rendered from.
    const walkerRef = useRef(null)
    const [mineIds, setMineIds] = useState(loadMineIds)
    // { face: 'add' | 'edit' | 'mine', objectId }
    const [sheet, setSheet] = useState(null)
    const [busy, setBusy] = useState(false)
    const [status, setStatus] = useState('')

    // `projectDocument`, never `document`: this file renders JSX, and a local
    // named `document` shadows the DOM global for the whole function scope —
    // the exact trap PublicProjectViewer.jsx carries a paragraph about.
    const projectDocument = state.document
    const objects = useMemo(() => projectDocument?.entities || [], [projectDocument?.entities])
    const mineObjects = useMemo(
        () => objects.filter((object) => isMine(object.id, mineIds)),
        [objects, mineIds]
    )
    const sheetObject = useMemo(
        () => (sheet?.objectId ? objects.find((object) => object.id === sheet.objectId) || null : null),
        [objects, sheet?.objectId]
    )

    const peopleHere = countPeopleHere(presence.users, { selfUserId: presence.localUserId })

    // Twenty phones each sending a pose several times a second is a lot of
    // React for a picture that changes very little. Sample the presence map on
    // a fixed beat instead of reacting to every arrival, and drop a sample that
    // would redraw the identical markers — so the cost of the 3D subtree is
    // bounded by the clock rather than by how busy the jam is.
    const cursorsRef = useRef(presence.cursors)
    useEffect(() => { cursorsRef.current = presence.cursors }, [presence.cursors])
    const [standingVisitors, setStandingVisitors] = useState([])
    useEffect(() => {
        const readNow = () => {
            const next = readStandingVisitors(cursorsRef.current, { selfUserId: presence.localUserId })
            setStandingVisitors((current) => (sameStandingVisitors(current, next) ? current : next))
        }
        readNow()
        const timer = window.setInterval(readNow, 200)
        return () => window.clearInterval(timer)
    }, [presence.localUserId])

    // --- telling everyone where you are standing -------------------------
    //
    // The existing presence cursor is emitted on `pointermove`, which a touch
    // screen never fires — so a phone has been emitting nothing at all. A
    // walker's position is not an event either; it changes continuously. So
    // this is a poll, gated on `shouldEmitPose` so a still visitor sends a
    // heartbeat rather than twelve identical payloads a second.
    const emitCursor = presence.emitCursor
    useEffect(() => {
        if (!emitCursor) return undefined
        let lastPose = null
        let lastSentAt = 0
        const timer = window.setInterval(() => {
            const pose = walkerRef.current
            if (!pose) return
            const now = Date.now()
            if (!shouldEmitPose(lastPose, pose, now - lastSentAt)) return
            lastPose = { x: pose.x, z: pose.z, yaw: pose.yaw }
            lastSentAt = now
            emitCursor(buildJamCursorPayload(pose))
        }, 200)
        return () => window.clearInterval(timer)
    }, [emitCursor])

    // A message that says itself and goes away. No toast system on this
    // surface — one line, one timer.
    const say = useCallback((message) => {
        setStatus(message)
        window.setTimeout(() => setStatus((current) => (current === message ? '' : current)), 2600)
    }, [])

    // --- adding ----------------------------------------------------------

    const addObject = useCallback((type, asset = null, pose = null) => {
        const usePose = pose || walkerRef.current
        if (!usePose) return null
        const object = buildJamObject(type, usePose, asset)
        applyLocalOps(
            { type: 'createEntity', payload: { entity: object } },
            { activityMessage: `Added a ${type} to the jam.` }
        )
        setMineIds((ids) => rememberMineId(object.id, ids))
        setSheet({ face: 'edit', objectId: object.id })
        return object
    }, [applyLocalOps])

    const addPhoto = useCallback(async (file) => {
        // Snapshot the pose BEFORE the upload: the walker keeps walking while
        // a photo goes up, and a picture that lands wherever they happened to
        // stop is not "where you were looking".
        const pose = { ...(walkerRef.current || {}) }
        setBusy(true)
        setStatus('Sending your photo…')
        try {
            const asset = await uploadProjectAsset(projectId, file)
            applyLocalOps({ type: 'upsertAsset', payload: { asset } })
            addObject(detectJamObjectType(file), asset, pose)
            setStatus('')
        } catch {
            say('That would not send. Try a smaller one.')
        } finally {
            setBusy(false)
        }
    }, [addObject, applyLocalOps, projectId, say])

    // --- changing what is yours ------------------------------------------
    //
    // Every one of these is gated on the localStorage list, which is a
    // COURTESY AGAINST ACCIDENTS AND NOT A SECURITY CONTROL — see the warning
    // at the top of src/project/jam/jamOwnership.js. serverXR is the
    // authority (MANIFESTO §5); anyone holding `editor` on the open space can
    // already change anything in this document, and the gate below only
    // decides which controls a phone offers.

    const patchComponent = useCallback((objectId, component, patch) => {
        if (!isMine(objectId, mineIds)) return
        applyLocalOps({
            type: 'updateComponent',
            payload: { entityId: objectId, component, patch }
        })
    }, [applyLocalOps, mineIds])

    const handleText = useCallback((value) => {
        if (!sheetObject) return
        patchComponent(sheetObject.id, 'text', { value })
    }, [patchComponent, sheetObject])

    const handleColour = useCallback((colour) => {
        if (!sheetObject) return
        patchComponent(sheetObject.id, 'appearance', { color: colour })
    }, [patchComponent, sheetObject])

    const handleNudge = useCallback((direction) => {
        if (!sheetObject || !walkerRef.current) return
        const current = sheetObject.components?.transform?.position || [0, 0, 0]
        const { position: eye } = poseToRay(walkerRef.current)
        const next = nudgeFromViewer(current, eye, direction * JAM_NUDGE_STEP)
        if (next[0] === current[0] && next[2] === current[2]) {
            say(NUDGE_LIMIT_MESSAGE)
            return
        }
        patchComponent(sheetObject.id, 'transform', { position: next })
    }, [patchComponent, say, sheetObject])

    const handleRemove = useCallback(() => {
        if (!sheetObject) return
        const objectId = sheetObject.id
        if (!isMine(objectId, mineIds)) return
        applyLocalOps(
            { type: 'deleteEntity', payload: { entityId: objectId } },
            { activityMessage: 'Removed an object from the jam.', activityLevel: 'warning' }
        )
        setMineIds((ids) => forgetMineId(objectId, ids))
        setSheet(null)
    }, [applyLocalOps, mineIds, sheetObject])

    // --- the surface -----------------------------------------------------

    const sceneExtras = useMemo(
        () => <JamStandingMarkers visitors={standingVisitors} />,
        [standingVisitors]
    )

    // The platform's floating account button is fixed to the bottom-right of
    // every surface. Measured on an iPhone 13: it lands at 346,548–376,578,
    // INSIDE the sheet's "photo" tile (261,551–374,626) and above it in z — so
    // the one contribution that matters at an event, a picture from your own
    // camera, has a sign-in button parked on its corner. The landing and the
    // wiki already take themselves out of its way the same way; a full-bleed
    // surface with its own thumb-reachable controls is the same case.
    useEffect(() => {
        document.body.classList.add('is-jam')
        return () => document.body.classList.remove('is-jam')
    }, [])

    return (
        <main className="jam-surface" data-space-id={spaceId || ''}>
            <LiveProjectScene
                projectId={projectId}
                document={projectDocument}
                walkerRef={walkerRef}
                sceneExtras={sceneExtras}
                interactive
                showChrome={false}
                showModeControls={false}
                title=""
            />

            <div className="jam-overlay">
                <div className="jam-topbar">
                    <span className="jam-count">
                        <span
                            className={`jam-count-dot${peopleHere === 1 ? ' is-alone' : ''}`}
                            aria-hidden="true"
                        />
                        {describePeopleHere(peopleHere)}
                    </span>
                    {/* Phones have never had this. The full toolset was behind
                        a control cluster that only renders on a wide screen. */}
                    <a className="jam-exit" href={buildJamEditorPath()}>
                        Full editor →
                    </a>
                </div>

                {status || state.loading ? (
                    <div className="jam-status" role="status">
                        {status || 'Loading the jam…'}
                    </div>
                ) : null}

                {sheet ? (
                    <JamSheet
                        face={sheet.face}
                        object={sheetObject}
                        mineObjects={mineObjects}
                        busy={busy}
                        onClose={() => setSheet(null)}
                        onAddShape={(type) => addObject(type)}
                        onPickFile={addPhoto}
                        onText={handleText}
                        onColour={handleColour}
                        onNudge={handleNudge}
                        onRemove={handleRemove}
                        onPickMine={(objectId) => setSheet({ face: 'edit', objectId })}
                    />
                ) : (
                    <div className="jam-add-bar">
                        {mineObjects.length ? (
                            <button
                                type="button"
                                className="jam-mine-chip"
                                onClick={() => setSheet({ face: 'mine' })}
                            >
                                {mineObjects.length === 1 ? '1 of yours' : `${mineObjects.length} of yours`}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="jam-add"
                            aria-label="Add something"
                            onClick={() => setSheet({ face: 'add' })}
                        >
                            +
                        </button>
                    </div>
                )}
            </div>
        </main>
    )
}
