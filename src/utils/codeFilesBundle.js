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

const inlineLocalCss = (html, files) => {
    const cssFiles = files.filter((f) => f.name.endsWith('.css'))
    let result = html
    for (const file of cssFiles) {
        const pattern = new RegExp(
            `<link[^>]*href=["']${escapeForRegex(file.name)}["'][^>]*/?>`,
            'gi'
        )
        result = result.replace(pattern, `<style>/* ${file.name} */\n${file.content}</style>`)
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
            `<script$1$2>/* ${file.name} */\n${file.content}</script>`
        )
    }
    return result
}

export const bundleCodeFiles = (files) => {
    if (!Array.isArray(files) || files.length === 0) return ''
    const indexFile = files.find((f) => f.name === 'index.html') || files.find((f) => f.name.endsWith('.html'))
    if (!indexFile) return ''
    let html = indexFile.content
    html = inlineLocalCss(html, files)
    html = inlineLocalJs(html, files)
    return html
}
