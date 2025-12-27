const SLUG_MIN_LENGTH = 3
const SLUG_MAX_LENGTH = 48

const sanitize = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')

export const slugifySpaceName = (input = '') => {
    if (!input) return ''
    const sanitized = sanitize(input)
    return sanitized.slice(0, SLUG_MAX_LENGTH)
}

export const isValidSpaceSlug = (slug) => {
    if (typeof slug !== 'string') return false
    const trimmed = slug.trim()
    if (!trimmed) return false
    if (trimmed.length < SLUG_MIN_LENGTH) return false
    return /^[a-z0-9-]+$/.test(trimmed)
}

export const getSpaceSlugLimits = () => ({
    min: SLUG_MIN_LENGTH,
    max: SLUG_MAX_LENGTH
})
