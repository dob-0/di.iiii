import StudioViewport from './StudioViewport.jsx'
import { buildPresentationPreviewDocument } from '../../utils/presentationPreviewDocument.js'

const overlayCardStyle = {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    padding: '2rem'
}

const overlayInnerStyle = {
    background: 'rgba(6, 9, 13, 0.82)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#f5f7fa',
    borderRadius: '18px',
    padding: '1rem 1.1rem',
    maxWidth: '28rem',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(12px)'
}

const resolveStudioPreviewCamera = (document, cameraView, previewMode) => {
    if (previewMode === 'fixed-camera') {
        return document.presentationState?.fixedCamera || document.worldState?.savedView || cameraView || null
    }
    return cameraView || document.worldState?.savedView || null
}

export default function StudioPresentationSurface({
    document,
    selectedEntityId,
    onSelectEntity,
    cursors = {},
    onCursorMove,
    onCursorLeave,
    cameraView,
    controlsRef,
    xrStore,
    onCameraChange
}) {
    const presentationState = document.presentationState || {}
    const previewMode = presentationState.mode || 'scene'
    const showCodeView = previewMode === 'code'
    const resolvedCamera = resolveStudioPreviewCamera(document, cameraView, previewMode)
    const previewDocument = buildPresentationPreviewDocument(presentationState.codeHtml || '')

    if (showCodeView) {
        if (!presentationState.codeHtml) {
            return (
                <div style={overlayCardStyle}>
                    <div style={overlayInnerStyle}>
                        <strong>Code preview is empty.</strong>
                    </div>
                </div>
            )
        }

        return (
            <iframe
                title={document.projectMeta?.title || document.projectMeta?.id || 'Studio code preview'}
                srcDoc={previewDocument}
                sandbox="allow-scripts allow-forms allow-popups allow-modals"
                style={{
                    border: 0,
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    background: '#05070a'
                }}
            />
        )
    }

    return (
        <StudioViewport
            document={document}
            selectedEntityId={selectedEntityId}
            onSelectEntity={onSelectEntity}
            cursors={cursors}
            onCursorMove={onCursorMove}
            onCursorLeave={onCursorLeave}
            cameraView={resolvedCamera}
            controlsRef={controlsRef}
            xrStore={xrStore}
            onCameraChange={previewMode === 'fixed-camera' ? undefined : onCameraChange}
            enableNavigation={previewMode !== 'fixed-camera'}
        />
    )
}
