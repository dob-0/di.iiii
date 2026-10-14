// The browser half of `di login` talks to the server through these four calls.
// The wire format is the one in docs/architecture/CLI_LOGIN.md ("Wire format"):
// JSON bodies, camelCase, the browser's own cookie session.
//
// They go through apiFetch, the one fetch layer every service here uses: it adds
// the base URL and the session cookie, sends JSON, and throws an Error that
// carries `.status` and the parsed body in `.data`. Nothing is re-implemented.
//
// One thing is added on top: a call that never answers is ended after
// REQUEST_TIMEOUT_MS and thrown as an Error WITHOUT a `.status` and with
// `.isTimeout`, so the page can say what failed and offer to try again instead
// of leaving a spinner on screen for ever.

import { apiFetch } from './apiClient.js'

export const REQUEST_TIMEOUT_MS = 15000

const call = async (path, options = {}) => {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
    }, REQUEST_TIMEOUT_MS)
    try {
        return await apiFetch(path, { ...options, signal: controller.signal })
    } catch (error) {
        if (timedOut) {
            const timeout = new Error('The server did not answer in time.')
            timeout.isTimeout = true
            throw timeout
        }
        throw error
    } finally {
        clearTimeout(timer)
    }
}

// What is waiting behind a code the person typed: { label, requestedAt, expiresAt, from }.
// 404 { error: 'unknown_code' } when the code is wrong, expired or already decided.
export const lookupDeviceCode = (userCode) => call('/api/auth/device/lookup', {
    method: 'POST',
    body: { userCode }
})

// The person's answer for that code: { approved }.
export const decideDeviceCode = (userCode, approve) => call('/api/auth/device/decision', {
    method: 'POST',
    body: { userCode, approve: Boolean(approve) }
})

// This account's live terminal logins: { tokens: [{ id, label, createdAt, lastUsedAt, expiresAt }] }.
export const listTerminalLogins = () => call('/api/auth/cli/tokens')

// Ends one of them: { revoked: true }. 404 { error: 'not_found' } when it is not this account's.
export const revokeTerminalLogin = (id) => call(`/api/auth/cli/tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE'
})
