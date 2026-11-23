const escapeForRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const inferLanguage = (name) => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    if (ext === 'css') return 'css'
    if (ext === 'js' || ext === 'mjs') return 'javascript'
    if (ext === 'html' || ext === 'htm') return 'html'
    return 'text'
}

export const SUPPORTED_EXTENSIONS = ['html', 'htm', 'css', 'js', 'mjs', 'txt', 'svg', 'json', 'md']

export const isSupportedFile = (name) => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    return SUPPORTED_EXTENSIONS.includes(ext)
}

export const normalizeFileName = (name) => name.replace(/[^\w.\-/]/g, '_').replace(/^\/+/, '')

export const fileLanguage = (name) => inferLanguage(name)

// The replacement is passed as a FUNCTION, never as a string. String.replace
// gives a string replacement special meaning for `$&`, `` $` ``, `$'`, `$$`
// and `$<n>` — and a real bundled file is code, which routinely contains
// those sequences on purpose (a `.replace(/x/, '$1')` call sitting inside a
// vendored library is enough). A minified React+GSAP bundle hit this: `` $` ``
// alone spliced the entire preceding document back into itself at that point,
// which truncated the actual <script> tag and spilled the rest of the bundle
// onto the page as visible text. A function's return value is inserted
// literally, with no reinterpretation.
const inlineLocalCss = (html, files) => {
    const cssFiles = files.filter((f) => f.name.endsWith('.css'))
    let result = html
    for (const file of cssFiles) {
        const pattern = new RegExp(
            `<link[^>]*href=["']${escapeForRegex(file.name)}["'][^>]*/?>`,
            'gi'
        )
        result = result.replace(pattern, () => `<style>/* ${file.name} */\n${file.content}</style>`)
    }
    return result
}

const inlineLocalJs = (html, files) => {
    const jsFiles = files.filter((f) => f.name.endsWith('.js') || f.name.endsWith('.mjs'))
    let result = html
    for (const file of jsFiles) {
        const pattern = new RegExp(
            `<script([^>]*)src=["']${escapeForRegex(file.name)}["']([^>]*)></script>`,
            'gi'
        )
        result = result.replace(
            pattern,
            (_match, pre, post) => `<script${pre}${post}>/* ${file.name} */\n${file.content}</script>`
        )
    }
    return result
}

// The file visitors see first: index.html, else the first .html file.
export const startPageFile = (files) => {
    if (!Array.isArray(files)) return null
    return files.find((f) => f.name === 'index.html') || files.find((f) => f.name.endsWith('.html')) || null
}

export const bundleCodeFiles = (files) => {
    if (!Array.isArray(files) || files.length === 0) return ''
    const indexFile = startPageFile(files)
    if (!indexFile) return ''
    let html = indexFile.content
    html = inlineLocalCss(html, files)
    html = inlineLocalJs(html, files)
    return html
}

// ── Import helpers (pure, so the panel only asks and shows) ──────────────

// Read a .zip into { files, skipped, error }. `skipped` lists the entries that
// are not text kinds the Code window can hold; `error` says why the zip failed.
export const readZipFiles = async (JSZip, blob) => {
    let zip
    try {
        zip = await JSZip.loadAsync(blob)
    } catch (err) {
        return { files: [], skipped: [], error: `This zip could not be read (${err?.message || 'it may be damaged'}).` }
    }
    const entries = []
    const skipped = []
    zip.forEach((relativePath, entry) => {
        if (entry.dir) return
        if (isSupportedFile(relativePath)) entries.push({ relativePath, entry })
        else skipped.push(relativePath)
    })
    try {
        const files = await Promise.all(
            entries.map(async ({ relativePath, entry }) => ({
                name: normalizeFileName(relativePath),
                content: await entry.async('text')
            }))
        )
        return { files, skipped, error: '' }
    } catch (err) {
        return { files: [], skipped, error: `A file inside this zip could not be read (${err?.message || 'it may be damaged'}).` }
    }
}

// mode 'replace' = only the incoming files; 'add' = existing files kept, an
// incoming file with the same name takes that file's place.
export const mergeImported = (existing, incoming, mode) => {
    if (mode === 'replace') return incoming
    const incomingByName = new Map(incoming.map((f) => [f.name, f]))
    const kept = existing.map((f) => incomingByName.get(f.name) || f)
    const have = new Set(existing.map((f) => f.name))
    return [...kept, ...incoming.filter((f) => !have.has(f.name))]
}

// Undo an import without losing what was typed since: files the import did not
// touch keep their current text; touched files go back to what they were.
export const undoImported = (before, current, incomingNames) => {
    const touched = new Set(incomingNames)
    const currentByName = new Map(current.map((f) => [f.name, f]))
    const beforeNames = new Set(before.map((f) => f.name))
    const restored = before.map((f) => (!touched.has(f.name) && currentByName.get(f.name)) || f)
    const extra = current.filter((f) => !beforeNames.has(f.name) && !touched.has(f.name))
    return [...restored, ...extra]
}

// Put a deleted file back where it was, unless the name is taken again.
export const restoreDeleted = (current, file, index) => {
    if (current.some((f) => f.name === file.name)) return current
    const next = current.slice()
    next.splice(Math.min(index, next.length), 0, file)
    return next
}
