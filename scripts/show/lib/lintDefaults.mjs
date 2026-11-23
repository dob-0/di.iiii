// Lint: no production name, address or id in any default of the show tools (gap G10; the owner's
// rule "Nothing is left behind", 2: the platform never checks a production by name). The forbidden
// terms are read from the venue files themselves, so a new venue file extends the lint with no code
// change; two patterns catch what a venue file may not list (tailnet addresses, Telegram group ids).
// The venue files are data and are not linted; everything else under scripts/show is.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED_DIR } from './profile.mjs'

export const SHOW_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const PATTERNS = [
    { re: /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/, why: 'a tailnet address (the CGNAT range used by Tailscale)' },
    { re: /-100\d{9,}/, why: 'a Telegram group id' }
]

export function forbiddenTerms(venuesDir = SEED_DIR) {
    const terms = new Map()
    for (const name of fs.readdirSync(venuesDir).filter((n) => n.endsWith('.json'))) {
        let v
        try { v = JSON.parse(fs.readFileSync(path.join(venuesDir, name), 'utf8')) } catch { continue }
        const add = (t, why) => { if (typeof t === 'string' && t.trim().length >= 4 && t !== 'local') terms.set(t.trim().toLowerCase(), why) }
        add(v.venue, `the venue id in ${name}`)
        add(v.production, `the production id in ${name}`)
        add(v.host, `the host in ${name}`)
        add(v.crew?.group, `the crew group in ${name}`)
        for (const n of v.names || []) add(n, `a production name in ${name}`)
    }
    return [...terms].map(([term, why]) => ({ term, why }))
}

export function lintText(file, text, terms) {
    const findings = []
    String(text).split('\n').forEach((line, i) => {
        const low = line.toLowerCase()
        for (const { term, why } of terms) if (low.includes(term)) findings.push({ file, line: i + 1, term, why })
        for (const { re, why } of PATTERNS) { const m = re.exec(line); if (m) findings.push({ file, line: i + 1, term: m[0], why }) }
    })
    return findings
}

export function lintTree(root = SHOW_ROOT, { venuesDir = SEED_DIR, terms = forbiddenTerms(venuesDir) } = {}) {
    const findings = []
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name)
            if (e.isDirectory()) { if (path.resolve(p) !== path.resolve(venuesDir) && e.name !== 'node_modules') walk(p); continue }
            if (/\.(mjs|cjs|js|sh)$/.test(e.name)) findings.push(...lintText(path.relative(root, p), fs.readFileSync(p, 'utf8'), terms))
        }
    }
    walk(root)
    return findings
}
