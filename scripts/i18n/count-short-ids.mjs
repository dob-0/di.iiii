#!/usr/bin/env node
/**
 * Read-only count of space and project ids shorter than 3 characters on a host,
 * so the language codes `en`, `hy`, `ru` (and any later 2-letter code) can be
 * reserved knowing nobody holds them. Sends GET requests only.
 *
 *   node scripts/i18n/count-short-ids.mjs [https://diiii.xyz https://dev.diiii.xyz http://diiii.localhost]
 *
 * Uses the public listings: /serverXR/api/spaces and /serverXR/api/spaces/<id>/projects.
 * A host that does not answer is reported, never guessed. Private spaces and
 * projects the host hides from an anonymous caller are not seen: the count is
 * "visible to a guest", and the line says so.
 * Design: docs/ai/decisions/2026-10-29-languages-in-the-address.md (S13b).
 */
import { isMainModule } from '../lib/isMainModule.mjs'

const DEFAULT_HOSTS = ['https://diiii.xyz', 'https://dev.diiii.xyz', 'http://diiii.localhost']
const MIN_LENGTH = 3

const getJson = async (url) => {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return res.json()
}

export const shortIds = (ids, min = MIN_LENGTH) => ids.filter((id) => String(id).length < min)

export const countHost = async (host) => {
    const out = { host, spaces: 0, projects: 0, shortSpaces: [], shortProjects: [], error: null }
    try {
        const { spaces = [] } = await getJson(`${host}/serverXR/api/spaces`)
        out.spaces = spaces.length
        out.shortSpaces = shortIds(spaces.map((space) => space.id))
        for (const space of spaces) {
            try {
                const body = await getJson(`${host}/serverXR/api/spaces/${encodeURIComponent(space.id)}/projects`)
                const projects = body.projects || body || []
                const ids = (Array.isArray(projects) ? projects : []).map((project) => project.id)
                out.projects += ids.length
                out.shortProjects.push(...shortIds(ids).map((id) => `${space.id}/${id}`))
            } catch {
                // a space whose project list a guest cannot read: skipped, counted below
                out.unreadable = (out.unreadable || 0) + 1
            }
        }
    } catch (error) {
        out.error = String(error.message || error)
    }
    return out
}

if (isMainModule(import.meta.url)) {
    const hosts = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_HOSTS
    for (const host of hosts) {
        const r = await countHost(host.replace(/\/+$/, ''))
        if (r.error) { console.log(`${r.host}: NOT READ (${r.error})`); continue }
        console.log(`${r.host}: ${r.spaces} spaces, ${r.projects} projects seen by a guest` +
            `${r.unreadable ? ` (${r.unreadable} spaces unreadable)` : ''}; ids under ${MIN_LENGTH} characters: ` +
            `${r.shortSpaces.length} spaces [${r.shortSpaces.join(', ')}], ${r.shortProjects.length} projects [${r.shortProjects.join(', ')}]`)
    }
}
