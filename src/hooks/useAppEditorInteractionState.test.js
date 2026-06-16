import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAppEditorInteractionState } from './useAppEditorInteractionState.js'

const useGuardedEditActionsMock = vi.fn()
const useObjectActionsMock = vi.fn()
const useObjectFactoryMock = vi.fn()
const useAppEditorActionsMock = vi.fn()

vi.mock('./useGuardedEditActions.js', () => ({
    useGuardedEditActions: (...args) => useGuardedEditActionsMock(...args)
}))

vi.mock('./useObjectActions.js', () => ({
    useObjectActions: (...args) => useObjectActionsMock(...args)
}))

vi.mock('./useObjectFactory.js', () => ({
    useObjectFactory: (...args) => useObjectFactoryMock(...args)
}))

vi.mock('./useAppEditorActions.js', () => ({
    useAppEditorActions: (...args) => useAppEditorActionsMock(...args)
}))

function createProps(overrides = {}) {
    const noop = vi.fn()
    return {
        canEditScene: true,
        isReadOnly: false,
        setIsAdminMode: noop,
        setIsGizmoVisible: noop,
        objects: [{ id: 'a' }],
        setObjects: noop,
        selectedObjectId: 'a',
        selectedObjectIds: ['a'],
        setSelectedObjectId: noop,
        setSelectedObjectIds: noop,
        applySelection: noop,
        expandIdsWithGroups: noop,
        isSelectionLocked: false,
        cloneObjects: noop,
        socketEmit: { objectAdded: noop },
        menuPosition3D: { x: 1, y: 2, z: 3 },
        setMenu: noop,
        selectionGroups: [],
        persistSelectionGroups: noop,
        resetAxisLock: noop,
        axisConstraint: 'X',
        setAxisConstraint: noop,
        freeTransformRef: { current: null },
        controlsRef: { current: null },
        isLoading: false,
        sceneSettings: {
            setBackgroundColor: noop,
            setGridSize: noop,
            setAmbientLight: noop,
            setDirectionalLight: noop,
            setDefault3DView: noop,
            setGridAppearance: noop,
            setTransformSnaps: noop,
            setCameraPosition: noop,
            setCameraTarget: noop
        },
        setPresentation: noop,
        setRemoteSceneVersion: noop,
        resetRemoteAssets: noop,
        setIsGridVisible: noop,
        setIsPerfVisible: noop,
        setIsUiVisible: noop,
        setSceneVersion: noop,
        clearSelection: noop,
        getBaseSceneData: noop,
        getSavedViewData: noop,
        persistSceneDataWithStatus: noop,
        updateSceneSignature: noop,
        skipServerLoadRef: { current: false },
        resetAssetStoreQuotaState: noop,
        scheduleLocalSceneSave: noop,
        defaultGridAppearance: {},
        liveSyncFeatureEnabled: true,
        isPreferencesPage: false,
        setGizmoMode: noop,
        toggleInteractionMode: noop,
        setIsSelectionLocked: noop,
        handleUndo: noop,
        handleRedo: noop,
        ...overrides
    }
}

describe('useAppEditorInteractionState', () => {
    it('composes guarded, object, factory, and editor action hooks into one interaction surface', () => {
        const guardEditAction = vi.fn((fn) => fn)
        const toggleAdminMode = vi.fn()
        const applyFreeTransformDelta = vi.fn()
        const selectObject = vi.fn()
        const selectAllObjects = vi.fn()
        const deleteSelectedObject = vi.fn()
        const copySelectedObject = vi.fn()
        const pasteClipboardObject = vi.fn()
        const cutSelectedObject = vi.fn()
        const duplicateSelectedObject = vi.fn()
        const handleSelectObjectFromOutliner = vi.fn()
        const handleToggleObjectVisibility = vi.fn()
        const handleAddObject = vi.fn()
        const handleCreateSelectionGroup = vi.fn()
        const handleSaveView = vi.fn()

        useGuardedEditActionsMock.mockReturnValue({ guardEditAction, toggleAdminMode })
        useObjectActionsMock.mockReturnValue({
            applyFreeTransformDelta,
            selectObject,
            selectAllObjects,
            deleteSelectedObject,
            copySelectedObject,
            pasteClipboardObject,
            cutSelectedObject,
            duplicateSelectedObject,
            handleSelectObjectFromOutliner,
            handleToggleObjectVisibility
        })
        useObjectFactoryMock.mockReturnValue({ handleAddObject })
        useAppEditorActionsMock.mockReturnValue({
            handleCreateSelectionGroup,
            handleSaveView
        })

        const props = createProps()
        const { result } = renderHook(() => useAppEditorInteractionState(props))

        expect(useGuardedEditActionsMock).toHaveBeenCalledWith({
            canEditScene: true,
            isReadOnly: false,
            setIsAdminMode: props.setIsAdminMode,
            setIsGizmoVisible: props.setIsGizmoVisible
        })
        expect(useObjectFactoryMock).toHaveBeenCalledWith({
            menuPosition3D: props.menuPosition3D,
            setMenu: props.setMenu,
            setObjects: props.setObjects,
            applySelection: props.applySelection,
            socketEmit: props.socketEmit
        })

        const editorArgs = useAppEditorActionsMock.mock.calls[0][0]
        expect(editorArgs.guardEditAction).toBe(guardEditAction)
        expect(editorArgs.toggleAdminMode).toBe(toggleAdminMode)
        expect(editorArgs.applyFreeTransformDelta).toBe(applyFreeTransformDelta)
        expect(editorArgs.deleteSelectedObject).toBe(deleteSelectedObject)
        expect(editorArgs.selectAllObjects).toBe(selectAllObjects)

        expect(result.current.guardEditAction).toBe(guardEditAction)
        expect(result.current.toggleAdminMode).toBe(toggleAdminMode)
        expect(result.current.handleAddObject).toBe(handleAddObject)
        expect(result.current.selectObject).toBe(selectObject)
        expect(result.current.handleCreateSelectionGroup).toBe(handleCreateSelectionGroup)
        expect(result.current.handleSaveView).toBe(handleSaveView)
    })
})
