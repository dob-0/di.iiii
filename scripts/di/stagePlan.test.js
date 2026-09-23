// @vitest-environment node
//
// Everything `di stage` decides, tested where it is decided.
//
// CI runs on Linux. The Windows scheduled task and the macOS LaunchAgent can
// therefore never be INSTALLED here — so what is held is the exact file each
// one writes and the exact commands each one runs, per platform. That is the
// whole reason stagePlan.mjs is pure, and it is the honest limit of this file:
// these are snapshots of the plan, not proof that Task Scheduler accepted it.
// The one thing a Linux machine can prove end to end — that join and leave
// cancel out — is in stageAutostart.test.js.
import { describe, expect, it } from 'vitest'

import {
    DEBUG_PORT, FALLBACK_AUTOSTART, PREFERRED_AUTOSTART, STAGE,
    autostartSpec, browserArgs, browserCandidates, chooseTarget, envTextRestore, envTextWith,
    SESSION_FILES, fallbackKind, holdPage, leavePlan, manifestFor, outUrl, pidFromSingletonLock, preferencesPatch,
    readOutTitle, reconcile, statusRows, versionVerdict, wakeCommand
} from './stagePlan.mjs'

const base = { home: '/home/a/.di', node: '/home/a/.di/runtime/node/bin/node', cli: '/home/a/.di/current/cli/cli.mjs' }

describe('the autostart entry, per platform', () => {
    it('on Windows is a scheduled task with a logon trigger and no elevation', () => {
        const spec = autostartSpec({ ...base, platform: 'win32', user: 'DOB\\dob', home: 'C:\\Users\\dob\\.di' })
        expect(spec.kind).toBe('windows-task')
        // The default joiner is '/', so this is the shape, not the separator —
        // stage.mjs hands it path.join and the file lands beside the manifest.
        expect(spec.path).toBe('C:\\Users\\dob\\.di/stage/autostart/di-stage.xml')
        expect(spec.content).toContain('<LogonTrigger>')
        // LeastPrivilege or the register itself needs an administrator, which
        // is exactly the thing this command promises not to need.
        expect(spec.content).toContain('<RunLevel>LeastPrivilege</RunLevel>')
        expect(spec.content).toContain('<RestartOnFailure>')
        // PT0S: a supervisor is not a job. The default stops it after 72 hours.
        expect(spec.content).toContain('<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>')
        expect(spec.content).toContain('DOB\\dob')
        expect(spec.content).toContain('stage run')
        expect(spec.encoding).toBe('utf16le')
        expect(spec.install).toEqual([{ command: 'schtasks', args: ['/Create', '/TN', 'di stage', '/XML', spec.path, '/F'] }])
        expect(spec.remove).toEqual([{ command: 'schtasks', args: ['/Delete', '/TN', 'di stage', '/F'] }])
        expect(spec.restartsOnFailure).toBe(true)
    })

    it('escapes a user name that would otherwise break the XML', () => {
        const spec = autostartSpec({ ...base, platform: 'win32', user: 'a&b<c>' })
        expect(spec.content).toContain('<UserId>a&amp;b&lt;c&gt;</UserId>')
    })

    it('falls back on Windows to a Startup-folder .cmd that cannot restart anything', () => {
        const spec = autostartSpec({
            ...base, platform: 'win32', kind: 'windows-startup',
            startupDir: 'C:\\Users\\dob\\Start Menu\\Startup'
        })
        expect(spec.kind).toBe('windows-startup')
        expect(spec.path).toContain('di-stage.cmd')
        expect(spec.content).toContain('stage run')
        expect(spec.content).toContain('set "DI_HOME=/home/a/.di"')
        expect(spec.install).toEqual([])
        expect(spec.remove).toEqual([])
        // The fact `status` has to keep repeating.
        expect(spec.restartsOnFailure).toBe(false)
    })

    it('on macOS is a KeepAlive LaunchAgent, bootstrapped into the GUI session', () => {
        const spec = autostartSpec({ ...base, platform: 'darwin', userHome: '/Users/dob', uid: 502 })
        expect(spec.kind).toBe('launchagent')
        expect(spec.path).toContain(`${STAGE.label}.plist`)
        expect(spec.path).toContain('Library')
        expect(spec.content).toContain('<key>KeepAlive</key>')
        expect(spec.content).toContain('<true/>')
        expect(spec.content).toContain('<string>stage</string>')
        expect(spec.content).toContain('<string>run</string>')
        expect(spec.install).toEqual([{ command: 'launchctl', args: ['bootstrap', 'gui/502', spec.path] }])
        expect(spec.remove).toEqual([{ command: 'launchctl', args: ['bootout', `gui/502/${STAGE.label}`] }])
        expect(spec.restartsOnFailure).toBe(true)
    })

    it('on Linux is a systemd user unit that restarts always', () => {
        const spec = autostartSpec({ ...base, platform: 'linux', configHome: '/home/a/.config' })
        expect(spec.kind).toBe('systemd-user')
        expect(spec.path).toContain('systemd/user/di-stage.service')
        expect(spec.content).toContain('Restart=always')
        expect(spec.content).toContain('Environment=DI_HOME=/home/a/.di')
        expect(spec.content).toContain('ExecStart=/home/a/.di/runtime/node/bin/node /home/a/.di/current/cli/cli.mjs stage run')
        expect(spec.content).toContain('WantedBy=default.target')
        expect(spec.install.map((step) => step.args.join(' '))).toEqual([
            '--user daemon-reload', '--user enable --now di-stage.service'
        ])
        expect(spec.remove.map((step) => step.args.join(' '))).toEqual([
            '--user disable --now di-stage.service', '--user daemon-reload'
        ])
        expect(spec.restartsOnFailure).toBe(true)
    })

    it('falls back on Linux to an XDG autostart entry that cannot restart anything', () => {
        const spec = autostartSpec({ ...base, platform: 'linux', kind: 'xdg-autostart', configHome: '/home/a/.config' })
        expect(spec.path).toContain('autostart/di-stage.desktop')
        expect(spec.content).toContain('Exec=env DI_HOME=/home/a/.di')
        expect(spec.restartsOnFailure).toBe(false)
    })

    it('names its preferred entry and its fallback for each platform, and nothing for an unknown one', () => {
        expect(PREFERRED_AUTOSTART).toEqual({ win32: 'windows-task', darwin: 'launchagent', linux: 'systemd-user' })
        expect(FALLBACK_AUTOSTART.darwin).toBe(null)
        expect(fallbackKind('linux')).toBe('xdg-autostart')
        expect(fallbackKind('win32')).toBe('windows-startup')
        expect(fallbackKind('aix')).toBe(null)
        expect(autostartSpec({ ...base, platform: 'aix' })).toBe(null)
    })

    it('always calls the CLI through `current`, so an update does not orphan the entry', () => {
        for (const platform of ['win32', 'darwin', 'linux']) {
            const spec = autostartSpec({
                ...base, platform, configHome: '/c', userHome: '/u', startupDir: '/s'
            })
            expect(spec.content, platform).toContain('current')
        }
    })
})

describe('the kiosk', () => {
    const args = browserArgs({ profileDir: '/p', url: 'file:///hold.html' })

    it('opens with its own profile, no first-run and no crash bubble', () => {
        expect(args).toContain('--user-data-dir=/p')
        expect(args).toContain('--kiosk')
        expect(args).toContain('--no-first-run')
        expect(args).toContain('--disable-session-crashed-bubble')
        expect(args).toContain('--noerrdialogs')
        // The url is last, which is how Chromium reads it as the page to open.
        expect(args[args.length - 1]).toBe('file:///hold.html')
    })

    it('takes the camera and plays the video without anyone to click', () => {
        expect(args).toContain('--use-fake-ui-for-media-stream')
        expect(args).toContain('--autoplay-policy=no-user-gesture-required')
    })

    it('opens a debugging port, because that is the only honest way to ask what it shows', () => {
        expect(args).toContain(`--remote-debugging-port=${DEBUG_PORT}`)
        expect(args).toContain(`--remote-allow-origins=http://127.0.0.1:${DEBUG_PORT}`)
        expect(DEBUG_PORT).not.toBe(9222)
    })

    it('places and sizes the window only when it is told where, and not before', () => {
        expect(args.some((flag) => flag.startsWith('--window-position'))).toBe(false)
        const placed = browserArgs({ profileDir: '/p', url: 'x', window: { x: 1920, y: 0, width: 1920, height: 1080 } })
        expect(placed).toContain('--window-position=1920,0')
        expect(placed).toContain('--window-size=1920,1080')
    })

    it('reads the running kiosk\'s pid out of the profile Chromium locked', () => {
        // Found on the first real run: a second launch into the same profile
        // hands the URL to the first browser and exits, so a child handle says
        // "dead" about a browser that is very much alive.
        expect(pidFromSingletonLock('aylmo-216858')).toBe(216858)
        expect(pidFromSingletonLock('some-host-name-7')).toBe(7)
        for (const value of ['', null, 'aylmo', 'aylmo-0', 'aylmo-x']) {
            expect(pidFromSingletonLock(value), String(value)).toBe(null)
        }
    })

    it('knows where a Chromium usually lives, and nothing about installing one', () => {
        expect(browserCandidates('linux')[0]).toBe('chromium')
        expect(browserCandidates('darwin')[0]).toContain('Google Chrome.app')
        expect(browserCandidates('win32')[0]).toContain('chrome.exe')
        expect(browserCandidates('aix')).toEqual([])
    })
})

describe('the Preferences patch', () => {
    it('marks the last exit normal, so a power cut does not come back as "restore pages?"', () => {
        const patched = JSON.parse(preferencesPatch('{"profile":{"exit_type":"Crashed","name":"kiosk"}}'))
        expect(patched.profile.exit_type).toBe('Normal')
        expect(patched.profile.exited_cleanly).toBe(true)
        // and keeps everything else in the profile
        expect(patched.profile.name).toBe('kiosk')
    })

    it('treats an absent, empty or broken Preferences as a first launch rather than an error', () => {
        for (const raw of ['', null, undefined, 'not json', '[]', '7']) {
            expect(JSON.parse(preferencesPatch(raw)).profile.exit_type, String(raw)).toBe('Normal')
        }
    })

    it('starts on a blank page rather than restoring last week\'s tabs', () => {
        const patched = JSON.parse(preferencesPatch('{"session":{"restore_on_startup":1,"startup_urls":["http://old"]}}'))
        expect(patched.session.restore_on_startup).toBe(5)
        expect(patched.session.startup_urls).toEqual([])
    })

    it('names the session files a launch has to take off the profile first', () => {
        // The patch stops it ASKING to restore. Only removing these stops it
        // restoring — four tabs deep on the first real run, two of them a page
        // nobody had opened this year.
        expect(SESSION_FILES).toContain('Default/Sessions')
        expect(SESSION_FILES).toContain('Default/Current Session')
        expect(SESSION_FILES).toContain('Default/Last Session')
        expect(SESSION_FILES.every((entry) => entry.startsWith('Default/'))).toBe(true)
    })

    it('leaves the rest of the file alone', () => {
        const patched = JSON.parse(preferencesPatch('{"browser":{"window_placement":{"left":10}},"profile":{}}'))
        expect(patched.browser.window_placement.left).toBe(10)
    })
})

describe('the hold page', () => {
    it('is black, and says in a dim corner what it is waiting for', () => {
        const html = holdPage({ spaceId: 'stage', waitingFor: 'local.thedi.studio' })
        expect(html).toContain('background:#000')
        expect(html).toContain('color:#1f1f1f')   // ≤12% grey — the dark-room default
        expect(html).toContain('holding for local.thedi.studio')
        expect(html).toContain('stage')
        expect(html).not.toMatch(/#fff|white/i)
    })

    it('walks itself to the out page once something answers, across origins', () => {
        const html = holdPage({
            spaceId: 's',
            targetUrl: 'https://local.thedi.studio/s/map/wall/out',
            healthUrl: 'https://local.thedi.studio/serverXR/api/health'
        })
        // no-cors, because a file:// page cannot read a cross-origin answer —
        // but it can tell the difference between an answer and nothing.
        expect(html).toContain("mode: 'no-cors'")
        expect(html).toContain('location.replace(target)')
        expect(html).toContain('https://local.thedi.studio/s/map/wall/out')
    })

    it('does nothing at all when there is no target yet', () => {
        const html = holdPage({ spaceId: 's' })
        expect(html).toContain('var target = null')
    })

    it('escapes a space id rather than writing it into the page', () => {
        expect(holdPage({ spaceId: '<script>x</script>' })).not.toContain('<script>x')
    })
})

describe('one tick of the supervisor', () => {
    const hold = 'file:///hold.html'
    const target = 'https://h/s/map/p/out'

    it('starts everything that is missing, and opens the browser on the hold page — never the server', () => {
        const { actions } = reconcile({ holdUrl: hold, targetUrl: target })
        expect(actions).toEqual([
            { do: 'start-server' },
            { do: 'start-wake' },
            { do: 'start-browser', url: hold }
        ])
    })

    it('leaves a settled screen alone', () => {
        const { actions } = reconcile({
            serverAlive: true, browserAlive: true, wakeAlive: true, holdUrl: hold, targetUrl: target, pageUrl: target
        })
        expect(actions).toEqual([])
    })

    it('leaves the hold page alone while it walks itself forward', () => {
        const { actions } = reconcile({
            serverAlive: true, browserAlive: true, wakeAlive: true, holdUrl: hold, targetUrl: target, pageUrl: hold
        })
        expect(actions).toEqual([])
    })

    it('reloads a hold page that was opened before the target was known', () => {
        // The first real run: the kiosk came up while the server was still
        // starting, so the page it loaded had no target in it. Rewriting the
        // file changed nothing, and the wall stayed black for good.
        const { actions } = reconcile({
            serverAlive: true, browserAlive: true, wakeAlive: true,
            holdUrl: hold, targetUrl: target, pageUrl: hold, holdCarriesTarget: false
        })
        expect(actions).toEqual([
            { do: 'restart-browser', url: hold, why: 'the hold page did not know where to go yet' }
        ])
    })

    it('puts a kiosk showing something else back on the hold page', () => {
        const { actions } = reconcile({
            serverAlive: true, browserAlive: true, wakeAlive: true, holdUrl: hold, targetUrl: target,
            pageUrl: 'https://h/s/map/other/out'
        })
        expect(actions).toEqual([{ do: 'restart-browser', url: hold, why: 'showing something else' }])
    })

    it('pulls the kiosk off Chrome\'s error page BEFORE it tries to fix the server', () => {
        const { actions } = reconcile({
            serverAlive: false, browserAlive: true, wakeAlive: true, holdUrl: hold, targetUrl: target, pageUrl: target
        })
        // Order is the whole point: starting a server can take thirty seconds,
        // and every one of them would be a grey error page on the wall.
        expect(actions).toEqual([
            { do: 'restart-browser', url: hold, why: 'the server is down' },
            { do: 'start-server' }
        ])
    })

    it('does not try to move a browser that is not there', () => {
        const { actions } = reconcile({ serverAlive: true, wakeAlive: true, holdUrl: hold, targetUrl: target, pageUrl: target })
        expect(actions).toEqual([{ do: 'start-browser', url: hold }])
    })
})

describe('which project this one screen shows', () => {
    it('takes --project as given, without asking the space anything', () => {
        expect(chooseTarget({ project: 'wall', projects: [] }).projectId).toBe('wall')
    })

    it('takes the only mapping in the space', () => {
        const chosen = chooseTarget({ projects: [{ id: 'notes', mapSurfaces: 0 }, { id: 'wall', mapSurfaces: 3 }] })
        expect(chosen.projectId).toBe('wall')
    })

    it('refuses to guess between two mappings, and names them', () => {
        const chosen = chooseTarget({ projects: [{ id: 'a', mapSurfaces: 1 }, { id: 'b', mapSurfaces: 2 }] })
        expect(chosen.projectId).toBe(null)
        expect(chosen.error).toBe('many')
        expect(chosen.ids).toEqual(['a', 'b'])
    })

    it('says there is none rather than picking an ordinary project', () => {
        expect(chooseTarget({ projects: [{ id: 'a', mapSurfaces: 0 }] })).toMatchObject({ projectId: null, error: 'none' })
    })

    it('builds the out url the way src/map/mapRouting.js does', () => {
        expect(outUrl({ base: 'https://local.thedi.studio', spaceId: 'dilijan', projectId: 'wall' }))
            .toBe('https://local.thedi.studio/dilijan/map/wall/out')
        expect(outUrl({ base: 'https://h/', spaceId: 'a b', projectId: 'c/d' })).toBe('https://h/a%20b/map/c%2Fd/out')
    })
})

describe('the out page\'s own title', () => {
    it('reads the reason the page already carries', () => {
        expect(readOutTitle('out · wall · ok')).toEqual({ showing: true, reason: 'ok', projectId: 'wall' })
        expect(readOutTitle('out · wall · empty')).toEqual({ showing: false, reason: 'empty', projectId: 'wall' })
        expect(readOutTitle('out · wall · all-off')).toEqual({ showing: false, reason: 'all-off', projectId: 'wall' })
    })

    it('says nothing at all about a page that is not an out page', () => {
        for (const title of ['di.iiii', '', null, 'out · wall']) {
            expect(readOutTitle(title), String(title)).toEqual({ showing: false, reason: null, projectId: null })
        }
    })
})

describe('two installs, one mapping document', () => {
    it('only warns when it knows the versions differ', () => {
        expect(versionVerdict({ here: '0.4.14', there: '0.4.14' })).toMatchObject({ same: true, verdict: 'same' })
        expect(versionVerdict({ here: '0.4.15', there: '0.4.14' })).toMatchObject({ same: false, verdict: 'different' })
        expect(versionVerdict({ here: null, there: '0.4.14' })).toMatchObject({ known: false, verdict: 'unknown' })
        expect(versionVerdict({})).toMatchObject({ known: false })
    })
})

describe('di.env, one line at a time', () => {
    it('appends a key and hands back a null previous', () => {
        const { text, previous } = envTextWith('PORT=4000\n', 'DI_PART', 'stage')
        expect(text).toBe('PORT=4000\nDI_PART=stage\n')
        expect(previous).toBe(null)
    })

    it('adds the newline a file was missing rather than joining two keys', () => {
        expect(envTextWith('PORT=4000', 'DI_PART', 'stage').text).toBe('PORT=4000\nDI_PART=stage\n')
    })

    it('replaces a key that is already there, and remembers the exact line', () => {
        const { text, previous } = envTextWith('# a note\nDI_PART = studio\nPORT=4000\n', 'DI_PART', 'stage')
        expect(text).toBe('# a note\nDI_PART=stage\nPORT=4000\n')
        expect(previous).toBe('DI_PART = studio')
    })

    it('puts the file back byte for byte, both ways round', () => {
        for (const before of ['', 'PORT=4000\n', '# comment\n\nPORT=4000\nA=b\n', 'DI_PART=studio\nPORT=4000\n']) {
            const { text, previous } = envTextWith(before, 'DI_PART', 'stage')
            expect(envTextRestore(text, 'DI_PART', previous), JSON.stringify(before)).toBe(before)
        }
    })

    it('does nothing to a file the key has already been taken out of', () => {
        expect(envTextRestore('PORT=4000\n', 'DI_PART', null)).toBe('PORT=4000\n')
    })
})

describe('holding the machine awake', () => {
    it('is process-lifetime on every OS, and never a setting', () => {
        const linux = wakeCommand('linux')
        expect(linux.command).toBe('systemd-inhibit')
        expect(linux.args).toContain('--mode=block')

        const mac = wakeCommand('darwin', { pid: 1234 })
        expect(mac.command).toBe('caffeinate')
        // -w 1234: caffeinate dies with the supervisor, always.
        expect(mac.args).toEqual(['-d', '-i', '-w', '1234'])

        const win = wakeCommand('win32')
        expect(win.command).toBe('powershell')
        expect(win.args.join(' ')).toContain('SetThreadExecutionState')
        expect(win.args.join(' ')).toContain('0x80000000')

        for (const command of [linux, mac, win]) {
            expect(JSON.stringify(command)).not.toContain('powercfg')
        }
        expect(wakeCommand('aix')).toBe(null)
    })
})

describe('the manifest, and its exact undo', () => {
    const manifest = manifestFor({
        spaceId: 'stage',
        from: 'https://local.thedi.studio',
        at: '100.87.4.12',
        follow: { spaceId: 'stage', previous: null },
        installed: [
            { kind: 'dir', path: '/h/stage' },
            { kind: 'dir', path: '/h/stage/browser' },
            { kind: 'file', path: '/h/run/stage.pid' },
            { kind: 'file', path: '/c/systemd/user/di-stage.service' }
        ],
        envSet: [{ key: 'DI_PART', previous: null, fileExisted: true }],
        autostart: { kind: 'systemd-user', remove: [{ command: 'systemctl', args: ['--user', 'disable', '--now', STAGE.unit] }] },
        now: '2026-09-20T00:00:00.000Z'
    })

    it('says what it is and what it made', () => {
        expect(manifest.format).toBe('di.stage')
        expect(manifest.space).toBe('stage')
        expect(manifest.at).toBe('100.87.4.12')
    })

    it('undoes things in the one order that works', () => {
        const steps = leavePlan(manifest)
        expect(steps.map((step) => step.do)).toEqual([
            // the supervisor first, or it puts back what the next steps remove
            'stop-supervisor',
            // then the OS entry, before the file it points at
            'run',
            'restore-follow',
            'restore-env',
            // files in the reverse of the order they were made
            'rm-file', 'rm-file',
            // and directories from the inside out
            'rm-dir', 'rm-dir'
        ])
        const dirs = steps.filter((step) => step.do === 'rm-dir').map((step) => step.path)
        expect(dirs).toEqual(['/h/stage/browser', '/h/stage'])
        const files = steps.filter((step) => step.do === 'rm-file').map((step) => step.path)
        expect(files).toEqual(['/c/systemd/user/di-stage.service', '/h/run/stage.pid'])
    })

    it('keeps the follow when asked to', () => {
        expect(leavePlan(manifest, { keepSpace: true }).some((step) => step.do === 'restore-follow')).toBe(false)
    })

    it('touches nothing at all for a manifest that recorded nothing', () => {
        expect(leavePlan({ format: 'di.stage' }).map((step) => step.do)).toEqual(['stop-supervisor'])
        expect(leavePlan(null).map((step) => step.do)).toEqual(['stop-supervisor'])
    })

    it('puts an earlier follow back rather than removing it', () => {
        const withPrevious = manifestFor({
            spaceId: 'stage', from: 'x',
            follow: { spaceId: 'stage', previous: { remote: 'https://other', token: 'k' } }
        })
        const step = leavePlan(withPrevious).find((entry) => entry.do === 'restore-follow')
        expect(step.previous).toEqual({ remote: 'https://other', token: 'k' })
    })
})

describe('what status says, and what it exits with', () => {
    const joined = {
        joined: true,
        server: { alive: true, url: 'https://local.thedi.studio' },
        supervisor: { alive: true, pid: 42 },
        follow: { spaceId: 'stage', remote: 'https://studio', status: 'idle', carriedIn: 3, carriedOut: 0 },
        autostart: { kind: 'systemd-user', present: true, restartsOnFailure: true },
        wake: { held: true, how: 'systemd-inhibit' },
        screens: [{ label: 'screen 1', showing: true, title: 'out · wall · ok' }]
    }

    it('names the server, the follow, the autostart, the wake and the screen, in that order', () => {
        const status = statusRows(joined)
        expect(status.rows.map((row) => row.key))
            .toEqual(['server', 'supervisor', 'follow', 'autostart', 'wake', 'screen:screen 1'])
        expect(status.ok).toBe(true)
    })

    it('SAYS when the autostart is the fallback that cannot restart anything', () => {
        const status = statusRows({ ...joined, autostart: { kind: 'windows-startup', present: true, restartsOnFailure: false } })
        const row = status.rows.find((entry) => entry.key === 'autostart')
        expect(row.text).toContain('does NOT restart if it dies')
        expect(row.ok).toBe(true)
    })

    it('fails when a screen is not showing, and repeats the page\'s own reason', () => {
        const status = statusRows({
            ...joined,
            screens: [{ label: 'screen 1', showing: false, reason: 'all-off', why: 'the page says all-off' }]
        })
        expect(status.ok).toBe(false)
        expect(status.rows.find((row) => row.key.startsWith('screen:')).text).toContain('all-off')
    })

    it('fails when there is no screen at all — a stage with nothing on it is not ok', () => {
        expect(statusRows({ ...joined, screens: [] }).ok).toBe(false)
    })

    it('says plainly that a machine with no autostart will not come back on its own', () => {
        const status = statusRows({ ...joined, autostart: { present: false } })
        expect(status.rows.find((row) => row.key === 'autostart').text).toContain('will not come back on its own')
    })

    it('answers a machine that never joined with nothing rather than an empty report', () => {
        expect(statusRows({ joined: false })).toEqual({ ok: false, joined: false, rows: [] })
    })
})
