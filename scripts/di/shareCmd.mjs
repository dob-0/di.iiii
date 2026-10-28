/**
 * `di share`, `di share --stop`, `di share --status` — the install's door on the wifi.
 *
 * All the doing is in the running server (serverXR/src/shareDoor.js, routes
 * /api/share); this file calls the three routes and says what came back. The
 * server answers the owner only, and the CLI is the owner by being on loopback.
 * Plan: docs/ai/team-sync-by-network-name.md §7.
 */
import fs from 'node:fs'
import path from 'node:path'

const readLabel = (home) => {
    try {
        const info = JSON.parse(fs.readFileSync(path.join(home, 'name', 'name.json'), 'utf8'))
        return info?.name ? info : null
    } catch { return null }
}

/** A terminal QR when the encoder is at hand (a checkout has it; the packed CLI may not). */
const terminalQr = async (text) => {
    try {
        const { renderUnicodeCompact } = await import('uqr')
        return renderUnicodeCompact(text, { ecc: 'M', border: 2 })
    } catch { return null }
}

const REFUSED = {
    'no-name': 'run di name first — this install has no name yet.',
    'no-network': 'this machine is not on a network.',
    'no-guest-secrets': 'guest mode needs the install’s secrets: di down, then di up once.',
    'no-port': 'no port is free for the share door.',
    'owner-only': 'only the person at this machine can do that.'
}

const sharedLines = async (state) => {
    const url = `https://${state.name}${state.port === 443 ? '' : `:${state.port}`}/`
    const qr = await terminalQr(url)
    return [
        `Shared on the wifi as ${state.name}`,
        `  address  ${state.address}:${state.port}`,
        `  open     ${url}   (a guest, with the open space — never your spaces)`,
        ...(qr ? ['', qr.trimEnd(), ''] : []),
        `  follow   di follow <space> --from ${state.name.split('.')[0]}`,
        ...(state.error ? [`  note     ${state.error}`] : []),
        '  stop     di share --stop'
    ]
}

/** { code, lines } for one `di share …`; never prints, so a test reads it. */
export const runShare = async ({ flags = {}, home, base, fetchImpl = fetch }) => {
    if (!readLabel(home)) return { code: 2, lines: ['Run di name first — this install has no name yet.'] }
    const url = `${base}/api/share`
    const stop = Boolean(flags.stop)
    const method = stop ? 'DELETE' : (flags.status ? 'GET' : 'POST')
    let response
    try {
        response = await fetchImpl(url, { method })
    } catch {
        return { code: 1, lines: ['This install is not running. Start it with di up.'] }
    }
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return { code: 1, lines: [`Not shared: ${REFUSED[body.error] || body.message || `the install answered ${response.status}`}`] }
    if (stop) return { code: 0, lines: ['Private again: the door is closed and the name points at this machine only.'] }
    if (!body.shared) return { code: 0, lines: ['Private. Not shared on the wifi. Share it with di share.'] }
    return { code: 0, lines: await sharedLines(body) }
}
