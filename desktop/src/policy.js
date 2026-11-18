'use strict'
// Pure policy for the desktop app: which address to open, which origins are
// di, which permissions di gets. No Electron import, so it unit-tests in plain
// Node. Everything the window may do is decided here, in one place.

const crypto = require('node:crypto')

// Public address: README.md ("live site: diiii.xyz"); dev tier: README.md
// ("`dev` branch -> dev.diiii.xyz"); local: AGENTS.md ("diiii.localhost").
const DI_ORIGINS = Object.freeze({
    prod: 'https://diiii.xyz',
    dev: 'https://dev.diiii.xyz',
    local: 'http://diiii.localhost'
})

// midi and midiSysex are what the app exists for; they are granted on di
// origins without a question. 'media' (camera and microphone) is NOT here:
// di uses both, so the app asks once per origin and kind (handlers.js, answers
// kept by mediaStore.js). Screen share has its own display-media handler.
// The other three keep what a browser tab already does for di: full screen
// for the output, pointer lock for the 3D view, copying text out.
const GRANTED_PERMISSIONS = Object.freeze([
    'midi',
    'midiSysex',
    'fullscreen',
    'pointerLock',
    'clipboard-sanitized-write'
])

const EXTERNAL_PROTOCOLS = Object.freeze(['http:', 'https:', 'mailto:'])

const parseWebUrl = (value) => {
    let url
    try {
        url = new URL(String(value))
    } catch {
        return null
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url
}

const readFlag = (argv, name) => {
    const index = argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`))
    if (index === -1) return { present: false }
    const arg = argv[index]
    if (arg.includes('=')) return { present: true, value: arg.slice(name.length + 1) }
    return { present: true, value: argv[index + 1] }
}

// Precedence: one of --url / --dev / --local, else DI_DESKTOP_URL, else prod.
// Two of the three flags together is an error, never a silent pick.
const resolveTarget = (argv = [], env = {}) => {
    const url = readFlag(argv, '--url')
    const dev = argv.includes('--dev')
    const local = argv.includes('--local')
    if ([url.present, dev, local].filter(Boolean).length > 1) {
        return { error: 'Use only one of --url, --dev, --local.' }
    }
    let raw
    if (url.present) raw = url.value
    else if (dev) raw = DI_ORIGINS.dev
    else if (local) raw = DI_ORIGINS.local
    else if (env.DI_DESKTOP_URL) raw = env.DI_DESKTOP_URL
    else raw = DI_ORIGINS.prod
    const parsed = parseWebUrl(raw)
    if (!parsed) return { error: `That address is not a web address: ${String(raw).slice(0, 80)}` }
    const origin = parsed.origin
    const known = Object.entries(DI_ORIGINS).find(([, value]) => value === origin)
    const channel = known
        ? known[0]
        : `custom-${crypto.createHash('sha1').update(origin).digest('hex').slice(0, 8)}`
    const allowed = new Set([...Object.values(DI_ORIGINS), origin])
    return { url: parsed.href, origin, channel, allowed }
}

const originOf = (value) => {
    const parsed = parseWebUrl(value)
    return parsed ? parsed.origin : null
}

const isAllowedUrl = (value, allowed) => {
    const origin = originOf(value)
    return origin !== null && allowed.has(origin)
}

// `requesting` is a URL or an origin; an empty, file: or opaque origin is a no.
const isPermissionGranted = (permission, requesting, allowed) =>
    GRANTED_PERMISSIONS.includes(permission) && isAllowedUrl(requesting, allowed)

const canOpenExternal = (value) => {
    try {
        return EXTERNAL_PROTOCOLS.includes(new URL(String(value)).protocol)
    } catch {
        return false
    }
}

// DI_DESKTOP_CDP=<port>: a DevTools port only when asked, on loopback only.
const resolveCdpPort = (env = {}) => {
    const raw = env.DI_DESKTOP_CDP
    if (raw === undefined || raw === '') return null
    const port = Number(raw)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return { error: 'DI_DESKTOP_CDP must be a port from 1024 to 65535.' }
    return { port }
}

module.exports = {
    DI_ORIGINS,
    GRANTED_PERMISSIONS,
    resolveTarget,
    originOf,
    isAllowedUrl,
    isPermissionGranted,
    canOpenExternal,
    resolveCdpPort
}
