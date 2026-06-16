import { useCallback, useState } from 'react'
import { defaultPresentation, normalizeFixedCamera, normalizePresentation } from '../shared/sceneSchema.js'

export function usePresentationState(initialValue = defaultPresentation) {
    const [presentation, setPresentationState] = useState(() => normalizePresentation(initialValue))

    const setPresentation = useCallback((nextValue) => {
        setPresentationState((prev) => normalizePresentation(
            typeof nextValue === 'function' ? nextValue(prev) : nextValue
        ))
    }, [])

    const setPresentationMode = useCallback((mode) => {
        setPresentation((prev) => ({ ...prev, mode }))
    }, [setPresentation])

    const setPresentationSourceType = useCallback((sourceType) => {
        setPresentation((prev) => ({ ...prev, sourceType }))
    }, [setPresentation])

    const setPresentationUrl = useCallback((url) => {
        setPresentation((prev) => ({ ...prev, url }))
    }, [setPresentation])

    const setPresentationHtml = useCallback((html) => {
        setPresentation((prev) => ({ ...prev, html }))
    }, [setPresentation])

    const setPresentationFixedCamera = useCallback((nextValue) => {
        setPresentation((prev) => ({
            ...prev,
            fixedCamera: normalizeFixedCamera(
                typeof nextValue === 'function' ? nextValue(prev.fixedCamera) : nextValue
            )
        }))
    }, [setPresentation])

    return {
        presentation,
        setPresentation,
        presentationMode: presentation.mode,
        setPresentationMode,
        presentationSourceType: presentation.sourceType,
        setPresentationSourceType,
        presentationUrl: presentation.url,
        setPresentationUrl,
        presentationHtml: presentation.html,
        setPresentationHtml,
        presentationFixedCamera: presentation.fixedCamera,
        setPresentationFixedCamera
    }
}

export default usePresentationState
