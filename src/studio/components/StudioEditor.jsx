import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMediaQuery, useTheme } from '@mui/material'
import { Vector3 } from 'three'
import { createEntityOfType, getInspectorSections } from '../../project/entityRegistry.js'
import { useProjectDocumentSync } from '../../project/hooks/useProjectDocumentSync.js'
import { useOpHistory } from '../../project/hooks/useOpHistory.js'
import { useProjectPresence } from '../../project/hooks/useProjectPresence.js'
import { useProjectStore } from '../../project/state/projectStore.js'
import { DEFAULT_PROJECT_SPACE_ID, buildProjectAssetUrl, deleteProjectAsset, uploadProjectAsset } from '../../project/services/projectsApi.js'
import { mountRelativeApiUrl } from '../../services/assetSources.js'
import { isHtmlLikeMimeType } from '../../utils/assetContentType.js'
import { createStudioProjectBundle, readStudioProjectBundle } from '../../project/transfer/studioProjectBundle.js'
import { defaultWorldState, normalizeProjectDocument } from '../../shared/projectSchema.js'
import useXrAr from '../../hooks/useXrAr.js'
import useSpaceAssets from '../../hooks/useSpaceAssets.js'
import { deleteServerAsset, getServerSpace, importCommonsAssets, importDriveAssets, importDriveSelection, listServerSpaces, setAssetShared, updateServerSpace } from '../../services/serverSpaces.js'
import { buildAppSpacePath } from '../../utils/spaceRouting.js'
import { buildStudioHubPath, buildStudioProjectPath, navigateToStudioPath } from '../utils/studioRouting.js'
import { buildRawProjectPath } from '../../raw/utils/rawRouting.js'
import { getPointsBoundingSphere } from '../../utils/cameraFraming.js'
import StudioShell from './StudioShell.jsx'
import AssetOptimizationDialog from './AssetOptimizationDialog.jsx'
import { formatAssetSize, optimizeGlbAsset, shouldSuggestGlbOptimization } from '../utils/assetOptimization.js'
import { canPlaceInScene, isPdfAsset, pdfToImageFiles } from '../utils/assetFormats.js'
import { getSelectionCentroid } from '../utils/multiTransform.js'
import { buildReparentPatch, cloneSubtree, collectSubtree, topLevelTargets } from '../utils/entityClipboard.js'
import { isTimelinePreviewPosed, setTimelinePreview } from '../utils/timelinePreview.js'

const DISPLAY_NAME_KEY = 'dii.studio.displayName'

const detectEntityTypeFromFile = (file) => {
    const mime = file?.type || file?.mimeType || ''
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('audio/')) return 'audio'
    return 'model'
}

// Support files that should import as assets only — placing them as entities
// would create a broken model: env maps feed the World window, .mtl pairs
// with an OBJ via the model's Materials picker.
const isSupportAssetFile = (file) => /\.(hdr|exr|mtl)$/i.test(file?.name || '')

const getStarterPlacement = (count = 0) => [((count % 4) - 1.5) * 1.4, 0, Math.floor(count / 4) * -1.8]

// New objects should appear where the user is looking, not march out from world
// origin. Drop them at the orbit target (centre of the current view) with a small
// per-count ring offset so repeated inserts don't perfectly overlap.
const getViewPlacement = (controlsRef, count = 0) => {
    const target = controlsRef?.current?.getTarget?.(new Vector3())
    if (!target) return getStarterPlacement(count)
    const ring = count % 6
    const angle = ring * (Math.PI / 3)
    const spread = ring === 0 ? 0 : 0.75
    return [target.x + Math.cos(angle) * spread, Math.max(0, target.y), target.z + Math.sin(angle) * spread]
}

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
    const cc = controlsRef.current
    const camera = cc?.camera || cc?._camera
    if (!camera || typeof cc.getTarget !== 'function') {
        return fallback
    }
    const target = cc.getTarget(new Vector3())
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
    const clipboardRef = useRef(null)
    const { applyLocalOps, undo, redo, history, jumpTo } = useOpHistory({
        projectId,
        document: state.document,
        applyLocalOps: _applyLocalOps
    })
    const presence = useProjectPresence({
        projectId,
        displayName,
        displayNameStorageKey: DISPLAY_NAME_KEY,
        userIdStorageKey: 'dii.studio.userId',
        legacyDisplayNameStorageKeys: ['dii.beta.displayName'],
        legacyUserIdStorageKeys: ['dii.beta.userId'],
        anonymousLabel: 'Guest',
        userIdPrefix: 'studio-user'
    })
    const document = state.document
    const resolvedSpaceId = spaceId || document.projectMeta?.spaceId || DEFAULT_PROJECT_SPACE_ID
    const { assets: spaceAssets, refresh: refreshSpaceAssets } = useSpaceAssets(resolvedSpaceId)
    // useDriveImport counts result.entries, the routes answer with .assets
    const asImportResult = (data) => ({ entries: data?.assets || [], failed: data?.failed || [] })
    const handleDriveImportUrl = useCallback(async (url) => {
        const result = asImportResult(await importDriveAssets(resolvedSpaceId, url))
        refreshSpaceAssets()
        return result
    }, [resolvedSpaceId, refreshSpaceAssets])
    const handleDriveImportSelection = useCallback(async (fileIds) => {
        const result = asImportResult(await importDriveSelection(resolvedSpaceId, fileIds))
        refreshSpaceAssets()
        return result
    }, [resolvedSpaceId, refreshSpaceAssets])
    const handleToggleAssetShared = useCallback(async (asset, shared) => {
        await setAssetShared(resolvedSpaceId, asset.id, shared)
        refreshSpaceAssets()
    }, [resolvedSpaceId, refreshSpaceAssets])
    const handleCommonsImport = useCallback(async (assetIds) => {
        const result = asImportResult(await importCommonsAssets(resolvedSpaceId, assetIds))
        refreshSpaceAssets()
        return result
    }, [resolvedSpaceId, refreshSpaceAssets])
    const entities = document.entities || []
    const selectedEntity = entities.find((entity) => entity.id === state.selectedEntityId) || null
    const selectedEntityIds = state.selectedEntityIds || []

    // One library view over both stores. Asset ids are content-hashed, so a
    // file adopted from the space shares its id with the project copy —
    // merge on id and track residency instead of showing two lists.
    const libraryItems = useMemo(() => {
        const usedCount = new Map()
        for (const entity of document.entities || []) {
            const id = entity?.components?.media?.assetId
            if (id) usedCount.set(id, (usedCount.get(id) || 0) + 1)
        }
        const items = new Map()
        for (const asset of document.assets || []) {
            items.set(asset.id, { ...asset, inProject: true, inSpace: false, shared: false })
        }
        for (const asset of spaceAssets) {
            const existing = items.get(asset.id)
            if (existing) {
                items.set(asset.id, { ...existing, inSpace: true, shared: Boolean(asset.shared), size: existing.size || asset.size })
            } else {
                items.set(asset.id, { ...asset, inProject: false, inSpace: true, shared: Boolean(asset.shared) })
            }
        }
        return [...items.values()].map((item) => ({ ...item, usedByCount: usedCount.get(item.id) || 0 }))
    }, [document.assets, document.entities, spaceAssets])
    const selectedEntities = entities.filter((entity) => selectedEntityIds.includes(entity.id))
    const [transformOp, setTransformOp] = useState(null)
    const [exportStatus, setExportStatus] = useState(null)
    const [assetOptimizationPrompt, setAssetOptimizationPrompt] = useState(null)
    const assetOptimizationResolveRef = useRef(null)
    const transformOpRef = useRef(null)
    useEffect(() => { transformOpRef.current = transformOp }, [transformOp])
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
    const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'lg'))
    // The real camera-controls instance lives inside the active viewport pane
    // (StudioViewportLayout registers it into paneControlsRef). controlsRef is
    // a live proxy so every editor read resolves to the actual controls at call
    // time — a plain useRef here was never attached to anything and silently
    // broke save-view, frame-selected, click placement, XR restore, and
    // saved-view-on-load.
    const paneControlsRef = useRef(null)
    const controlsRef = useMemo(() => ({
        get current() { return paneControlsRef.current?.current ?? null }
    }), [])
    const [spaceMeta, setSpaceMeta] = useState(null)
    // Spaces list powers the portal entity's Space dropdown (pick by name instead
    // of typing a raw id). Projects for the chosen space are fetched on demand
    // inside the inspector field itself.
    const [spaceOptions, setSpaceOptions] = useState([])
    useEffect(() => {
        let alive = true
        listServerSpaces()
            .then((spaces) => { if (alive) setSpaceOptions(spaces.map((s) => ({ value: s.id, label: s.label || s.id }))) })
            .catch(() => {})
        return () => { alive = false }
    }, [])
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

    useEffect(() => () => {
        assetOptimizationResolveRef.current?.(null)
        assetOptimizationResolveRef.current = null
    }, [])

    useEffect(() => {
        // Undo/redo replays inverse ops through applyLocalOps — the same
        // network-backed path as every other document write. A local-only
        // dispatch here never persists or broadcasts to collaborators, and a
        // whole-document replace would revert their concurrent edits too
        // (see docs/ai/known-fixes.md).
        const handler = (event) => {
            const tag = event.target?.tagName?.toLowerCase?.()
            if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return
            const isUndo = (event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey
            const isRedo = (event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))
            if (!isUndo && !isRedo) return
            event.preventDefault()
            if (isUndo) undo()
            else redo()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [undo, redo])

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

    const handleCreateEntity = (type, asset = null, position = null) => {
        const entity = createEntityOfType(type, {
            name: asset?.name ? asset.name.replace(/\.[^.]+$/, '') : undefined,
            components: {
                transform: {
                    position: position || getViewPlacement(controlsRef, entities.length)
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
        }, { activityMessage: `Created ${entity.type} object.` })
        dispatch({ type: 'select-entity', entityId: entity.id })
    }

    // PDFs can't render in the scene directly — rasterize the pages to PNG
    // project assets and place each page as an image entity.
    const importPdfAsImagePages = async (file) => {
        const pageFiles = await pdfToImageFiles(file)
        for (const pageFile of pageFiles) {
            const asset = await uploadProjectAsset(projectId, pageFile)
            applyLocalOps({
                type: 'upsertAsset',
                payload: { asset }
            }, { activityMessage: `Imported ${pageFile.name} (PDF page).` })
            handleCreateEntity('image', asset)
        }
        return pageFiles.length
    }

    // Space/commons assets live outside the project document; adopt them into
    // document.assets first, or buildAssetMap can't resolve the entity's
    // media.assetId and the created entity renders invisible.
    const handleCreateFromAsset = async (asset, position = null) => {
        if (isPdfAsset(asset)) {
            try {
                // Project-document assets store mount-relative `/api/…` urls
                // (and legacy imports can carry an empty one). Fetching those
                // verbatim on the deployed stack hits nginx's SPA fallback and
                // returns 200 text/html, which pdfToImageFiles then fails to
                // parse — "works on localhost, broken on prod".
                const pdfUrl = mountRelativeApiUrl(asset.url) || buildProjectAssetUrl(projectId, asset.id)
                const res = await fetch(pdfUrl, { credentials: 'include' })
                if (!res.ok) throw new Error(`fetch failed (${res.status})`)
                if (isHtmlLikeMimeType(res.headers?.get?.('content-type') || '')) {
                    throw new Error('asset URL returned HTML, not a PDF')
                }
                const blob = await res.blob()
                await importPdfAsImagePages(new File([blob], asset.name || 'document.pdf', { type: 'application/pdf' }))
            } catch (error) {
                applyLocalOps([], { activityMessage: `Could not import ${asset?.name || 'PDF'}: ${error.message}`, activityLevel: 'error' })
            }
            return
        }
        if (!canPlaceInScene(asset)) return
        if (asset?.id && !(document.assets || []).some((a) => a.id === asset.id)) {
            applyLocalOps({
                type: 'upsertAsset',
                payload: { asset }
            }, { activityMessage: `Added ${asset.name || 'asset'} to project assets.` })
        }
        handleCreateEntity(detectEntityTypeFromFile(asset), asset, position)
    }

    const handleDeleteLibraryItem = async (item) => {
        const scopeNote = item.inProject && item.inSpace
            ? 'It will be removed from this project and from the space files.'
            : item.inSpace ? 'It will be removed from the space files.' : 'It will be removed from this project.'
        const usedNote = item.usedByCount
            ? ` ${item.usedByCount} object${item.usedByCount === 1 ? ' uses' : 's use'} it here and will lose their file.`
            : ''
        if (!window.confirm(`Delete "${item.name || item.id}"? ${scopeNote}${usedNote}`)) return
        try {
            if (item.inProject) {
                applyLocalOps({
                    type: 'deleteAsset',
                    payload: { assetId: item.id }
                }, { activityMessage: `Deleted ${item.name || 'asset'} from project assets.` })
                await deleteProjectAsset(projectId, item.id).catch((error) => {
                    if (error?.status !== 404) throw error
                })
            }
            if (item.inSpace) {
                try {
                    await deleteServerAsset(resolvedSpaceId, item.id)
                } catch (error) {
                    if (error?.status !== 409 || !Array.isArray(error?.data?.usedBy)) throw error
                    // The scan may still see this project's just-removed reference;
                    // only re-confirm when OTHER projects use the file.
                    const others = error.data.usedBy.filter((u) => u.projectId !== projectId)
                    if (others.length) {
                        const where = others.map((u) => `${u.title} (${u.entities.length})`).join(', ')
                        if (!window.confirm(`Other projects in this space still use this file: ${where}. Delete anyway?`)) return
                    }
                    await deleteServerAsset(resolvedSpaceId, item.id, { force: true })
                }
                applyLocalOps([], { activityMessage: `Deleted ${item.name || 'asset'} from space files.` })
            }
        } catch (error) {
            applyLocalOps([], { activityMessage: `Could not delete ${item.name || 'asset'}: ${error.message}`, activityLevel: 'error' })
        } finally {
            refreshSpaceAssets()
        }
    }

    const requestAssetUploadFile = (file) => {
        if (!shouldSuggestGlbOptimization(file)) return Promise.resolve(file)
        return new Promise((resolve) => {
            assetOptimizationResolveRef.current = resolve
            setAssetOptimizationPrompt({ file, status: 'choice', error: null })
        })
    }

    const finishAssetOptimizationPrompt = (file) => {
        const resolve = assetOptimizationResolveRef.current
        assetOptimizationResolveRef.current = null
        setAssetOptimizationPrompt(null)
        resolve?.(file)
    }

    const handleOptimizeAsset = async () => {
        const file = assetOptimizationPrompt?.file
        if (!file) return
        setAssetOptimizationPrompt((current) => ({ ...current, status: 'optimizing', error: null }))
        try {
            const optimized = await optimizeGlbAsset(file)
            finishAssetOptimizationPrompt(optimized)
        } catch (error) {
            setAssetOptimizationPrompt((current) => ({
                ...current,
                status: 'error',
                error: error instanceof Error ? error.message : 'Model optimization failed.'
            }))
        }
    }

    const importAssetFiles = async (files, position = null) => {
        if (!files.length) return
        try {
            for (const file of files) {
                if (isPdfAsset(file)) {
                    await importPdfAsImagePages(file)
                    continue
                }
                const uploadFile = await requestAssetUploadFile(file)
                if (!uploadFile) continue
                const asset = await uploadProjectAsset(projectId, uploadFile)
                const wasOptimized = uploadFile !== file
                const activityMessage = wasOptimized
                    ? `Optimized ${file.name} from ${formatAssetSize(file.size)} to ${formatAssetSize(uploadFile.size)} and imported it.`
                    : `Imported ${file.name}.`
                applyLocalOps({
                    type: 'upsertAsset',
                    payload: { asset }
                }, { activityMessage })
                if (isSupportAssetFile(file)) continue
                const entityAsset = wasOptimized ? { ...asset, name: file.name } : asset
                handleCreateEntity(detectEntityTypeFromFile(file), entityAsset, position)
            }
        } finally {
            refreshSpaceAssets()
        }
    }

    const handleAssetFilesSelected = async (event) => {
        const files = Array.from(event.target.files || [])
        try {
            await importAssetFiles(files)
        } finally {
            event.target.value = ''
        }
    }

    const handleDeleteSelected = () => {
        const targets = selectedEntities.length ? selectedEntities : (selectedEntity ? [selectedEntity] : [])
        if (!targets.length) return
        applyLocalOps(
            targets.map((entity) => ({ type: 'deleteEntity', payload: { entityId: entity.id } })),
            {
                activityMessage: targets.length === 1
                    ? `Deleted ${targets[0].name}.`
                    : `Deleted ${targets.length} objects.`,
                activityLevel: 'warning'
            }
        )
        dispatch({ type: 'select-entity', entityId: null })
    }

    // Build a new entity from any source (selected entity or clipboard), offset
    // slightly on X/Z so the copy doesn't sit exactly on top of the original.
    const handleDuplicateSelected = () => {
        const targets = topLevelTargets(entities, selectedEntities.length ? selectedEntities : (selectedEntity ? [selectedEntity] : []))
        if (!targets.length) return
        const cloneGroups = targets.map((target) => cloneSubtree(collectSubtree(entities, target.id)))
        const clones = cloneGroups.flat()
        applyLocalOps(
            clones.map((entity) => ({ type: 'createEntity', payload: { entity } })),
            {
                activityMessage: targets.length === 1
                    ? `Duplicated ${targets[0].name}.`
                    : `Duplicated ${targets.length} objects.`
            }
        )
        dispatch({ type: 'select-entities', entityIds: cloneGroups.map((group) => group[0].id) })
    }

    const handleCopySelected = () => {
        const targets = topLevelTargets(entities, selectedEntities.length ? selectedEntities : (selectedEntity ? [selectedEntity] : []))
        if (!targets.length) return
        clipboardRef.current = {
            subtrees: targets.map((target) => structuredClone(collectSubtree(entities, target.id)))
        }
    }

    const handlePasteClipboard = () => {
        const source = clipboardRef.current
        if (!source?.subtrees?.length) return
        const cloneGroups = source.subtrees.map((subtree) => cloneSubtree(subtree))
        const clones = cloneGroups.flat()
        applyLocalOps(
            clones.map((entity) => ({ type: 'createEntity', payload: { entity } })),
            {
                activityMessage: cloneGroups.length === 1
                    ? `Pasted ${source.subtrees[0][0].name}.`
                    : `Pasted ${cloneGroups.length} objects.`
            }
        )
        dispatch({ type: 'select-entities', entityIds: cloneGroups.map((group) => group[0].id) })
    }

    const handleCutSelected = () => {
        if (!selectedEntity && !selectedEntities.length) return
        handleCopySelected()
        handleDeleteSelected()
    }

    const handleRenameEntity = (entityId, name) => {
        const trimmed = String(name || '').trim()
        const entity = entities.find((e) => e.id === entityId)
        if (!entity || !trimmed || trimmed === entity.name) return
        applyLocalOps({
            type: 'updateEntity',
            payload: { entityId, patch: { name: trimmed } }
        }, { activityMessage: `Renamed ${entity.name} to ${trimmed}.` })
    }

    const handleToggleEntityVisible = (entityId) => {
        const entity = entities.find((e) => e.id === entityId)
        if (!entity) return
        const nextVisible = entity.components?.runtime?.visible === false
        applyLocalOps({
            type: 'updateComponent',
            payload: { entityId, component: 'runtime', patch: { visible: nextVisible } }
        }, { activityMessage: `${nextVisible ? 'Showed' : 'Hid'} ${entity.name}.` })
    }

    const handleToggleEntityLocked = (entityId) => {
        const entity = entities.find((e) => e.id === entityId)
        if (!entity) return
        const nextLocked = entity.components?.runtime?.locked !== true
        applyLocalOps({
            type: 'updateComponent',
            payload: { entityId, component: 'runtime', patch: { locked: nextLocked } }
        }, { activityMessage: `${nextLocked ? 'Locked' : 'Unlocked'} ${entity.name}.` })
    }

    const handleGroupSelected = () => {
        const targets = selectedEntities.length > 1
            ? selectedEntities
            : (selectedEntity ? [selectedEntity] : [])
        if (targets.length < 2) return
        const centroid = getSelectionCentroid(targets)
        const group = createEntityOfType('group', {
            name: 'Group',
            components: { transform: { position: centroid, rotation: [0, 0, 0], scale: [1, 1, 1] } }
        })
        const ops = [{ type: 'createEntity', payload: { entity: group } }]
        for (const entity of targets) {
            const wp = entity.components?.transform?.position || [0, 0, 0]
            ops.push({
                type: 'updateEntity',
                payload: {
                    entityId: entity.id,
                    patch: {
                        parentId: group.id,
                        components: {
                            transform: {
                                ...entity.components?.transform,
                                position: [wp[0] - centroid[0], wp[1] - centroid[1], wp[2] - centroid[2]]
                            }
                        }
                    }
                }
            })
        }
        applyLocalOps(ops, { activityMessage: `Grouped ${targets.length} objects.` })
        dispatch({ type: 'select-entity', entityId: group.id })
    }

    const handleUngroup = () => {
        const target = selectedEntity
        if (!target || target.type !== 'group') return
        const gp = target.components?.transform?.position || [0, 0, 0]
        const children = entities.filter((e) => e.parentId === target.id)
        const ops = children.map((child) => {
            const lp = child.components?.transform?.position || [0, 0, 0]
            return {
                type: 'updateEntity',
                payload: {
                    entityId: child.id,
                    patch: {
                        parentId: null,
                        components: {
                            transform: {
                                ...child.components?.transform,
                                position: [lp[0] + gp[0], lp[1] + gp[1], lp[2] + gp[2]]
                            }
                        }
                    }
                }
            }
        })
        ops.push({ type: 'deleteEntity', payload: { entityId: target.id } })
        applyLocalOps(ops, { activityMessage: `Ungrouped ${target.name}.` })
        dispatch({ type: 'select-entity', entityId: null })
    }

    const handleReparentEntity = (entityId, newParentId) => {
        const patch = buildReparentPatch(entities, entityId, newParentId)
        if (!patch) return
        const entity = entities.find((e) => e.id === entityId)
        const parent = newParentId ? entities.find((e) => e.id === newParentId) : null
        applyLocalOps({
            type: 'updateEntity',
            payload: { entityId, patch }
        }, { activityMessage: parent ? `Moved ${entity.name} into ${parent.name}.` : `Moved ${entity.name} to the root.` })
        dispatch({ type: 'select-entity', entityId })
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
                if (!selectedEntity && !selectedEntities.length) return
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
                if (!selectedEntity && !selectedEntities.length) return
                event.preventDefault()
                handleCutSelected()
                return
            }

            // Group selected (Ctrl+G) / Ungroup (Ctrl+Shift+G)
            if (meta && !event.shiftKey && (key === 'g' || key === 'G')) {
                event.preventDefault()
                handleGroupSelected()
                return
            }
            if (meta && event.shiftKey && (key === 'g' || key === 'G')) {
                event.preventDefault()
                handleUngroup()
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
            // Frame selected — F (Maya/Unity) or "." (Blender numpad). Both
            // supported. The !meta guard matches the sibling Delete/A branches:
            // without it, Ctrl/Cmd+F (find-in-page, preventable in Chrome and
            // Firefox) was swallowed and the camera jumped instead.
            if (!meta && (event.key === 'f' || event.key === 'F' || event.key === '.')) {
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
            // Editing the transform while a timeline preview holds the pose would be
            // invisible — release the hold so the edit shows, same as grabbing the gizmo.
            if (component === 'transform' && isTimelinePreviewPosed(selectedEntity.id)) {
                setTimelinePreview({ playing: false, hold: false })
            }
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

    // Commit several entity transforms at once as a single undo step.
    // Does NOT clear transformOp -- the V1 model calls onCommit multiple times
    // per session (once per mode-switch via commitIfMoved), so clearing here
    // would prematurely unmount ModalTransform. Session ends via onCancel→handleTransformCancel.
    const handleTransformCommitMany = useCallback((list) => {
        const ops = (list || [])
            .filter((entry) => entry?.id && entry.transform)
            .map((entry) => ({
                type: 'updateComponent',
                payload: { entityId: entry.id, component: 'transform', patch: entry.transform }
            }))
        if (ops.length) applyLocalOps(ops)
    }, [applyLocalOps])

    const handleStartTransform = useCallback((mode, axis = null) => {
        setTransformOp({ mode, axis, seq: Date.now() })
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
                message: nextSpace?.isPublic
                    ? `Published this project to /${resolvedSpaceId} — live for visitors.`
                    : `Set as the live project for /${resolvedSpaceId}. The space is still private — visitors will see a login wall until you make it public.`
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

    const handleMakeSpacePublic = async () => {
        setIsUpdatingLiveProject(true)
        try {
            const nextSpace = await updateServerSpace(resolvedSpaceId, { isPublic: true })
            setSpaceMeta(nextSpace)
            dispatch({
                type: 'append-activity',
                level: 'info',
                message: `Made /${resolvedSpaceId} public — visitors can now enter.`
            })
        } catch (error) {
            dispatch({
                type: 'append-activity',
                level: 'error',
                message: `Could not make the space public: ${error.message || 'unknown error'}`
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
                label: 'Scene',
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
        sceneStreamError: state.sceneStreamError,
        pendingSyncError: state.pendingSyncError
    }

    return (
        <>
            <StudioShell
            document={document}
            loading={state.loading}
            loadError={state.loadError}
            editHistory={history()}
            onHistoryJump={jumpTo}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            selectedEntity={selectedEntity}
            selectedEntityId={state.selectedEntityId}
            selectedEntityIds={selectedEntityIds}
            entities={entities}
            inspectorSections={inspectorSections}
            inspectorValues={inspectorValues}
            assetOptions={document.assets || []}
            spaceOptions={spaceOptions}
            libraryItems={libraryItems}
            onDeleteLibraryItem={handleDeleteLibraryItem}
            presence={presence}
            syncState={syncState}
            isDesktop={!isMobile && !isTablet}
            isMobile={isMobile}
            cameraView={cameraView}
            controlsRef={controlsRef}
            paneControlsRef={paneControlsRef}
            xrState={{ ...xr, xrStore: xr.xrStore }}
            onCreateEntity={handleCreateEntity}
            onCreateFromAsset={handleCreateFromAsset}
            onAssetFilesSelected={handleAssetFilesSelected}
            onDriveImportUrl={handleDriveImportUrl}
            onDriveImportSelection={handleDriveImportSelection}
            onToggleAssetShared={handleToggleAssetShared}
            onCommonsImport={handleCommonsImport}
            onDeleteSelected={handleDeleteSelected}
            onGroupSelected={handleGroupSelected}
            onUngroup={handleUngroup}
            onRenameEntity={handleRenameEntity}
            onToggleEntityVisible={handleToggleEntityVisible}
            onToggleEntityLocked={handleToggleEntityLocked}
            onReparentEntity={handleReparentEntity}
            onViewportDropFiles={importAssetFiles}
            onDuplicateSelected={handleDuplicateSelected}
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
            onOpenNodeEditor={() => navigateToStudioPath(buildRawProjectPath(projectId, resolvedSpaceId))}
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
                // null until space meta loads, so the panel doesn't flash a
                // "private" warning for a space that turns out to be public
                isPublic: spaceMeta ? Boolean(spaceMeta.isPublic) : null,
                isUpdating: isUpdatingLiveProject
            }}
            onSetLiveProject={handleSetLiveProject}
            onClearLiveProject={handleClearLiveProject}
            onMakeSpacePublic={handleMakeSpacePublic}
            />
            <AssetOptimizationDialog
                prompt={assetOptimizationPrompt}
                onOptimize={handleOptimizeAsset}
                onUploadOriginal={() => finishAssetOptimizationPrompt(assetOptimizationPrompt?.file || null)}
                onCancel={() => finishAssetOptimizationPrompt(null)}
            />
        </>
    )
}
