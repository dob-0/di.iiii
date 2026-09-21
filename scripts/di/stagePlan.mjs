/**
 * `di stage`, decided. Every function here is PURE: it takes facts and returns
 * data — a file's content, a list of commands, a row of status text — and
 * touches nothing.
 *
 * That is not tidiness. A stage machine is a Windows box under a projector and
 * a Mac in a rack, and CI is Linux: the only way to test the two autostart
 * entries this machine cannot install is to test the STRINGS and the COMMANDS
 * they are made of. stagePlan.test.js does exactly that, per platform, and
 * stage.mjs is the thin impure layer that writes what it is handed.
 *
 * The other reason: `di stage leave` must undo exactly what `di stage join`
 * did, and nothing else. Both sides read from the same manifest, and
 * `leavePlan` is the undo, written out as data you can look at.
 */

/** The names this appliance uses on each OS. One place, so leave can find them. */
export const STAGE = {
    format: 'di.stage',
    version: 1,
    taskName: 'di stage',
    unit: 'di-stage.service',
    label: 'studio.thedi.di-stage',
    desktop: 'di-stage.desktop',
    startupCmd: 'di-stage.cmd',
    taskXml: 'di-stage.xml'
}

/** How often the supervisor looks at the world and puts it back the way it should be. */
export const RECONCILE_MS = 5000

/** Where the kiosk answers questions about itself. Not 9222: that is every other tool's. */
export const DEBUG_PORT = 9333

const posix = (value) => String(value || '').split('\\').join('/')

// ── the autostart entry ───────────────────────────────────────────────────

/**
 * The entry each OS actually supports, and the one to fall back to when it is
 * refused. The preferred entry on Windows and Linux can restart the supervisor
 * if it dies; the fallback on both CANNOT, which is why `status` says which one
 * is in force rather than saying "autostart: yes".
 */
export const PREFERRED_AUTOSTART = { win32: 'windows-task', darwin: 'launchagent', linux: 'systemd-user' }
export const FALLBACK_AUTOSTART = { win32: 'windows-startup', darwin: null, linux: 'xdg-autostart' }

const xmlEscape = (value) => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const plistEscape = xmlEscape

const windowsTaskXml = ({ node, cli, home, user }) => [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    '  <RegistrationInfo>',
    '    <Description>di.iiii stage — keeps the server, the screen and the wake hold up.</Description>',
    '    <URI>\\di stage</URI>',
    '  </RegistrationInfo>',
    '  <Triggers>',
    '    <LogonTrigger>',
    '      <Enabled>true</Enabled>',
    `      <UserId>${xmlEscape(user)}</UserId>`,
    '    </LogonTrigger>',
    '  </Triggers>',
    '  <Principals>',
    '    <Principal id="Author">',
    `      <UserId>${xmlEscape(user)}</UserId>`,
    '      <LogonType>InteractiveToken</LogonType>',
    // LeastPrivilege on purpose: this task must register and run for a person
    // who is not an administrator. Asking for HighestAvailable is what turns a
    // one-line install into a UAC prompt nobody at a venue can answer.
    '      <RunLevel>LeastPrivilege</RunLevel>',
    '    </Principal>',
    '  </Principals>',
    '  <Settings>',
    '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
    '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
    '    <AllowHardTerminate>true</AllowHardTerminate>',
    '    <StartWhenAvailable>true</StartWhenAvailable>',
    '    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>',
    '    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>',
    '    <AllowStartOnDemand>true</AllowStartOnDemand>',
    '    <Enabled>true</Enabled>',
    '    <Hidden>false</Hidden>',
    '    <RunOnlyIfIdle>false</RunOnlyIfIdle>',
    '    <WakeToRun>false</WakeToRun>',
    // No time limit: this is a supervisor, not a job. The default kills it
    // after three days, which is the week of a run.
    '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
    '    <Priority>7</Priority>',
    '    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>',
    '  </Settings>',
    '  <Actions Context="Author">',
    '    <Exec>',
    `      <Command>${xmlEscape(node)}</Command>`,
    `      <Arguments>"${xmlEscape(cli)}" stage run</Arguments>`,
    `      <WorkingDirectory>${xmlEscape(home)}</WorkingDirectory>`,
    '    </Exec>',
    '  </Actions>',
    '</Task>',
    ''
].join('\r\n')

const windowsStartupCmd = ({ node, cli, home }) => [
    '@echo off',
    'rem di.iiii stage — written by `di stage join`, removed by `di stage leave`.',
    'rem The Startup folder has no restart-on-failure. `di stage status` says so.',
    `set "DI_HOME=${home}"`,
    `start "" /b "${node}" "${cli}" stage run`,
    ''
].join('\r\n')

const launchAgentPlist = ({ node, cli, home, logFile }) => [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${plistEscape(STAGE.label)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    `    <string>${plistEscape(node)}</string>`,
    `    <string>${plistEscape(cli)}</string>`,
    '    <string>stage</string>',
    '    <string>run</string>',
    '  </array>',
    '  <key>EnvironmentVariables</key>',
    `  <dict><key>DI_HOME</key><string>${plistEscape(home)}</string></dict>`,
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <true/>',
    '  <key>ProcessType</key>',
    '  <string>Interactive</string>',
    '  <key>StandardOutPath</key>',
    `  <string>${plistEscape(logFile)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${plistEscape(logFile)}</string>`,
    '</dict>',
    '</plist>',
    ''
].join('\n')

const systemdUnit = ({ node, cli, home }) => [
    '[Unit]',
    'Description=di.iiii stage — server, screen and wake hold',
    'After=graphical-session.target',
    'PartOf=graphical-session.target',
    '',
    '[Service]',
    'Type=simple',
    `Environment=DI_HOME=${home}`,
    `ExecStart=${node} ${cli} stage run`,
    'Restart=always',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    ''
].join('\n')

const xdgDesktop = ({ node, cli, home }) => [
    '[Desktop Entry]',
    'Type=Application',
    'Name=di.iiii stage',
    'Comment=Keeps the server, the screen and the wake hold up. Written by `di stage join`.',
    `Exec=env DI_HOME=${home} ${node} ${cli} stage run`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
].join('\n')

/**
 * The autostart entry, as data: one file to write and the commands that make
 * the OS notice it. Nothing here runs — stage.mjs writes `content` to `path`
 * and hands `install` to a runner, and `leavePlan` hands back `remove`.
 *
 * `restartsOnFailure` is the fact `status` has to repeat out loud: the two
 * fallbacks start the supervisor once at login and never look again.
 */
export const autostartSpec = ({
    platform,
    kind = null,
    home,
    node,
    cli,
    configHome = null,
    userHome = null,
    startupDir = null,
    user = 'the-user',
    uid = 501,
    logFile = null,
    join = (...parts) => parts.filter(Boolean).join('/')
} = {}) => {
    const wanted = kind || PREFERRED_AUTOSTART[platform] || null
    if (!wanted) return null
    const log = logFile || join(home, 'logs', 'stage.log')

    if (wanted === 'windows-task') {
        const file = join(home, 'stage', 'autostart', STAGE.taskXml)
        return {
            kind: wanted,
            path: file,
            content: windowsTaskXml({ node, cli, home, user }),
            encoding: 'utf16le',
            install: [{ command: 'schtasks', args: ['/Create', '/TN', STAGE.taskName, '/XML', file, '/F'] }],
            remove: [{ command: 'schtasks', args: ['/Delete', '/TN', STAGE.taskName, '/F'] }],
            restartsOnFailure: true,
            note: 'a scheduled task that runs at logon and restarts the supervisor if it dies'
        }
    }
    if (wanted === 'windows-startup') {
        return {
            kind: wanted,
            path: join(startupDir, STAGE.startupCmd),
            content: windowsStartupCmd({ node, cli, home }),
            encoding: 'utf8',
            install: [],
            remove: [],
            restartsOnFailure: false,
            note: 'the Startup folder — it starts the supervisor at logon and never looks again'
        }
    }
    if (wanted === 'launchagent') {
        const file = join(userHome, 'Library', 'LaunchAgents', `${STAGE.label}.plist`)
        return {
            kind: wanted,
            path: file,
            content: launchAgentPlist({ node, cli, home, logFile: log }),
            encoding: 'utf8',
            install: [{ command: 'launchctl', args: ['bootstrap', `gui/${uid}`, file] }],
            remove: [{ command: 'launchctl', args: ['bootout', `gui/${uid}/${STAGE.label}`] }],
            restartsOnFailure: true,
            note: 'a LaunchAgent with KeepAlive — it starts at login and is restarted if it dies'
        }
    }
    if (wanted === 'systemd-user') {
        const file = join(configHome, 'systemd', 'user', STAGE.unit)
        return {
            kind: wanted,
            path: file,
            content: systemdUnit({ node, cli, home }),
            encoding: 'utf8',
            install: [
                { command: 'systemctl', args: ['--user', 'daemon-reload'] },
                { command: 'systemctl', args: ['--user', 'enable', '--now', STAGE.unit] }
            ],
            remove: [
                { command: 'systemctl', args: ['--user', 'disable', '--now', STAGE.unit] },
                { command: 'systemctl', args: ['--user', 'daemon-reload'] }
            ],
            restartsOnFailure: true,
            note: 'a systemd user unit with Restart=always — it starts at login and is restarted if it dies'
        }
    }
    if (wanted === 'xdg-autostart') {
        return {
            kind: wanted,
            path: join(configHome, 'autostart', STAGE.desktop),
            content: xdgDesktop({ node, cli, home }),
            encoding: 'utf8',
            install: [],
            remove: [],
            restartsOnFailure: false,
            note: 'a desktop autostart entry — it starts the supervisor at login and never looks again'
        }
    }
    return null
}

/** The entry to try when the preferred one is refused, or null when there is none. */
export const fallbackKind = (platform) => FALLBACK_AUTOSTART[platform] ?? null

// ── the browser ───────────────────────────────────────────────────────────

/**
 * Where a Chromium usually is, per OS. Tried in order and the first one that
 * exists wins; `--browser` overrides all of it. di never installs one — that is
 * on the §5 list of things this command says out loud it does not do.
 */
export const browserCandidates = (platform) => ({
    win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ],
    darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ],
    linux: ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'brave-browser', 'microsoft-edge']
}[platform] || [])

/**
 * The kiosk, in flags.
 *
 * `--use-fake-ui-for-media-stream` and `--autoplay-policy` because nobody is
 * standing at this machine to click "allow" or to tap a video; the session
 * bubbles and the error dialogs because they land on a projector; the debugging
 * port because it is the only honest way to ask the page what it is showing.
 */
export const browserArgs = ({ profileDir, url, debugPort = DEBUG_PORT, window = null } = {}) => [
    `--user-data-dir=${profileDir}`,
    '--kiosk',
    '--start-fullscreen',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--noerrdialogs',
    '--disable-infobars',
    '--disable-pinch',
    '--overscroll-history-navigation=0',
    '--disable-features=TranslateUI,InfiniteSessionRestore,HardwareMediaKeyHandling',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--password-store=basic',
    `--remote-debugging-port=${debugPort}`,
    `--remote-allow-origins=http://127.0.0.1:${debugPort}`,
    ...(window ? [`--window-position=${window.x},${window.y}`, `--window-size=${window.width},${window.height}`] : []),
    url
]

/**
 * The running kiosk's pid, out of the SingletonLock symlink Chromium leaves in
 * its profile directory (`<hostname>-<pid>`).
 *
 * Found on the first real run: a second launch into the same profile does NOT
 * start a second browser — it hands the URL to the first one and exits at once.
 * A supervisor that had just been restarted therefore thought its kiosk was
 * dead, opened a tab, and did it again every five seconds. The profile itself
 * is where the truth about "is there already one" lives.
 */
export const pidFromSingletonLock = (target) => {
    const match = /-(\d+)$/.exec(String(target || ''))
    const pid = match ? Number(match[1]) : NaN
    return Number.isFinite(pid) && pid > 0 ? pid : null
}

/**
 * `exit_type: "Normal"` into the profile before every launch.
 *
 * Without it a machine that lost power comes back up asking "Restore pages?"
 * in a grey bar across the top of the projection, and there is nobody there to
 * dismiss it. A profile with no Preferences file yet is not an error — it is
 * the first launch.
 */
export const preferencesPatch = (raw) => {
    let parsed = {}
    try { parsed = JSON.parse(raw || '{}') } catch { parsed = {} }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {}
    const branch = (key) => ((parsed[key] && typeof parsed[key] === 'object' && !Array.isArray(parsed[key])) ? parsed[key] : {})
    return JSON.stringify({
        ...parsed,
        profile: { ...branch('profile'), exit_type: 'Normal', exited_cleanly: true },
        // 5 = start on the new tab page. A kiosk shows ONE page, the one it was
        // given on the command line; "restore the last session" put every tab
        // from before the power cut back on the wall, which is the same defect
        // as the crash bubble wearing a different hat.
        session: { ...branch('session'), restore_on_startup: 5, startup_urls: [] }
    })
}

/**
 * The session files taken off the profile before each launch, relative to the
 * profile directory.
 *
 * The Preferences patch above stops Chromium ASKING to restore pages. It does
 * not stop it restoring them: a browser that was killed rather than closed
 * comes back with every tab it had, and on a stage machine those tabs are last
 * week's. Seen on the first real run — four tabs deep, two of them a landing
 * page nobody had opened this year.
 */
export const SESSION_FILES = [
    'Default/Sessions',
    'Default/Current Session',
    'Default/Current Tabs',
    'Default/Last Session',
    'Default/Last Tabs'
]

/**
 * THE BLACK HOLD PAGE. The browser always opens here, never straight at the
 * server.
 *
 * A dead server in Chrome is a light-grey page with a sad folder on it, and on
 * a stage machine that is a white rectangle on a wall in front of an audience.
 * So the first thing the kiosk ever draws is black, with one dim line in a
 * corner saying what it is waiting for — the dark-room default, ≤12% grey.
 *
 * It walks itself to the real page: a no-cors fetch resolves on any answer and
 * rejects when nothing is listening, which works across origins where a plain
 * fetch would not. The supervisor relaunches the kiosk as a second route to the
 * same place, so a page with no script still gets there.
 */
export const holdPage = ({ spaceId = '', waitingFor = '', targetUrl = null, healthUrl = null, pollMs = 1000 } = {}) => {
    const escape = (value) => String(value).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
    const json = (value) => JSON.stringify(value == null ? null : String(value))
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>di stage · holding</title>
<style>
  html,body{margin:0;height:100%;background:#000;color:#1f1f1f;overflow:hidden}
  body{font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
  .corner{position:fixed;left:16px;bottom:14px;letter-spacing:.08em}
  .corner b{font-weight:400;color:#2b2b2b}
</style></head>
<body>
  <div class="corner">di stage${spaceId ? ` · <b>${escape(spaceId)}</b>` : ''} — holding${waitingFor ? ` for ${escape(waitingFor)}` : ''}</div>
  <script>
  (function () {
    var target = ${json(targetUrl)}, health = ${json(healthUrl)}, every = ${Number(pollMs) || 1000}
    if (!target || !health) return
    function look () {
      fetch(health, { mode: 'no-cors', cache: 'no-store' })
        .then(function () { location.replace(target) })
        .catch(function () { setTimeout(look, every) })
    }
    look()
  }())
  </script>
</body></html>
`
}

// ── what the supervisor does about what it found ──────────────────────────

/**
 * One tick. Facts in, an ordered list of actions out — and nothing else, so
 * every awkward case (no target yet, a server that died under a live kiosk, a
 * browser killed by a stray click) is a test rather than an afternoon.
 */
export const reconcile = ({
    serverAlive = false,
    browserAlive = false,
    wakeAlive = false,
    holdUrl = null,
    targetUrl = null,
    pageUrl = null,
    // Does the hold page ON SCREEN carry the target the supervisor now knows
    // about? Found on the first real run: the kiosk opens while the server is
    // still starting, so the hold page it loaded had nowhere to go — and
    // rewriting the file underneath a loaded page changes nothing. The wall
    // stayed black forever, correctly and uselessly.
    holdCarriesTarget = true
} = {}) => {
    const actions = []
    // FIRST, before anything that takes time. Starting the server can take
    // thirty seconds, and for every one of them a dead server is Chrome's
    // light-grey error page — on a wall, in front of an audience. The screen
    // goes black the moment the server goes, and the repair happens behind it.
    if (!serverAlive && browserAlive && pageUrl && pageUrl !== holdUrl) {
        actions.push({ do: 'restart-browser', url: holdUrl, why: 'the server is down' })
    }
    if (!serverAlive) actions.push({ do: 'start-server' })
    if (!wakeAlive) actions.push({ do: 'start-wake' })
    if (!browserAlive) {
        actions.push({ do: 'start-browser', url: holdUrl })
        return { actions }
    }
    // The kiosk is up. It is only ever moved by being relaunched — the hold
    // page walks itself forward on its own, and a relaunch is the one move that
    // works whether the page has script in it or is Chrome's own error page.
    if (serverAlive && targetUrl && pageUrl === holdUrl && !holdCarriesTarget) {
        actions.push({ do: 'restart-browser', url: holdUrl, why: 'the hold page did not know where to go yet' })
    } else if (serverAlive && targetUrl && pageUrl && pageUrl !== targetUrl && pageUrl !== holdUrl) {
        actions.push({ do: 'restart-browser', url: holdUrl, why: 'showing something else' })
    }
    return { actions }
}

/** The one map project this screen shows, or the reason there is no single one. */
export const chooseTarget = ({ projects = [], project = null } = {}) => {
    if (project) return { projectId: String(project), why: 'named with --project' }
    const mapped = projects.filter((entry) => Number(entry?.mapSurfaces || 0) > 0)
    if (mapped.length === 1) return { projectId: mapped[0].id, why: 'the only mapping in this space' }
    if (!mapped.length) return { projectId: null, error: 'none', ids: projects.map((entry) => entry.id) }
    return { projectId: null, error: 'many', ids: mapped.map((entry) => entry.id) }
}

/** `<base>/<space>/map/<project>/out` — src/map/mapRouting.js, written once more here
 * because the CLI cannot import the client bundle. mapRouting.test.js holds the shape. */
export const outUrl = ({ base, spaceId, projectId }) =>
    `${String(base || '').replace(/\/$/, '')}/${encodeURIComponent(spaceId)}/map/${encodeURIComponent(projectId)}/out`

/** What the out page's own title means. `out · <project> · ok|empty|all-off`. */
export const readOutTitle = (title) => {
    const parts = String(title || '').split(' · ')
    if (parts.length < 3 || parts[0] !== 'out') return { showing: false, reason: null, projectId: null }
    const reason = parts[2].trim()
    return { showing: reason === 'ok', reason, projectId: parts[1].trim() }
}

/**
 * Two installs, one mapping document. `normalizeMappingState` rebuilds the
 * output block from width and height alone, so a machine on an older build
 * that touches the document strips anything newer out of it. Not a refusal —
 * a thing said out loud, once, at join.
 */
export const versionVerdict = ({ here = null, there = null } = {}) => {
    if (!here || !there) return { same: false, known: false, verdict: 'unknown' }
    if (here === there) return { same: true, known: true, verdict: 'same' }
    return { same: false, known: true, verdict: 'different' }
}

// ── the manifest, and its exact undo ──────────────────────────────────────

/** Everything `join` is about to create, written down before it creates it. */
export const manifestFor = ({
    spaceId, from, at = null, into = null, project = null, browser = null, lan = false,
    name = null, address = null, port = null, installed = [], envSet = [], follow = null,
    autostart = null, now = new Date().toISOString(), version = null
}) => ({
    format: STAGE.format,
    version: STAGE.version,
    space: spaceId,
    from,
    at: at || null,
    into: into || null,
    project: project || null,
    browser: browser || null,
    lan: Boolean(lan),
    name: name || null,
    address: address || null,
    port: port || null,
    joinedAt: now,
    diVersion: version || null,
    autostart: autostart || null,
    follow: follow || null,
    installed,
    envSet
})

/**
 * `leave`, as a list. Read off the manifest and nothing else — a path this
 * install did not write down is a path `leave` will not touch, which is the
 * whole promise. Order matters: stop the thing that would put it all back
 * first, then the OS entry, then the files, then the directories from the
 * inside out.
 */
export const leavePlan = (manifest, { keepSpace = false } = {}) => {
    const steps = [{ do: 'stop-supervisor' }]
    const autostart = manifest?.autostart || null
    for (const command of autostart?.remove || []) steps.push({ do: 'run', ...command, tolerant: true })

    if (!keepSpace && manifest?.follow?.spaceId) {
        steps.push({ do: 'restore-follow', spaceId: manifest.follow.spaceId, previous: manifest.follow.previous ?? null })
    }
    for (const entry of [...(manifest?.envSet || [])].reverse()) {
        steps.push({ do: 'restore-env', key: entry.key, previous: entry.previous ?? null, fileExisted: entry.fileExisted !== false })
    }

    const installed = [...(manifest?.installed || [])]
    for (const entry of installed.filter((item) => item.kind === 'file').reverse()) {
        steps.push({ do: 'rm-file', path: entry.path })
    }
    // Deepest first: `<home>/stage/autostart` must go before `<home>/stage`, or
    // the second removal is the one that deletes the first's contents and the
    // manifest stops describing what happened.
    const dirs = installed.filter((item) => item.kind === 'dir').map((item) => item.path)
    for (const dir of [...dirs].sort((a, b) => posix(b).split('/').length - posix(a).split('/').length)) {
        steps.push({ do: 'rm-dir', path: dir })
    }
    return steps
}

// ── di.env, one line at a time ────────────────────────────────────────────
//
// `writeEnv` rewrites the whole file from a parsed object, which loses comments
// and blank lines — fine when di wrote the file, wrong when `leave` has to hand
// back something byte-for-byte. So the one key `join` sets is set as a LINE,
// and `leave` puts that exact line back, or takes exactly it away.

const keyLine = (key) => new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`)

export const envTextWith = (raw, key, value) => {
    const text = String(raw ?? '')
    const lines = text.split('\n')
    const index = lines.findIndex((line) => keyLine(key).test(line))
    if (index >= 0) {
        const previous = lines[index]
        lines[index] = `${key}=${value}`
        return { text: lines.join('\n'), previous }
    }
    const needsNewline = text.length > 0 && !text.endsWith('\n')
    return { text: `${text}${needsNewline ? '\n' : ''}${key}=${value}\n`, previous: null }
}

export const envTextRestore = (raw, key, previous = null) => {
    const text = String(raw ?? '')
    const lines = text.split('\n')
    const index = lines.findIndex((line) => keyLine(key).test(line))
    if (index < 0) return text
    if (previous === null) {
        // Splice the line out entirely. A line appended to a file that ended in
        // a newline leaves an empty last element behind it; removing the line
        // has to remove that too, or the file grows a blank line per join.
        lines.splice(index, 1)
        return lines.join('\n')
    }
    lines[index] = previous
    return lines.join('\n')
}

// ── holding the machine awake ─────────────────────────────────────────────

/**
 * A wake request that lives exactly as long as the supervisor does.
 *
 * Never `powercfg`, never a settings change: a machine whose power plan was
 * edited by a tool that later crashed is a machine that never sleeps again, and
 * `leave` would have something to restore that it might get wrong. All three of
 * these are dropped by the OS the moment the process ends.
 */
export const wakeCommand = (platform, { pid = null } = {}) => {
    if (platform === 'darwin') {
        // -w waits for our pid: caffeinate dies with the supervisor, always.
        return { command: 'caffeinate', args: ['-d', '-i', ...(pid ? ['-w', String(pid)] : [])] }
    }
    if (platform === 'linux') {
        return {
            command: 'systemd-inhibit',
            args: ['--what=idle:sleep:handle-lid-switch', '--who=di stage', '--why=showing a projection', '--mode=block',
                'sleep', 'infinity']
        }
    }
    if (platform === 'win32') {
        return {
            command: 'powershell',
            args: ['-NoProfile', '-WindowStyle', 'Hidden', '-Command',
                'Add-Type -Name P -Namespace W -MemberDefinition \'[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint e);\'; '
                + '[W.P]::SetThreadExecutionState(0x80000000 -bor 0x00000001 -bor 0x00000002) | Out-Null; '
                + 'while ($true) { Start-Sleep -Seconds 60 }']
        }
    }
    return null
}

// ── what `status` says ────────────────────────────────────────────────────

/**
 * The rows, in the order a person reads them, each with whether it is right.
 * `ok` is false if ANY screen row is not showing — that is the exit code, and
 * the reason this command is worth putting in a health check.
 */
export const statusRows = ({
    joined = false,
    server = null,        // { alive, url }
    supervisor = null,    // { alive, pid }
    follow = null,        // { spaceId, remote, status, carriedIn, carriedOut, lastError }
    autostart = null,     // { kind, present, restartsOnFailure, note }
    wake = null,          // { held, how }
    screens = []          // [{ label, url, title, showing, reason, why }]
} = {}) => {
    if (!joined) return { ok: false, joined: false, rows: [] }
    const rows = []
    rows.push({
        key: 'server',
        text: server?.alive ? `running — ${server.url}` : 'not running',
        ok: Boolean(server?.alive)
    })
    rows.push({
        key: 'supervisor',
        text: supervisor?.alive ? `up — pid ${supervisor.pid}` : 'not running',
        ok: Boolean(supervisor?.alive)
    })
    rows.push({
        key: 'follow',
        text: follow
            ? `${follow.spaceId} on ${follow.remote}${follow.lastError ? ` — ${follow.lastError}` : (follow.status ? ` — ${follow.status} · in ${follow.carriedIn ?? 0} · out ${follow.carriedOut ?? 0}` : '')}`
            : 'not following anything',
        ok: Boolean(follow) && !follow.lastError
    })
    rows.push({
        key: 'autostart',
        text: autostart?.present
            ? `${autostart.kind}${autostart.restartsOnFailure ? '' : ' — starts at login, does NOT restart if it dies'}`
            : 'none — this machine will not come back on its own',
        ok: Boolean(autostart?.present)
    })
    rows.push({
        key: 'wake',
        text: wake?.held ? `held — ${wake.how}` : 'not held — this screen may sleep',
        ok: Boolean(wake?.held)
    })
    for (const screen of screens) {
        rows.push({
            key: `screen:${screen.label}`,
            text: screen.showing
                ? `showing ${screen.title || screen.url}`
                : `not showing — ${screen.why || screen.reason || 'no page'}`,
            ok: Boolean(screen.showing)
        })
    }
    const screenRows = rows.filter((row) => row.key.startsWith('screen:'))
    return {
        ok: screenRows.length > 0 && screenRows.every((row) => row.ok),
        joined: true,
        rows
    }
}
