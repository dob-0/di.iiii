const normalizeMimeType = (value = '') => String(value || '').trim().toLowerCase()

export const isHtmlLikeMimeType = (value = '') => {
    const normalized = normalizeMimeType(value)
    return normalized.startsWith('text/html') || normalized.includes('application/xhtml+xml')
}

export default isHtmlLikeMimeType
