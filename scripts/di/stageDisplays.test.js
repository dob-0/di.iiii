// @vitest-environment node
//
// Displays as data, tested where they are decided.
//
// The Linux fixture is REAL: `xrandr --query` captured on aylmo on
// 2026-09-20 (one 2560×1440 panel, eight disconnected outputs). The Windows
// and macOS samples are plausible captures of the exact commands
// `probeCommands` returns — written from the tools' documented output shapes,
// NOT run on their own OS. The honest limit of this file is the same as
// stagePlan.test.js: it proves the parser reads that shape, not that the
// tool printed it.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { probeDisplays } from './displayProbe.mjs'
import {
    boundsMatch, cloneVerdict, displayDiff, matchScreen, parseMacScreens, parseWindowsScreens, parseXrandr,
    placementVerdict, planDisplays, probeCommands, readProbe, toWindowUnits
} from './stageDisplays.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const XRANDR_AYLMO = fs.readFileSync(path.join(HERE, 'fixtures', 'xrandr-aylmo-2026-09-20.txt'), 'utf8')

const XRANDR_TWO = [
    'Screen 0: minimum 320 x 200, current 3840 x 1440, maximum 16384 x 16384',
    'eDP-1 connected primary 2560x1440+0+0 (normal left inverted right x axis y axis) 344mm x 194mm',
    '   2560x1440    240.00*+  60.00 +',
    'HDMI-1-0 connected 1280x800+2560+0 (normal left inverted right x axis y axis) 0mm x 0mm',
    '   1280x800      60.00*+',
    'DP-1 disconnected (normal left inverted right x axis y axis)',
    ''
].join('\n')

describe('the commands each OS is asked', () => {
    it('on Linux under X11 is xrandr, and under Wayland is nothing — said, not guessed', () => {
        expect(probeCommands('linux', { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' })).toEqual([{ key: 'xrandr', command: 'xrandr', args: ['--query'] }])
        expect(probeCommands('linux', { XDG_SESSION_TYPE: 'wayland' })).toEqual([])
        const wayland = readProbe({ platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland' } })
        expect(wayland.assumed).toBe(true)
        expect(wayland.note).toContain('Wayland')
        expect(wayland.displays).toHaveLength(1)
    })

    it('on Windows is PowerShell without elevation: AllScreens for bounds, WmiMonitorID for names', () => {
        const commands = probeCommands('win32')
        expect(commands.map((entry) => entry.command)).toEqual(['powershell', 'powershell'])
        expect(commands[0].args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command'])
        expect(commands[0].args[3]).toContain('[System.Windows.Forms.Screen]::AllScreens')
        expect(commands[0].args[3]).toContain('ConvertTo-Json')
        expect(commands[1].args[3]).toContain('WmiMonitorID')
        expect(commands[1].args[3]).toContain('root\\wmi')
        expect(commands.map((entry) => entry.args.join(' '))).not.toContain('RunAs')
    })

    it('on macOS is NSScreen through osascript for positions, and system_profiler for what exists', () => {
        const commands = probeCommands('darwin')
        expect(commands[0]).toMatchObject({ key: 'screens', command: 'osascript' })
        expect(commands[0].args.slice(0, 3)).toEqual(['-l', 'JavaScript', '-e'])
        expect(commands[0].args[3]).toContain('NSScreen.screens')
        expect(commands[1]).toEqual({ key: 'profiler', command: 'system_profiler', args: ['SPDisplaysDataType', '-json'] })
    })
})

describe('xrandr, read', () => {
    it('reads the real capture from this machine: one panel, primary, at 0,0', () => {
        expect(parseXrandr(XRANDR_AYLMO)).toEqual([
            { id: 'eDP-1', label: 'eDP-1', x: 0, y: 0, width: 2560, height: 1440, primary: true }
        ])
    })

    it('reads a second display to the right, and leaves disconnected outputs out', () => {
        expect(parseXrandr(XRANDR_TWO)).toEqual([
            { id: 'eDP-1', label: 'eDP-1', x: 0, y: 0, width: 2560, height: 1440, primary: true },
            { id: 'HDMI-1-0', label: 'HDMI-1-0', x: 2560, y: 0, width: 1280, height: 800, primary: false }
        ])
    })

    it('ignores a connected output that has no geometry yet', () => {
        expect(parseXrandr('HDMI-1 connected (normal left inverted right x axis y axis)\n')).toEqual([])
        expect(parseXrandr('')).toEqual([])
    })
})

describe('Windows, read (sample, not run on Windows)', () => {
    const screens = '[{"device":"\\\\\\\\.\\\\DISPLAY1","primary":true,"x":0,"y":0,"width":1920,"height":1080},'
        + '{"device":"\\\\\\\\.\\\\DISPLAY2","primary":false,"x":1920,"y":0,"width":1280,"height":800}]'
    const monitors = '[{"instance":"DISPLAY\\\\LEN40A9\\\\4&2a3b\\\\0_0","name":"Built-in"},{"instance":"DISPLAY\\\\OPT1234\\\\4&2a3b\\\\1_0","name":"Optoma"}]'

    it('joins names to bounds only when the counts agree', () => {
        const { displays } = parseWindowsScreens({ screens, monitors })
        expect(displays).toEqual([
            { id: 'DISPLAY1', label: 'Built-in', x: 0, y: 0, width: 1920, height: 1080, primary: true },
            { id: 'DISPLAY2', label: 'Optoma', x: 1920, y: 0, width: 1280, height: 800, primary: false }
        ])
        // One monitor listed for two screens: WMI does not say which is
        // which, so the device names stand rather than a guess.
        const { displays: unnamed } = parseWindowsScreens({ screens, monitors: '{"instance":"x","name":"Optoma"}' })
        expect(unnamed.map((display) => display.label)).toEqual(['DISPLAY1', 'DISPLAY2'])
    })

    it('reads the bare object ConvertTo-Json emits for a single screen', () => {
        const one = parseWindowsScreens({ screens: '{"device":"\\\\\\\\.\\\\DISPLAY1","primary":true,"x":0,"y":0,"width":1920,"height":1080}', monitors: '' })
        expect(one.displays).toHaveLength(1)
        expect(one.displays[0].id).toBe('DISPLAY1')
    })

    it('counts two monitors behind one screen as a clone, and says so', () => {
        const probe = readProbe({ platform: 'win32', outputs: {
            screens: '{"device":"\\\\\\\\.\\\\DISPLAY1","primary":true,"x":0,"y":0,"width":1920,"height":1080}',
            monitors
        } })
        expect(probe.cloned).toBe(true)
        expect(probe.why).toContain('2 monitors')
        expect(probe.displays).toHaveLength(1)
    })
})

describe('macOS, read (sample, not run on macOS)', () => {
    // Cocoa measures from the bottom-left. The primary is 900 points tall at
    // the origin; the projector (800 tall) sits to its right with its bottom
    // edge 100 points up — so both TOP edges are at 900, which in top-left
    // space is y = 0 for each: 900 - (0 + 900) and 900 - (100 + 800).
    const screens = '[{"name":"Built-in Retina Display","x":0,"y":0,"width":1440,"height":900,"scale":2},'
        + '{"name":"Optoma","x":1440,"y":100,"width":1280,"height":800,"scale":1}]'
    const profiler = JSON.stringify({ SPDisplaysDataType: [{ spdisplays_ndrvs: [
        { _name: 'Color LCD', spdisplays_main: 'spdisplays_yes' },
        { _name: 'Optoma', spdisplays_mirror: 'spdisplays_off' }
    ] }] })

    it('flips NSScreen frames to top-left and keeps the names', () => {
        const { displays, monitors } = parseMacScreens({ screens, profiler })
        expect(displays).toEqual([
            { id: 'screen-0', label: 'Built-in Retina Display', x: 0, y: 0, width: 1440, height: 900, primary: true },
            { id: 'screen-1', label: 'Optoma', x: 1440, y: 0, width: 1280, height: 800, primary: false }
        ])
        expect(monitors).toBe(2)
    })

    it('reads a mirrored display as a clone', () => {
        const mirrored = JSON.stringify({ SPDisplaysDataType: [{ spdisplays_ndrvs: [
            { _name: 'Color LCD', spdisplays_main: 'spdisplays_yes' }, { _name: 'Optoma', spdisplays_mirror: 'spdisplays_on' }
        ] }] })
        const probe = readProbe({ platform: 'darwin', outputs: { screens: '[{"name":"Color LCD","x":0,"y":0,"width":1440,"height":900}]', profiler: mirrored } })
        expect(probe.cloned).toBe(true)
        expect(probe.why).toContain('mirrored')
    })
})

describe('a machine that cannot say', () => {
    it('falls back to one assumed screen and names the tool that said nothing', () => {
        const probe = readProbe({ platform: 'linux', env: { DISPLAY: ':0' }, outputs: { xrandr: '' } })
        expect(probe.assumed).toBe(true)
        expect(probe.note).toContain('xrandr')
        expect(probe.displays[0].assumed).toBe(true)
    })

    it('reports two outputs at one geometry as cloned, and does not touch them', () => {
        const displays = parseXrandr(XRANDR_TWO.replace('1280x800+2560+0', '2560x1440+0+0'))
        expect(cloneVerdict({ displays })).toEqual({ cloned: true, why: 'eDP-1 and HDMI-1-0 show the same picture (2560×1440 at 0,0)' })
        expect(cloneVerdict({ displays: parseXrandr(XRANDR_TWO) })).toEqual({ cloned: false, why: null })
    })

    it('runs the commands it was handed and nothing else', () => {
        const ran = []
        const probe = probeDisplays({ platform: 'linux', env: { DISPLAY: ':0' }, run: (command) => { ran.push(command); return XRANDR_AYLMO } })
        expect(ran).toEqual([{ key: 'xrandr', command: 'xrandr', args: ['--query'] }])
        expect(probe.displays[0].label).toBe('eDP-1')
    })
})

describe('which display a document means', () => {
    const displays = parseXrandr(XRANDR_TWO)

    it('matches an exact label, then a fragment, then the size, then the index — in that order', () => {
        expect(matchScreen(displays, { label: 'HDMI-1-0' }).id).toBe('HDMI-1-0')
        expect(matchScreen(displays, { label: 'hdmi' }).id).toBe('HDMI-1-0')
        expect(matchScreen(displays, { label: 'projector', size: [1280, 800] }).id).toBe('HDMI-1-0')
        expect(matchScreen(displays, { label: 'projector', size: [4096, 2160], index: 1 }).id).toBe('HDMI-1-0')
        expect(matchScreen(displays, { label: '', index: 0 }).id).toBe('eDP-1')
    })

    it('returns null rather than a guess, and never matches "all"', () => {
        expect(matchScreen(displays, { label: 'projector', size: [4096, 2160], index: 7 })).toBeNull()
        expect(matchScreen(displays, 'all')).toBeNull()
        expect(matchScreen([], { label: 'eDP-1' })).toBeNull()
    })

    it('prefers the exact label over one that merely contains it', () => {
        const two = [...displays, { id: 'HDMI-1', label: 'HDMI-1', x: 0, y: 1440, width: 1920, height: 1080, primary: false }]
        expect(matchScreen(two, { label: 'HDMI-1' }).id).toBe('HDMI-1')
    })
})

describe('one kiosk per assigned display', () => {
    const displays = parseXrandr(XRANDR_TWO)
    const me = 'b8592c7f-217a-4f95-8c48-07a4e08524d0'

    it('places each project on the display it names, with its own profile and port', () => {
        const plan = planDisplays({
            machineId: me, displays,
            projects: [
                { id: 'projector', mapSurfaces: 1, show: { machine: me, screen: { label: 'HDMI-1-0', index: 1, size: [1280, 800] } } },
                { id: 'panel', mapSurfaces: 1, show: { machine: me, screen: { label: 'eDP-1', index: 0, size: [2560, 1440] } } }
            ]
        })
        expect(plan.mode).toBe('shown')
        expect(plan.unplaced).toEqual([])
        expect(plan.windows.map((window) => [window.projectId, window.label, window.display.x, window.profile, window.debugPort, window.hold])).toEqual([
            ['panel', 'eDP-1', 0, 'browser-edp-1', 9334, 'hold-edp-1.html'],
            ['projector', 'HDMI-1-0', 2560, 'browser-hdmi-1-0', 9335, 'hold-hdmi-1-0.html']
        ])
    })

    it('keeps #513\'s single kiosk when no project names this machine', () => {
        const plan = planDisplays({ machineId: me, displays, projects: [{ id: 'wall', mapSurfaces: 2 }, { id: 'notes', mapSurfaces: 0 }] })
        expect(plan.mode).toBe('single')
        expect(plan.target).toEqual({ projectId: 'wall', why: 'the only mapping in this space' })
        expect(plan.windows).toEqual([{ key: 'screen 1', label: 'screen 1', projectId: 'wall', display: null, profile: 'browser', debugPort: 9333, hold: 'hold.html' }])
        // A show that names ANOTHER machine is that machine's business.
        expect(planDisplays({ machineId: me, displays, projects: [{ id: 'wall', mapSurfaces: 1, show: { machine: 'someone-else', screen: 'all' } }] }).mode).toBe('single')
        // --project still wins in single mode.
        expect(planDisplays({ machineId: me, displays, project: 'named', projects: [] }).windows[0].projectId).toBe('named')
    })

    it('says, dimly and exactly, when the named display is not on this machine — and does not crash', () => {
        const plan = planDisplays({
            machineId: me, displays: parseXrandr(XRANDR_AYLMO),
            projects: [{ id: 'projector', mapSurfaces: 1, show: { machine: me, screen: { label: 'Optoma', index: 3, size: [1280, 800] } } }]
        })
        expect(plan.windows).toEqual([])
        expect(plan.unplaced).toEqual([{ projectId: 'projector', why: 'no display "Optoma" 1280×800 #4 on this machine — it has eDP-1 2560×1440' }])
    })

    it('gives "all" one window per display, and refuses a second project the same display', () => {
        const plan = planDisplays({
            machineId: me, displays,
            projects: [
                { id: 'everywhere', mapSurfaces: 1, show: { machine: me, screen: 'all' } },
                { id: 'late', mapSurfaces: 1, show: { machine: me, screen: { label: 'eDP-1' } } }
            ]
        })
        expect(plan.windows.map((window) => `${window.projectId}@${window.label}`)).toEqual(['everywhere@eDP-1', 'everywhere@HDMI-1-0'])
        expect(plan.unplaced).toEqual([{ projectId: 'late', why: 'eDP-1 already shows everywhere' }])
    })

    it('places nothing on an assumed screen, but still opens the kiosk full-screen on it', () => {
        const probe = readProbe({ platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland' } })
        const plan = planDisplays({ machineId: me, displays: probe.displays, projects: [{ id: 'wall', mapSurfaces: 1, show: { machine: me, screen: 'all' } }] })
        expect(plan.windows).toHaveLength(1)
        expect(plan.windows[0].display).toBeNull()
    })
})

describe('did the window land where it was sent', () => {
    it('accepts a window manager\'s couple of pixels and nothing more', () => {
        const wanted = { x: 2560, y: 0, width: 1280, height: 800 }
        expect(boundsMatch({ left: 2560, top: 0, width: 1280, height: 800 }, wanted)).toBe(true)
        expect(boundsMatch({ left: 2561, top: 1, width: 1279, height: 800 }, wanted)).toBe(true)
        expect(boundsMatch({ left: 0, top: 0, width: 2560, height: 1440 }, wanted)).toBe(false)
        expect(boundsMatch(null, wanted)).toBe(false)
    })

    it('names the displays that came and went between two probes', () => {
        const before = parseXrandr(XRANDR_TWO)
        const after = parseXrandr(XRANDR_AYLMO)
        expect(displayDiff(before, after).gone.map((display) => display.id)).toEqual(['HDMI-1-0'])
        expect(displayDiff(after, before).appeared.map((display) => display.id)).toEqual(['HDMI-1-0'])
    })
})

describe('the units Chromium places windows in', () => {
    // Measured on aylmo, 2026-09-21: a 2560×1440 panel at Xft.dpi 144
    // (×1.5) — Chromium reported the fullscreen kiosk as 1707×960 at 0,0,
    // and a window launched with --window-size=800,600 came back 800×600.
    const panel = { x: 0, y: 0, width: 2560, height: 1440 }

    it('hands Chromium the display divided by the page\'s devicePixelRatio', () => {
        expect(toWindowUnits(panel, 1.5)).toEqual({ x: 0, y: 0, width: 1707, height: 960 })
        expect(toWindowUnits({ x: 2560, y: 0, width: 1280, height: 800 }, 1.5)).toEqual({ x: 1707, y: 0, width: 853, height: 533 })
        expect(toWindowUnits(panel, 1)).toEqual(panel)
        expect(toWindowUnits(panel, 0)).toEqual(panel)
    })

    it('accepts the kiosk as placed in whichever unit matched, and says which', () => {
        expect(placementVerdict({ left: 0, top: 0, width: 1707, height: 960 }, panel, 1.5)).toEqual({ ok: true, units: 'CSS pixels at ×1.5' })
        expect(placementVerdict({ left: 0, top: 0, width: 2560, height: 1440 }, panel, 1.5)).toEqual({ ok: true, units: 'the probe\'s own' })
        // At ×1 the two are the same unit; a mismatch is a mismatch.
        expect(placementVerdict({ left: 0, top: 0, width: 1707, height: 960 }, panel, 1)).toEqual({ ok: false, units: null })
        expect(placementVerdict({ left: 1707, top: 0, width: 853, height: 533 }, panel, 1.5)).toEqual({ ok: false, units: null })
        expect(placementVerdict(null, panel, 1.5)).toEqual({ ok: false, units: null })
    })
})
