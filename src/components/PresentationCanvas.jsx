import { useEffect, useMemo, useRef, useState } from 'react'
import {
    buildPresentationPreviewDocument,
    getPreviewIssueMessage,
    normalizePreviewIssues,
    PREVIEW_HOST_MESSAGE_TYPE
} from '../utils/presentationPreviewDocument.js'

export default function PresentationCanvas({
    presentation,
    onCanvasPointerMove,
    onCanvasPointerLeave
}) {
    const iframeRef = useRef(null)
    const sourceType = presentation?.sourceType === 'url' ? 'url' : 'html'
    const url = (presentation?.url || '').trim()
    const html = presentation?.html || ''
    const hasUrl = Boolean(url)
    const hasHtml = Boolean(html.trim())
    const previewDocument = useMemo(
        () => (hasHtml ? buildPresentationPreviewDocument(html) : ''),
        [hasHtml, html]
    )
    const [previewIssues, setPreviewIssues] = useState([])

    useEffect(() => {
        setPreviewIssues([])
    }, [sourceType, url, html])

    useEffect(() => {
        const handleMessage = (event) => {
            if (event.source !== iframeRef.current?.contentWindow) return
            if (event.data?.type !== PREVIEW_HOST_MESSAGE_TYPE) return
            if (event.data?.kind !== 'issues') return
            setPreviewIssues(normalizePreviewIssues(event.data?.issues))
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    const previewIssueMessage = previewIssues.length > 0
        ? getPreviewIssueMessage(previewIssues[0])
        : ''

    const renderEmptyState = () => (
        <div className="presentation-empty-state">
            <div className="presentation-empty-eyebrow">Code View</div>
            <h2>Design a flat 2D space</h2>
            <p>
                Use the View panel to switch this space into a custom page mode,
                then paste HTML or point to a public link.
            </p>
        </div>
    )

    return (
        <div
            className="presentation-canvas-shell"
            onPointerMove={onCanvasPointerMove}
            onPointerLeave={onCanvasPointerLeave}
        >
            {sourceType === 'url' ? (
                hasUrl ? (
                    <>
                        <iframe
                            ref={iframeRef}
                            className="presentation-frame"
                            title="Space link preview"
                            src={url}
                            loading="lazy"
                            sandbox="allow-scripts allow-forms allow-popups allow-modals"
                            referrerPolicy="strict-origin-when-cross-origin"
                        />
                        <div className="presentation-frame-note-stack">
                            <div className="presentation-frame-note">
                                This preview stays sandboxed. Same-origin storage, cookies, or iframe-restricted sites may need Open Link for full behavior.
                            </div>
                        </div>
                    </>
                ) : renderEmptyState()
            ) : (
                hasHtml ? (
                    <>
                        <iframe
                            ref={iframeRef}
                            className="presentation-frame"
                            title="Space code preview"
                            srcDoc={previewDocument}
                            sandbox="allow-scripts allow-forms allow-popups allow-modals"
                        />
                        <div className="presentation-frame-note-stack">
                            {previewIssueMessage && (
                                <div
                                    className="presentation-frame-status"
                                    aria-live="polite"
                                >
                                    {previewIssueMessage}
                                </div>
                            )}
                        </div>
                    </>
                ) : renderEmptyState()
            )}
        </div>
    )
}
