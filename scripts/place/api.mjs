/**
 * The di.iiii the pipeline talks to — one client, three callers.
 *
 * Written for step 5 (import.mjs, the room arriving) and now also used by step 1
 * (frames.mjs, `--from-space`, the footage coming the other way). A phone can
 * collect a walk into a space on any tier, including a hosted one; the
 * reconstruction only runs on the studio machine. So the footage has to travel,
 * and it travels over the same API the importer already speaks.
 *
 * The token is READ, handed to fetch, and never printed — the same contract every
 * script in scripts/place/ works under. `--token-file` first, then the installed
 * di.iiii's own env file, then a checkout's.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { REPO_ROOT } from './common.mjs'

export const DEFAULT_API = 'https://local.thedi.studio/serverXR'

const TOKEN_KEYS = ['ADMIN_API_TOKEN', 'API_TOKEN', 'DI_API_TOKEN']

export const readToken = (tokenFile = null) => {
    if (process.env.DI_API_TOKEN) return process.env.DI_API_TOKEN.trim()
    const files = [
        tokenFile ? String(tokenFile) : null,
        path.join(os.homedir(), '.di', 'di.env'),
        path.join(REPO_ROOT, 'serverXR', '.env.local')
    ].filter(Boolean)
    for (const file of files) {
        let text = ''
        try {
            text = fs.readFileSync(file, 'utf8')
        } catch {
            continue
        }
        for (const key of TOKEN_KEYS) {
            const line = text.split('\n').find((entry) => entry.startsWith(`${key}=`))
            const value = line ? line.slice(key.length + 1).trim() : ''
            if (value) return value
        }
    }
    return null
}

export const mimeFor = (file) => {
    const ext = path.extname(file).toLowerCase()
    return {
        '.glb': 'model/gltf-binary',
        '.gltf': 'model/gltf+json',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.heic': 'image/heic',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.m4v': 'video/mp4',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska'
    }[ext] || 'application/octet-stream'
}

/** …and back: what a file coming DOWN should be called on disk. */
export const extensionFor = (asset) => {
    const fromName = path.extname(String(asset?.name || '')).toLowerCase()
    const known = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.mp4', '.mov', '.m4v', '.webm', '.mkv'])
    if (known.has(fromName)) return fromName
    const mime = String(asset?.mimeType || '').split(';')[0].trim().toLowerCase()
    return {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/heic': '.heic',
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'video/webm': '.webm',
        'video/x-matroska': '.mkv'
    }[mime] || ''
}

export const makeClient = (api, token) => {
    const auth = token ? { Authorization: `Bearer ${token}` } : {}
    const call = async (method, route, body, extraHeaders = {}) => {
        const response = await fetch(`${api}${route}`, {
            method,
            headers: {
                ...auth,
                ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
                ...extraHeaders
            },
            body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined)
        })
        const text = await response.text()
        let parsed = null
        try {
            parsed = text ? JSON.parse(text) : null
        } catch {
            parsed = null
        }
        return { status: response.status, ok: response.ok, body: parsed, text }
    }
    return {
        get: (route) => call('GET', route),
        post: (route, body, headers) => call('POST', route, body, headers),
        patch: (route, body) => call('PATCH', route, body),
        put: (route, body) => call('PUT', route, body),
        /** The bytes, not the JSON — for pulling footage back down. */
        bytes: async (route) => {
            const response = await fetch(`${api}${route}`, { headers: auth })
            if (!response.ok) return { ok: false, status: response.status, buffer: null }
            return { ok: true, status: response.status, buffer: Buffer.from(await response.arrayBuffer()) }
        }
    }
}

/** `moxir` → `moxir-sources`. The one name the phone, the importer and this share. */
export const sourcesProjectId = (space) => `${String(space || '').trim()}-sources`
