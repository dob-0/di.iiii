/**
 * Displays as data — step D of the stage plan.
 *
 * Everything here is PURE, for the same reason stagePlan.mjs is: the real
 * stage box is a Windows laptop with a projector on HDMI and CI is Linux, so
 * the only honest way to test the Windows and macOS probes is to hold the
 * exact command each one runs and parse a captured sample of its output.
 * displayProbe.mjs is the thin impure layer that runs `probeCommands` and
 * hands the text back in.
 *
 * A display is `{ id, label, x, y, width, height, primary }`, in whatever
 * unit the OS tool speaks:
 *
 *   Linux (xrandr)       device pixels, top-left origin              — run here
 *   Windows (AllScreens) the virtual desktop as a non-DPI-aware       — NOT run on Windows
 *                        PowerShell sees it (the primary's DIPs)
 *   macOS (NSScreen)     points, flipped here to top-left            — NOT run on macOS
 *
 * Chromium places windows in CSS pixels (measured, see toWindowUnits), so
 * the supervisor divides by the kiosk's own devicePixelRatio before it
 * launches or corrects, and accepts a match in either unit. On one DPI that
 * is the whole story. On MIXED DPI the ratio is not one number, nothing here
 * has been run there, and the status says which unit it matched rather than
 * claiming more.
 */

import { pickByLabel } from './nameMatch.mjs'

// ── the commands, as data ─────────────────────────────────────────────────

const POWERSHELL_SCREENS = 'Add-Type -AssemblyName System.Windows.Forms; '
    + '[System.Windows.Forms.Screen]::AllScreens | ForEach-Object { [pscustomobject]@{ '
    + 'device = $_.DeviceName; primary = $_.Primary; x = $_.Bounds.X; y = $_.Bounds.Y; '
    + 'width = $_.Bounds.Width; height = $_.Bounds.Height } } | ConvertTo-Json -Compress'

// The friendly names ("Optoma", "BenQ PD2700U") live in WMI, not in
// AllScreens. root\wmi is readable without elevation; the name arrives as a
// zero-padded array of char codes.
const POWERSHELL_MONITORS = 'Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue '
    + '| ForEach-Object { [pscustomobject]@{ instance = $_.InstanceName; '
    + 'name = -join ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) } } | ConvertTo-Json -Compress'

// NSScreen has what system_profiler does not: where each display IS. Frames
// come back in Cocoa's bottom-left space and are flipped to top-left below.
const JXA_SCREENS = 'ObjC.import("AppKit"); '
    + 'JSON.stringify($.NSScreen.screens.js.map(function (s) { var f = s.frame; return { '
    + 'name: String(s.localizedName.js), x: f.origin.x, y: f.origin.y, width: f.size.width, height: f.size.height, '
    + 'scale: s.backingScaleFactor }; }))'

/**
 * What to run on each OS to learn the displays. `env` decides the Linux
 * case: under Wayland there is no portable query for a compositor's outputs
 * from a plain process, and xrandr under XWayland reports one virtual screen
 * — so the honest answer there is "one screen, assumed", said out loud.
 */
export const probeCommands = (platform, env = {}) => {
    if (platform === 'win32') {
        return [
            { key: 'screens', command: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_SCREENS] },
            { key: 'monitors', command: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_MONITORS] }
        ]
    }
    if (platform === 'darwin') {
        return [
            { key: 'screens', command: 'osascript', args: ['-l', 'JavaScript', '-e', JXA_SCREENS] },
            { key: 'profiler', command: 'system_profiler', args: ['SPDisplaysDataType', '-json'] }
        ]
    }
    if (platform === 'linux') {
        if (String(env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' && !env.DISPLAY) return []
        return [{ key: 'xrandr', command: 'xrandr', args: ['--query'] }]
    }
    return []
}

// ── the parsers ───────────────────────────────────────────────────────────

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : null)

/**
 * `xrandr --query`: one line per output, and only the connected ones with a
 * geometry are displays. `eDP-1 connected primary 2560x1440+0+0 (…)`.
 * A connected output with no geometry (plugged in, not enabled) is not a
 * display the kiosk could be placed on, and is left out on purpose.
 */
export const parseXrandr = (text) => {
    const displays = []
    for (const line of String(text || '').split('\n')) {
        const match = /^(\S+) connected( primary)? (\d+)x(\d+)\+(\d+)\+(\d+)/.exec(line)
        if (!match) continue
        displays.push({
            id: match[1],
            label: match[1],
            x: Number(match[5]),
            y: Number(match[6]),
            width: Number(match[3]),
            height: Number(match[4]),
            primary: Boolean(match[2])
        })
    }
    return displays
}

const asList = (value) => (Array.isArray(value) ? value : (value && typeof value === 'object' ? [value] : []))
const parseJson = (text) => { try { return JSON.parse(String(text || '')) } catch { return null } }

/**
 * Windows: AllScreens for bounds, WmiMonitorID for names. ConvertTo-Json
 * hands back a bare object for ONE screen and an array for more, so both
 * shapes are read. The two lists are joined by position only when they are
 * the same length — WMI does not say which DISPLAYn a monitor is, and a
 * guess would put the projector's name on the laptop panel.
 */
export const parseWindowsScreens = ({ screens, monitors } = {}) => {
    const rows = asList(parseJson(screens))
    const names = asList(parseJson(monitors)).map((row) => String(row?.name || '').trim()).filter(Boolean)
    const displays = rows.map((row, index) => {
        const device = String(row?.device || '').replace(/^\\\\\.\\/, '') || `DISPLAY${index + 1}`
        const friendly = names.length === rows.length ? names[index] : ''
        return {
            id: device,
            label: friendly || device,
            x: number(row?.x) ?? 0,
            y: number(row?.y) ?? 0,
            width: number(row?.width) ?? 0,
            height: number(row?.height) ?? 0,
            primary: Boolean(row?.primary)
        }
    }).filter((display) => display.width > 0 && display.height > 0)
    return { displays, monitors: names.length }
}

/**
 * macOS: NSScreen frames (points, bottom-left origin — the primary is the one
 * at 0,0 and its height is the flip line), plus system_profiler for the
 * displays that exist at all, so a mirrored one — which NSScreen folds into
 * its partner — is still counted.
 */
export const parseMacScreens = ({ screens, profiler } = {}) => {
    const rows = asList(parseJson(screens))
    const primary = rows.find((row) => number(row?.x) === 0 && number(row?.y) === 0) || rows[0] || null
    const flipLine = number(primary?.height) ?? 0
    const displays = rows.map((row, index) => {
        const width = number(row?.width) ?? 0
        const height = number(row?.height) ?? 0
        const yBottom = number(row?.y) ?? 0
        return {
            id: `screen-${index}`,
            label: String(row?.name || '').trim() || `Display ${index + 1}`,
            x: number(row?.x) ?? 0,
            y: flipLine - (yBottom + height),
            width,
            height,
            primary: row === primary
        }
    }).filter((display) => display.width > 0 && display.height > 0)
    let monitors = 0
    let mirrored = false
    const data = parseJson(profiler)
    for (const gpu of asList(data?.SPDisplaysDataType)) {
        for (const display of asList(gpu?.spdisplays_ndrvs)) {
            monitors += 1
            if (String(display?.spdisplays_mirror || '').endsWith('_on')) mirrored = true
        }
    }
    return { displays, monitors, mirrored }
}

/**
 * Cloned displays are TOLD, never flipped: switching a machine out of mirror
 * mode is a display-settings change, and a supervisor that changed display
 * settings would be exactly the kind of tool `di stage` promised not to be.
 * Two displays at the same geometry, or more monitors than screens, is a
 * clone.
 */
export const cloneVerdict = ({ displays = [], monitors = 0, mirrored = false } = {}) => {
    const seen = new Map()
    for (const display of displays) {
        const key = `${display.x},${display.y},${display.width}x${display.height}`
        if (seen.has(key)) {
            return { cloned: true, why: `${seen.get(key)} and ${display.label} show the same picture (${display.width}×${display.height} at ${display.x},${display.y})` }
        }
        seen.set(key, display.label)
    }
    if (mirrored) return { cloned: true, why: 'a display is mirrored' }
    if (monitors > displays.length && displays.length > 0) {
        return { cloned: true, why: `${monitors} monitors are plugged in but the OS shows ${displays.length} screen${displays.length === 1 ? '' : 's'} — one is a clone of another` }
    }
    return { cloned: false, why: null }
}

/**
 * The probe's whole answer: displays, whether they are cloned, and a note
 * when the OS could not be asked. A machine that cannot list its displays
 * still has one — the kiosk goes full-screen on it, unplaced — but says so.
 */
export const readProbe = ({ platform, env = {}, outputs = {} } = {}) => {
    const commands = probeCommands(platform, env)
    if (platform === 'linux' && !commands.length) {
        return { displays: [assumedDisplay()], cloned: false, why: null, assumed: true, note: 'Wayland session — the compositor\'s outputs cannot be read from here; one screen assumed' }
    }
    let result = { displays: [], monitors: 0, mirrored: false }
    if (platform === 'linux') result = { displays: parseXrandr(outputs.xrandr), monitors: 0, mirrored: false }
    else if (platform === 'win32') result = parseWindowsScreens(outputs)
    else if (platform === 'darwin') result = parseMacScreens(outputs)
    if (!result.displays.length) {
        return { displays: [assumedDisplay()], cloned: false, why: null, assumed: true, note: `${platform === 'linux' ? 'xrandr' : platform === 'win32' ? 'PowerShell' : 'osascript'} did not list a display — one screen assumed` }
    }
    const verdict = cloneVerdict(result)
    return { displays: result.displays, cloned: verdict.cloned, why: verdict.why, assumed: false, note: null }
}

const assumedDisplay = () => ({ id: 'screen-1', label: 'screen 1', x: 0, y: 0, width: 0, height: 0, primary: true, assumed: true })

// ── which display a document means ────────────────────────────────────────

/**
 * The rule everywhere a live thing is named: exact label, contains, then —
 * because a projector's label can change between a Windows update and a
 * cable swap — its size, then its index. `'all'` matches nothing here: the
 * planner expands it.
 */
export const matchScreen = (displays = [], screen = null) => {
    if (!screen || screen === 'all' || typeof screen !== 'object') return null
    const byLabel = screen.label ? (pickByLabel(displays, screen.label) || pickByLabel(displays.map((d) => ({ ...d, label: d.id })), screen.label)) : null
    if (byLabel) return displays.find((display) => display.id === byLabel.id) || byLabel
    if (Array.isArray(screen.size) && screen.size.length === 2) {
        const bySize = displays.find((display) => display.width === screen.size[0] && display.height === screen.size[1])
        if (bySize) return bySize
    }
    if (Number.isInteger(screen.index) && screen.index >= 0 && screen.index < displays.length) return displays[screen.index]
    return null
}

const describeScreen = (screen) => {
    if (!screen || screen === 'all') return 'all screens'
    const parts = []
    if (screen.label) parts.push(`"${screen.label}"`)
    if (Array.isArray(screen.size)) parts.push(`${screen.size[0]}×${screen.size[1]}`)
    if (Number.isInteger(screen.index)) parts.push(`#${screen.index + 1}`)
    return parts.join(' ') || 'a screen'
}

const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'screen'

/**
 * One kiosk per assigned display.
 *
 * Every map project whose `output.show.machine` is THIS machine gets a
 * window on the display it names — or a line saying why not: the display is
 * not here, or another project already has it. A project that names every
 * screen gets one window per display. When no project names this machine at
 * all, the plan is the one #513 shipped: a single kiosk, the space's one
 * mapping or `--project`, full-screen and unplaced — so a stage joined
 * before `show` existed keeps working exactly as it did.
 *
 * Each window carries its own profile directory and debugging port, both
 * derived from the display so they are stable across ticks and reboots.
 */
export const planDisplays = ({ projects = [], machineId = null, displays = [], project = null, debugPort = 9333 } = {}) => {
    const mine = machineId
        ? projects.filter((entry) => entry?.show?.machine && entry.show.machine === machineId).sort((a, b) => String(a.id).localeCompare(String(b.id)))
        : []
    if (!mine.length) {
        const target = chooseSingle({ projects, project })
        return {
            mode: 'single',
            target,
            windows: [{
                key: 'screen 1', label: 'screen 1', projectId: target.projectId, display: null,
                profile: 'browser', debugPort, hold: 'hold.html'
            }],
            unplaced: []
        }
    }
    const windows = []
    const unplaced = []
    const taken = new Map()
    const claim = (display, entry) => {
        if (taken.has(display.id)) {
            unplaced.push({ projectId: entry.id, why: `${display.label} already shows ${taken.get(display.id)}` })
            return
        }
        taken.set(display.id, entry.id)
        const slot = displays.indexOf(display)
        windows.push({
            key: display.id,
            label: display.label,
            projectId: entry.id,
            display: display.assumed ? null : display,
            profile: `browser-${slug(display.id)}`,
            debugPort: debugPort + 1 + Math.max(0, slot),
            hold: `hold-${slug(display.id)}.html`
        })
    }
    for (const entry of mine) {
        if (entry.show.screen === 'all') {
            for (const display of displays) claim(display, entry)
            continue
        }
        const display = matchScreen(displays, entry.show.screen)
        if (!display) {
            const have = displays.map((d) => `${d.label}${d.width ? ` ${d.width}×${d.height}` : ''}`).join(', ')
            unplaced.push({ projectId: entry.id, why: `no display ${describeScreen(entry.show.screen)} on this machine — it has ${have || 'none it can name'}` })
            continue
        }
        claim(display, entry)
    }
    return { mode: 'shown', target: null, windows, unplaced }
}

/** #513's rule, kept: the one mapping in the space, or `--project`. */
const chooseSingle = ({ projects = [], project = null }) => {
    if (project) return { projectId: String(project), why: 'named with --project' }
    const mapped = projects.filter((entry) => Number(entry?.mapSurfaces || 0) > 0)
    if (mapped.length === 1) return { projectId: mapped[0].id, why: 'the only mapping in this space' }
    if (!mapped.length) return { projectId: null, error: 'none', ids: projects.map((entry) => entry.id) }
    return { projectId: null, error: 'many', ids: mapped.map((entry) => entry.id) }
}

/**
 * Did the window land where it was sent? A kiosk is full-screen on whichever
 * display its top-left corner fell on, so the bounds Chromium reports should
 * BE the display's. A couple of pixels of slack for a window manager's frame.
 */
export const boundsMatch = (actual, wanted, slack = 2) => {
    if (!actual || !wanted) return false
    const near = (a, b) => Math.abs(Number(a) - Number(b)) <= slack
    return near(actual.left ?? actual.x, wanted.x) && near(actual.top ?? actual.y, wanted.y)
        && near(actual.width, wanted.width) && near(actual.height, wanted.height)
}

/**
 * THE UNITS, measured rather than assumed (aylmo, 2026-09-21, Xft.dpi 144):
 * Chromium's `--window-position`/`--window-size` and its CDP window bounds
 * are one unit, CSS pixels — a 2560×1440 panel at 150% came back as
 * 1707×960 — while xrandr is device pixels. The page's own
 * `devicePixelRatio` is the conversion, and on X11 it is one number for the
 * whole desktop. So the display's bounds are handed to Chromium divided by
 * the scale the kiosk itself reported, and a window is accepted as placed
 * when its bounds match the display in EITHER unit — because on macOS the
 * probe already speaks points, and on Windows a non-DPI-aware PowerShell
 * already speaks the primary's DIPs. Which unit matched is written down.
 *
 * Mixed DPI — a laptop at 150% with a projector at 100% on Windows — is
 * where "one number" stops being true, and nothing here has been run there.
 */
export const toWindowUnits = (display, scale = 1) => {
    const factor = Number.isFinite(scale) && scale > 0 ? scale : 1
    return {
        x: Math.round(display.x / factor),
        y: Math.round(display.y / factor),
        width: Math.round(display.width / factor),
        height: Math.round(display.height / factor)
    }
}

export const placementVerdict = (actual, display, scale = 1) => {
    if (!actual || !display) return { ok: false, units: null }
    if (boundsMatch(actual, display)) return { ok: true, units: 'the probe\'s own' }
    const factor = Number.isFinite(scale) && scale > 0 ? scale : 1
    if (factor !== 1 && boundsMatch(actual, toWindowUnits(display, factor))) return { ok: true, units: `CSS pixels at ×${factor}` }
    return { ok: false, units: null }
}

/**
 * What changed between two probes: the displays that appeared and the ones
 * that went, by id. The supervisor closes a kiosk whose display is gone and
 * opens one for a display that arrived, on the same tick it already runs.
 */
export const displayDiff = (before = [], after = []) => {
    const was = new Set(before.map((display) => display.id))
    const is = new Set(after.map((display) => display.id))
    return {
        appeared: after.filter((display) => !was.has(display.id)),
        gone: before.filter((display) => !is.has(display.id))
    }
}
