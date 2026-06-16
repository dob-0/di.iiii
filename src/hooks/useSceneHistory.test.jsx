import { renderHook, act, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useSceneHistory } from './useSceneHistory.js'

const INITIAL_SNAPSHOT = {
    objects: [{ id: 'box-1' }],
    backgroundColor: '#ffffff',
    gridSize: 20,
    gridAppearance: { cellSize: 1 },
    renderSettings: { shadows: true },
    cameraSettings: { near: 0.1, far: 200 },
    transformSnaps: { translation: 0.1 },
    isGridVisible: true,
    isGizmoVisible: true,
    isPerfVisible: false,
    ambientLight: { intensity: 0.8 },
    directionalLight: { intensity: 1 },
    default3DView: { position: [0, 1, 4], target: [0, 0, 0] },
    cameraPosition: [0, 1, 4],
    cameraTarget: [0, 0, 0]
}

const UPDATED_SNAPSHOT = {
    objects: [{ id: 'sphere-1' }],
    backgroundColor: '#101010',
    gridSize: 48,
    gridAppearance: { cellSize: 2 },
    renderSettings: { shadows: false },
    cameraSettings: { near: 0.5, far: 500 },
    transformSnaps: { translation: 1 },
    isGridVisible: false,
    isGizmoVisible: false,
    isPerfVisible: true,
    ambientLight: { intensity: 0.2 },
    directionalLight: { intensity: 2 },
    default3DView: { position: [4, 4, 4], target: [1, 1, 1] },
    cameraPosition: [4, 4, 4],
    cameraTarget: [1, 1, 1]
}

describe('useSceneHistory', () => {
    it('undoes and redoes full scene snapshots, not only object arrays', async () => {
        const { result } = renderHook(() => {
            const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT)
            const history = useSceneHistory({
                snapshot,
                restoreSnapshot: setSnapshot,
                isLoading: false
            })

            return {
                snapshot,
                setSnapshot,
                ...history
            }
        })

        act(() => {
            result.current.setSnapshot(UPDATED_SNAPSHOT)
        })

        await waitFor(() => {
            expect(result.current.canUndo).toBe(true)
        })

        act(() => {
            result.current.handleUndo()
        })

        await waitFor(() => {
            expect(result.current.snapshot).toEqual(INITIAL_SNAPSHOT)
        })

        act(() => {
            result.current.handleRedo()
        })

        await waitFor(() => {
            expect(result.current.snapshot).toEqual(UPDATED_SNAPSHOT)
        })
    })
})
