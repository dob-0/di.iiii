import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: vi.fn(() => new Promise(() => {}))
}))

import PublishPanelWindow, { resolvePanelXrMode } from './PublishPanelWindow.jsx'

const pressed = (label) => screen.getByRole('button', { name: label }).getAttribute('aria-pressed')

// The viewer offers Enter AR unless xrDefaultMode is exactly 'off'
// (PublicProjectViewer's canOfferXrEntry); legacy 'none' is AR. The panel
// has to write the one value the viewer reads as off, and show every other
// value the way the viewer will treat it.
describe('PublishPanelWindow headset entry', () => {
    it('writes off — not the legacy none the viewer reads as AR', () => {
        const onPublishPatch = vi.fn()
        render(<PublishPanelWindow projectId="p1" spaceId="lab" publishState={{ xrDefaultMode: 'ar' }} onPublishPatch={onPublishPatch} />)
        fireEvent.click(screen.getByRole('button', { name: 'Off' }))
        expect(onPublishPatch).toHaveBeenCalledWith({ xrDefaultMode: 'off' })
        expect(onPublishPatch).not.toHaveBeenCalledWith({ xrDefaultMode: 'none' })
    })

    it('shows a project that never set the field as AR, the way the viewer treats it', () => {
        render(<PublishPanelWindow projectId="p1" spaceId="lab" publishState={{}} />)
        expect(pressed('AR')).toBe('true')
        expect(pressed('Off')).toBe('false')
    })

    it('shows the schema default none as AR, not Off', () => {
        render(<PublishPanelWindow projectId="p1" spaceId="lab" publishState={{ xrDefaultMode: 'none' }} />)
        expect(pressed('AR')).toBe('true')
        expect(pressed('Off')).toBe('false')
    })

    it('shows off as Off and vr as VR', () => {
        const { unmount } = render(<PublishPanelWindow projectId="p1" spaceId="lab" publishState={{ xrDefaultMode: 'off' }} />)
        expect(pressed('Off')).toBe('true')
        unmount()
        render(<PublishPanelWindow projectId="p1" spaceId="lab" publishState={{ xrDefaultMode: 'vr' }} />)
        expect(pressed('VR')).toBe('true')
    })

    it('maps every stored value to the choice the viewer acts on', () => {
        expect(resolvePanelXrMode(undefined)).toBe('ar')
        expect(resolvePanelXrMode('none')).toBe('ar')
        expect(resolvePanelXrMode('ar')).toBe('ar')
        expect(resolvePanelXrMode('off')).toBe('off')
        expect(resolvePanelXrMode('vr')).toBe('vr')
    })
})
