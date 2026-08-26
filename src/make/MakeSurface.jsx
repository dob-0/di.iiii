import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MakeRoom from './MakeRoom.jsx'
import { useProjectStore } from '../project/state/projectStore.js'
import { useProjectDocumentSync } from '../project/hooks/useProjectDocumentSync.js'
import { useProjectPresence } from '../project/hooks/useProjectPresence.js'
import { createEntityOfType } from '../project/entityRegistry.js'
import { currentAuthor } from '../project/authorship.js'
import { getProject, uploadProjectAsset } from '../project/services/projectsApi.js'
import MakeNamePrompt from './MakeNamePrompt.jsx'
import MakeSheet from './MakeSheet.jsx'
import { GlyphAdd, GlyphColour, GlyphPhoto, GlyphTalk } from './MakeGlyphs.jsx'
import { makePlacementPosition, makePlacementRotation } from './makePlacement.js'
import { preparePhoto } from './makePhoto.js'
import { bearingFromView } from './makeFraming.js'
import { DISPLAY_NAME_KEY, USER_ID_KEY, readDisplayName, writeDisplayName } from './makeIdentity.js'
import { nameForShape, splitTitle, WORDS } from './makeVocabulary.js'
// .raw-viewport-shell is `position: absolute; inset: 0` in this file and
// nothing at all without it — RawViewport mounted without raw.css collapses to
// an intrinsic band across the top of the page with dead space beneath. Seen,
// not guessed: PublicGraphSurface.jsx carries the same import and the same
// paragraph for the same reason.
import '../raw/styles/raw.css'
import './makeSurface.css'

// THE TOYBOX.
//
// Five children aged 10 to 17 are making 3D rooms on their own phones at a day
// camp in Dilijan. They were opening Raw, which on a 390px screen is eight
// stacked window bars, a node graph at 34% zoom, nine "Enter ›" affordances,
// and — the part that matters — no view of the thing they are actually making.
//
// Raw is a workshop bench and it is a good one. This is not a replacement for
// it and shares every drawer underneath: the same project document, the same op
// layer (useProjectDocumentSync), the same renderer (RawViewport), the same
// presence and chat transport, the same uploader. A mentor opening
// /{space}/raw/projects/{id} sees every object made here, authored by name.
// Nothing about Raw's own surface changes.
//
// What is different is the lid. The room fills the screen and is tappable. Four
// words sit under it. There are no windows, no graph, no zoom control, no
// chrome, and every choice a child is offered is one of nine colours or one of
// five shapes.

export default function MakeSurface({ projectId, spaceId }) {
    const store = useProjectStore()
    const { state, dispatch } = store
    const { applyLocalOps } = useProjectDocumentSync({
        projectId,
        store,
        clientIdPrefix: 'make-client',
        opIdPrefix: 'make-op'
    })

    // Read once at mount, then owned by React. The prompt below writes it
    // through to localStorage the moment it is answered, so presence and
    // authorship both pick it up on the same tick.
    const [displayName, setDisplayName] = useState(readDisplayName)
    const [nameAsked, setNameAsked] = useState(() => Boolean(readDisplayName()))

    // Raw's own identity keys, deliberately — see makeIdentity.js. The presence
    // hook persists `displayName` back to that key itself, which is what makes
    // a child's name appear on a Raw chat bubble without Raw changing at all.
    const presence = useProjectPresence({
        projectId,
        displayName,
        displayNameStorageKey: DISPLAY_NAME_KEY,
        userIdStorageKey: USER_ID_KEY,
        anonymousLabel: 'Guest',
        userIdPrefix: 'raw-user'
    })

    // `projectDocument`, never `document`: this file renders JSX, and a local
    // named `document` shadows the DOM global for the whole function scope.
    const projectDocument = state.document
    const entities = useMemo(() => projectDocument?.entities || [], [projectDocument?.entities])

    // Which way is "in front of the room" — see makePlacement.js. Read from the
    // project's own saved view so the arc widens across the picture rather than
    // along whichever axis happens to be +Z.
    const placement = useMemo(() => ({
        bearing: bearingFromView(projectDocument?.worldState?.savedView),
        origin: projectDocument?.worldState?.savedView?.target || [0, 0, 0]
    }), [projectDocument?.worldState?.savedView])

    const [sheet, setSheet] = useState(null)
    const [status, setStatus] = useState('')
    const [readCount, setReadCount] = useState(0)
    const fileInputRef = useRef(null)

    const selectedId = state.selectedEntityId
    const selected = useMemo(
        () => (selectedId ? entities.find((entity) => entity.id === selectedId) || null : null),
        [entities, selectedId]
    )

    // A line that says itself and goes away. No toast system on this surface.
    // Bad news stays up longer than good news — a child who missed the one
    // moment the surface told them their photo did not go in has no way to ask.
    const say = useCallback((word, holdMs = 2600) => {
        setStatus(word)
        window.setTimeout(() => setStatus((current) => (current === word ? '' : current)), holdMs)
    }, [])

    // The platform's floating account chip is fixed to the bottom-right of every
    // surface and lands on top of the fourth word. RootApp already refuses it
    // (`showAccountButton={false}`); this is the belt to that pair of braces,
    // reusing the jam's existing rule rather than restating it, because the chip
    // is mounted by a component this one does not own and a fourth word a thumb
    // cannot reach is the failure that ends the afternoon.
    useEffect(() => {
        document.body.classList.add('is-make')
        return () => document.body.classList.remove('is-make')
    }, [])

    // Unread count on the talk button, cleared by opening it.
    useEffect(() => {
        if (sheet === 'talk') setReadCount(presence.messages.length)
    }, [sheet, presence.messages.length])
    const unread = sheet === 'talk' ? 0 : Math.max(0, presence.messages.length - readCount)

    const handleName = useCallback((value) => {
        const name = writeDisplayName(value)
        if (name) setDisplayName(name)
        setNameAsked(true)
    }, [])

    // --- add -------------------------------------------------------------

    const addShape = useCallback((type) => {
        const entity = createEntityOfType(type, {
            name: nameForShape(type) || undefined,
            createdBy: currentAuthor(displayName),
            components: {
                transform: { position: makePlacementPosition(type, entities.length, placement) }
            }
        })
        if (!entity) return
        applyLocalOps(
            { type: 'createEntity', payload: { entity } },
            { activityMessage: `Added a ${type}.` }
        )
        // Select what was just made: the four words act on the selection, so a
        // child who adds a cube and then taps colour should be colouring the
        // cube they just added and not nothing.
        dispatch({ type: 'select-entity', entityId: entity.id })
        setSheet(null)
    }, [applyLocalOps, dispatch, displayName, entities.length, placement])

    // --- colour ----------------------------------------------------------

    const pickColour = useCallback((hex) => {
        if (!selectedId) return
        applyLocalOps({
            type: 'updateComponent',
            payload: { entityId: selectedId, component: 'appearance', patch: { color: hex } }
        })
    }, [applyLocalOps, selectedId])

    // --- photo -----------------------------------------------------------
    //
    // No `capture` attribute: a bare `accept="image/*"` lets the phone offer
    // both the camera and the roll, and half of what these children want in
    // their rooms was photographed before they sat down.

    const addPhoto = useCallback(async (chosen) => {
        if (!chosen || !projectId) return
        setStatus(WORDS.sending.hy)
        try {
            // Re-encoded in the browser first — see makePhoto.js. It is what
            // makes an iPhone HEIC land at all, and it means a child's GPS
            // coordinates never leave the phone.
            const { file } = await preparePhoto(chosen)
            const asset = await uploadProjectAsset(projectId, file)
            const entity = createEntityOfType('image', {
                // Both languages, like every other name this surface writes —
                // and not the filename, which is `IMG_0526` on every phone at
                // the camp and is the one label a mentor reading the Raw
                // outliner learns nothing from.
                name: `${WORDS.photo.hy} · ${WORDS.photo.en}`,
                createdBy: currentAuthor(displayName),
                components: {
                    transform: {
                        position: makePlacementPosition('image', entities.length, placement),
                        // A picture is a thing you look AT, and left to itself
                        // it lies flat on the floor like a rug. See
                        // makePlacement.js.
                        rotation: makePlacementRotation('image', placement)
                    },
                    media: { assetId: asset.id, fit: 'contain', autoplay: false, loop: false, muted: true }
                }
            })
            // One batch: the asset record and the thing that points at it are
            // the same edit. Two batches leave a window where the document
            // holds an image entity whose asset another client cannot resolve.
            applyLocalOps([
                { type: 'upsertAsset', payload: { asset } },
                { type: 'createEntity', payload: { entity } }
            ], { activityMessage: `Added a photo.` })
            dispatch({ type: 'select-entity', entityId: entity.id })
            setStatus('')
        } catch {
            say(WORDS.photoFailed.hy, 6000)
        }
    }, [applyLocalOps, dispatch, displayName, entities.length, placement, projectId, say])

    const openPhotoPicker = useCallback(() => {
        setSheet(null)
        fileInputRef.current?.click()
    }, [])

    // --- the surface ------------------------------------------------------

    const selectEntity = useCallback((entityId) => {
        dispatch({ type: 'select-entity', entityId })
    }, [dispatch])

    const clearSelection = useCallback(() => {
        dispatch({ type: 'select-entity', entityId: null })
    }, [dispatch])

    const toggleSheet = useCallback((face) => {
        setSheet((current) => (current === face ? null : face))
    }, [])

    const selectedColour = selected?.components?.appearance?.color || null
    const isEmpty = entities.length === 0 && !state.loading

    // Whose room this is. The project's own title and nothing else — the camp's
    // projects are named for the children (`ՄԱՐԳԱՐԻՏԱ · Margarita`), while the
    // id is an address somebody typed into a phone once. A room that calls a
    // child TEAM 3 is a room that belongs to the camp rather than to them.
    //
    // The DOCUMENT's title is the one that is true, and it took a wrong turn to
    // establish that. The project row and `document.projectMeta.title` can
    // disagree, so the row looked like the safer read — until the row reverted
    // to `Team 1` the moment a child added a shape. Every op batch ends with
    // `upsertProjectMeta({ title: nextDocument.projectMeta.title })`
    // (serverXR/src/routes/projectRoutes.js), so the row is a MIRROR of the
    // document, refreshed on every edit, and the document is upstream of it.
    // The row is still read, as the thing to show before the document has
    // arrived — the first paint of a room should not be nameless.
    const [recordTitle, setRecordTitle] = useState('')
    useEffect(() => {
        if (!projectId) return undefined
        let alive = true
        getProject(projectId)
            .then((result) => { if (alive) setRecordTitle(result?.project?.title || '') })
            .catch(() => {})
        return () => { alive = false }
    }, [projectId])

    const roomName = useMemo(
        () => splitTitle(projectDocument?.projectMeta?.title || recordTitle),
        [recordTitle, projectDocument?.projectMeta?.title]
    )

    return (
        <main className="make-surface" data-space-id={spaceId || ''}>
            <MakeRoom
                projectDocument={projectDocument}
                projectId={projectId}
                roomTitle={roomName?.hy || ''}
                selectedId={selectedId}
                onSelectEntity={selectEntity}
                onClearSelection={clearSelection}
            />

            {roomName && (
                <p className="make-room-name">
                    <span className="make-room-name-hy">{roomName.hy}</span>
                    {roomName.en && <span className="make-room-name-en">{roomName.en}</span>}
                </p>
            )}

            {(status || state.loading) && (
                <p className="make-status" role="status">
                    {status || WORDS.loading.hy}
                </p>
            )}

            {isEmpty && !sheet && (
                <p className="make-empty">
                    <span className="make-word-hy">{WORDS.startHere.hy}</span>
                    <span className="make-word-en">{WORDS.startHere.en}</span>
                    <span className="make-empty-arrow" aria-hidden="true">↓</span>
                </p>
            )}

            {/* THE PHOTO COMES FIRST.
                In two full days of camp not one child has authored anything in
                a browser, and the strand's raw material — photographs of
                Dilijan — is already on their phones. So the picture is not the
                third of four equal words: it is the whole width of the screen,
                on its own row, in the only filled block on the surface, and it
                opens the camera roll on one tap with nothing in between. The
                shapes are the side dish. */}
            <nav className="make-bar" aria-label="make">
                <button type="button" className="make-key make-key--photo" onClick={openPhotoPicker}>
                    <GlyphPhoto />
                    <span className="make-key-words">
                        <span className="make-word-hy">{WORDS.photo.hy}</span>
                        <span className="make-word-en">{WORDS.photo.en}</span>
                    </span>
                </button>
                <button
                    type="button"
                    className={`make-key${sheet === 'add' ? ' is-open' : ''}`}
                    onClick={() => toggleSheet('add')}
                >
                    <GlyphAdd />
                    <span className="make-word-hy">{WORDS.add.hy}</span>
                    <span className="make-word-en">{WORDS.add.en}</span>
                </button>
                <button
                    type="button"
                    className={`make-key${sheet === 'colour' ? ' is-open' : ''}${selected ? ' has-target' : ''}`}
                    onClick={() => toggleSheet('colour')}
                >
                    <GlyphColour />
                    <span className="make-word-hy">{WORDS.colour.hy}</span>
                    <span className="make-word-en">{WORDS.colour.en}</span>
                </button>
                <button
                    type="button"
                    className={`make-key${sheet === 'talk' ? ' is-open' : ''}`}
                    onClick={() => toggleSheet('talk')}
                >
                    <GlyphTalk />
                    {unread > 0 && <span className="make-unread">{unread > 9 ? '9+' : unread}</span>}
                    <span className="make-word-hy">{WORDS.talk.hy}</span>
                    <span className="make-word-en">{WORDS.talk.en}</span>
                </button>
            </nav>

            {sheet && (
                <MakeSheet
                    face={sheet}
                    hasSelection={Boolean(selected)}
                    selectedColour={selectedColour}
                    messages={presence.messages}
                    onAddShape={addShape}
                    onPickColour={pickColour}
                    onSendMessage={presence.sendChatMessage}
                    onClose={() => setSheet(null)}
                />
            )}

            <input
                ref={fileInputRef}
                className="make-file"
                type="file"
                accept="image/*"
                onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) addPhoto(file)
                }}
            />

            {!nameAsked && <MakeNamePrompt onDone={handleName} />}
        </main>
    )
}
