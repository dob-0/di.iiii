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

    it('intercepts fragment-anchor clicks so the sandboxed iframe never navigates to the shell URL', () => {
        const result = buildPresentationPreviewDocument('<main><a href="#theme">Theme</a><section id="theme"></section></main>')

        expect(result).toContain('a[href^="#"]')
        expect(result).toContain('preventDefault')
        expect(result).toContain('scrollIntoView')
    })

    it('hands the shell query down to the srcdoc page, which has no URL of its own', () => {
        const result = buildPresentationPreviewDocument('<main>Field</main>', '?just=bkyi')

        expect(result).toContain('window.diiPageQuery = "?just=bkyi"')
        expect(result).toContain('window.diiPageParams = new URLSearchParams(window.diiPageQuery)')
    })

    it('escapes the shell query so it cannot break out of the bootstrap script', () => {
        const result = buildPresentationPreviewDocument('<main>Field</main>', '?x=</script><script>alert(1)</script>')

        expect(result).not.toContain('<script>alert(1)</script>')
    })

    it('defaults the page query to an empty string when the host passes none', () => {
        const result = buildPresentationPreviewDocument('<main>Field</main>')

        expect(result).toContain('window.diiPageQuery = ""')
    })

    it('maps known issue codes to concise host messages', () => {
        expect(getPreviewIssueMessage(PREVIEW_ISSUE_CODES.storageUnavailable)).toContain('Storage unavailable')
        expect(getPreviewIssueMessage(PREVIEW_ISSUE_CODES.sandboxApiDenied)).toContain('sandboxed browser API')
    })
})
