import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const getServerSpace = vi.fn(() => new Promise(() => {}))
vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: (...args) => getServerSpace(...args)
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

// A space with a live own domain is shared on that domain (SPEC_space_own_domain.md).
describe('PublishPanelWindow share address', () => {
    it('copies the address on the space\'s own domain', async () => {
        getServerSpace.mockResolvedValueOnce({ id: 'taronx', publishedProjectId: 'other', domain: 'yokozo.xyz' })
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.assign(navigator, { clipboard: { writeText } })
        render(<PublishPanelWindow projectId="p1" spaceId="taronx" publishState={{}} />)
        await waitFor(() => expect(getServerSpace).toHaveBeenCalled())
        const button = await screen.findByRole('button', { name: 'Copy link' })
        await waitFor(() => {
            fireEvent.click(button)
            expect(writeText).toHaveBeenCalledWith('https://yokozo.xyz/p/p1')
        })
    })
})
