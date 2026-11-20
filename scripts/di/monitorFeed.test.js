// @vitest-environment node
// `di monitor feed add|remove|list`: every test works on a file in its own temp folder (DI_MONITOR_CONFIG) with HOME pointed at
// another temp folder, so the real ~/.di is never read or written. Backups are counted in the folder, "no write" is proved by a
// modification time pinned to 2001 and an unchanged inode, "atomic" by the inode changing and no temp file left behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { parseArgs } from './args.mjs'
import { parseMonitorArgs, runMonitor } from './monitorReport.mjs'
import { CHECK_LIMIT_MS, FEED_USAGE, checkFeedCommand, jsonErrorOffset, limitFor, parseFeedArgs, readFeedConfig, runFeed, stamp } from './monitorFeed.mjs'

const POSIX = process.platform !== 'win32'
const posixOnly = it.skipIf(!POSIX)
const posixNotRoot = it.skipIf(!POSIX || process.getuid?.() === 0)

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..', '..') // holds serverXR/src/monitorChats.js, the Monitor's own reader that --check uses
const CLI = path.join(here, 'cli.mjs')
const monitorChats = createRequire(import.meta.url)(path.join(ROOT, 'serverXR', 'src', 'monitorChats.js'))
const CLOCK = new Date(2026, 10, 20, 4, 5, 6) // local time, so the stamp below holds in every time zone
const STAMP = '20261120-040506'
const PAST = new Date(2001, 0, 2, 3, 4, 5)
const CMD = 'di-chats --json'
// what a chat list carries for the Monitor: the time it was made, in seconds since 1970 (2026-11-20 01:11 UTC)
const GENERATED_AT = 1795137071
const chatList = (chats) => JSON.stringify({ generatedAt: GENERATED_AT, chats })
const CHATS = { id: 'chats', title: 'Chats', panel: 'chats', kind: 'command', command: CMD }
const TASKS = { id: 'tasks', title: 'Tasks', panel: 'tasks', kind: 'file', path: '/x/tasks.json' }

const folders = []
const tmp = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-feed-')); folders.push(dir); return dir }
const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, DI_MONITOR_CONFIG: process.env.DI_MONITOR_CONFIG }
let home = ''
beforeEach(() => {
    home = tmp()
    process.env.HOME = home
    process.env.USERPROFILE = home
    delete process.env.DI_MONITOR_CONFIG
})
afterEach(() => {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    while (folders.length) {
        const dir = folders.pop()
        try { fs.chmodSync(dir, 0o700) } catch { /* gone already */ }
        fs.rmSync(dir, { recursive: true, force: true })
    }
})

/** A config path in a fresh folder. With `content` the file exists (mode 0600); without it neither the file nor its folder does. */
const place = (content) => {
    const dir = path.join(tmp(), 'conf')
    const file = path.join(dir, 'monitor.json')
    if (content !== undefined) { fs.mkdirSync(dir); fs.writeFileSync(file, content, { mode: 0o600 }) }
    return { dir, file }
}
const json = (value) => `${JSON.stringify(value, null, 2)}\n`
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const ls = (dir) => fs.readdirSync(dir).sort()
const backups = (dir) => ls(dir).filter((name) => name.startsWith('monitor.json.bak-'))
const pin = (file) => fs.utimesSync(file, PAST, PAST)
const snap = (file) => { const s = fs.statSync(file); return { mtimeMs: s.mtimeMs, ino: s.ino, bytes: fs.readFileSync(file) } }

/** `di monitor feed <argv>` against `file`: the exit code and what it said on stdout and on stderr. */
const feed = async (file, argv, deps = {}) => {
    const out = []
    const err = []
    const code = await runFeed(parseArgs(['monitor', 'feed', ...argv]), {
        env: { DI_MONITOR_CONFIG: file }, home, say: (line) => out.push(line), fail: (line) => err.push(line), now: () => CLOCK, root: ROOT, ...deps
    })
    return { code, out: out.join('\n'), err: err.join('\n') }
}
const fakeRun = (result) => async () => ({ error: null, stdout: '', stderr: '', ...result })
const killed = Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' })

describe('add', () => {
    it('writes the first feed into a file that is not there yet, folder included', async () => {
        const { dir, file } = place()
        const r = await feed(file, ['add', 'chats', '--command', CMD])
        expect(r.code).toBe(0)
        expect(readJson(file)).toEqual({ feeds: [CHATS] })
        expect(ls(dir)).toEqual(['monitor.json'])
        expect(r.out).toContain(`added the chats feed (id chats): ${CMD}`)
        expect(r.out).toContain('backup: none, the file is new')
        expect(r.out.split('\n').at(-1)).toBe('undo: di monitor feed remove chats')
    })

    it('uses ~/.di/monitor.json of the home it is given when DI_MONITOR_CONFIG is not set', async () => {
        const out = []
        const code = await runFeed(parseArgs(['monitor', 'feed', 'add', 'chats', '--command', CMD]), { env: {}, home, say: (l) => out.push(l), fail: () => {}, now: () => CLOCK, root: ROOT })
        expect(code).toBe(0)
        expect(readJson(path.join(home, '.di', 'monitor.json'))).toEqual({ feeds: [CHATS] })
        expect(out.join('\n')).toContain(`file: ${path.join(home, '.di', 'monitor.json')}`)
    })

    it('keeps every other key and every other feed, and keeps the old file once', async () => {
        const old = { port: 8080, note: 'mine', feeds: [TASKS, { id: 'credits', title: 'Credits', panel: 'credits', kind: 'command', command: 'cr --json' }] }
        const { dir, file } = place(json(old))
        const r = await feed(file, ['add', 'chats', '--command', CMD])
        expect(r.code).toBe(0)
        expect(readJson(file)).toEqual({ ...old, feeds: [...old.feeds, CHATS] })
        expect(backups(dir)).toEqual([`monitor.json.bak-${STAMP}`])
        expect(fs.readFileSync(path.join(dir, backups(dir)[0]), 'utf8')).toBe(json(old))
        expect(r.out).toContain(`backup: ${path.join(dir, `monitor.json.bak-${STAMP}`)}`)
        expect(r.out.split('\n').at(-1)).toBe('undo: di monitor feed remove chats')
    })

    it('the same feed again changes nothing: no write, no new backup', async () => {
        const { dir, file } = place('{}\n')
        await feed(file, ['add', 'chats', '--command', CMD])
        expect(backups(dir)).toHaveLength(1)
        pin(file)
        const before = snap(file)
        const again = await feed(file, ['add', 'chats', '--command', CMD])
        expect(again.code).toBe(0)
        expect(again.out).toBe('the chats feed is already set, nothing changed')
        expect(snap(file)).toEqual(before)
        expect(snap(file).mtimeMs).toBe(PAST.getTime())
        expect(backups(dir)).toHaveLength(1)
        expect(ls(dir)).toHaveLength(2)
    })

    it('a changed command replaces the feed where it stands, keeps its title, keeps the old file once', async () => {
        const old = { feeds: [{ ...CHATS, title: 'Mine' }, TASKS] }
        const { dir, file } = place(json(old))
        const r = await feed(file, ['add', 'chats', '--command', 'other --json'])
        expect(r.code).toBe(0)
        expect(readJson(file).feeds).toEqual([{ ...CHATS, title: 'Mine', command: 'other --json' }, TASKS])
        expect(r.out).toContain('replaced the chats feed (id chats): other --json')
        expect(backups(dir)).toHaveLength(1)
        expect(r.out).toContain(`undo: cp '${path.join(dir, backups(dir)[0])}' '${file}'`)
    })

    it('a title nobody asked for stays; an explicit title is a change', async () => {
        const { dir, file } = place(json({ feeds: [{ ...CHATS, title: 'Mine' }] }))
        pin(file)
        const same = await feed(file, ['add', 'chats', '--command', CMD])
        expect(same.out).toBe('the chats feed is already set, nothing changed')
        expect(snap(file).mtimeMs).toBe(PAST.getTime())
        const renamed = await feed(file, ['add', 'chats', '--command', CMD, '--title', 'Chats of this machine'])
        expect(renamed.out).toContain('replaced the chats feed')
        expect(readJson(file).feeds[0].title).toBe('Chats of this machine')
        expect(backups(dir)).toHaveLength(1)
    })

    it('another id for the same panel is added next to it, and the note says which one the Monitor runs', async () => {
        const { file } = place(json({ feeds: [CHATS] }))
        const r = await feed(file, ['add', 'chats', '--id', 'second', '--command', 'two'])
        expect(r.code).toBe(0)
        expect(readJson(file).feeds.map((f) => f.id)).toEqual(['chats', 'second'])
        expect(r.out).toContain('note: the Monitor runs only the first chats feed, and that is "chats", not this one.')
        expect(r.out).toContain('undo: di monitor feed remove chats --id second')
    })

    it('credits feeds get the title Credits, and --title names a feed', async () => {
        const { file } = place()
        await feed(file, ['add', 'credits', '--command', 'cr --json'])
        await feed(file, ['add', 'chats', '--command', CMD, '--title', 'My machine'])
        expect(readJson(file).feeds).toEqual([
            { id: 'credits', title: 'Credits', panel: 'credits', kind: 'command', command: 'cr --json' },
            { id: 'chats', title: 'My machine', panel: 'chats', kind: 'command', command: CMD }
        ])
    })

    it('a feed without an id is the panel\'s own feed, and doubles of one panel and id collapse into one', async () => {
        const { file } = place(json({ feeds: [{ panel: 'chats', kind: 'command', command: 'old' }, { id: 'chats', panel: 'chats', kind: 'command', command: 'old2' }, { panel: 'tasks', kind: 'file', path: '/t' }] }))
        await feed(file, ['add', 'chats', '--command', CMD])
        expect(readJson(file).feeds).toEqual([CHATS, { panel: 'tasks', kind: 'file', path: '/t' }])
    })

    it('three changes inside one second keep all three old files, each with its own bytes', async () => {
        const { dir, file } = place('{}\n')
        await feed(file, ['add', 'chats', '--command', 'one'])
        const afterOne = fs.readFileSync(file)
        await feed(file, ['add', 'chats', '--command', 'two'])
        const afterTwo = fs.readFileSync(file)
        await feed(file, ['add', 'chats', '--command', 'three'])
        expect(backups(dir)).toEqual([`monitor.json.bak-${STAMP}`, `monitor.json.bak-${STAMP}-1`, `monitor.json.bak-${STAMP}-2`])
        expect(fs.readFileSync(path.join(dir, `monitor.json.bak-${STAMP}`), 'utf8')).toBe('{}\n')
        expect(fs.readFileSync(path.join(dir, `monitor.json.bak-${STAMP}-1`))).toEqual(afterOne)
        expect(fs.readFileSync(path.join(dir, `monitor.json.bak-${STAMP}-2`))).toEqual(afterTwo)
    })

    it('stamps a backup from the clock it is given: YYYYMMDD-HHMMSS', () => {
        expect(stamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('20260102-030405')
        expect(stamp(CLOCK)).toBe(STAMP)
    })
})

describe('remove', () => {
    it('takes the feed of that panel and id out, keeps the rest, and the printed backup restores the file', async () => {
        const old = { port: 8080, feeds: [CHATS, TASKS] }
        const { dir, file } = place(json(old))
        const r = await feed(file, ['remove', 'chats'])
        expect(r.code).toBe(0)
        expect(readJson(file)).toEqual({ port: 8080, feeds: [TASKS] })
        expect(r.out).toContain('removed 1 chats feed (id chats)')
        expect(backups(dir)).toEqual([`monitor.json.bak-${STAMP}`])
        const backup = path.join(dir, backups(dir)[0])
        expect(r.out).toContain(`backup: ${backup}`)
        expect(r.out.split('\n').at(-1)).toBe(`undo: cp '${backup}' '${file}'`)
        fs.copyFileSync(backup, file)
        expect(fs.readFileSync(file, 'utf8')).toBe(json(old))
    })

    it('an absent feed is "nothing to remove", exit 0, and nothing is written or kept', async () => {
        const { dir, file } = place(json({ feeds: [TASKS] }))
        pin(file)
        const before = snap(file)
        const r = await feed(file, ['remove', 'chats'])
        expect(r.code).toBe(0)
        expect(r.out).toBe(`nothing to remove: no chats feed with id chats in ${file}`)
        expect(snap(file)).toEqual(before)
        expect(ls(dir)).toEqual(['monitor.json'])
    })

    it('a file that is not there is "nothing to remove" too, and is not created', async () => {
        const { dir, file } = place()
        const r = await feed(file, ['remove', 'chats'])
        expect(r.code).toBe(0)
        expect(r.out).toBe(`nothing to remove: ${file} does not exist`)
        expect(fs.existsSync(dir)).toBe(false)
    })

    it('--id picks one of two feeds of a panel; the default id does not match another id', async () => {
        const { file } = place(json({ feeds: [{ ...CHATS, id: 'main' }, { ...CHATS, id: 'second' }] }))
        expect((await feed(file, ['remove', 'chats'])).out).toContain('nothing to remove')
        const r = await feed(file, ['remove', 'chats', '--id', 'second'])
        expect(r.out).toContain('removed 1 chats feed (id second)')
        expect(readJson(file).feeds.map((f) => f.id)).toEqual(['main'])
    })

    it('the last feed out leaves an empty list and every other key', async () => {
        const { file } = place(json({ port: 1, feeds: [CHATS] }))
        await feed(file, ['remove', 'chats'])
        expect(readJson(file)).toEqual({ port: 1, feeds: [] })
    })
})

describe('a file it must not touch', () => {
    const BROKEN = [
        ['a stray word', '{\n  "feeds": [\n    oops\n  ]\n}\n', /line 3, column 5 \(unexpected "o"\)/],
        ['a trailing comma', '{\n  "feeds": [\n    { "panel": "chats" },\n  ]\n}\n', /line 4, column 3 \(unexpected "\]"\)/],
        ['a file cut short', '{\n  "feeds": [\n', /line 3, column 1 \(the file ends too soon\)/],
        ['an empty file', '', /line 1, column 1 \(the file ends too soon\)/],
        ['single quotes', '{ \'feeds\': [] }', /line 1, column 3 \(unexpected "'"\)/],
        ['a byte-order mark', '﻿{ "feeds": [] }', /line 1, column 1 \(unexpected U\+FEFF\)/],
        ['a comment', '{\n  // chats\n  "feeds": []\n}\n', /line 2, column 3 \(unexpected "\/"\)/]
    ]
    const ACTIONS = [['add', 'chats', '--command', CMD], ['remove', 'chats'], ['list']]

    it.each(BROKEN)('invalid JSON (%s) is refused for add, remove and list, says where, and the file stays byte for byte', async (_name, text, where) => {
        for (const argv of ACTIONS) {
            const { dir, file } = place(text)
            pin(file)
            const before = snap(file)
            const r = await feed(file, argv)
            expect(r.code).toBe(1)
            expect(r.err).toContain(`${file} is not valid JSON at `)
            expect(r.err).toMatch(where)
            expect(r.err).toContain('Nothing was changed.')
            expect(snap(file)).toEqual(before)
            expect(ls(dir)).toEqual(['monitor.json'])
        }
    })

    it.each([['a list', '[]'], ['a list', '[{"panel":"chats"}]'], ['a string', '"x"'], ['a number', '5'], ['null', 'null'], ['a boolean', 'true']])('JSON that is %s and not an object is refused, byte for byte', async (word, text) => {
        for (const argv of ACTIONS) {
            const { dir, file } = place(text)
            const before = fs.readFileSync(file)
            const r = await feed(file, argv)
            expect(r.code).toBe(1)
            expect(r.err).toContain(`${file} holds ${word}, not a JSON object`)
            expect(fs.readFileSync(file)).toEqual(before)
            expect(ls(dir)).toEqual(['monitor.json'])
        }
    })

    it('"feeds" that is not a list is refused', async () => {
        const { dir, file } = place('{ "feeds": { "chats": 1 } }\n')
        const r = await feed(file, ['add', 'chats', '--command', CMD])
        expect(r.code).toBe(1)
        expect(r.err).toContain(`"feeds" in ${file} is not a list`)
        expect(ls(dir)).toEqual(['monitor.json'])
    })

    posixOnly('a folder where the file should be is refused with its reason', async () => {
        const { file } = place()
        fs.mkdirSync(file, { recursive: true })
        const r = await feed(file, ['add', 'chats', '--command', CMD])
        expect(r.code).toBe(1)
        expect(r.err).toContain(`cannot read ${file}: EISDIR`)
    })

    posixNotRoot('a write that cannot happen says so, exits 1 and leaves the old file whole', async () => {
        const { dir, file } = place(json({ port: 1, feeds: [TASKS] }))
        const before = fs.readFileSync(file)
        fs.chmodSync(dir, 0o500)
        try {
            const r = await feed(file, ['add', 'chats', '--command', CMD])
            expect(r.code).toBe(1)
            expect(r.err).toContain(`could not change ${file}: EACCES. The file was not changed.`)
            expect(r.out).toBe('')
            expect(fs.readFileSync(file)).toEqual(before)
        } finally { fs.chmodSync(dir, 0o700) }
        expect(ls(dir)).toEqual(['monitor.json'])
    })
})

describe('usage mistakes are exit 2 and touch nothing', () => {
    const CASES = [
        [[], /di monitor feed needs add, remove or list/],
        [['frob'], /di monitor feed needs add, remove or list/],
        [['add', 'tasks', '--command', 'x'], /"tasks" is not a feed this command sets: use chats or credits/],
        [['remove', 'tasks'], /"tasks" is not a feed this command sets: use chats or credits/],
        [['add'], /add needs the panel: chats or credits/],
        [['remove'], /remove needs the panel: chats or credits/],
        [['add', 'chats'], /add needs --command/],
        [['add', 'chats', '--command', '   '], /add needs --command/],
        [['add', 'chats', '--command'], /--command needs its value right after it/],
        [['add', 'chats', '--command', '--check'], /--command needs its value right after it/],
        [['add', 'chats', '--command=x'], /write --command "\.\.\." with a space, not =/],
        [['add', 'chats', '--command', 'x', '--force'], /add does not take --force/],
        [['remove', 'chats', '--command', 'x'], /remove does not take --command/],
        [['remove', 'chats', '--check'], /remove does not take --check/],
        [['list', '--dry-run'], /list does not take --dry-run/],
        [['list', 'chats'], /list takes no other words/],
        [['add', 'chats', '--command', 'x', 'extra'], /unexpected word "extra"/],
        [['add', 'chats', '--command', 'x', '--id', 'a b'], /--id takes letters, digits/],
        [['add', 'chats', '--command', 'x', '--id', '-x'], /--id takes letters, digits/],
        [['add', 'chats', '--command', 'x', '--title', ''], /--title takes a short text/],
        [['add', 'chats', '--command', 'x', '--title', 'a\nb'], /--title takes a short text/]
    ]

    it.each(CASES)('di monitor feed %j', async (argv, message) => {
        const { dir, file } = place()
        const r = await feed(file, argv)
        expect(r.code).toBe(2)
        expect(r.err).toMatch(message)
        expect(r.out).toBe('')
        expect(fs.existsSync(dir)).toBe(false)
    })

    it('an unknown panel is refused in one sentence even when the file is broken', async () => {
        const { file } = place('{ nope')
        const r = await feed(file, ['add', 'tasks', '--command', 'x'])
        expect(r.code).toBe(2)
        expect(r.err).toBe('"tasks" is not a feed this command sets: use chats or credits')
    })

    it('the usage text shows the real shapes: chats with generatedAt, credits as a list of routes', async () => {
        const { dir, file } = place()
        const r = await feed(file, [])
        expect(r.code).toBe(2)
        expect(r.err).toContain('{ "generatedAt": <seconds since 1970>, "chats": [ ... ] }')
        expect(r.err).toContain('[ { "route": "<name>", "available": true or false, "meter": "...", "have": "...", "why": "..." } ]')
        expect(r.err).not.toContain('{ "chats"')
        expect(fs.existsSync(dir)).toBe(false)
    })

    it('the Monitor\'s own readers accept the shapes in the usage text once their placeholders are filled in', async () => {
        const shape = (panel) => FEED_USAGE.split('\n').map((line) => line.trim()).find((line) => line.startsWith(`${panel} `)).slice(panel.length).replace(/\(every row .*\)$/, '').trim()
        const chats = shape('chats').replace('<seconds since 1970>', String(Math.floor(Date.now() / 1000))).replace('[ ... ]', '[ { "id": "a" } ]')
        const credits = shape('credits').replace('<name>', 'plan-a').replace('true or false', 'true')
        for (const [panel, stdout] of [['chats', chats], ['credits', credits]]) {
            const r = await checkFeedCommand({ panel, command: 'x', root: ROOT, exec: fakeRun({ stdout }) })
            expect(r.error).toBeUndefined()
            expect(r.line).toMatch(/^the command printed 1 /)
        }
    })

    it('parses the words and flags into one plain object', () => {
        expect(parseFeedArgs(parseArgs(['monitor', 'feed', 'add', 'chats', '--command', 'c', '--check', '--dry-run']))).toEqual({ action: 'add', panel: 'chats', id: 'chats', dryRun: true, command: 'c', title: undefined, check: true })
        expect(parseFeedArgs(parseArgs(['monitor', 'feed', 'remove', 'credits', '--id', 'x']))).toEqual({ action: 'remove', panel: 'credits', id: 'x', dryRun: false })
        expect(parseFeedArgs(parseArgs(['monitor', 'feed', 'list']))).toEqual({ action: 'list' })
    })
})

describe('files are written the safe way', () => {
    posixOnly('mode 0600 on a new file, on a file that was wider, and on its backup', async () => {
        const fresh = place()
        await feed(fresh.file, ['add', 'chats', '--command', CMD])
        expect(fs.statSync(fresh.file).mode & 0o777).toBe(0o600)

        const { dir, file } = place('{}\n')
        fs.chmodSync(file, 0o644)
        await feed(file, ['add', 'chats', '--command', CMD])
        expect(fs.statSync(file).mode & 0o777).toBe(0o600)
        expect(fs.statSync(path.join(dir, backups(dir)[0])).mode & 0o777).toBe(0o600)

        fs.chmodSync(file, 0o664)
        await feed(file, ['remove', 'chats'])
        expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    })

    posixOnly('the file is replaced by a rename: a new inode, and no temp file is left in the folder', async () => {
        const { dir, file } = place('{ "port": 1 }\n')
        const before = fs.statSync(file).ino
        await feed(file, ['add', 'chats', '--command', CMD])
        expect(fs.statSync(file).ino).not.toBe(before)
        expect(ls(dir)).toEqual(['monitor.json', `monitor.json.bak-${STAMP}`])
    })

    posixOnly('a config that is a link stays a link, and the file behind it is the one that changes', async () => {
        const dir = tmp()
        const real = path.join(dir, 'real.json')
        const link = path.join(dir, 'monitor.json')
        fs.writeFileSync(real, '{ "port": 1 }\n', { mode: 0o600 })
        fs.symlinkSync(real, link)
        const r = await feed(link, ['add', 'chats', '--command', CMD])
        expect(r.code).toBe(0)
        expect(fs.lstatSync(link).isSymbolicLink()).toBe(true)
        expect(readJson(real)).toEqual({ port: 1, feeds: [CHATS] })
    })

    it('--dry-run prints the whole file it would write and writes nothing: no file, no folder, no backup', async () => {
        const { dir, file } = place()
        const r = await feed(file, ['add', 'chats', '--command', CMD, '--dry-run'])
        expect(r.code).toBe(0)
        expect(JSON.parse(r.out)).toEqual({ feeds: [CHATS] })
        expect(r.err).toContain('dry run: nothing was written')
        expect(fs.existsSync(dir)).toBe(false)
    })

    it('--dry-run on an existing file leaves bytes, time, inode and folder as they were, for add and remove', async () => {
        const old = { port: 1, feeds: [TASKS, CHATS] }
        const { dir, file } = place(json(old))
        pin(file)
        const before = snap(file)
        const add = await feed(file, ['add', 'chats', '--command', 'new', '--dry-run'])
        expect(JSON.parse(add.out)).toEqual({ port: 1, feeds: [TASKS, { ...CHATS, command: 'new' }] })
        const remove = await feed(file, ['remove', 'chats', '--dry-run'])
        expect(JSON.parse(remove.out)).toEqual({ port: 1, feeds: [TASKS] })
        expect([add.code, remove.code]).toEqual([0, 0])
        expect(snap(file)).toEqual(before)
        expect(ls(dir)).toEqual(['monitor.json'])
    })

    it('--dry-run with nothing to change says so on stderr and still prints the file', async () => {
        const { file } = place(json({ feeds: [CHATS] }))
        const r = await feed(file, ['add', 'chats', '--command', CMD, '--dry-run'])
        expect(JSON.parse(r.out)).toEqual({ feeds: [CHATS] })
        expect(r.err).toBe('the chats feed is already set, nothing changed')
    })
})

// --check can run for seconds (4 s for chats, up to 30 s for credits) between the first read of the file and the write. The command
// under check is replaced here by a function that changes the file the way another hand would, while the check is "running".
describe('a file that changes while --check runs', () => {
    const SENTENCE = (file) => `${file} changed while this command ran, so nothing was written. Run the command again.`
    const printed = { error: null, stdout: chatList([]), stderr: '' }

    it('an edit made during the check is kept: refused, exit 1, no backup, no write', async () => {
        const { dir, file } = place(json({ port: 1 }))
        const edited = json({ port: 1, feeds: [TASKS], note: 'typed by hand while the check ran' })
        let during
        const exec = async () => { fs.writeFileSync(file, edited); pin(file); during = snap(file); return printed }
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec })
        expect(r.code).toBe(1)
        expect(r.err).toBe(SENTENCE(file))
        expect(fs.readFileSync(file, 'utf8')).toBe(edited)
        expect(snap(file)).toEqual(during) // same bytes, same inode, same time: not written
        expect(ls(dir)).toEqual(['monitor.json']) // no backup, no temp file
    })

    it('a file that was not there and appears during the check is not overwritten', async () => {
        const { dir, file } = place()
        const theirs = json({ port: 2, feeds: [TASKS] })
        const exec = async () => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, theirs, { mode: 0o600 }); return printed }
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec })
        expect(r.code).toBe(1)
        expect(r.err).toBe(SENTENCE(file))
        expect(fs.readFileSync(file, 'utf8')).toBe(theirs)
        expect(ls(dir)).toEqual(['monitor.json'])
    })

    it('a file that vanishes during the check is not written back from the old read, and no folder or backup is made', async () => {
        const { dir, file } = place(json({ port: 1 }))
        const exec = async () => { fs.rmSync(file); return printed }
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec })
        expect(r.code).toBe(1)
        expect(r.err).toBe(SENTENCE(file))
        expect(ls(dir)).toEqual([])
    })

    it('the same bytes written again during the check are no change: the feed is saved, with its backup', async () => {
        const { dir, file } = place(json({ port: 1 }))
        const exec = async () => {
            fs.writeFileSync(file, fs.readFileSync(file)) // an editor that saves without a change
            const swap = `${file}.swap` // and one that saves through a new file: another inode, another time, the same bytes
            fs.writeFileSync(swap, fs.readFileSync(file), { mode: 0o600 })
            fs.renameSync(swap, file)
            return printed
        }
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec })
        expect(r.code).toBe(0)
        expect(r.err).toBe('')
        expect(readJson(file)).toEqual({ port: 1, feeds: [CHATS] })
        expect(backups(dir)).toHaveLength(1)
        expect(ls(dir)).toHaveLength(2)
    })
})

// Two commands that both reach the write would both read the same bytes in the read-again and both pass; the second rename would
// drop what the first wrote, with exit 0 for both (60 parallel pairs: 19 times, measured by the review). The write runs under
// <file>.lock (git's lock file); a command that finds it held writes nothing and says so.
describe('two commands at the same moment', () => {
    const lockOf = (file) => `${file}.lock`
    const HELD = (file) => `another di monitor feed command is writing ${file} (${lockOf(file)} exists), so nothing was written. `
        + `Run the command again. If this stays and no other command is running, delete the lock: rm '${lockOf(file)}'`
    const CREDITS_CMD = 'di-credits status --json'

    it('a second command that reaches the write while the first one holds it is refused; the first is written whole', async () => {
        const { dir, file } = place(json({ port: 1 }))
        let second
        // the clock is first read inside the write (the backup's time stamp): the second command starts right there, as a parallel process would
        const now = () => { second ??= feed(file, ['add', 'credits', '--command', CREDITS_CMD]); return CLOCK }
        const first = await feed(file, ['add', 'chats', '--command', CMD], { now })
        expect(second).toBeDefined()
        const other = await second
        expect(first.code).toBe(0)
        expect(other.code).toBe(1)
        expect(other.err).toBe(HELD(file))
        expect(other.out).toBe('')
        expect(readJson(file)).toEqual({ port: 1, feeds: [CHATS] }) // the first command's feed, and nothing of the second
        expect(ls(dir)).toEqual(['monitor.json', `monitor.json.bak-${STAMP}`]) // one backup, and the lock is gone
    })

    it('a lock that is already there refuses add and remove, writes nothing and is left exactly where it is', async () => {
        const { dir, file } = place(json({ port: 1, feeds: [CHATS] }))
        fs.writeFileSync(lockOf(file), '4242\n')
        pin(file)
        const before = snap(file)
        const add = await feed(file, ['add', 'credits', '--command', CREDITS_CMD])
        const remove = await feed(file, ['remove', 'chats'])
        for (const r of [add, remove]) {
            expect(r.code).toBe(1)
            expect(r.err).toBe(HELD(file))
        }
        expect(snap(file)).toEqual(before)
        expect(fs.readFileSync(lockOf(file), 'utf8')).toBe('4242\n') // not removed by the command that did not make it
        expect(ls(dir)).toEqual(['monitor.json', 'monitor.json.lock']) // no backup, no temp file
    })

    it('what does not write does not care about the lock: list, --dry-run, the same feed again, a feed that is not there', async () => {
        const { file } = place(json({ feeds: [CHATS] }))
        fs.writeFileSync(lockOf(file), '4242\n')
        const list = await feed(file, ['list'])
        const dry = await feed(file, ['add', 'chats', '--command', 'new', '--dry-run'])
        const same = await feed(file, ['add', 'chats', '--command', CMD])
        const none = await feed(file, ['remove', 'credits'])
        expect([list.code, dry.code, same.code, none.code]).toEqual([0, 0, 0, 0])
        expect(same.out).toBe('the chats feed is already set, nothing changed')
        expect([list.err, same.err, none.err]).toEqual(['', '', ''])
    })

    it('the file is read again while the lock is held, not before it (a read before it passes for both commands)', async () => {
        const { file } = place(json({ port: 1 }))
        const real = fs.readFileSync
        const lockHeld = []
        const spy = vi.spyOn(fs, 'readFileSync').mockImplementation((target, ...rest) => {
            if (target === file) lockHeld.push(fs.existsSync(lockOf(file)))
            return real(target, ...rest)
        })
        try { expect((await feed(file, ['add', 'chats', '--command', CMD])).code).toBe(0) } finally { spy.mockRestore() }
        expect(lockHeld).toEqual([false, true]) // the first read of the command, then the read-again under the lock
    })

    it('the lock is removed after a write that fails inside it (100 backups with one time stamp are already there)', async () => {
        const { file } = place(json({ port: 1 }))
        fs.writeFileSync(`${file}.bak-${STAMP}`, 'x')
        for (let n = 1; n < 100; n += 1) fs.writeFileSync(`${file}.bak-${STAMP}-${n}`, 'x')
        const before = snap(file)
        const r = await feed(file, ['add', 'chats', '--command', CMD])
        expect(r.code).toBe(1)
        expect(r.err).toContain('100 backups with one time stamp')
        expect(snap(file)).toEqual(before)
        expect(fs.existsSync(lockOf(file))).toBe(false)
    })
})

describe('--check', () => {
    it('refuses output that is not JSON, saves nothing, exits 1', async () => {
        const { dir, file } = place(json({ port: 1 }))
        pin(file)
        const before = snap(file)
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec: fakeRun({ stdout: 'hello there\n' }) })
        expect(r.code).toBe(1)
        expect(r.err).toBe('the command did not print JSON, it printed "hello there". Nothing was saved.')
        expect(snap(file)).toEqual(before)
        expect(ls(dir)).toEqual(['monitor.json'])
    })

    it('refuses a command that prints nothing', async () => {
        const { dir, file } = place()
        const r = await feed(file, ['add', 'chats', '--check', '--command', 'true'], { exec: fakeRun({}) })
        expect(r.code).toBe(1)
        expect(r.err).toBe('the command printed nothing. Nothing was saved.')
        expect(fs.existsSync(dir)).toBe(false)
    })

    it('refuses JSON that is not a chat list: an object without chats, or a bare list', async () => {
        const { file } = place()
        for (const stdout of ['{"a":1}', '[]', '{"chats":"x"}', 'null']) {
            const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec: fakeRun({ stdout }) })
            expect(r.code).toBe(1)
            expect(r.err).toContain('not a chat list: it must print { "generatedAt": <seconds since 1970>, "chats": [ ... ] }. Nothing was saved.')
        }
        expect(fs.existsSync(file)).toBe(false)
    })

    it('a command that hangs is stopped at the Monitor\'s own limit and nothing is saved', async () => {
        const { file } = place()
        let seen = null
        const exec = async (command, opts) => { seen = { command, timeout: opts.timeout }; return { error: killed, stdout: '', stderr: '' } }
        const r = await feed(file, ['add', 'chats', '--check', '--command', 'sleep 60'], { exec })
        expect(r.code).toBe(1)
        expect(r.err).toBe('the command did not finish in 4 s: the Monitor stops it there. Nothing was saved.')
        expect(seen).toEqual({ command: 'sleep 60', timeout: CHECK_LIMIT_MS.chats })
        expect(fs.existsSync(file)).toBe(false)
    })

    posixOnly('a real command that outlives a short limit is killed by the real runner', async () => {
        const { file } = place()
        const r = await feed(file, ['add', 'chats', '--check', '--command', 'exec sleep 1'], { limits: { chats: 150 } })
        expect(r.code).toBe(1)
        expect(r.err).toBe('the command did not finish in 0.15 s: the Monitor stops it there. Nothing was saved.')
        expect(fs.existsSync(file)).toBe(false)
    })

    it('a command that fails says how and what it wrote to stderr', async () => {
        const { file } = place()
        const exec = fakeRun({ error: Object.assign(new Error('x'), { code: 3 }), stderr: 'no such thing\n' })
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec })
        expect(r.code).toBe(1)
        expect(r.err).toBe('the command failed (exit 3): no such thing. Nothing was saved.')
    })

    it('a good chat list passes: "the command printed N chats", and the feed is saved', async () => {
        const { dir, file } = place(json({ port: 1 }))
        const exec = fakeRun({ stdout: chatList([{ id: 'a', title: 'one' }, { id: 'b' }]) })
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec })
        expect(r.code).toBe(0)
        expect(r.out.split('\n')[0]).toBe('the command printed 2 chats')
        expect(readJson(file)).toEqual({ port: 1, feeds: [CHATS] })
        expect(backups(dir)).toHaveLength(1)
    })

    it('one chat is "1 chat"; an empty list is fine ("0 chats")', async () => {
        const { file } = place()
        const one = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec: fakeRun({ stdout: chatList([{ id: 'a' }]) }) })
        expect(one.out.split('\n')[0]).toBe('the command printed 1 chat')
        const none = await feed(file, ['add', 'chats', '--check', '--command', 'other', '--id', 'x'], { exec: fakeRun({ stdout: chatList([]) }) })
        expect(none.out.split('\n')[0]).toBe('the command printed 0 chats')
    })

    it('says when the Monitor would keep fewer chats than the command printed (chats without an identity)', async () => {
        const { file } = place()
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec: fakeRun({ stdout: chatList([{ id: 'a' }, { title: '' }, 'text']) }) })
        expect(r.code).toBe(0)
        expect(r.out.split('\n')[0]).toBe('the command printed 3 chats (the Monitor keeps 1)')
    })

    // what the Monitor makes of a chat list: its own reader and its own Chats block, so these tests judge --check by the Monitor, not by a copy of its rule
    const monitorShows = (doc) => monitorChats.chatsBlock([{ host: 'h', source: monitorChats.sanitizeChats(doc, 'h'), error: null }], { now: Date.now() }).state
    const NO_TIME = 'the chat list has no "generatedAt" as a number of seconds since 1970 (for example 1795137071), so the Monitor would show the list as stale. Nothing was saved.'

    it.each([
        ['no generatedAt', { chats: [{ id: 'a' }] }],
        ['generatedAt as an ISO time', { generatedAt: '2026-11-20T01:11:11Z', chats: [{ id: 'a' }] }],
        ['generatedAt null', { generatedAt: null, chats: [{ id: 'a' }] }],
        ['generatedAt 0', { generatedAt: 0, chats: [{ id: 'a' }] }],
        ['generatedAt as a word', { generatedAt: 'soon', chats: [{ id: 'a' }] }]
    ])('a chat list with %s is refused: the Monitor would show it as stale, and nothing is saved', async (_name, doc) => {
        const { file } = place()
        expect(monitorShows(doc)).toBe('stale')
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec: fakeRun({ stdout: JSON.stringify(doc) }) })
        expect(r.code).toBe(1)
        expect(r.err).toBe(NO_TIME)
        expect(r.out).toBe('')
        expect(fs.existsSync(file)).toBe(false)
    })

    it('a chat list with generatedAt as a number of seconds is accepted, and the Monitor shows it as live', async () => {
        const { file } = place()
        const doc = { generatedAt: Math.floor(Date.now() / 1000), chats: [{ id: 'a' }] }
        expect(monitorShows(doc)).toBe('live')
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { exec: fakeRun({ stdout: JSON.stringify(doc) }) })
        expect(r.code).toBe(0)
        expect(r.out.split('\n')[0]).toBe('the command printed 1 chat')
        expect(readJson(file)).toEqual({ feeds: [CHATS] })
    })

    it('credits: a list of routes passes, also when the command exits 1 because no route is ready', async () => {
        const { file } = place()
        const stdout = JSON.stringify([{ route: 'plan-a', available: true }, { route: 'plan-b', available: false }])
        const ready = await feed(file, ['add', 'credits', '--check', '--command', 'cr --json'], { exec: fakeRun({ stdout }) })
        expect(ready.out.split('\n')[0]).toBe('the command printed 2 credit routes, 1 ready')
        const exit1 = await feed(file, ['add', 'credits', '--check', '--id', 'again', '--command', 'cr2'], { exec: fakeRun({ error: Object.assign(new Error('x'), { code: 1 }), stdout: '[{"route":"plan-b","available":false}]' }) })
        expect(exit1.code).toBe(0)
        expect(exit1.out.split('\n')[0]).toBe('the command printed 1 credit route, 0 ready')
    })

    it('credits: an object, or rows without a route name, are refused', async () => {
        const { file } = place()
        const object = await feed(file, ['add', 'credits', '--check', '--command', 'cr'], { exec: fakeRun({ stdout: '{"a":1}' }) })
        expect(object.code).toBe(1)
        expect(object.err).toContain('not a list of credit routes: it must print [ { "route": ... } ]')
        const nameless = await feed(file, ['add', 'credits', '--check', '--command', 'cr'], { exec: fakeRun({ stdout: '[{"route":"a"},{"x":1}]' }) })
        expect(nameless.code).toBe(1)
        expect(nameless.err).toContain('1 of the rows have no route name')
        expect(fs.existsSync(file)).toBe(false)
    })

    it('without --check the command is stored and never run', async () => {
        const { file } = place()
        const calls = []
        const r = await feed(file, ['add', 'chats', '--command', 'rm -rf nothing'], { exec: async (command) => { calls.push(command); return { error: null, stdout: '', stderr: '' } } })
        expect(r.code).toBe(0)
        expect(calls).toEqual([])
        expect(readJson(file).feeds[0].command).toBe('rm -rf nothing')
    })

    it('--check with --dry-run keeps stdout for the JSON alone', async () => {
        const { file } = place()
        const r = await feed(file, ['add', 'chats', '--check', '--dry-run', '--command', CMD], { exec: fakeRun({ stdout: chatList([]) }) })
        expect(r.code).toBe(0)
        expect(JSON.parse(r.out)).toEqual({ feeds: [CHATS] })
        expect(r.err).toContain('the command printed 0 chats')
        expect(fs.existsSync(file)).toBe(false)
    })

    it('says so when it cannot reach the Monitor\'s own reader instead of passing a command unchecked', async () => {
        const { file } = place()
        const r = await feed(file, ['add', 'chats', '--check', '--command', CMD], { root: tmp(), exec: fakeRun({ stdout: chatList([]) }) })
        expect(r.code).toBe(1)
        expect(r.err).toContain('cannot check here: serverXR/src/monitorChats.js')
        expect(fs.existsSync(file)).toBe(false)
    })

    posixOnly('the real runner starts the command through /bin/sh, like the Monitor does', async () => {
        const { file } = place()
        const r = await feed(file, ['add', 'chats', '--check', '--command', `printf '%s' '${chatList([{ id: 'a' }, { id: 'b' }])}'`])
        expect(r.code).toBe(0)
        expect(r.out.split('\n')[0]).toBe('the command printed 2 chats')
        const failing = await feed(file, ['add', 'chats', '--check', '--id', 'x', '--command', 'echo broken >&2; exit 4'])
        expect(failing.code).toBe(1)
        expect(failing.err).toBe('the command failed (exit 4): broken. Nothing was saved.')
    })

    // a tree with just the files --check reads: the credits reader, and a store that holds `store` (no store file when it is undefined)
    const treeWith = (store) => {
        const root = tmp()
        const src = path.join(root, 'serverXR', 'src')
        fs.mkdirSync(src, { recursive: true })
        fs.copyFileSync(path.join(ROOT, 'serverXR', 'src', 'monitorCredits.js'), path.join(src, 'monitorCredits.js'))
        if (store !== undefined) fs.writeFileSync(path.join(src, 'monitorStore.js'), store)
        return root
    }

    it('the fixed limits are the Monitor\'s: 4 s for chats, 8 s for credits in the older trees', () => {
        expect(CHECK_LIMIT_MS).toEqual({ chats: 4000, credits: 8000 })
        expect(limitFor('chats', treeWith())).toBe(4000)
        expect(limitFor('credits', treeWith())).toBe(8000) // no store in the tree
        expect(limitFor('credits', treeWith('module.exports = { createMonitorStore() {} }'))).toBe(8000) // an older store: nothing exported
        expect(limitFor('credits', undefined)).toBe(8000) // no tree given
    })

    it('credits: the limit is the one the store states (CREDITS_COMMAND_MS), and --check runs the command under it', async () => {
        const root = treeWith('module.exports = { CREDITS_COMMAND_MS: 30000 }')
        expect(limitFor('credits', root)).toBe(30000)
        expect(limitFor('chats', root)).toBe(4000)
        const seen = []
        const exec = async (command, opts) => { seen.push(opts.timeout); return { error: null, stdout: '[]', stderr: '' } }
        await checkFeedCommand({ panel: 'credits', command: 'cr', root, exec })
        expect(seen).toEqual([30000])
    })

    it('credits: a store that states something that is not a limit, or does not load, is ignored', () => {
        for (const stated of ['"soon"', '"5000"', '0', '-5', 'null', 'NaN', 'Infinity']) {
            expect(limitFor('credits', treeWith(`module.exports = { CREDITS_COMMAND_MS: ${stated} }`))).toBe(8000)
        }
        expect(limitFor('credits', treeWith('throw new Error("broken store")'))).toBe(8000)
    })

    it('no other number has crept into the server: its source states the limits --check uses', () => {
        const source = fs.readFileSync(path.join(ROOT, 'serverXR', 'src', 'monitorStore.js'), 'utf8')
        expect(source).toContain(`const PANEL_TIMEOUT_MS = ${CHECK_LIMIT_MS.chats}\n`)
        const limit = limitFor('credits', ROOT)
        if (source.includes('{ timeout: CREDITS_COMMAND_MS }')) {
            expect(source).toMatch(/module\.exports = \{[^}]*\bCREDITS_COMMAND_MS\b/) // used, so it must be exported for limitFor() to see it
        } else {
            expect(source).toContain(`{ timeout: ${limit} }`) // the fixed number of the older trees, the one --check falls back to
        }
    })
})

describe('list', () => {
    it('says "no feeds" for a file that is not there and for one without feeds', async () => {
        const gone = place()
        const none = place('{ "port": 1 }\n')
        expect((await feed(gone.file, ['list'])).out).toBe(`no feeds (${gone.file} does not exist)`)
        expect((await feed(none.file, ['list'])).out).toBe(`no feeds in ${none.file}`)
        expect(fs.existsSync(gone.dir)).toBe(false)
    })

    it('one line per feed: panel, id, command cut at 100 characters', async () => {
        const long = `run ${'x'.repeat(150)}`
        const { file } = place(json({ feeds: [CHATS, { id: 'c', panel: 'credits', kind: 'command', command: long }] }))
        const r = await feed(file, ['list'])
        const lines = r.out.split('\n')
        expect(r.code).toBe(0)
        expect(lines).toHaveLength(2)
        expect(lines[0]).toMatch(/^chats +chats +di-chats --json$/)
        expect(lines[1]).toMatch(/^credits +c +run x+…$/)
        expect(lines[1].split(/ +/).slice(2).join(' ')).toHaveLength(100)
    })

    it('shows feeds of other kinds, junk entries, and a second command feed the Monitor would never run', async () => {
        const { file } = place(json({ feeds: [{ panel: 'tasks', kind: 'file', path: '/t.json' }, { panel: 'x', kind: 'url', url: 'http://localhost/x' }, 5, CHATS, { ...CHATS, id: 'second', command: 'two' }] }))
        const r = await feed(file, ['list'])
        expect(r.out).toContain('tasks    tasks        file /t.json')
        expect(r.out).toContain('url http://localhost/x')
        expect(r.out).toContain('(not a feed) 5')
        expect(r.out).toMatch(/chats +second +two {2}\(ignored: the Monitor runs only the first chats feed\)/)
        expect(r.out).not.toMatch(/chats +chats +di-chats --json.*ignored/)
    })

    posixOnly('warns on stderr when others can write to the file, because the Monitor then ignores it', async () => {
        const { file } = place(json({ feeds: [CHATS] }))
        fs.chmodSync(file, 0o664)
        const r = await feed(file, ['list'])
        expect(r.code).toBe(0)
        expect(r.err).toContain(`warning: the Monitor ignores ${file} while others can write to it (mode 664). Fix: chmod 600 '${file}'`)
        fs.chmodSync(file, 0o600)
        expect((await feed(file, ['list'])).err).toBe('')
    })
})

describe('through di monitor', () => {
    it('`feed` is a subcommand of monitor and the command entry runs it', async () => {
        expect(parseMonitorArgs(parseArgs(['monitor', 'feed', 'list']))).toEqual({ sub: 'feed' })
        expect(parseMonitorArgs(parseArgs(['monitor', 'frob'])).error).toMatch(/di monitor feed add chats --command/)
        const { file } = place(json({ feeds: [CHATS] }))
        const out = []
        const err = []
        const deps = { env: { DI_MONITOR_CONFIG: file }, home, say: (l) => out.push(l), fail: (l) => err.push(l) }
        expect(await runMonitor(parseArgs(['monitor', 'feed', 'list']), deps)).toBe(0)
        expect(out.join('\n')).toMatch(/^chats +chats +di-chats --json$/)
        expect(await runMonitor(parseArgs(['monitor', 'feed', 'add', 'tasks', '--command', 'x']), deps)).toBe(2)
        expect(err.join('\n')).toContain('"tasks" is not a feed this command sets')
        expect(await runMonitor(parseArgs(['monitor', 'feed', 'remove', 'chats']), deps)).toBe(0)
        expect(readJson(file)).toEqual({ feeds: [] })
    })

    it('runs from a source tree as a process: node scripts/di/cli.mjs monitor feed …, with exit codes 0 and 2', () => {
        const { file } = place(json({ feeds: [CHATS] }))
        const env = { ...process.env, HOME: home, USERPROFILE: home, DI_MONITOR_CONFIG: file }
        const list = spawnSync(process.execPath, [CLI, 'monitor', 'feed', 'list'], { env, encoding: 'utf8', timeout: 60000 })
        expect(list.status).toBe(0)
        expect(list.stdout).toMatch(/^chats +chats +di-chats --json$/m)
        const bad = spawnSync(process.execPath, [CLI, 'monitor', 'feed', 'add', 'tasks', '--command', 'x'], { env, encoding: 'utf8', timeout: 60000 })
        expect(bad.status).toBe(2)
        expect(bad.stderr).toContain('"tasks" is not a feed this command sets')
        expect(readJson(file)).toEqual({ feeds: [CHATS] })
    }, 120000)
})

describe('where a broken file breaks', () => {
    it('names the first character that does not fit, the way JSON.parse reads it', () => {
        const at = (text) => jsonErrorOffset(text)
        expect(at('{"a":1,}')).toBe(7)
        expect(at('[1 2]')).toBe(3)
        expect(at('{"a":}')).toBe(5)
        expect(at('"abc')).toBe(4)
        expect(at('{"a":1} x')).toBe(8)
        expect(at('tru')).toBe(0)
        expect(at('01')).toBe(1)
        expect(at('"\\x"')).toBe(2)
        expect(at('"\\u12"')).toBe(2)
        expect(at('')).toBe(0)
        for (const fine of ['{"a":[1,2,{"b":null}]}', '  [ ]  ', '"\\u00e9\\n"', '-0.5e+3', '{}']) expect(at(fine)).toBe(-1)
    })

    it('agrees with JSON.parse on every cut, every missing character and every added character of a real file', () => {
        const doc = JSON.stringify({ feeds: [{ ...CHATS, command: 'x "y" \\ z' }], n: [1, -2.5e3, 0, true, false, null, 'aé\n'], o: {} }, null, 2)
        const disagree = []
        const compare = (text, label) => {
            let broken = false
            try { JSON.parse(text) } catch { broken = true }
            if (broken !== jsonErrorOffset(text) >= 0) disagree.push(label)
        }
        compare(doc, 'the whole file')
        for (let i = 0; i < doc.length; i += 1) { compare(doc.slice(0, i), `cut at ${i}`); compare(doc.slice(0, i) + doc.slice(i + 1), `without ${i}`) }
        for (const ch of ['x', ',', '}', ']', '"', '\\', ':', '{', ' ']) for (let i = 0; i < doc.length; i += 7) compare(`${doc.slice(0, i)}${ch}${doc.slice(i)}`, `${ch} at ${i}`)
        expect(disagree).toEqual([])
    })

    it('reads a file that is fine and keeps the bytes it read', () => {
        const { file } = place(json({ feeds: [CHATS] }))
        const read = readFeedConfig(file)
        expect(read).toMatchObject({ exists: true, config: { feeds: [CHATS] } })
        expect(read.raw.equals(fs.readFileSync(file))).toBe(true)
        expect(readFeedConfig(`${file}.none`)).toEqual({ exists: false, raw: null, config: {} })
    })
})
