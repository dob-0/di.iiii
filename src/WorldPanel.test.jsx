import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorldPanel from './WorldPanel.jsx'
import { SceneSettingsContext, UiContext } from './contexts/AppContexts.js'
import { defaultGridAppearance, defaultScene } from './state/sceneStore.js'

describe('WorldPanel', () => {
    it('resets world settings to the shared dark defaults', () => {
        const setBackgroundColor = vi.fn()
        const setGridSize = vi.fn()
        const setAmbientLight = vi.fn()
        const setDirectionalLight = vi.fn()
        const setGridAppearance = vi.fn()

        render(
            <UiContext.Provider value={{ setIsWorldPanelVisible: vi.fn() }}>
                <SceneSettingsContext.Provider value={{
                    backgroundColor: '#ffffff',
                    setBackgroundColor,
                    gridSize: 10,
                    setGridSize,
                    ambientLight: { color: '#ffffff', intensity: 0.8 },
                    setAmbientLight,
                    directionalLight: { color: '#ffffff', intensity: 1, position: [0, 0, 0] },
                    setDirectionalLight,
                    gridAppearance: defaultGridAppearance,
                    setGridAppearance
                }}
                >
                    <WorldPanel surfaceMode="dock" />
                </SceneSettingsContext.Provider>
            </UiContext.Provider>
        )

        fireEvent.click(screen.getByTitle('Reset all world settings to defaults'))

        expect(setBackgroundColor).toHaveBeenCalledWith(defaultScene.backgroundColor)
        expect(setGridSize).toHaveBeenCalledWith(defaultScene.gridSize)
        expect(setAmbientLight).toHaveBeenCalledWith(defaultScene.ambientLight)
        expect(setDirectionalLight).toHaveBeenCalledWith(defaultScene.directionalLight)
        expect(setGridAppearance).toHaveBeenCalledWith(defaultGridAppearance)
    })
})
