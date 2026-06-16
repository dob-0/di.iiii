import StudioViewport from './StudioViewport.jsx'
import { buildPresentationPreviewDocument } from '../../utils/presentationPreviewDocument.js'
import { bundleCodeFiles } from '../../utils/codeFilesBundle.js'

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

const resolveStudioPreviewCamera = (document, cameraView) => {
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
    onCameraChange,
    onRotateStart,
    editMode,
    gizmoMode,
    setEditMode,
    setGizmoMode,
    onTransformCommit
}) {
    const presentationState = document.presentationState || {}
    const previewMode = presentationState.mode || 'scene'
    const isFixedCamera = previewMode === 'fixed-camera'
    const showCodeView = previewMode === 'code'
    const resolvedCamera = isFixedCamera
        ? (presentationState.fixedCamera || resolveStudioPreviewCamera(document, cameraView))
        : resolveStudioPreviewCamera(document, cameraView)
    const hasFiles = Array.isArray(presentationState.codeFiles) && presentationState.codeFiles.length > 0
    const rawHtml = hasFiles
        ? bundleCodeFiles(presentationState.codeFiles)
        : (presentationState.codeHtml || '')
    const previewDocument = buildPresentationPreviewDocument(rawHtml)

    if (showCodeView) {
        const isUrlSource = presentationState.codeSourceType === 'url'
        const codeUrl = (presentationState.codeUrl || '').trim()

        if (isUrlSource) {
            if (!codeUrl) {
                return (
                    <div style={overlayCardStyle}>
                        <div style={overlayInnerStyle}>
                            <strong>No URL set.</strong> Add a public link in the Present panel.
                        </div>
                    </div>
                )
            }
            return (
                <iframe
                    title={document.projectMeta?.title || document.projectMeta?.id || 'Studio URL preview'}
                    src={codeUrl}
                    loading="lazy"
                    sandbox="allow-scripts allow-forms allow-popups allow-modals"
                    referrerPolicy="strict-origin-when-cross-origin"
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

        if (!rawHtml) {
            return (
                <div style={overlayCardStyle}>
                    <div style={overlayInnerStyle}>
                        <strong>Code preview is empty.</strong> Add files or pick a starter in the Present panel.
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
            onCameraChange={onCameraChange}
            onRotateStart={onRotateStart}
            editMode={editMode}
            gizmoMode={gizmoMode}
            setEditMode={setEditMode}
            setGizmoMode={setGizmoMode}
            onTransformCommit={onTransformCommit}
            enableNavigation={isFixedCamera ? false : undefined}
        />
    )
}
