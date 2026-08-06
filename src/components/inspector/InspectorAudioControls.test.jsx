import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import InspectorAudioControls from './InspectorAudioControls.jsx'

// Regression guard: an audio object with audioLoop/audioAutoplay left unset
// (any scene saved before these fields existed, or loaded via a path that
// doesn't go through useObjectFactory's ?? true defaults) actually plays back
// looping and autoplaying — AudioObject.jsx and useObjectFactory.js both
// resolve a missing value to true. The toggle buttons here used to read the
// raw field with no default, so they showed "Off" while the audio was, in
// fact, on.
describe('InspectorAudioControls', () => {
    it('shows Autoplay/Loop as On when the fields are unset, matching real playback', () => {
        const selectedObject = { id: 'a1', type: 'audio' }
        render(
            <InspectorAudioControls
                selectedObject={selectedObject}
                isAudioObject
                audioUrl="/serverXR/api/assets/a1"
                previewAudioRef={{ current: null }}
                onPreviewPlay={vi.fn()}
                onPreviewStop={vi.fn()}
                onUpdateProperty={vi.fn()}
            />
        )

        expect(screen.getByLabelText('Toggle audio autoplay')).toHaveTextContent('On')
        expect(screen.getByLabelText('Toggle audio autoplay')).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByLabelText('Toggle audio loop')).toHaveTextContent('On')
        expect(screen.getByLabelText('Toggle audio loop')).toHaveAttribute('aria-pressed', 'true')
    })

    it('respects an explicit false value', () => {
        const selectedObject = { id: 'a1', type: 'audio', audioAutoplay: false, audioLoop: false }
        render(
            <InspectorAudioControls
                selectedObject={selectedObject}
                isAudioObject
                audioUrl="/serverXR/api/assets/a1"
                previewAudioRef={{ current: null }}
                onPreviewPlay={vi.fn()}
                onPreviewStop={vi.fn()}
                onUpdateProperty={vi.fn()}
            />
        )

        expect(screen.getByLabelText('Toggle audio autoplay')).toHaveTextContent('Off')
        expect(screen.getByLabelText('Toggle audio loop')).toHaveTextContent('Off')
    })

    it('toggling from the unset (On) state commits an explicit false', () => {
        const onUpdateProperty = vi.fn()
        const selectedObject = { id: 'a1', type: 'audio' }
        render(
            <InspectorAudioControls
                selectedObject={selectedObject}
                isAudioObject
                audioUrl="/serverXR/api/assets/a1"
                previewAudioRef={{ current: null }}
                onPreviewPlay={vi.fn()}
                onPreviewStop={vi.fn()}
                onUpdateProperty={onUpdateProperty}
            />
        )

        screen.getByLabelText('Toggle audio loop').click()
        expect(onUpdateProperty).toHaveBeenCalledWith('audioLoop', false)
    })
})
