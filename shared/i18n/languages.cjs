/**
 * THE LANGUAGE TABLE — one list, read by the server and mirrored by the client
 * (src/i18n/languages.js; src/i18n/languages.test.js fails if they drift).
 * Design: docs/ai/decisions/2026-10-29-languages-in-the-address.md (S13).
 *
 * English is the bare address and keeps every address it has. Armenian is
 * `/hy` + the same path, Russian `/ru` + the same path. The codes are reserved
 * words (shared/reservedSegments.cjs), so no space or project can take one.
 * `public: false` = the language is not offered on public hosts yet.
 */

const DEFAULT_LANGUAGE = 'en'

const LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English', label: 'EN', locale: 'en_US', public: true, prefixed: false },
    { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', label: 'ՀԱՅ', locale: 'hy_AM', public: false, prefixed: true },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', label: 'РУС', locale: 'ru_RU', public: false, prefixed: true }
]

const LANGUAGE_CODES = LANGUAGES.map((language) => language.code)
const PREFIXED_CODES = LANGUAGES.filter((language) => language.prefixed).map((language) => language.code)

// Addresses that never get a language form: they keep one bare address.
// `wcc` and `algovrithm` are the ids in src/works/works.js (a test keeps them
// equal). The rest are the studio chat, the light desk, the AI endpoints and
// the static directories nginx serves before the app.
const WORK_IDS = ['wcc', 'algovrithm']
const OWN_FREE_SEGMENTS = ['chat', 'light', 'ai']
// Read lazily: reservedSegments.cjs requires this file for the codes.
const languageFreeSegments = () => [...WORK_IDS, ...OWN_FREE_SEGMENTS, ...require('../reservedSegments.cjs').STATIC_SEGMENTS]

// Only a whole, lower-case first segment is a language: `/hyper/studio`,
// `/ruby`, `/ru-ok` and `/HY/x` are ordinary addresses. A query or hash after
// the path is kept with the path.
const splitLang = (path = '/') => {
    const text = String(path || '/')
    const match = /^\/([^/?#]*)(.*)$/.exec(text)
    if (match && PREFIXED_CODES.includes(match[1])) {
        const rest = match[2]
        return { lang: match[1], path: rest === '' ? '/' : rest.startsWith('/') ? rest : `/${rest}` }
    }
    return { lang: DEFAULT_LANGUAGE, path: text }
}

const withLang = (lang, path = '/') => {
    const text = String(path || '/')
    if (!PREFIXED_CODES.includes(lang)) return text
    if (text === '/' || text === '') return `/${lang}`
    if (/^[?#]/.test(text)) return `/${lang}${text}`
    return `/${lang}${text.startsWith('/') ? '' : '/'}${text}`
}

const isLanguageFree = (path = '/') => {
    const pathname = String(path || '/').split(/[?#]/)[0]
    const segments = pathname.split('/').filter(Boolean)
    if (!segments.length) return false
    if (languageFreeSegments().includes(segments[0])) return true
    return /\.[A-Za-z0-9]+$/.test(segments[segments.length - 1])
}

// Machine drafts may show on preview hosts only: `dev.*` and `*.localhost`.
const isPreviewHost = (host = '') => {
    const name = String(host || '').toLowerCase().replace(/:\d+$/, '')
    return name.startsWith('dev.') || name.endsWith('.localhost') || name === 'localhost'
}

module.exports = {
    DEFAULT_LANGUAGE,
    LANGUAGES,
    LANGUAGE_CODES,
    PREFIXED_CODES,
    WORK_IDS,
    languageFreeSegments,
    splitLang,
    withLang,
    isLanguageFree,
    isPreviewHost
}
