import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createCardSource } from './card.js'

let tmpRoot

beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-card-test-'))
})

afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
})

function write(relPath, content) {
    const full = path.join(tmpRoot, relPath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
}

function fakeOs({ platform = 'linux', cores = 4, uptime = 12345, interfaces = {}, totalmem, freemem, cpusThrows = false } = {}) {
    return {
        platform: () => platform,
        uptime: () => uptime,
        cpus: () => {
            if (cpusThrows) throw new Error('no cpu info')
            return Array.from({ length: cores }, () => ({
                times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 }
            }))
        },
        networkInterfaces: () => interfaces,
        totalmem: () => (totalmem != null ? totalmem : 0),
        freemem: () => (freemem != null ? freemem : 0)
    }
}

function rejectingExec() {
    return () => Promise.reject(Object.assign(new Error('command not found'), { code: 'ENOENT' }))
}

// --- Fixture 1: "asuz" (ASUS X502CA) ------------------------------------

function buildAsuzFixture() {
    write('/sys/class/drm/card0-HDMI-A-1/status', 'connected\n')
    write('/sys/class/drm/card0-HDMI-A-1/modes', '1920x1080\n1920x1080i\n')
    write('/sys/class/drm/card0-LVDS-1/status', 'connected\n')
    write('/sys/class/drm/card0-LVDS-1/modes', '1366x768\n')
    write('/sys/class/drm/card0-DP-1/status', 'disconnected\n')
    write('/sys/class/drm/card0-VGA-1/status', 'disconnected\n')

    write('/proc/asound/cards', ' 0 [PCH             ]: HDA-Intel - HDA Intel PCH\n                      HDA Intel PCH at 0xf7238000 irq 16\n')
    write('/proc/asound/pcm', '00-00: ALC269VB Analog : ALC269VB Analog : playback 1 : capture 1\n00-03: HDMI 0 : Optoma 1080P : playback 1\n')

    write('/dev/video0', '')
    write('/sys/class/video4linux/video0/name', 'USB2.0 HD UVC WebCam\n')

    write('/proc/meminfo', 'MemTotal:        3898928 kB\nMemAvailable:    2000000 kB\n')
    write('/proc/stat', 'cpu  100 200 300 900 50 0 0 0 0 0\n')

    write('/sys/class/hwmon/hwmon0/name', 'coretemp\n')
    write('/sys/class/hwmon/hwmon0/temp1_input', '77000\n')

    write('/sys/class/net/wlp2s0f0/wireless', '')
    write('/sys/class/net/wlp2s0f0/operstate', 'up\n')
    write('/sys/class/net/wlp2s0f0/device', '')
    write('/sys/class/net/enp3s0/device', '')
    write('/sys/class/net/enp3s0/operstate', 'down\n')
    write('/sys/class/net/tailscale0/operstate', 'unknown\n')
}

describe('createCardSource — asuz (ASUS X502CA, real measured fixture)', () => {
    it('reads screens, audio, camera, mem, temp, net and derives part "stage"', async () => {
        buildAsuzFixture()
        const source = createCardSource({
            env: {},
            fsRoot: tmpRoot,
            exec: rejectingExec(),
            os: fakeOs({
                cores: 2,
                interfaces: {
                    wlp2s0f0: [{ address: '192.168.88.179', internal: false, family: 'IPv4' }],
                    enp3s0: [],
                    tailscale0: [{ address: '100.72.53.77', internal: false, family: 'IPv4' }]
                }
            })
        })

        const started = Date.now()
        const card = await source.read()
        expect(Date.now() - started).toBeLessThan(500)

        expect(card.ports.screens).toEqual(
            expect.arrayContaining([
                { name: 'HDMI-A-1', connected: true, width: 1920, height: 1080 },
                { name: 'LVDS-1', connected: true, width: 1366, height: 768 },
                { name: 'DP-1', connected: false, width: null, height: null },
                { name: 'VGA-1', connected: false, width: null, height: null }
            ])
        )
        expect(card.ports.screens).toHaveLength(4)

        expect(card.ports.audioOut).toEqual(
            expect.arrayContaining([{ name: 'HDA Intel PCH, ALC269VB Analog' }, { name: 'HDA Intel PCH, Optoma 1080P' }])
        )
        expect(card.ports.audioIn).toEqual([{ name: 'HDA Intel PCH, ALC269VB Analog' }])

        expect(card.ports.cameras).toEqual([{ name: 'USB2.0 HD UVC WebCam', path: '/dev/video0' }])
        expect(card.ports.serial).toEqual([])
        expect(card.ports.midi).toEqual([])
        expect(card.ports.net).toEqual([
            { iface: 'enp3s0', kind: 'ethernet', up: false, addresses: [] },
            { iface: 'tailscale0', kind: 'other', up: true, addresses: ['100.72.53.77'] },
            { iface: 'wlp2s0f0', kind: 'wifi', up: true, addresses: ['192.168.88.179'] }
        ])

        expect(card.health.tempC).toBe(77)
        expect(card.health.memTotalMb).toBe(Math.round(3898928 / 1024))
        expect(card.health.memUsedMb).toBe(Math.round((3898928 - 2000000) / 1024))
        expect(typeof card.health.cpuPct).toBe('number')
        expect(card.health.throttled).toBeNull()
        expect(card.health.uptimeS).toBe(12345)

        expect(card.part).toBe('stage')
        expect(card.partReason).toContain('2 cores')
        expect(card.partReason).toContain('a screen connected')

        expect(card.shows).toEqual([{ output: null, url: null }])
    }, 2000)

    it('caches for 2s: a second read within the window returns the same object', async () => {
        buildAsuzFixture()
        const source = createCardSource({ env: {}, fsRoot: tmpRoot, exec: rejectingExec(), os: fakeOs({ cores: 2 }) })
        const first = await source.read()
        const second = await source.read()
        expect(second).toBe(first)
    })
})

// --- Fixture 2: "r-di" (Raspberry Pi 3 B+) -------------------------------

describe('createCardSource — r-di (Pi 3 B+, no screen, throttled)', () => {
    it('derives part "hands" and reports vcgencmd throttle state', async () => {
        write('/proc/meminfo', 'MemTotal:         926000 kB\nMemAvailable:     300000 kB\n')
        write('/proc/stat', 'cpu  50 0 10 500 5 0 0 0 0 0\n')

        const execFn = (cmd) => {
            if (cmd.includes('vcgencmd')) return Promise.resolve({ stdout: 'throttled=0x50005\n', stderr: '' })
            return Promise.reject(new Error('unexpected command'))
        }

        const source = createCardSource({
            env: {},
            fsRoot: tmpRoot,
            exec: execFn,
            os: fakeOs({ cores: 4 })
        })

        const card = await source.read()

        expect(card.ports.screens).toEqual([])
        expect(card.part).toBe('hands')
        expect(card.health.memTotalMb).toBe(Math.round(926000 / 1024))
        expect(card.health.throttled).toEqual({ now: true, underVoltage: true, raw: '0x50005' })
    }, 2000)
})

// --- Fixture 3: DI_PART override -----------------------------------------

describe('createCardSource — DI_PART override', () => {
    it('wins over every measurement', async () => {
        // Hardware that would otherwise compute to "hands" (no screen, tiny mem).
        write('/proc/meminfo', 'MemTotal:         500000 kB\n')

        const source = createCardSource({
            env: { DI_PART: 'studio' },
            fsRoot: tmpRoot,
            exec: rejectingExec(),
            os: fakeOs({ cores: 1 })
        })

        const card = await source.read()
        expect(card.part).toBe('studio')
        expect(card.partReason).toBe('set by DI_PART')
    })
})

// --- Fixture 4: missing everything ----------------------------------------

describe('createCardSource — missing everything', () => {
    it('returns nulls/[] honestly and never throws', async () => {
        const source = createCardSource({
            env: {},
            fsRoot: tmpRoot, // empty dir, nothing written
            exec: rejectingExec(),
            os: fakeOs({ cpusThrows: true })
        })

        // If read() ever throws, this await rejects and the test fails —
        // that is the "never throws" assertion.
        const card = await source.read()

        expect(card.ports).toEqual({ screens: [], audioOut: [], audioIn: [], cameras: [], serial: [], midi: [], net: [] })
        expect(card.health.tempC).toBeNull()
        expect(card.health.cpuPct).toBeNull()
        expect(card.health.memUsedMb).toBeNull()
        expect(card.health.memTotalMb).toBeNull()
        expect(card.health.throttled).toBeNull()
        expect(typeof card.health.uptimeS).toBe('number')
        expect(card.shows).toEqual([{ output: null, url: null }])
        expect(card.part).toBe('studio')
        expect(card.partReason).toBe('unknown cores, unknown memory, no screen connected')
    }, 2000)
})

// --- Bonus: non-Linux platforms report honestly, not with Linux guesses ---

describe('createCardSource — macOS/Windows', () => {
    it('reports ports [] except net, and health from os, temp null', async () => {
        // Even if a fixture tree happens to exist, the non-Linux branch must
        // never touch /sys or /proc — everything comes from the os module.
        const source = createCardSource({
            env: {},
            fsRoot: tmpRoot,
            exec: rejectingExec(),
            os: fakeOs({
                platform: 'darwin',
                cores: 8,
                totalmem: 16 * 1024 * 1024 * 1024,
                freemem: 4 * 1024 * 1024 * 1024,
                interfaces: { en0: [{ address: '10.0.0.5', internal: false, family: 'IPv4' }] }
            })
        })

        const card = await source.read()

        expect(card.ports).toEqual({
            screens: [],
            audioOut: [],
            audioIn: [],
            cameras: [],
            serial: [],
            midi: [],
            net: [{ iface: 'en0', kind: null, up: true, addresses: ['10.0.0.5'] }]
        })
        expect(card.health.tempC).toBeNull()
        expect(card.health.memTotalMb).toBe(16 * 1024)
        expect(card.health.memUsedMb).toBe(12 * 1024)
        expect(typeof card.health.cpuPct).toBe('number')
        expect(card.health.throttled).toBeNull()
    }, 2000)
})
