/**
 * `di agents remote on|off|status` — Claude Code Remote Control at start, on this machine, with one command.
 * It sets `remoteControlAtStartup` (true/false) in ~/.claude.json and touches nothing else in that file.
 *
 * Method: read the whole file, change ONE key, write a temp file in the same folder and rename it over (writeFileAtomicSync,
 * the repo's atomic write), after copying the old file to ~/.claude.json.di-backup-<time> (mode 0600, the file can hold
 * tokens). An unreadable (not JSON) file is never overwritten: the command stops and says so. Undo: `di agents remote off`
 * or copy the backup back.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeFileAtomicSync } from './atomicWrite.mjs'

export const KEY = 'remoteControlAtStartup'
export const configFile = (home = os.homedir()) => path.join(home, '.claude.json')

export const USAGE = 'di agents remote on|off|status   Claude Code Remote Control at start (~/.claude.json: remoteControlAtStartup)'

/** { ok, value, file, backup? } or { ok: false, error }. `value` null = the key is not set. */
export const remoteControl = (action, { home = os.homedir(), now = () => new Date() } = {}) => {
    const file = configFile(home)
    let text = null
    try { text = fs.readFileSync(file, 'utf8') } catch (error) { if (error.code !== 'ENOENT') return { ok: false, error: `cannot read ${file}: ${error.code || error.message}` } }
    let data = {}
    if (text !== null && text.trim()) {
        try { data = JSON.parse(text) } catch { return { ok: false, error: `${file} is not valid JSON; left untouched` } }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: `${file} is not a JSON object; left untouched` }
    }
    if (action === 'status') return { ok: true, value: typeof data[KEY] === 'boolean' ? data[KEY] : null, file }
    if (action !== 'on' && action !== 'off') return { ok: false, error: USAGE }
    const value = action === 'on'
    let backup
    if (text !== null) {
        backup = `${file}.di-backup-${now().toISOString().replace(/[:.]/g, '-')}`
        fs.writeFileSync(backup, text, { mode: 0o600 })
    }
    writeFileAtomicSync(file, `${JSON.stringify({ ...data, [KEY]: value }, null, 2)}\n`, { mode: 0o600 })
    return { ok: true, value, file, backup }
}

export const runAgents = (args, { home, say = console.log, fail = console.error, now } = {}) => {
    const [, group, action] = args._
    if (group !== 'remote' || !['on', 'off', 'status'].includes(action)) { fail(USAGE); return 1 }
    const r = remoteControl(action, { home, now })
    if (!r.ok) { fail(r.error); return 1 }
    say(action === 'status'
        ? `remoteControlAtStartup: ${r.value === null ? 'not set (Claude Code default)' : r.value}`
        : `remoteControlAtStartup: ${r.value}${r.backup ? ` (previous file kept as ${r.backup})` : ''}`)
    return 0
}
