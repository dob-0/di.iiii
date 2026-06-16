import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpacesController } from './useSpacesController.js'

const createSpace = vi.fn()
const listSpaces = vi.fn()
const deleteSpace = vi.fn()
const cleanupSpaces = vi.fn()
const markSpaceActive = vi.fn()
const getSceneStorageKey = vi.fn((spaceId) => `scene:${spaceId}`)
const persistSceneToLocalStorage = vi.fn()

let currentSpaces = []

vi.mock('../storage/spaceStore.js', () => ({
    createSpace: (...args) => createSpace(...args),
    listSpaces: (...args) => listSpaces(...args),
    deleteSpace: (...args) => deleteSpace(...args),
    cleanupSpaces: (...args) => cleanupSpaces(...args),
    markSpaceActive: (...args) => markSpaceActive(...args),
    getSpaceShareUrl: (spaceId) => `/${spaceId}`,
    TEMP_SPACE_TTL_MS: 1000 * 60 * 60 * 24
}))

vi.mock('../services/serverSpaces.js', () => ({
    createServerSpace: vi.fn(),
    listServerSpaces: vi.fn(),
    deleteServerSpace: vi.fn(),
    updateServerSpace: vi.fn()
}))

vi.mock('../state/sceneStore.js', () => ({
    defaultScene: {
        objects: [],
        presentation: {
            mode: 'scene',
            sourceType: 'url',
            url: '',
            html: '',
            fixedCamera: {
                projection: 'perspective',
                position: [0, 0, 5],
                target: [0, 0, 0],
                fov: 60,
                zoom: 1,
                near: 0.1,
                far: 200
            }
        }
    },
    SCENE_DATA_VERSION: 7
}))

vi.mock('../storage/scenePersistence.js', () => ({
    getSceneStorageKey: (...args) => getSceneStorageKey(...args),
    persistSceneToLocalStorage: (...args) => persistSceneToLocalStorage(...args)
}))

describe('useSpacesController', () => {
    beforeEach(() => {
        currentSpaces = [
            {
                id: 'main',
                label: 'Main Space',
                isPermanent: true,
                lastActive: Date.now()
            }
        ]

        createSpace.mockReset()
        createSpace.mockImplementation(({ slug, label, isPermanent = false }) => {
            const record = {
                id: slug,
                label,
                isPermanent,
                lastActive: Date.now()
            }
            currentSpaces = [...currentSpaces, record]
            return record
        })

        listSpaces.mockReset()
        listSpaces.mockImplementation(() => currentSpaces)

        deleteSpace.mockReset()
        cleanupSpaces.mockReset()
        markSpaceActive.mockReset()
        getSceneStorageKey.mockClear()
        persistSceneToLocalStorage.mockClear()

        vi.restoreAllMocks()
        vi.spyOn(window, 'prompt').mockImplementation(() => '')
        vi.spyOn(window, 'alert').mockImplementation(() => {})
    })

    it('opens a newly named space in the selected studio route', async () => {
        const navigateToSpace = vi.fn()
        const { result } = renderHook(() => useSpacesController({
            spaceId: 'main',
            defaultSpaceId: 'main',
            buildSpacePath: (spaceId) => `/${spaceId}`,
            navigateToSpace
        }))

        act(() => {
            result.current.setOpenAfterCreateTarget('studio')
            result.current.setNewSpaceName('Gallery')
        })

        await act(async () => {
            await result.current.handleCreateNamedSpace(false)
        })

        expect(navigateToSpace).toHaveBeenCalledWith('/gallery/studio')
        expect(createSpace).toHaveBeenCalledWith(expect.objectContaining({
            slug: 'gallery',
            label: 'Gallery',
            isPermanent: false
        }))
        expect(getSceneStorageKey).toHaveBeenCalledWith('gallery')
        expect(persistSceneToLocalStorage).toHaveBeenCalledTimes(1)
    })

    it('uses the selected admin target for quick-create actions too', async () => {
        const navigateToSpace = vi.fn()
        window.prompt.mockReturnValue('Showroom')

        const { result } = renderHook(() => useSpacesController({
            spaceId: 'main',
            defaultSpaceId: 'main',
            buildSpacePath: (spaceId) => `/${spaceId}`,
            navigateToSpace
        }))

        act(() => {
            result.current.setOpenAfterCreateTarget('admin')
        })

        await act(async () => {
            await result.current.handleQuickSpaceCreate()
        })

        expect(navigateToSpace).toHaveBeenCalledWith('/admin?space=showroom')
        expect(createSpace).toHaveBeenCalledWith(expect.objectContaining({
            slug: 'showroom',
            label: 'Showroom'
        }))
    })
})
