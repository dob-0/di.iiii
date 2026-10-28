// What a project opens as. entryView defaults to 'scene' for every document
// (projectSchema.js), so a project that holds no scene used to open an empty
// 3D room. Decide from what the project holds; keep an explicit choice.
//   'code'  -> the author chose a code page, or the project holds code
//   'scene' -> objects or nodes present
//   'page'  -> neither: the plain project view (title, pictures)
// An author's non-default choice ('code', 'fixed-camera') is kept as stored.
// The default 'scene' cannot be told from a stored one after normalization, so
// it yields to what the project holds.

export const holdsCode = (presentation = {}) => Boolean(
    (typeof presentation.codeHtml === 'string' && presentation.codeHtml.trim())
    || (typeof presentation.codeUrl === 'string' && presentation.codeUrl.trim())
    || (Array.isArray(presentation.codeFiles) && presentation.codeFiles.length > 0)
)

export const holdsScene = (document = {}) => (
    (Array.isArray(document?.entities) && document.entities.length > 0)
    || (Array.isArray(document?.nodes) && document.nodes.length > 0)
)

export const resolveOpeningView = (document) => {
    const presentation = document?.presentationState || {}
    const stored = presentation.entryView
    if (stored === 'code' || stored === 'fixed-camera') return stored
    if (holdsScene(document)) return 'scene'
    if (holdsCode(presentation)) return 'code'
    return 'page'
}
