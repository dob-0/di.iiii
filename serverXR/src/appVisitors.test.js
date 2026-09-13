// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
    ANONYMOUS_READS_PER_MINUTE,
    IDENTIFIED_READS_PER_MINUTE,
    classifyUserAgent,
    createVisitorBouncer,
    createVisitorRecorder
} = require('./appVisitors.js')

// Real strings, as these programs send them.
const UA = {
    firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
    chromePhone: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    cubotPhone: 'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    claudebot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    applebotExtended: 'Mozilla/5.0 (compatible; Applebot-Extended/0.1; +http://www.apple.com/go/applebot)',
    telegram: 'TelegramBot (like TwitterBot)',
    mastodon: 'http.rb/5.1.1 (Mastodon/4.2.10; +https://mastodon.social/)',
    unknownBot: 'Mozilla/5.0 (compatible; NewSearchBot/2.1)',
    musicbrainzStyle: 'SpaceMirror/1.4.2 ( ops@example.org )',
    urlContact: 'di-archive/0.3 (+https://example.org/about-this-bot)',
    curl: 'curl/8.9.1',
    python: 'python-requests/2.32.3',
    go: 'Go-http-client/2.0',
    axios: 'axios/1.7.2',
    node: 'node',
    wgetWithParens: 'Wget/1.24.5 (linux-gnu)'
}

describe('classifyUserAgent', () => {
    it('reads a normal browser as a browser, and names nothing about it', () => {
        for (const ua of [UA.firefox, UA.chromePhone]) {
            expect(classifyUserAgent(ua)).toEqual({ kind: 'browser', name: 'browser', contact: null })
        }
    })

    // "CUBOT" ends in "bot". A phone brand must not become a crawler and lose
    // the browser exemption.
    it('does not mistake a phone model ending in "bot" for a crawler', () => {
        expect(classifyUserAgent(UA.cubotPhone).kind).toBe('browser')
    })

    it('names known crawlers and AI bots, even when they carry a contact URL', () => {
        expect(classifyUserAgent(UA.gptbot)).toEqual({ kind: 'crawler', name: 'gptbot', contact: null })
        expect(classifyUserAgent(UA.claudebot).name).toBe('claudebot')
        expect(classifyUserAgent(UA.telegram).name).toBe('telegrambot')
        expect(classifyUserAgent(UA.mastodon)).toMatchObject({ kind: 'crawler', name: 'mastodon' })
    })

    it('prefers the longer name — Applebot-Extended is not Applebot', () => {
        expect(classifyUserAgent(UA.applebotExtended).name).toBe('applebot-extended')
    })

    it('still names a bot nobody listed, by its own Name/version', () => {
        expect(classifyUserAgent(UA.unknownBot)).toEqual({ kind: 'crawler', name: 'newsearchbot', contact: null })
    })

    it('reads Name/version plus an email or URL in parentheses as an identified app', () => {
        expect(classifyUserAgent(UA.musicbrainzStyle)).toEqual({ kind: 'app', name: 'spacemirror', contact: 'ops@example.org' })
        expect(classifyUserAgent(UA.urlContact)).toEqual({ kind: 'app', name: 'di-archive', contact: 'https://example.org/about-this-bot' })
    })

    it('reads a bare HTTP library as an anonymous program, named by its first token', () => {
        expect(classifyUserAgent(UA.curl)).toEqual({ kind: 'anonymous', name: 'curl', contact: null })
        expect(classifyUserAgent(UA.python).name).toBe('python-requests')
        expect(classifyUserAgent(UA.go).name).toBe('go-http-client')
        expect(classifyUserAgent(UA.axios).name).toBe('axios')
        expect(classifyUserAgent(UA.node).name).toBe('node')
        // parentheses are not a contact unless they hold one
        expect(classifyUserAgent(UA.wgetWithParens)).toMatchObject({ kind: 'anonymous', name: 'wget' })
    })

    it('treats a missing User-Agent as anonymous', () => {
        expect(classifyUserAgent(undefined)).toEqual({ kind: 'anonymous', name: '(no user-agent)', contact: null })
        expect(classifyUserAgent('   ').name).toBe('(no user-agent)')
    })

    // The name is a key and a line of text in the admin console. Nothing a
    // caller types may become markup, a second line, or an unbounded string.
    it('normalises what the caller chose into a short, plain, lowercase name', () => {
        const hostile = classifyUserAgent('<script>Evil App</script>/1.0 (x@y.io)\nsecond line')
        expect(hostile.name).toMatch(/^[a-z0-9._-]+$/)
        const long = classifyUserAgent(`${'a'.repeat(300)}/1.0`)
        expect(long.name.length).toBeLessThanOrEqual(64)
        expect(classifyUserAgent('CURL/8.0').name).toBe(classifyUserAgent('curl/7.1').name)
    })
})

// ── middleware ──

const fromOutside = (ua, overrides = {}) => ({
    method: 'GET',
    path: '/api/spaces',
    headers: { 'x-forwarded-for': '203.0.113.5, 172.18.0.3', ...(ua === undefined ? {} : { 'user-agent': ua }) },
    socket: { remoteAddress: '172.18.0.3' },
    ...overrides
})

const makeRes = () => ({
    statusCode: null,
    headers: {},
    body: null,
    set(name, value) { this.headers[name] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this }
})

const fakeBook = (blocked = []) => ({
    recorded: [],
    record(visitor) { this.recorded.push(visitor) },
    isBlocked: (name) => blocked.includes(name)
})

afterEach(() => {
    delete process.env.DI_LOCAL
})

describe('the recorder', () => {
    it('counts a request once, even when it passes two mounts of the router', () => {
        const book = fakeBook()
        const record = createVisitorRecorder({ guestBook: book })
        const req = fromOutside(UA.curl)
        const next = vi.fn()
        record(req, makeRes(), next)
        record(req, makeRes(), next)
        expect(next).toHaveBeenCalledTimes(2)
        expect(book.recorded).toEqual([{ kind: 'anonymous', name: 'curl', contact: null }])
    })

    it('counts nothing on a `di up` install', () => {
        process.env.DI_LOCAL = '1'
        const book = fakeBook()
        const req = fromOutside(UA.curl)
        createVisitorRecorder({ guestBook: book })(req, makeRes(), () => {})
        expect(book.recorded).toEqual([])
        expect(req.appVisitor).toBeNull()
    })

    // The healthcheck and the contract tests talk to the server on loopback,
    // without the proxies. They are not somebody reaching us.
    it('counts nothing from this machine that did not come through the proxies', () => {
        const book = fakeBook()
        const req = { method: 'GET', path: '/api/health', headers: { 'user-agent': 'curl/8' }, socket: { remoteAddress: '127.0.0.1' } }
        createVisitorRecorder({ guestBook: book })(req, makeRes(), () => {})
        expect(book.recorded).toEqual([])
    })

    it('never fails a request because counting failed', () => {
        const book = { record() { throw new Error('disk full') } }
        const next = vi.fn()
        createVisitorRecorder({ guestBook: book, log: { warn: () => {} } })(fromOutside(UA.curl), makeRes(), next)
        expect(next).toHaveBeenCalledTimes(1)
    })
})

const recordAndBounce = (bouncer, req, book = fakeBook()) => {
    createVisitorRecorder({ guestBook: book })(req, makeRes(), () => {})
    const res = makeRes()
    let passed = false
    bouncer(req, res, () => { passed = true })
    return { res, passed }
}

const passesOf = (bouncer, makeReq, attempts) => {
    let passes = 0
    for (let i = 0; i < attempts; i += 1) {
        if (recordAndBounce(bouncer, makeReq()).passed) passes += 1
    }
    return passes
}

describe('the bouncer', () => {
    it('gives anonymous programs a smaller read allowance than identified apps and crawlers', () => {
        const bouncer = createVisitorBouncer({ guestBook: fakeBook() })
        expect(ANONYMOUS_READS_PER_MINUTE).toBeLessThan(IDENTIFIED_READS_PER_MINUTE)
        expect(passesOf(bouncer, () => fromOutside(UA.curl), ANONYMOUS_READS_PER_MINUTE + 5)).toBe(ANONYMOUS_READS_PER_MINUTE)

        const other = createVisitorBouncer({ guestBook: fakeBook() })
        expect(passesOf(other, () => fromOutside(UA.musicbrainzStyle), ANONYMOUS_READS_PER_MINUTE + 5)).toBe(ANONYMOUS_READS_PER_MINUTE + 5)
        expect(passesOf(other, () => fromOutside(UA.gptbot), ANONYMOUS_READS_PER_MINUTE + 5)).toBe(ANONYMOUS_READS_PER_MINUTE + 5)
    })

    it('tells a throttled anonymous program how to identify', () => {
        const bouncer = createVisitorBouncer({ guestBook: fakeBook() })
        let last
        for (let i = 0; i <= ANONYMOUS_READS_PER_MINUTE; i += 1) last = recordAndBounce(bouncer, fromOutside(UA.python))
        expect(last.res.statusCode).toBe(429)
        expect(last.res.body.hint).toMatch(/User-Agent/)
        expect(last.res.body.hint).toContain('/for-apps')
    })

    it('never throttles a browser', () => {
        const bouncer = createVisitorBouncer({ guestBook: fakeBook() })
        expect(passesOf(bouncer, () => fromOutside(UA.firefox), IDENTIFIED_READS_PER_MINUTE + 10)).toBe(IDENTIFIED_READS_PER_MINUTE + 10)
    })

    it('leaves writes and non-API paths to the limiters that already own them', () => {
        const bouncer = createVisitorBouncer({ guestBook: fakeBook() })
        expect(passesOf(bouncer, () => fromOutside(UA.curl, { method: 'POST' }), ANONYMOUS_READS_PER_MINUTE + 5)).toBe(ANONYMOUS_READS_PER_MINUTE + 5)
        expect(passesOf(bouncer, () => fromOutside(UA.curl, { path: '/og/br_id_ge' }), ANONYMOUS_READS_PER_MINUTE + 5)).toBe(ANONYMOUS_READS_PER_MINUTE + 5)
    })

    it('answers a blocked name with 403 and a pointer to /for-apps', () => {
        const book = fakeBook(['python-requests'])
        const bouncer = createVisitorBouncer({ guestBook: book })
        const { res, passed } = recordAndBounce(bouncer, fromOutside(UA.python), book)
        expect(passed).toBe(false)
        expect(res.statusCode).toBe(403)
        expect(res.body.see).toBe('/for-apps')
    })

    // An account's own script can be called `node`. A block or an allowance
    // meant for strangers must not land on somebody who already signed in.
    it('lets a caller who proved who they are through, whatever their User-Agent', () => {
        const book = fakeBook(['node'])
        const bouncer = createVisitorBouncer({ guestBook: book, isKnownCaller: () => true })
        expect(recordAndBounce(bouncer, fromOutside(UA.node), book).passed).toBe(true)
    })

    it('does nothing on a `di up` install', () => {
        process.env.DI_LOCAL = '1'
        const book = fakeBook(['curl'])
        const bouncer = createVisitorBouncer({ guestBook: book })
        expect(recordAndBounce(bouncer, fromOutside(UA.curl), book).passed).toBe(true)
    })
})
