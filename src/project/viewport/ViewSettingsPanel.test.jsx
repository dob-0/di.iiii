import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { ViewSettingsPanel } from './ViewSettingsPanel.jsx'
import { getViewSettings, resetViewSettingsForTests, setViewSetting } from './viewSettings.js'

beforeEach(() => { window.localStorage.clear(); resetViewSettingsForTests() })
afterEach(cleanup)

describe('ViewSettingsPanel levels', () => {
    it('view: the short list, no Clip, Mouse mapping and Look present', () => {
        render(<ViewSettingsPanel level="view" />)
        for (const t of ['Zoom Speed', 'Smooth View', 'Invert Zoom Direction (Wheel)', 'Mouse mapping', 'Environment light']) expect(screen.getByText(t)).toBeTruthy()
        expect(screen.queryByText('Clip Start')).toBeNull()
        expect(screen.queryByText('Orbit Sensitivity')).toBeNull()
        expect(screen.getByText('More settings')).toBeTruthy()
    })
    it('view: More settings reveals the full list in place, Fewer settings hides it again', () => {
        render(<ViewSettingsPanel level="view" />)
        fireEvent.click(screen.getByText('More settings'))
        for (const t of ['Clip Start', 'Orbit Sensitivity', 'Closest distance']) expect(screen.getByText(t)).toBeTruthy()
        expect(screen.getAllByText('Zoom Speed')).toHaveLength(1)
        fireEvent.click(screen.getByText('Fewer settings'))
        expect(screen.queryByText('Clip Start')).toBeNull()
    })
    it('studio: everything, no More settings button', () => {
        render(<ViewSettingsPanel level="studio" />)
        for (const t of ['Navigation', 'Orbit & Pan', 'Zoom', 'Clip', 'Look', 'Clip Start', 'Orbit Sensitivity']) expect(screen.getAllByText(t).length).toBeGreaterThan(0)
        expect(screen.queryByText('More settings')).toBeNull()
    })
    it.each(['view', 'studio'])('Reset restores the defaults at level %s', (level) => {
        render(<ViewSettingsPanel level={level} />)
        setViewSetting('zoomSpeed', 3)
        expect(getViewSettings().zoomSpeed).toBe(3)
        fireEvent.click(screen.getByText('Reset to defaults'))
        expect(getViewSettings().zoomSpeed).toBe(1)
    })
})
