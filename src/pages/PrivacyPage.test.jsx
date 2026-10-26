import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PrivacyPage from './PrivacyPage.jsx'

// Read as text on purpose: the server modules are CommonJS that open the
// database on load, and only their words and numbers are needed here.
const here = dirname(fileURLToPath(import.meta.url))
const serverSource = (file) => readFileSync(join(here, '../../serverXR/src', file), 'utf8')

// The keys of the GET /api/auth/providers answer that are written at the
// start of a line (serverXR/src/routes/authRoutes.js). Spread-in keys (`hub`,
// `telegramBot`) sit inside one-line expressions and are not sign-ins.
const providerKeys = () => {
    const source = serverSource('routes/authRoutes.js')
    const start = source.indexOf("router.get('/api/auth/providers'")
    const end = source.indexOf('return { GUEST_SPACES }', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return [...source.slice(start, end).matchAll(/^\s+(\w+):/gm)].map((match) => match[1])
}

// `24 * 60 * 60 * 1000` -> 86400000
const product = (expression) => expression.split('*').reduce((total, part) => total * Number(part.trim()), 1)
const inWords = (ms) => (ms % 3600000 === 0 ? `${ms / 3600000} hours` : `${ms / 60000} minutes`)
const lifetime = (source, pattern) => {
    const match = source.match(pattern)
    expect(match, `no lifetime matching ${pattern}`).toBeTruthy()
    return inWords(product(match[1]))
}

const signingInText = () => {
    const { container } = render(<PrivacyPage />)
    const section = [...container.querySelectorAll('section')]
        .find((node) => node.querySelector('h2')?.textContent === 'signing in')
    expect(section).toBeTruthy()
    return section.textContent.replace(/\s+/g, ' ')
}

describe('/privacy', () => {
    // Sentence case, not the lowercase the tab used to carry —
    // docs/ai/vocabulary.md's naming rule.
    it('names itself in the tab, Sentence case', () => {
        render(<PrivacyPage />)
        expect(document.title).toBe('Privacy — di.iiii')
    })

    // 2026-10-26: diiii.xyz offered Telegram and password sign-in while this
    // page said "GitHub or Google" only. A sign-in added to the server's
    // providers answer now fails here until the page describes what it keeps.
    it('describes every sign-in the server can offer', () => {
        const notSignIns = new Set(['mail']) // says whether mail can be sent
        const named = { github: 'GitHub', google: 'Google', telegram: 'Telegram', password: 'Password' }
        const keys = providerKeys().filter((key) => !notSignIns.has(key))
        expect(keys.length).toBeGreaterThanOrEqual(4)
        const text = signingInText()
        for (const key of keys) {
            expect(named[key], `the providers answer offers "${key}"; describe it on /privacy, then name it here`).toBeTruthy()
            expect(text).toContain(named[key])
        }
    })

    // The page states how long each sign-in link works. Read from the stores
    // that set those lifetimes, so a changed lifetime fails here until the
    // page says the new one.
    it('states the link lifetimes the server uses', () => {
        const mailLinks = serverSource('authTokenStore.js')
        const telegramLinks = serverSource('telegramLoginStore.js')
        const lifetimes = [
            lifetime(mailLinks, /\[KINDS\.VERIFY\]:\s*([\d\s*]*\d)/),
            lifetime(mailLinks, /\[KINDS\.RESET\]:\s*([\d\s*]*\d)/),
            lifetime(mailLinks, /\[KINDS\.MAGIC\]:\s*([\d\s*]*\d)/),
            lifetime(telegramLinks, /const DEFAULT_TTL_MS = ([\d\s*]*\d)/)
        ]
        const text = signingInText()
        for (const words of lifetimes) expect(text).toContain(words)
    })
})
