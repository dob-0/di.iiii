import { describe, expect, it } from 'vitest'
import {
    buildPresentationPreviewDocument,
    getPreviewIssueMessage,
    PREVIEW_HOST_MESSAGE_TYPE,
    PREVIEW_ISSUE_CODES
} from './presentationPreviewDocument.js'

describe('presentationPreviewDocument', () => {
    it('wraps HTML fragments in a preview document with bootstrap messaging', () => {
        const result = buildPresentationPreviewDocument('<main>Hello world</main>')

        expect(result).toContain('<!doctype html>')
        expect(result).toContain('<main>Hello world</main>')
        expect(result).toContain(PREVIEW_HOST_MESSAGE_TYPE)
        expect(result).toContain('localStorage')
    })

    it('injects bootstrap into full documents without replacing the user body', () => {
        const result = buildPresentationPreviewDocument('<html><head><title>Demo</title></head><body><section>Body</section></body></html>')

        expect(result).toContain('<title>Demo</title>')
        expect(result).toContain('<section>Body</section>')
        expect(result).toContain(PREVIEW_HOST_MESSAGE_TYPE)
    })

    it('maps known issue codes to concise host messages', () => {
        expect(getPreviewIssueMessage(PREVIEW_ISSUE_CODES.storageUnavailable)).toContain('Storage unavailable')
        expect(getPreviewIssueMessage(PREVIEW_ISSUE_CODES.sandboxApiDenied)).toContain('sandboxed browser API')
    })
})
