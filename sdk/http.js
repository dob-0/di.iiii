/**
 * One HTTP layer, so every trap it knows about is a trap no caller has to
 * remember. Each of these cost real damage before it was written down.
 */

export class DiError extends Error {
    constructor(message, { status = 0, code = null, body = null, url = null } = {}) {
        super(message)
        this.name = 'DiError'
        this.status = status
        this.code = code
        this.body = body
        this.url = url
    }
}

/**
 * 202 IS NOT SUCCESS.
 *
 * di.iiii's approval gate answers 202 for a sensitive change: armed, queued,
 * and NOT APPLIED. Two of the three hand-rolled push scripts in this estate
 * check for it and one does not — the one that does not prints a success line
 * for a change that never happened. So it is an error here, with a name, and a
 * caller has to opt into treating it as normal.
 */
export class ApprovalPending extends DiError {
    constructor({ url, body }) {
        super(
            'the approval gate is armed — this change is QUEUED, not applied.\n' +
            '  Approve it, or run against a server whose gate is off.',
            { status: 202, code: 'approval_pending', body, url }
        )
        this.name = 'ApprovalPending'
    }
}

const readBody = async (response) => {
    const text = await response.text()
    if (!text) return null
    try { return JSON.parse(text) } catch { return text }
}

export const createHttp = ({ base, token, fetchImpl = globalThis.fetch }) => {
    if (!base) throw new DiError('no server to talk to: pass base, or a tier name')
    const root = String(base).replace(/\/+$/, '')

    const call = async (method, path, { body = null, headers = {}, allowPending = false, raw = false } = {}) => {
        const url = path.startsWith('http') ? path : `${root}${path}`
        const isForm = body instanceof FormData
        const response = await fetchImpl(url, {
            method,
            headers: {
                ...(token ? { authorization: `Bearer ${token}` } : {}),
                ...(body && !isForm ? { 'content-type': 'application/json' } : {}),
                ...headers
            },
            ...(body ? { body: isForm ? body : JSON.stringify(body) } : {})
        })

        if (response.status === 202 && !allowPending) throw new ApprovalPending({ url, body: await readBody(response) })
        if (raw) return response

        const parsed = await readBody(response)
        if (!response.ok) {
            const detail = typeof parsed === 'string' ? parsed.slice(0, 300) : JSON.stringify(parsed || {}).slice(0, 300)
            // 401 on a tier you thought you were authenticated against almost
            // always means the token belongs to a DIFFERENT tier — they are
            // per-server and they look identical.
            const hint = response.status === 401
                ? `\n  A 401 here usually means the token is for another tier, not that access was revoked.`
                : ''
            throw new DiError(`${method} ${url} → ${response.status}${hint}\n  ${detail}`, {
                status: response.status,
                code: parsed?.error || null,
                body: parsed,
                url
            })
        }
        return { status: response.status, body: parsed }
    }

    return {
        root,
        get: (p, o) => call('GET', p, o),
        post: (p, body, o) => call('POST', p, { ...o, body }),
        put: (p, body, o) => call('PUT', p, { ...o, body }),
        patch: (p, body, o) => call('PATCH', p, { ...o, body }),
        del: (p, o) => call('DELETE', p, o),
        call
    }
}
