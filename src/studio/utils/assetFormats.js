// What can actually become a scene entity. Everything else still lives in the
// space asset store (URL-referenced from code files), but gets no "+ Add".

const MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'stl', 'fbx']
const PDF_MIME = 'application/pdf'

export const extensionOf = (name = '') => {
    const match = /\.([a-z0-9]+)$/i.exec(String(name))
    return match ? match[1].toLowerCase() : ''
}

export const isPdfAsset = (asset) =>
    (asset?.mimeType || asset?.type || '') === PDF_MIME || extensionOf(asset?.name) === 'pdf'

export const canPlaceInScene = (asset) => {
    const mime = asset?.mimeType || asset?.type || ''
    if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) return true
    if (isPdfAsset(asset)) return true
    const ext = extensionOf(asset?.name)
    if (MODEL_EXTENSIONS.includes(ext)) return true
    // Model files often upload with an empty/generic mime; trust the extension
    // first, and treat model/* mimes as placeable too.
    return mime.startsWith('model/')
}

// Naming image/* first matters on iOS: with an accept list that does not claim
// HEIC, the photo picker hands over a transcoded JPEG instead of the camera's
// HEIC original — which is both a format the server can scrub and one every
// browser can display. Belt and braces; the server still refuses anything it
// cannot strip metadata from.
export const ASSET_ACCEPT =
    'image/*,video/*,audio/*,application/pdf,.glb,.gltf,.obj,.mtl,.stl,.fbx,.pdf'

export const ASSET_FORMAT_HINT =
    'Placeable formats: 3D models (.glb/.gltf incl. Draco/Meshopt, .obj, .stl, .fbx) · images · video · audio · PDF (imported as image pages). Other files are stored and usable by URL.'

// Render a PDF's pages to PNG File objects (page 1..maxPages). pdfjs is
// imported lazily so it never lands in the main bundle.
export async function pdfToImageFiles(file, { maxPages = 6, scale = 2 } = {}) {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
    ).toString()
    const data = await file.arrayBuffer()
    const doc = await pdfjs.getDocument({ data }).promise
    const baseName = String(file.name || 'document').replace(/\.pdf$/i, '')
    const pages = Math.min(doc.numPages, maxPages)
    const files = []
    for (let i = 1; i <= pages; i += 1) {
        const page = await doc.getPage(i)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (!blob) continue
        const suffix = doc.numPages > 1 ? `-p${i}` : ''
        files.push(new File([blob], `${baseName}${suffix}.png`, { type: 'image/png' }))
    }
    await doc.destroy()
    return files
}
