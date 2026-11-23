#!/usr/bin/env node
// Writes ~/.di/monitor.json for Preferences → Monitor, once. Never overwrites:
// an existing file is left alone and printed, so a hand edit is never lost.
// Undo: delete the file; the Monitor falls back to the built-in probes and no feeds.
//   node scripts/monitor/init-config.mjs            write the example if none exists
//   node scripts/monitor/init-config.mjs --print    show the example, write nothing
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const EXAMPLE = {
    probes: [
        { name: 'dev tier', url: 'https://dev.diiii.xyz' },
        { name: 'prod tier', url: 'https://diiii.xyz' }
    ],
    feeds: [
        { panel: 'tasks', id: 'asks', title: 'Open asks', kind: 'command', command: 'echo "set a command that prints your open tasks, one per line"' },
        { panel: 'shows', id: 'board', title: 'Show board', kind: 'file', path: '~/show-board.md' }
    ]
}

const target = process.env.DI_MONITOR_CONFIG || path.join(os.homedir(), '.di', 'monitor.json')
if (process.argv.includes('--print')) {
    console.log(JSON.stringify(EXAMPLE, null, 2))
} else if (fs.existsSync(target)) {
    console.log(`kept (already there): ${target}`)
} else {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, `${JSON.stringify(EXAMPLE, null, 2)}\n`, { mode: 0o600 })
    console.log(`written: ${target}`)
}
