import { useCallback, useEffect, useRef, useState } from 'react'
import { useMediaQuery, useTheme } from '@mui/material'
import { Vector3 } from 'three'
import { createEntityOfType, getInspectorSections } from '../../project/entityRegistry.js'
import { useProjectDocumentSync } from '../../project/hooks/useProjectDocumentSync.js'
import { useProjectPresence } from '../../project/hooks/useProjectPresence.js'
import { useProjectStore } from '../../project/state/projectStore.js'
import { DEFAULT_PROJECT_SPACE_ID, uploadProjectAsset } from '../../project/services/projectsApi.js'
import { createStudioProjectBundle, readStudioProjectBundle } from '../../project/transfer/studioProjectBundle.js'
import { defaultWorldState, normalizeProjectDocument } from '../../shared/projectSchema.js'
import useXrAr from '../../hooks/useXrAr.js'
import useSpaceAssets from '../../hooks/useSpaceAssets.js'
import { getServerSpace, updateServerSpace } from '../../services/serverSpaces.js'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { buildStudioHubPath, buildStudioProjectPath, navigateToStudioPath } from '../utils/studioRouting.js'
import { useStudioLayoutPrefs } from '../hooks/useStudioLayoutPrefs.js'
import { getPointsBoundingSphere } from '../../utils/cameraFraming.js'
import StudioShell from './StudioShell.jsx'

const DISPLAY_NAME_KEY = 'dii.studio.displayName'

const detectEntityTypeFromFile = (file) => {
    const mime = file?.type || file?.mimeType || ''
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('audio/')) return 'audio'
    return 'model'
}

const getStarterPlacement = (count = 0) => [((count % 4) - 1.5) * 1.4, 0, Math.floor(count / 4) * -1.8]

const buildDownload = (content, filename, type = 'application/json') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
}

const readCurrentCameraSnapshot = (controlsRef, fallback) => {
    const camera = controlsRef.current?.object
    const target = controlsRef.current?.target
    if (!camera || !target) {
        return fallback
    }
    return {
        position: camera.position.toArray(),
        target: target.toArray(),
        projection: camera.isOrthographicCamera ? 'orthographic' : 'perspective',
        fov: Number.isFinite(camera.fov) ? camera.fov : 50,
        zoom: Number.isFinite(camera.zoom) ? camera.zoom : 1,
        near: Number.isFinite(camera.near) ? camera.near : 0.1,
        far: Number.isFinite(camera.far) ? camera.far : 200,
        locked: true
    }
}

export default function StudioEditor({ projectId, spaceId = DEFAULT_PROJECT_SPACE_ID }) {
    const [displayName, setDisplayName] = useState(() => {
        try {
            return window.localStorage.getItem(DISPLAY_NAME_KEY)
                || window.localStorage.getItem('dii.beta.displayName')
                || ''
        } catch {
            return ''
        }
    })
    const store = useProjectStore()
    const { state, dispatch } = store
    const { applyLocalOps: _applyLocalOps, replaceDocument } = useProjectDocumentSync({
        projectId,
        store,
        clientIdPrefix: 'studio-client',
        opIdPrefix: 'studio-op'
    })
    const historyRef = useRef([])
    const redoRef = useRef([])
    const clipboardRef = useRef(null)
    const documentRef = useRef(state.document)
    useEffect(() => { documentRef.current = state.document }, [state.document])
    const applyLocalOps = useCallback((ops, options) => {
        historyRef.current = [...historyRef.current.slice(-49), documentRef.current]
        redoRef.current = []
        return _applyLocalOps(ops, options)
    }, [_applyLocalOps])
    const presence = useProjectPresence({
        projectId,
        displayName,
        displayNameStorageKey: DISPLAY_NAME_KEY,
        userIdStorageKey: 'dii.studio.userId',
        legacyDisplayNameStorageKeys: ['dii.beta.displayName'],
        legacyUserIdStorageKeys: ['dii.beta.userId'],
        anonymousLabel: 'Studio',
        userIdPrefix: 'studio-user'
    })
    const document = state.document
    const resolvedSpaceId = spaceId || document.projectMeta?.spaceId || DEFAULT_PROJECT_SPACE_ID
    const { assets: spaceAssets, refresh: refreshSpaceAssets } = useSpaceAssets(resolvedSpaceId)
    const entities = document.entities || []
    const selectedEntity = entities.find((entity) => entity.id === state.selectedEntityId) || null
    const selectedEntityIds = state.selectedEntityIds || []
    const selectedEntities = entities.filter((entity) => selectedEntityIds.includes(entity.id))
    const [transformOp, setTransformOp] = useState(null)
    const [exportStatus, setExportStatus] = useState(null)
    const transformOpRef = useRef(null)
    useEffect(() => { transformOpRef.current = transformOp }, [transformOp])
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
    const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'lg'))
    const profile = isMobile ? 'mobile' : (isTablet ? 'tablet' : 'desktop')
    const { layout, updateLayout } = useStudioLayoutPrefs({
        projectId,
        profile,
        legacyWindowLayout: document.windowLayout
    })
    const controlsRef = useRef(null)
    const [spaceMeta, setSpaceMeta] = useState(null)
    const [isUpdatingLiveProject, setIsUpdatingLiveProject] = useState(false)
    const [cameraView, setCameraView] = useState(() => ({
        position: document.worldState?.savedView?.position || defaultWorldState.savedView.position,
        target: document.worldState?.savedView?.target || defaultWorldState.savedView.target
    }))

    useEffect(() => {
        const savedView = document.worldState?.savedView || defaultWorldState.savedView
        setCameraView({
            position: savedView.position,
            target: savedView.target
        })
    }, [document.worldState?.savedView])

    useEffect(() => {
        try {
            window.localStorage.setItem(DISPLAY_NAME_KEY, displayName)
        } catch {
            // ignore local storage errors
        }
    }, [displayName])

    useEffect(() => {
        const handler = (event) => {
            const tag = event.target?.tagName?.toLowerCase?.()
            if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return
            const isUndo = (event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey
            const isRedo = (event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))
            if (!isUndo && !isRedo) return
            event.preventDefault()
            if (isUndo && historyRef.current.length > 0) {
                redoRef.current = [...redoRef.current.slice(-49), documentRef.current]
                const prev = historyRef.current.at(-1)
                historyRef.current = historyRef.current.slice(0, -1)
                dispatch({ type: 'replace-document', document: prev, version: state.version })
            } else if (isRedo && redoRef.current.length > 0) {
                historyRef.current = [...historyRef.current.slice(-49), documentRef.current]
                const next = redoRef.current.at(-1)
                redoRef.current = redoRef.current.slice(0, -1)
                dispatch({ type: 'replace-document', document: next, version: state.version })
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [dispatch, state.version])

    useEffect(() => {
        let cancelled = false

        getServerSpace(resolvedSpaceId)
            .then((space) => {
                if (cancelled) return
                setSpaceMeta(space)
            })
            .catch(() => {
                if (cancelled) return
                setSpaceMeta(null)
            })

        return () => {
            cancelled = true
        }
    }, [resolvedSpaceId])

    const xr = useXrAr({
        default3DView: document.worldState?.savedView || defaultWorldState.savedView,
        controlsRef,
        setCameraPosition: (position) => setCameraView((current) => ({ ...current, position })),
        setCameraTarget: (target) => setCameraView((current) => ({ ...current, target }))
    })

    const handleCreateEntity = (type, asset = null) => {
        const entity = createEntityOfType(type, {
            name: asset?.name ? asset.name.replace(/\.[^.]+$/, '') : undefined,
            components: {
                transform: {
                    position: getStarterPlacement(entities.length)
                },
                ...(asset ? {
                    media: {
                        assetId: asset.id,
                        autoplay: type !== 'image',
                        loop: true,
                        muted: type === 'video'
                    }
                } : {})
            }
        })
        applyLocalOps({
            type: 'createEntity',
            payload: { entity }
        }, { activityMessage: `Created ${entity.type} entity.` })
        dispatch({ type: 'select-entity', entityId: entity.id })
    }

    const handleAssetFilesSelected = async (event) => {
        const files = Array.from(event.target.files || [])
        if (!files.length) return
        for (const file of files) {
            const asset = await uploadProjectAsset(projectId, file)
            applyLocalOps({
                type: 'upsertAsset',
                payload: { asset }
            }, { activityMessage: `Imported ${file.name}.` })
            handleCreateEntity(detectEntityTypeFromFile(file), asset)
        }
        event.target.value = ''
        refreshSpaceAssets()
    }

    const handleDeleteSelected = () => {
        const targets = selectedEntities.length ? selectedEntities : (selectedEntity ? [selectedEntity] : [])
        if (!targets.length) return
        applyLocalOps(
            targets.map((entity) => ({ type: 'deleteEntity', payload: { entityId: entity.id } })),
            {
                activityMessage: targets.length === 1
                    ? `Deleted ${targets[0].name}.`
                    : `Deleted ${targets.length} entities.`,
                activityLevel: 'warning'
            }
        )
        dispatch({ type: 'select-entity', entityId: null })
    }

    // Build a new entity from any source (selected entity or clipboard), offset
    // slightly on X/Z so the copy doesn't sit exactly on top of the original.
    const cloneEntityFrom = (source) => {
        const sourcePosition = source.components?.transform?.position || [0, 0, 0]
        return createEntityOfType(source.type, {
            name: `${source.name} copy`,
            components: {
                ...structuredClone(source.components),
                transform: {
                    ...structuredClone(source.components?.transform),
                    position: [sourcePosition[0] + 0.4, sourcePosition[1], sourcePosition[2] + 0.4]
                }
            }
        })
    }

    const handleDuplicateSelected = () => {
        const targets = selectedEntities.length ? selectedEntities : (selectedEntity ? [selectedEntity] : [])
        if (!targets.length) return
        const clones = targets.map(cloneEntityFrom)
        applyLocalOps(
            clones.map((entity) => ({ type: 'createEntity', payload: { entity } })),
            {
                activityMessage: clones.length === 1
                    ? `Duplicated ${targets[0].name}.`
                    : `Duplicated ${clones.length} entities.`
            }
        )
        dispatch({ type: 'select-entities', entityIds: clones.map((entity) => entity.id) })
    }

    const handleCopySelected = () => {
        if (!selectedEntity) return
        clipboardRef.current = {
            type: selectedEntity.type,
            name: selectedEntity.name,
            components: structuredClone(selectedEntity.components)
        }
    }

    const handlePasteClipboard = () => {
        const source = clipboardRef.current
        if (!source) return
        const entity = cloneEntityFrom(source)
        applyLocalOps({
            type: 'createEntity',
            payload: { entity }
        }, { activityMessage: `Pasted ${source.name}.` })
        dispatch({ type: 'select-entity', entityId: entity.id })
    }

    const handleCutSelected = () => {
        if (!selectedEntity) return
        handleCopySelected()
        handleDeleteSelected()
    }

    const handleFrameSelected = () => {
        const cc = controlsRef.current
        if (!cc) return
        const visibleEntities = entities.filter((entity) => entity.components?.runtime?.visible !== false)
        const targets = selectedEntities.length ? selectedEntities.filter((entity) => entity.components?.runtime?.visible !== false) : visibleEntities
        const sphere = getPointsBoundingSphere(
            targets.map((entity) => entity.components?.transform?.position || [0, 0, 0]),
            { minRadius: targets.length === 1 ? 0.75 : 1 }
        )
        const camera = cc.camera || cc._camera
        if (!sphere || !camera) return
        const previousTarget = cc._target || new Vector3()
        const direction = camera.position.clone().sub(previousTarget)
        if (direction.lengthSq() <= 1e-8) direction.set(0.8, 0.45, 1)
        direction.normalize()
        const halfFov = Math.max(0.01, (camera.fov || 50) * Math.PI / 360)
        const distance = (sphere.radius * (targets.length === 1 ? 1.35 : 1.45)) / Math.sin(halfFov)
        const position = sphere.center.clone().add(direction.multiplyScalar(distance))
        cc.setLookAt(position.x, position.y, position.z, sphere.center.x, sphere.center.y, sphere.center.z, true)
    }

    useEffect(() => {
        const handler = (event) => {
            const tag = event.target?.tagName?.toLowerCase?.()
            if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return

            // While a modal transform is running, the operator owns the keyboard
            // (X/Y/Z constrain, Enter/Esc finish) — don't let these shortcuts fire.
            if (transformOpRef.current) return

            const meta = event.ctrlKey || event.metaKey
            const key = event.key

            // Select all (A) / deselect all (Alt+A) — Blender style
            if (!meta && (key === 'a' || key === 'A')) {
                event.preventDefault()
                if (event.altKey) {
                    dispatch({ type: 'select-entities', entityIds: [] })
                } else {
                    dispatch({
                        type: 'select-entities',
                        entityIds: entities
                            .filter((entity) => entity.components?.runtime?.visible !== false && entity.components?.runtime?.locked !== true)
                            .map((entity) => entity.id)
                    })
                }
                return
            }

            // Clipboard — Copy (Ctrl/Cmd+C), Paste (Ctrl/Cmd+V), Cut (Ctrl/Cmd+X)
            if (meta && (key === 'c' || key === 'C')) {
                if (!selectedEntity) return
                event.preventDefault()
                handleCopySelected()
                return
            }
            if (meta && (key === 'v' || key === 'V')) {
                if (!clipboardRef.current) return
                event.preventDefault()
                handlePasteClipboard()
                return
            }
            if (meta && (key === 'x' || key === 'X')) {
                if (!selectedEntity) return
                event.preventDefault()
                handleCutSelected()
                return
            }

            // Duplicate — Shift+D (Blender) or Ctrl/Cmd+D
            if ((event.shiftKey || meta) && (key === 'd' || key === 'D')) {
                if (!selectedEntity) return
                event.preventDefault()
                handleDuplicateSelected()
                return
            }
            // Delete / Backspace. Bare X is reserved for gizmo axis constraint.
            if (!meta && (key === 'Delete' || key === 'Backspace')) {
                if (!selectedEntity) return
                event.preventDefault()
                handleDeleteSelected()
                return
            }
            // Frame selected — F (Maya/Unity) or "." (Blender numpad). Both supported.
            if (event.key === 'f' || event.key === 'F' || event.key === '.') {
                if (!selectedEntity) return
                event.preventDefault()
                handleFrameSelected()
                return
            }
            // Deselect
            if (event.key === 'Escape' && selectedEntity) {
                dispatch({ type: 'select-entity', entityId: null })
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEntity, selectedEntities, entities, dispatch])

    const handleWorldPatch = (patch) => {
        applyLocalOps({
            type: 'setWorldState',
            payload: { patch }
        })
    }

    const handleRenderSettingsPatch = (patch) => {
        applyLocalOps({
            type: 'setRenderSettings',
            payload: { patch }
        })
    }

    const handleProjectMetaPatch = (patch) => {
        applyLocalOps({
            type: 'setProjectMeta',
            payload: { patch }
        })
    }

    const handlePresentationPatch = (patch) => {
        applyLocalOps({
            type: 'setPresentationState',
            payload: { patch }
        })
    }

    const handlePublishPatch = (patch) => {
        applyLocalOps({
            type: 'setPublishState',
            payload: { patch }
        })
    }

    const handleInspectorChange = (component, nextValue) => {
        if (selectedEntity) {
            applyLocalOps({
                type: 'updateComponent',
                payload: {
                    entityId: selectedEntity.id,
                    component,
                    patch: nextValue
                }
            })
            return
        }
        if (component === 'worldState') {
            handleWorldPatch(nextValue)
        }
    }

    const handleTransformCommit = useCallback((entityId, transform) => {
        if (!entityId) return
        applyLocalOps({
            type: 'updateComponent',
            payload: { entityId, component: 'transform', patch: transform }
        })
    }, [applyLocalOps])

    // Commit several entity transforms at once (modal multi-object move) as a single
    // undo step.
    const handleTransformCommitMany = useCallback((list) => {
        const ops = (list || [])
            .filter((entry) => entry?.id && entry.transform)
            .map((entry) => ({
                type: 'updateComponent',
                payload: { entityId: entry.id, component: 'transform', patch: entry.transform }
            }))
        if (ops.length) applyLocalOps(ops)
        setTransformOp(null)
    }, [applyLocalOps])

    const handleStartTransform = useCallback((mode) => {
        setTransformOp({ mode, seq: Date.now() })
    }, [])

    const handleTransformCancel = useCallback(() => {
        setTransformOp(null)
    }, [])

    const handleCameraViewChange = (nextView) => {
        if (!nextView) return
        setCameraView({
            position: nextView.position,
            target: nextView.target
        })
    }

    const handleSaveCurrentCamera = () => {
        const snapshot = readCurrentCameraSnapshot(controlsRef, {
            ...document.worldState?.savedView
        })
        handleCameraViewChange(snapshot)
        handleWorldPatch({
            savedView: {
                position: snapshot.position,
                target: snapshot.target,
                mode: 'perspective',
                fov: snapshot.fov,
                zoom: snapshot.zoom,
                near: snapshot.near,
                far: snapshot.far
            }
        })
        dispatch({
            type: 'append-activity',
            level: 'info',
            message: 'Saved current camera as the editor default view.'
        })
    }

    const handleViewLive = () => {
        const url = `${window.location.origin}${buildAppSpacePath(resolvedSpaceId)}`
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    const handleCopyShareLink = async () => {
        const isLiveProject = spaceMeta?.publishedProjectId === projectId
        const sharePath = isLiveProject
            ? buildAppSpacePath(resolvedSpaceId)
            : buildStudioProjectPath(projectId, resolvedSpaceId)
        const url = `${window.location.origin}${sharePath}`
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url)
            } else if (typeof window.prompt === 'function') {
                window.prompt('Copy share link', url)
            }
            dispatch({
                type: 'append-activity',
                level: 'info',
                message: `${isLiveProject ? 'Copied the live space link' : 'Copied the project share link'}: ${url}`
            })
        } catch (error) {
            dispatch({
                type: 'append-activity',
                level: 'error',
                message: `Could not copy share link: ${error.message || 'unknown error'}`
            })
        }
    }

    const handleSetLiveProject = async () => {
        setIsUpdatingLiveProject(true)
        try {
            const nextSpace = await updateServerSpace(resolvedSpaceId, {
                publishedProjectId: projectId
            })
            setSpaceMeta(nextSpace)
            dispatch({
                type: 'append-activity',
                level: 'info',
                message: `Published this project to /${resolvedSpaceId}.`
            })
        } catch (error) {
            dispatch({
                type: 'append-activity',
                level: 'error',
                message: `Could not set the live project: ${error.message || 'unknown error'}`
            })
        } finally {
            setIsUpdatingLiveProject(false)
        }
    }

    const handleClearLiveProject = async () => {
        setIsUpdatingLiveProject(true)
        try {
            const nextSpace = await updateServerSpace(resolvedSpaceId, {
                publishedProjectId: null
            })
            setSpaceMeta(nextSpace)
            dispatch({
                type: 'append-activity',
                level: 'info',
                message: `Cleared the live project for /${resolvedSpaceId}.`
            })
        } catch (error) {
            dispatch({
                type: 'append-activity',
                level: 'error',
                message: `Could not clear the live project: ${error.message || 'unknown error'}`
            })
        } finally {
            setIsUpdatingLiveProject(false)
        }
    }

    const handleExportProject = async () => {
        if (exportStatus && exportStatus.phase !== 'error') return
        const exportedAt = Date.now()
        const exportDocument = normalizeProjectDocument({
            ...document,
            publishState: {
                ...document.publishState,
                lastExportAt: exportedAt
            }
        })
        try {
            setExportStatus({ phase: 'downloading', completed: 0, total: exportDocument.assets.length })
            const bundle = await createStudioProjectBundle(exportDocument, { onProgress: setExportStatus })
            buildDownload(bundle, `${document.projectMeta?.title || projectId}.studio.zip`, 'application/zip')
            setExportStatus(null)
            handlePublishPatch({ lastExportAt: exportedAt })
            dispatch({
                type: 'append-activity',
                level: 'info',
                message: `Exported project with ${exportDocument.assets.length} bundled assets.`
            })
        } catch (error) {
            setExportStatus({ phase: 'error', message: error.message || 'unknown error' })
            dispatch({
                type: 'append-activity',
                level: 'error',
                message: `Could not export complete project: ${error.message || 'unknown error'}`
            })
        }
    }

    const handleImportProjectFile = async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        try {
            const { document: importedDocument, assetFiles } = await readStudioProjectBundle(file)
            const uploadedAssets = new Map()
            for (const [assetId, assetFile] of assetFiles.entries()) {
                const uploaded = await uploadProjectAsset(projectId, assetFile, { assetId, filename: assetFile.name })
                uploadedAssets.set(assetId, uploaded)
            }
            const imported = normalizeProjectDocument({
                ...importedDocument,
                assets: importedDocument.assets.map((asset) => uploadedAssets.get(asset.id) || asset)
            })
            await replaceDocument({
                ...imported,
                projectMeta: {
                    ...imported.projectMeta,
                    id: document.projectMeta?.id || projectId,
                    spaceId: spaceId || document.projectMeta?.spaceId || imported.projectMeta.spaceId
                }
            }, {
                activityMessage: `Imported ${file.name}.`
            })
        } catch (error) {
            dispatch({
                type: 'append-activity',
                level: 'error',
                message: `Could not import project: ${error.message || 'unknown error'}`
            })
        } finally {
            event.target.value = ''
        }
    }

    const inspectorSections = selectedEntity
        ? getInspectorSections(selectedEntity)
        : [
            {
                id: 'worldState',
                label: 'World',
                fields: [
                    { label: 'Background', component: 'worldState', path: ['backgroundColor'], type: 'color' },
                    { label: 'Grid Visible', component: 'worldState', path: ['gridVisible'], type: 'checkbox' },
                    { label: 'Grid Size', component: 'worldState', path: ['gridSize'], type: 'number', min: 1, step: 1 },
                    { label: 'Ambient Color', component: 'worldState', path: ['ambientLight', 'color'], type: 'color' },
                    { label: 'Ambient Intensity', component: 'worldState', path: ['ambientLight', 'intensity'], type: 'number', min: 0, max: 2, step: 0.05 },
                    { label: 'Sun Color', component: 'worldState', path: ['directionalLight', 'color'], type: 'color' },
                    { label: 'Sun Intensity', component: 'worldState', path: ['directionalLight', 'intensity'], type: 'number', min: 0, max: 3, step: 0.05 }
                ]
            }
        ]

    const inspectorValues = selectedEntity ? selectedEntity.components : { worldState: document.worldState }
    const syncState = {
        activity: state.activity,
        sceneStreamState: state.sceneStreamState,
        sceneStreamError: state.sceneStreamError
    }

    return (
        <StudioShell
            document={document}
            loading={state.loading}
            loadError={state.loadError}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            selectedEntity={selectedEntity}
            selectedEntityId={state.selectedEntityId}
            selectedEntityIds={selectedEntityIds}
            entities={entities}
            inspectorSections={inspectorSections}
            inspectorValues={inspectorValues}
            assetOptions={document.assets || []}
            spaceAssets={spaceAssets}
            presence={presence}
            syncState={syncState}
            layout={layout}
            updateLayout={updateLayout}
            isDesktop={!isMobile && !isTablet}
            isMobile={isMobile}
            cameraView={cameraView}
            controlsRef={controlsRef}
            xrState={{ ...xr, xrStore: xr.xrStore }}
            onCreateEntity={handleCreateEntity}
            onCreateFromAsset={(asset) => handleCreateEntity(detectEntityTypeFromFile(asset), asset)}
            onAssetFilesSelected={handleAssetFilesSelected}
            onDeleteSelected={handleDeleteSelected}
            onSelectEntity={(entityId) => dispatch({ type: 'select-entity', entityId })}
            onToggleSelectEntity={(entityId) => dispatch({ type: 'toggle-entity-selection', entityId })}
            onInspectorChange={handleInspectorChange}
            onWorldPatch={handleWorldPatch}
            onRenderSettingsPatch={handleRenderSettingsPatch}
            onProjectMetaPatch={handleProjectMetaPatch}
            onPresentationPatch={handlePresentationPatch}
            onPublishPatch={handlePublishPatch}
            onSaveCurrentCamera={handleSaveCurrentCamera}
            onCopyShareLink={handleCopyShareLink}
            onViewLive={handleViewLive}
            onExportProject={handleExportProject}
            exportStatus={exportStatus}
            onImportProjectFile={handleImportProjectFile}
            onEnterXr={xr.handleEnterXrSession}
            onExitXr={xr.handleExitXrSession}
            onBackToHub={() => navigateToStudioPath(buildStudioHubPath(resolvedSpaceId))}
            onCameraViewChange={handleCameraViewChange}
            onTransformCommit={handleTransformCommit}
            transformOp={transformOp}
            onStartTransform={handleStartTransform}
            onTransformCommitMany={handleTransformCommitMany}
            onTransformCancel={handleTransformCancel}
            liveProjectState={{
                spaceId: resolvedSpaceId,
                spaceLabel: spaceMeta?.label || resolvedSpaceId,
                currentLiveProjectId: spaceMeta?.publishedProjectId || null,
                isLiveProject: spaceMeta?.publishedProjectId === projectId,
                isUpdating: isUpdatingLiveProject
            }}
            onSetLiveProject={handleSetLiveProject}
            onClearLiveProject={handleClearLiveProject}
        />
    )
}
