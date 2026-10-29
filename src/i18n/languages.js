/**
 * THE LANGUAGE TABLE, client mirror of shared/i18n/languages.cjs (the Vite root
 * is src/, so the client cannot import root shared/). src/i18n/languages.test.js
 * runs both through shared/i18n/langPath.cases.json and fails if their data differ.
 */
import { WORK_IDS } from '../works/works.js'

export const DEFAULT_LANGUAGE = 'en'

export const LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English', label: 'EN', locale: 'en_US', public: true, prefixed: false },
    { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', label: 'ՀԱՅ', locale: 'hy_AM', public: false, prefixed: true },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', label: 'РУС', locale: 'ru_RU', public: false, prefixed: true }
]

export const LANGUAGE_CODES = LANGUAGES.map((language) => language.code)
export const PREFIXED_CODES = LANGUAGES.filter((language) => language.prefixed).map((language) => language.code)

// Mirrors STATIC_SEGMENTS in shared/reservedSegments.cjs (the drift test compares them).
const STATIC_SEGMENTS = [
    'assets', 'basis', 'brand', 'draco', 'fonts', 'get', 'kit', 'og',
    'serverXR', 'suite', 'unicode-fonts', 'vendor', 'rigbuild', 'chat-app', '.well-known'
]
const OWN_FREE_SEGMENTS = ['chat', 'light', 'ai']
export const languageFreeSegments = () => [...WORK_IDS, ...OWN_FREE_SEGMENTS, ...STATIC_SEGMENTS]

export const splitLang = (path = '/') => {
    const text = String(path || '/')
    const match = /^\/([^/?#]*)(.*)$/.exec(text)
    if (match && PREFIXED_CODES.includes(match[1])) {
        const rest = match[2]
        return { lang: match[1], path: rest === '' ? '/' : rest.startsWith('/') ? rest : `/${rest}` }
    }
    return { lang: DEFAULT_LANGUAGE, path: text }
}

export const withLang = (lang, path = '/') => {
    const text = String(path || '/')
    if (!PREFIXED_CODES.includes(lang)) return text
    if (text === '/' || text === '') return `/${lang}`
    if (/^[?#]/.test(text)) return `/${lang}${text}`
    return `/${lang}${text.startsWith('/') ? '' : '/'}${text}`
}

export const isLanguageFree = (path = '/') => {
    const pathname = String(path || '/').split(/[?#]/)[0]
    const segments = pathname.split('/').filter(Boolean)
    if (!segments.length) return false
    if (languageFreeSegments().includes(segments[0])) return true
    return /\.[A-Za-z0-9]+$/.test(segments[segments.length - 1])
}

export const isPreviewHost = (host = '') => {
    const name = String(host || '').toLowerCase().replace(/:\d+$/, '')
    return name.startsWith('dev.') || name.endsWith('.localhost') || name === 'localhost'
}
