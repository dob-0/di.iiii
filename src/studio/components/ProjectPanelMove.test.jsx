import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectPanel } from './StudioShellPanels.jsx'
import { getSpeedPreference, resetNavigationPreferenceMemory } from '../navigation/preference.js'

beforeEach(() => {
    resetNavigationPreferenceMemory()
    try { window.localStorage.clear() } catch { /* no storage */ }
})
afterEach(() => resetNavigationPreferenceMemory())

const panel = () => render(
    <ProjectPanel
        document={{ projectMeta: { title: 'Hall' }, assets: [] }}
        displayName="Hall"
        onDisplayNameChange={() => {}}
        onProjectMetaPatch={() => {}}
        onWorldPatch={() => {}}
        onRenderSettingsPatch={() => {}}
        onOpenHub={() => {}}
    />
)

describe('the Scene window\'s Move section', () => {
    it('sits with the other view settings, open, after Default camera', () => {
        panel()
        const titles = screen.getAllByRole('button').map((b) => b.textContent.replace(/[▾▸]/g, '').trim())
        expect(titles.indexOf('Move')).toBeGreaterThan(titles.indexOf('Default camera'))
        expect(titles.indexOf('Move')).toBeLessThan(titles.indexOf('Render'))
        expect(screen.getByLabelText('Speed (metres a step)')).toBeTruthy()
        expect(screen.getByLabelText('Turn')).toBeTruthy()
    })

    it('writes the same preference the camera reads', () => {
        panel()
        fireEvent.change(screen.getByLabelText('Speed (metres a step)'), { target: { value: '1' } })
        expect(getSpeedPreference()).toBe(1)
    })

    it('folds away like the other sections', () => {
        panel()
        fireEvent.click(screen.getByRole('button', { name: /^Move/ }))
        expect(screen.queryByLabelText('Speed (metres a step)')).toBeNull()
    })
})
