// @vitest-environment node
// The one di browser setting: the resolver (env, file, default, bad value, short names), its shell twin,
// and the argv of each launcher in both modes. No browser starts: builders only, and stage-open.sh --dry-run.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
    CHROMIUM, UNGOOGLED, browserApp, browserConfPath, devBrowserCommand, readBrowserConf, rigLinksBrowserCommand,
} from './browserApp.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const scripts = path.resolve(here, '..')
const tmps = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'di-browser-')); tmps.push(d); return d }
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }) })

/** A home with an optional browser.conf; returns { home, env } with a clean environment. */
const homeWith = (conf, extraEnv = {}) => {
    const home = tmp()
    if (conf !== undefined) {
        fs.mkdirSync(path.join(home, '.config/di'), { recursive: true })
        fs.writeFileSync(path.join(home, '.config/di/browser.conf'), conf)
    }
    return { home, env: { ...extraEnv } }
}

describe('browserApp (mjs)', () => {
    it('no env and no file: Chromium', () => {
        const { home, env } = homeWith()
        expect(browserApp({ env, home })).toBe(CHROMIUM)
    })
    it('the file sets the app; comments, blanks and spaces are ignored; the last app= wins', () => {
        const { home, env } = homeWith('# the browser\n\n  other = 1\n app = chromium \napp=io.github.ungoogled_software.ungoogled_chromium\n')
        expect(browserApp({ env, home })).toBe(UNGOOGLED)
    })
    it('env DI_BROWSER_APP beats the file', () => {
        const { home } = homeWith('app=ungoogled\n')
        expect(browserApp({ env: { DI_BROWSER_APP: 'chromium' }, home })).toBe(CHROMIUM)
        expect(browserApp({ env: { DI_BROWSER_APP: UNGOOGLED }, home: homeWith().home })).toBe(UNGOOGLED)
    })
    it('an empty env or an empty app= falls through to the next source', () => {
        const { home } = homeWith('app=ungoogled\n')
        expect(browserApp({ env: { DI_BROWSER_APP: '  ' }, home })).toBe(UNGOOGLED)
        expect(browserApp({ env: {}, home: homeWith('app=\n').home })).toBe(CHROMIUM)
    })
    it('short names resolve to the app ids', () => {
        const { home } = homeWith()
        expect(browserApp({ env: { DI_BROWSER_APP: 'ungoogled' }, home })).toBe(UNGOOGLED)
        expect(browserApp({ env: { DI_BROWSER_APP: 'chromium' }, home })).toBe(CHROMIUM)
    })
    it('a set but unknown value is refused in one line, naming where it came from', () => {
        const { home } = homeWith()
        expect(() => browserApp({ env: { DI_BROWSER_APP: 'firefox' }, home })).toThrow(/^browser: unknown app "firefox" in DI_BROWSER_APP \(use: [^\n]+\)$/)
        const f = homeWith('app=org.mozilla.firefox\n')
        expect(() => browserApp({ env: {}, home: f.home })).toThrow(new RegExp(`in ${browserConfPath({}, f.home).replace(/\./g, '\\.')}`))
        expect(() => browserApp({ env: { DI_BROWSER_APP: 'x' }, home })).toThrow(/^[^\n]+$/)
    })
    it('an unreadable file is the default; XDG_CONFIG_HOME moves the file', () => {
        const home = tmp()
        expect(browserApp({ env: {}, home, readFile: () => { throw new Error('EACCES') } })).toBe(CHROMIUM)
        const xdg = tmp(); fs.mkdirSync(path.join(xdg, 'di')); fs.writeFileSync(path.join(xdg, 'di/browser.conf'), 'app=ungoogled\n')
        expect(readBrowserConf({ XDG_CONFIG_HOME: xdg }, home)).toBe('ungoogled')
    })
})

describe('browser-app.sh matches the mjs', () => {
    const sh = (env, conf) => {
        const { home } = homeWith(conf)
        const r = spawnSync('bash', ['-c', `source "${scripts}/lib/browser-app.sh"; di_browser_app`], {
            env: { PATH: process.env.PATH, HOME: home, ...env }, encoding: 'utf8',
        })
        return { out: r.stdout.trim(), err: r.stderr.trim(), status: r.status }
    }
    it.each([
        [{}, undefined, CHROMIUM],
        [{}, '# c\napp = ungoogled\n', UNGOOGLED],
        [{ DI_BROWSER_APP: 'chromium' }, 'app=ungoogled\n', CHROMIUM],
        [{ DI_BROWSER_APP: 'ungoogled' }, undefined, UNGOOGLED],
        [{ DI_BROWSER_APP: UNGOOGLED }, undefined, UNGOOGLED],
        [{ DI_BROWSER_APP: '' }, 'app=ungoogled\n', UNGOOGLED],
        [{}, 'app=\n', CHROMIUM],
    ])('env %j file %j -> %s', (env, conf, want) => {
        const r = sh(env, conf)
        expect(r).toMatchObject({ out: want, status: 0 })
    })
    it('a bad value: one line on stderr, status 2, nothing on stdout', () => {
        const r = sh({ DI_BROWSER_APP: 'firefox' })
        expect(r.status).toBe(2)
        expect(r.out).toBe('')
        expect(r.err).toMatch(/^browser: unknown app "firefox" in DI_BROWSER_APP \(use: [^\n]+\)$/)
        expect(sh({}, 'app=nope\n').err).toMatch(/browser\.conf/)
    })
})

describe('launcher argv, Chromium mode = today (byte-identical snapshots from origin/dev)', () => {
    const { home } = homeWith()
    it('dev-stack', () => {
        const plan = devBrowserCommand('http://localhost:5372/', { env: {}, home })
        expect(plan.command).toBe('flatpak')
        expect(plan.args).toEqual(['run', 'org.chromium.Chromium', `--user-data-dir=${home}/.var/app/org.chromium.Chromium/data/dev-profile`, 'http://localhost:5372/'])
        expect(plan.profile).toBe(`${home}/.var/app/org.chromium.Chromium/data/dev-profile`)
    })
    it('rig-links', () => {
        const plan = rigLinksBrowserCommand(9335, 4242, { env: {}, home })
        expect(plan.command).toBe('flatpak')
        expect(plan.args).toEqual(['run', 'org.chromium.Chromium', `--user-data-dir=${home}/.var/app/org.chromium.Chromium/cache/rig-links-4242`,
            '--remote-debugging-port=9335', '--no-first-run', '--no-default-browser-check', 'about:blank'])
    })
    it('stage-open.sh --dry-run prints exactly the commands it printed before', () => {
        const r = stageDry({})
        expect(r.status).toBe(0)
        expect(r.out.split('\n').slice(0, 4).join('\n')).toBe([
            '# dry run: nothing is executed',
            '+ mkdir -p /home/x/.local/state/di/out-profile',
            '+ flatpak run org.chromium.Chromium --user-data-dir=/home/x/.local/state/di/out-profile --remote-debugging-port=9224 --no-first-run --hide-crash-restore-bubble --app=http://diiii.localhost/platina/map/platina-screen/out &',
            '+ flatpak run org.chromium.Chromium --user-data-dir=/home/x/.local/state/di/out-profile --remote-debugging-port=9224 --no-first-run --hide-crash-restore-bubble --new-window --app=http://diiii.localhost/platina/perform/platina-screen &',
        ].join('\n'))
    })
})

describe('launcher argv, Ungoogled mode: its own app id and its own profile', () => {
    const { home } = homeWith()
    const env = { DI_BROWSER_APP: 'ungoogled' }
    it('dev-stack', () => {
        const plan = devBrowserCommand('http://localhost:5372/', { env, home })
        expect(plan.args).toEqual(['run', UNGOOGLED, `--user-data-dir=${home}/.var/app/${UNGOOGLED}/data/dev-profile`, 'http://localhost:5372/'])
    })
    it('rig-links', () => {
        const plan = rigLinksBrowserCommand(9335, 4242, { env, home })
        expect(plan.args.slice(0, 3)).toEqual(['run', UNGOOGLED, `--user-data-dir=${home}/.var/app/${UNGOOGLED}/cache/rig-links-4242`])
        expect(plan.args.slice(3)).toEqual(['--remote-debugging-port=9335', '--no-first-run', '--no-default-browser-check', 'about:blank'])
    })
    it('stage-open.sh', () => {
        const r = stageDry(env)
        const lines = r.out.split('\n')
        expect(lines[1]).toBe('+ mkdir -p /home/x/.local/state/di/out-profile-ungoogled_chromium')
        expect(lines[2]).toContain(`flatpak run ${UNGOOGLED} --user-data-dir=/home/x/.local/state/di/out-profile-ungoogled_chromium --remote-debugging-port=9224 --no-first-run --hide-crash-restore-bubble --app=`)
        expect(lines[3]).toContain(`flatpak run ${UNGOOGLED} --user-data-dir=/home/x/.local/state/di/out-profile-ungoogled_chromium `)
    })
    it('stage-open.sh refuses an unknown value with one line and status 2', () => {
        const r = stageDry({ DI_BROWSER_APP: 'firefox' })
        expect(r.status).toBe(2)
        expect(r.err).toMatch(/^browser: unknown app "firefox"[^\n]*$/)
    })
})

describe('no launcher still names the Chromium app directly', () => {
    it.each(['dev-stack.mjs', 'rigbuild/rig-links.mjs'])('%s', (f) => {
        const code = fs.readFileSync(path.join(scripts, f), 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n')
        expect(code).not.toMatch(/org\.chromium\.Chromium/)
    })
})

function stageDry(env) {
    const r = spawnSync('bash', [path.join(scripts, 'show/stage-open.sh'), '--dry-run'], {
        env: { PATH: process.env.PATH, HOME: '/home/x', ...env }, encoding: 'utf8',
    })
    return { out: r.stdout.trim(), err: r.stderr.trim(), status: r.status }
}
