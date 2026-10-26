import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PrivacyPage from './PrivacyPage.jsx'

// Read as text on purpose: the server modules are CommonJS that open the
// database on load, and only their words and numbers are needed here.
const here = dirname(fileURLToPath(import.meta.url))
const serverRoot = join(here, '../../serverXR/src')
const serverSource = (file) => readFileSync(join(serverRoot, file), 'utf8')

// Every line of the server's own code (no tests) that matches `pattern`.
const serverLines = (pattern) => readdirSync(serverRoot, { recursive: true })
    .filter((file) => file.endsWith('.js') && !file.includes('.test.') && !file.split(/[\\/]/).includes('tests'))
    .flatMap((file) => serverSource(file).split('\n')
        .map((text, index) => ({ file, line: index + 1, text }))
        .filter(({ text }) => pattern.test(text)))

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
const inDays = (ms) => `${ms / 86400000} days`
const lifetime = (source, pattern) => {
    const match = source.match(pattern)
    expect(match, `no lifetime matching ${pattern}`).toBeTruthy()
    return inWords(product(match[1]))
}

const sectionText = (title) => {
    const { container } = render(<PrivacyPage />)
    const section = [...container.querySelectorAll('section')]
        .find((node) => node.querySelector('h2')?.textContent === title)
    expect(section, `no "${title}" section on /privacy`).toBeTruthy()
    return section.textContent.replace(/\s+/g, ' ')
}
const signingInText = () => sectionText('signing in')

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

    // 2026-10-26: the page said guests keep their cookie 30 days (the code:
    // the guest sandbox's 7) and that there was no sign-out-everywhere (logout
    // bumps the account's token version, which ends every session).
    // Review of #1141: the cookie is renewed while in use (half its lifetime
    // left -> a fresh one, refreshSessionCookieIfStale in index.js), and a
    // sign-out leaves terminal logins, which carry no token version and end on
    // their own clock (cliLoginStore.js).
    it('states the session lifetimes, their renewal and the sign-out the server uses', () => {
        const config = serverSource('config.js')
        const index = serverSource('index.js')
        const signedIn = product(config.match(/AUTH_SESSION_TTL_MS, ([\d\s*]*\d)\)/)[1])
        const guest = product(config.match(/SANDBOX_TTL_MS \|\| ([\d\s*]*\d)\)/)[1])
        expect(index).toContain('const GUEST_SESSION_TTL_MS = Math.max(config.sandboxTtlMs')
        const cookie = sectionText('the session cookie')
        expect(cookie).toContain(`${inWords(signedIn)} signed in, ${inDays(guest)} as a guest, renewed while in use`)
        expect(index, 'the renewal rule changed: re-check the page').toContain('if (expiresAt - Date.now() > ttl / 2) return')
        const hourly = inWords(signedIn).replace(' hours', '-hour')
        expect(cookie).toContain(`once less than ${inWords(signedIn / 2)} are left, your next request to the server gets a fresh ${hourly} cookie`)
        expect(cookie).toContain(`ends ${inWords(signedIn)} after its last renewal`)
        expect(cookie).toContain(`A guest cookie renews the same way, in ${hourly} steps`)
        expect(index).toContain('bumpUserTokenVersion(state.subject)')
        expect(cookie).toContain('Signing out ends every browser session of your account at once, on every device')
        // A bot key is minted with the account's token version; a terminal
        // login's table has none, so a sign-out cannot end it.
        expect(serverSource('telegramActTokenStore.js')).toMatch(/token_version/)
        expect(cookie).toContain('every key our Telegram bot was given to act for you')
        const db = serverSource('db.js')
        const cliTable = db.slice(db.indexOf('CREATE TABLE IF NOT EXISTS cli_tokens'))
        const cliColumns = cliTable.slice(0, cliTable.indexOf(');'))
        expect(cliColumns).toContain('user_id')
        expect(cookie.includes('Terminal logins are the exception: signing out does not end them'), 'cli_tokens token_version vs the page')
            .toBe(!cliColumns.includes('token_version'))
        const cli = serverSource('cliLoginStore.js')
        const idle = product(cli.match(/const TOKEN_IDLE_MS = ([\d\s*]*\d)/)[1])
        const max = product(cli.match(/const TOKEN_MAX_MS = ([\d\s*]*\d)/)[1])
        expect(cookie).toContain(`after ${inDays(idle)} unused or ${inDays(max)} after it was made`)
        const notBuilt = sectionText('not built yet')
        expect(notBuilt).not.toContain('sign-out-everywhere')
        expect(notBuilt).not.toContain('one device cannot be signed out')
        expect(notBuilt).toContain('one browser cannot be signed out on its own')
    })

    // 2026-10-26: the page said no user ids are written to the logs; seven
    // logger lines write an account id and two write the name a browser sent.
    // Review of #1141: #1136 keeps a request line only for answers that went
    // wrong, and the production nginx this repo sets up logs every request in
    // nginx's predefined "combined" format: address, request line, referrer,
    // user agent (nginx.org/en/docs/http/ngx_http_log_module.html).
    it('says what the logs write about a person, as the server writes it', () => {
        // morgan's 'tiny' format: method, URL, status, size, time. No IP, no user agent.
        expect(serverSource('index.js')).toContain("app.use(morgan('tiny', { skip: accessLogSkip() }))")
        expect(serverSource('accessLog.js')).toContain('res.statusCode < 400')
        const logs = sectionText('logs and realtime')
        expect(logs).toContain('writes a line for a request only when its answer went wrong')
        expect(logs).toContain('method, URL, status, size and duration — no IP address, no user agent')
        const nginx = readFileSync(join(here, '../../scripts/standby/nginx-conf.sh'), 'utf8')
        const accessLog = nginx.match(/^\s*access_log\s+([^;]+);/m)
        expect(accessLog, 'nginx-conf.sh has no access_log line: say what the web server logs now').toBeTruthy()
        const [, format, ...rest] = accessLog[1].trim().split(/\s+/)
        expect(accessLog[1].trim()).not.toBe('off')
        expect({ format, rest }, 'nginx-conf.sh names a log format: re-check the page').toEqual({ format: undefined, rest: [] })
        expect(logs).toContain("in nginx's standard format: the address the request came from")
        expect(logs).toContain("the page it came from and your browser's user agent")
        expect(logs).not.toContain('no user ids')
        const naming = serverLines(/logger\.\w+\(.*(subject:|\$\{userName\})/)
        const namesAccount = naming.some(({ text }) => text.includes('subject:'))
        const namesPerson = naming.some(({ text }) => /\$\{userName\}/.test(text))
        expect(logs.includes('the line holds the account id'), 'log lines with an account id vs the page').toBe(namesAccount)
        expect(logs.includes('the name their browser sent'), 'log lines with a person\'s name vs the page').toBe(namesPerson)
    })

    // 2026-10-26: the page said IPs are never stored; a change waiting for
    // approval keeps the request's IP (pending_actions.request_ip), and
    // nothing deletes those rows.
    it('says the one place an IP address is stored, and that it is kept', () => {
        const stored = serverLines(/request_ip/).filter(({ file }) => file !== 'db.js')
        expect(stored.length, 'nothing stores request_ip any more: say so on /privacy').toBeGreaterThan(0)
        const logs = sectionText('logs and realtime')
        expect(logs).not.toMatch(/IPs? [^.]*never stored/)
        expect(logs).toContain('Apart from the web server\'s log above, the one place the server stores one is a change that waits for approval')
        const deletes = serverLines(/DELETE FROM pending_actions/)
        expect(logs.includes('Nothing deletes these records'), 'pending_actions deletion vs the page').toBe(deletes.length === 0)
        // Review of #1141: with the gate on, a space's delete and purge wait
        // whoever asks (its owner too), and change notices reach the same bot.
        const gate = serverSource('approvalGate.js')
        expect(gate).toContain("kind: 'spaces.delete'")
        expect(gate).toContain("kind: 'spaces.purge'")
        expect(logs).toContain("deleting or purging a space (its owner's own included)")
        expect(logs).not.toContain('and admin-level changes when the approval gate')
        expect(serverSource('config.js')).toContain('CONTENT_CHANGE_NOTICES_ENABLED')
        expect(serverSource('spaceHistory.js')).toContain('/content-changed')
        expect(logs).toContain('finishes a burst of edits in it: who edited (account id and name)')
        const wiki = readFileSync(join(here, '../wiki/wikiContent.js'), 'utf8')
        expect(wiki, 'the wiki says /privacy covers "no stored IP addresses"').not.toContain('no stored IP')
    })

    // 2026-10-26: the page said chat is never stored; space chat, mesh-room
    // talk and AI conversations each have a table.
    it('says which chat is stored, and how much', () => {
        const keep = (file) => Number(serverSource(file).match(/const DEFAULT_KEEP = (\d+)/)[1])
        const db = serverSource('db.js')
        expect(db).toContain('CREATE TABLE IF NOT EXISTS space_chat_lines')
        expect(db).toContain('CREATE TABLE IF NOT EXISTS ai_messages')
        const logs = sectionText('logs and realtime')
        expect(logs).not.toContain('no chat log')
        expect(logs).toContain(`the last ${keep('spaceChatStore.js').toLocaleString('en-US')} lines of its chat`)
        expect(logs).toContain(`the last ${keep('meshRoomHistoryStore.js').toLocaleString('en-US')} lines of their talk`)
        expect(logs).toContain('kept with your account until you delete them')
    })

    // 2026-10-26: pruneAuthTokens is written and tested but nothing calls it,
    // so mail-link records are kept; the backup pull keeps copies off the
    // server. The page promises only what the code does.
    it('promises no deletion the code does not do', () => {
        const callers = serverLines(/pruneAuthTokens\(/)
        expect(signingInText().includes('Nothing deletes these records today'), 'pruneAuthTokens callers vs the page').toBe(callers.length === 0)
        const retention = sectionText('retention and backups')
        expect(retention).toContain('mail-link records and approval records have no retention limit')
        const index = serverSource('index.js')
        // The count cap is on every write path; the 30-day age cap only where a
        // route passes it (0 disables it), so the page states the count alone.
        const maxOps = Number(index.match(/const MAX_OP_HISTORY = (\d+)/)[1])
        expect(retention).toContain(`the last ${maxOps} changes of each space and each project.`)
        // Review of #1141: the server keeps the newest 14 by count
        // (scripts/standby/backup-data.sh); the live pull to aylmo held 58 and
        // its copy on Google Drive (rclone copy) never deletes.
        const standby = readFileSync(join(here, '../../scripts/standby/backup-data.sh'), 'utf8')
        const keepOnServer = Number(standby.match(/\[keep \(default (\d+)\)\]/)[1])
        expect(retention).toContain(`nightly, the newest ${keepOnServer} kept on the server`)
        expect(retention).not.toContain('nowhere else')
        expect(retention).not.toContain('keeps the last 30')
        expect(retention).toContain('copied from it to Google Drive, where nothing deletes them')
        expect(sectionText('not built yet')).toContain('the backup copies on Google Drive')
    })

    // Review of #1141: the page said a fingerprint is kept "in place of the
    // link itself", but every link carries its key in the URL, and URLs reach
    // the logs the page describes.
    it('says a sign-in link, key included, can reach a web server log', () => {
        expect(serverSource('routes/passwordAuthRoutes.js')).toContain('?token=${encodeURIComponent(minted.token)}')
        expect(serverSource('routes/authRoutes.js')).toContain('/api/auth/telegram/callback?token=${encodeURIComponent(token)}')
        const text = signingInText()
        expect(text).not.toContain('in place of the link itself')
        expect(text.match(/The link itself, key included, can be written to a web server's log/g)).toHaveLength(2)
    })

    // Review of #1141: diiii.xyz and dev.diiii.xyz answer "server: cloudflare"
    // with report-to/nel headers (a.nel.cloudflare.com), and the backups have a
    // copy on Google Drive. Deployment facts: pinned here so they are not lost.
    it('names the services that carry requests or hold copies', () => {
        const third = sectionText('third parties')
        expect(third).not.toContain('no error reporting')
        expect(third).toContain('the app sends no error reports of its own')
        expect(third).toContain('reached through Cloudflare')
        expect(third).toContain('(Network Error Logging)')
        expect(third).toContain('Google Drive again for copies of the backups')
    })
})
