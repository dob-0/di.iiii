import { useCallback, useEffect, useRef, useState } from 'react'
import { useMediaQuery, useTheme } from '@mui/material'
import { createEntityOfType, getInspectorSections } from '../../project/entityRegistry.js'
import { useProjectDocumentSync } from '../../project/hooks/useProjectDocumentSync.js'
import { useProjectPresence } from '../../project/hooks/useProjectPresence.js'
import { useProjectStore } from '../../project/state/projectStore.js'
import { DEFAULT_PROJECT_SPACE_ID, uploadProjectAsset } from '../../project/services/projectsApi.js'
import { defaultWorldState, normalizeProjectDocument } from '../../shared/projectSchema.js'
import useXrAr from '../../hooks/useXrAr.js'
import useSpaceAssets from '../../hooks/useSpaceAssets.js'
import { getServerSpace, updateServerSpace } from '../../services/serverSpaces.js'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { buildStudioHubPath, buildStudioProjectPath, navigateToStudioPath } from '../utils/studioRouting.js'
import { useStudioLayoutPrefs } from '../hooks/useStudioLayoutPrefs.js'
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
    const blob = new Blob([content], { type })
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
        if (!selectedEntity) return
        applyLocalOps({
            type: 'deleteEntity',
            payload: { entityId: selectedEntity.id }
        }, { activityMessage: `Deleted ${selectedEntity.name}.`, activityLevel: 'warning' })
        dispatch({ type: 'select-entity', entityId: null })
    }

    const handleWorldPatch = (patch) => {
        applyLocalOps({
            type: 'setWorldState',
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
                mode: 'perspective'
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

    const handleExportProject = () => {
        const exportedAt = Date.now()
        const exportDocument = normalizeProjectDocument({
            ...document,
            publishState: {
                ...document.publishState,
                lastExportAt: exportedAt
            }
        })
        buildDownload(
            JSON.stringify(exportDocument, null, 2),
            `${document.projectMeta?.title || projectId}.studio.json`
        )
        handlePublishPatch({ lastExportAt: exportedAt })
        dispatch({
            type: 'append-activity',
            level: 'info',
            message: 'Exported the current project document.'
        })
    }

    const handleImportProjectFile = async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        try {
            const text = await file.text()
            const imported = normalizeProjectDocument(JSON.parse(text))
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
                    { label: 'Ambient Intensity', component: 'worldState', path: ['ambientLight', 'intensity'], type: 'number', min: 0, step: 0.05 },
                    { label: 'Sun Color', component: 'worldState', path: ['directionalLight', 'color'], type: 'color' },
                    { label: 'Sun Intensity', component: 'worldState', path: ['directionalLight', 'intensity'], type: 'number', min: 0, step: 0.05 }
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
            onInspectorChange={handleInspectorChange}
            onWorldPatch={handleWorldPatch}
            onProjectMetaPatch={handleProjectMetaPatch}
            onPresentationPatch={handlePresentationPatch}
            onPublishPatch={handlePublishPatch}
            onSaveCurrentCamera={handleSaveCurrentCamera}
            onCopyShareLink={handleCopyShareLink}
            onViewLive={handleViewLive}
            onExportProject={handleExportProject}
            onImportProjectFile={handleImportProjectFile}
            onEnterXr={xr.handleEnterXrSession}
            onExitXr={xr.handleExitXrSession}
            onBackToHub={() => navigateToStudioPath(buildStudioHubPath(resolvedSpaceId))}
            onCameraViewChange={handleCameraViewChange}
            onTransformCommit={handleTransformCommit}
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
