import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PresentationCanvas from './PresentationCanvas.jsx'
import {
    PREVIEW_HOST_MESSAGE_TYPE,
    PREVIEW_ISSUE_CODES
} from '../utils/presentationPreviewDocument.js'

describe('PresentationCanvas', () => {
    it('wraps inline HTML previews in the sandbox bootstrap document', () => {
        render(
            <PresentationCanvas
                presentation={{
                    mode: 'code',
                    sourceType: 'html',
                    html: '<main>Preview</main>'
                }}
            />
        )

        const frame = screen.getByTitle('Space code preview')
        expect(frame.getAttribute('srcdoc')).toContain(PREVIEW_HOST_MESSAGE_TYPE)
        expect(frame.getAttribute('srcdoc')).toContain('<main>Preview</main>')
    })

    it('shows a host-side issue banner when the preview reports a sandbox storage failure', () => {
        render(
            <PresentationCanvas
                presentation={{
                    mode: 'code',
                    sourceType: 'html',
                    html: '<main>Preview</main>'
                }}
            />
        )

        const frame = screen.getByTitle('Space code preview')
        Object.defineProperty(frame, 'contentWindow', {
            configurable: true,
            value: window
        })

        act(() => {
            const event = new MessageEvent('message', {
                data: {
                    type: PREVIEW_HOST_MESSAGE_TYPE,
                    kind: 'issues',
                    issues: [PREVIEW_ISSUE_CODES.storageUnavailable]
                }
            })
            Object.defineProperty(event, 'source', {
                configurable: true,
                value: window
            })
            window.dispatchEvent(event)
        })

        expect(screen.getByText('Storage unavailable in sandboxed preview.')).toBeTruthy()
    })

    it('keeps the external URL note visible for sandboxed link previews', () => {
        render(
            <PresentationCanvas
                presentation={{
                    mode: 'code',
                    sourceType: 'url',
                    url: 'https://example.com'
                }}
            />
        )

        expect(screen.getByText(/Same-origin storage, cookies, or iframe-restricted sites/i)).toBeTruthy()
    })
})
