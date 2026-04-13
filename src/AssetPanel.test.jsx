import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionsContext, SceneContext, SyncContext } from './contexts/AppContexts.js'
import AssetPanel from './AssetPanel.jsx'

vi.mock('./hooks/usePanelDrag.js', () => ({
    usePanelDrag: () => ({
        panelRef: { current: null },
        dragProps: {},
        dragStyle: {},
        isDragging: false,
        panelPointerProps: {}
    })
}))

vi.mock('./hooks/usePanelResize.js', () => ({
    usePanelResize: () => ({
        width: 380,
        height: 520,
        resizerProps: {},
        isResizing: false
    })
}))

describe('AssetPanel', () => {
    it('keeps row actions compact and reveals secondary media controls on demand', () => {
        render(
            <SceneContext.Provider
                value={{
                    objects: [{
                        id: 'video-1',
                        type: 'video',
                        assetRef: { id: 'video-original', name: 'Launch Clip.mp4', mimeType: 'video/mp4', size: 2048 },
                        mediaVariants: {
                            original: { id: 'video-original', name: 'Launch Clip.mp4', mimeType: 'video/mp4', size: 2048 },
                            optimized: { id: 'video-optimized', name: 'Launch Clip-optimized.mp4', mimeType: 'video/mp4', size: 1024 }
                        },
                        selectedVariant: 'optimized'
                    }],
                    setObjects: vi.fn(),
                    clearSelection: vi.fn()
                }}
            >
                <ActionsContext.Provider
                    value={{
                        selectObject: vi.fn(),
                        handleAssetFilesUpload: vi.fn(),
                        requestManualMediaOptimization: vi.fn(),
                        requestBatchMediaOptimization: vi.fn()
                    }}
                >
                    <SyncContext.Provider
                        value={{
                            uploadProgress: null,
                            mediaOptimizationStatus: null,
                            remoteAssetsManifest: [],
                            remoteAssetsBaseUrl: '',
                            setRemoteAssetsManifest: vi.fn()
                        }}
                    >
                        <AssetPanel onClose={vi.fn()} />
                    </SyncContext.Provider>
                </ActionsContext.Provider>
            </SceneContext.Provider>
        )

        expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Clean Up/i })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Reveal' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Use Original' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'More' }))

        expect(screen.getByRole('button', { name: 'Use Original' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Use Optimized' })).toBeTruthy()
    })
})
