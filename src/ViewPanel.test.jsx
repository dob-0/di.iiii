import React, { useMemo, useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionsContext, RefsContext, SceneSettingsContext, UiContext } from './contexts/AppContexts.js'
import { defaultPresentation } from './shared/sceneSchema.js'
import ViewPanel from './ViewPanel.jsx'

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
        width: 320,
        height: 560,
        resizerProps: {},
        isResizing: false
    })
}))

function ViewPanelHarness({ initialMode = 'code' }) {
    const controlsRef = useRef(null)
    const [presentationMode, setPresentationMode] = useState(initialMode)
    const [presentationSourceType, setPresentationSourceType] = useState('html')
    const [presentationUrl, setPresentationUrl] = useState('')
    const [presentationHtml, setPresentationHtml] = useState('<main>Hello</main>')
    const [presentationFixedCamera, setPresentationFixedCamera] = useState(defaultPresentation.fixedCamera)
    const [cameraSettings, setCameraSettings] = useState({ fov: 60, near: 0.1, far: 200 })
    const [renderSettings, setRenderSettings] = useState({
        shadows: true,
        antialias: true,
        toneMapping: 'ACESFilmic',
        toneMappingExposure: 1,
        dpr: [1, 2]
    })
    const [isGridVisible, setIsGridVisible] = useState(true)
    const [isGizmoVisible, setIsGizmoVisible] = useState(true)

    const uiValue = useMemo(() => ({
        setIsViewPanelVisible: vi.fn(),
        isGridVisible,
        setIsGridVisible,
        isGizmoVisible,
        setIsGizmoVisible
    }), [isGridVisible, isGizmoVisible])

    const sceneSettingsValue = useMemo(() => ({
        default3DView: { position: [0, 1.6, 4], target: [0, 1, 0] },
        cameraPosition: [0, 1.6, 4],
        setCameraPosition: vi.fn(),
        cameraTarget: [0, 1, 0],
        setCameraTarget: vi.fn(),
        cameraSettings,
        setCameraSettings,
        renderSettings,
        setRenderSettings,
        presentationMode,
        setPresentationMode,
        presentationSourceType,
        setPresentationSourceType,
        presentationUrl,
        setPresentationUrl,
        presentationHtml,
        setPresentationHtml,
        presentationFixedCamera,
        setPresentationFixedCamera
    }), [
        cameraSettings,
        presentationFixedCamera,
        presentationHtml,
        presentationMode,
        presentationSourceType,
        presentationUrl,
        renderSettings
    ])

    return (
        <UiContext.Provider value={uiValue}>
            <SceneSettingsContext.Provider value={sceneSettingsValue}>
                <ActionsContext.Provider value={{ handleSaveView: vi.fn(), handleFrameAll: vi.fn() }}>
                    <RefsContext.Provider value={{ controlsRef }}>
                        <ViewPanel />
                    </RefsContext.Provider>
                </ActionsContext.Provider>
            </SceneSettingsContext.Provider>
        </UiContext.Provider>
    )
}

describe('ViewPanel', () => {
    it('progressively reveals camera controls based on the active presentation mode', () => {
        render(<ViewPanelHarness initialMode="code" />)

        expect(screen.getByText('Presentation')).toBeTruthy()
        expect(screen.getByText('Camera')).toBeTruthy()
        expect(screen.getByText('Display')).toBeTruthy()
        expect(screen.getByText('Render')).toBeTruthy()
        expect(screen.getByLabelText('Custom HTML')).toBeTruthy()
        expect(screen.getByText(/Camera controls are inactive in Code View/i)).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: '2D Camera' }))
        expect(screen.getByRole('button', { name: 'Use Current Camera' })).toBeTruthy()
        expect(screen.getByText('Advanced camera controls')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: '3D Scene' }))
        expect(screen.getByRole('button', { name: 'Frame All' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Save Current View' })).toBeTruthy()
    })

    it('loads the artist open call starter into the code editor', () => {
        render(<ViewPanelHarness initialMode="code" />)

        fireEvent.click(screen.getByRole('button', { name: /Artist Open Call/i }))

        expect(screen.getByLabelText('Custom HTML').value).toContain('Women Creating Change')
        expect(screen.getByLabelText('Custom HTML').value).toContain('Apply to the open call')
    })
})
