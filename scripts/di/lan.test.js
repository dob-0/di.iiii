// @vitest-environment node
//
// `di up --lan` — a phone in the same room can open the festival machine.
//
// The install binds 127.0.0.1 on purpose (a café's wifi must not be an editor
// with auth off), and until this flag there was no other way to start it: the
// lighting desk printed a LAN URL and a QR that no phone could open. The flag
// is per start and written nowhere; the server is asked, never a file, when
// `status` or `where` say which bind is in force.
import { describe, expect, it } from 'vitest'

import { parseArgs } from './args.mjs'
import { probeLanAddresses } from './probe.mjs'
// ?raw hands us the file's text without executing it — cli.mjs runs its
// command on import, and vitest serves this module over an http-scheme URL so
// import.meta.url cannot be given to fs.
import cli from './cli.mjs?raw'
import runner from './runner-node.mjs?raw'
import ui from './ui.mjs?raw'

describe('parsing --lan', () => {
    it('is a bare switch that eats nothing after it', () => {
        expect(parseArgs(['up', '--lan'])).toEqual({ _: ['up'], flags: { lan: true } })
        expect(parseArgs(['open', '--lan', 'my-show.diiii'])).toEqual({ _: ['open', 'my-show.diiii'], flags: { lan: true } })
    })

    it('sits anywhere on the line beside the flags that do take a value', () => {
        expect(parseArgs(['up', '--lan', '--port', '4100', '--no-open']))
            .toEqual({ _: ['up'], flags: { lan: true, port: '4100', 'no-open': true } })
        expect(parseArgs(['up', '--port', '4100', '--lan']).flags).toEqual({ port: '4100', lan: true })
    })

    it('is absent, not false, on a plain start — loopback is the default', () => {
        expect(parseArgs(['up']).flags.lan).toBeUndefined()
    })
})

describe('the addresses a phone could type', () => {
    const table = {
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }, { address: '::1', family: 'IPv6', internal: true }],
        wlp3s0: [
            { address: '192.168.1.5', family: 'IPv4', internal: false },
            { address: 'fe80::1%wlp3s0', family: 'IPv6', internal: false }
        ],
        tailscale0: [{ address: '100.64.0.3', family: 'IPv4', internal: false }]
    }

    it('are the non-internal IPv4 ones, one per interface, with the interface named', () => {
        expect(probeLanAddresses(table)).toEqual([
            { iface: 'wlp3s0', address: '192.168.1.5' },
            { iface: 'tailscale0', address: '100.64.0.3' }
        ])
    })

    it('reads the numeric family older node versions report, and survives an empty table', () => {
        expect(probeLanAddresses({ eth0: [{ address: '10.0.0.9', family: 4, internal: false }] }))
            .toEqual([{ iface: 'eth0', address: '10.0.0.9' }])
        expect(probeLanAddresses({})).toEqual([])
    })
})

describe('what `di up --lan` does', () => {
    const up = cli.slice(cli.indexOf('const cmdUp'), cli.indexOf('const CHECK_EVERY_MS'))

    it('binds every interface only under the flag, loopback otherwise', () => {
        expect(up).toContain("host: lan ? '0.0.0.0' : '127.0.0.1'")
    })

    it('persists nothing about it — the only thing written is the port', () => {
        const writes = up.match(/writeEnv\(.*\)/g) || []
        expect(writes).toEqual(['writeEnv(home, { PORT: String(port) })'])
        expect(up).not.toContain('writeState')
    })

    it('prints the addresses and exactly one warning that the room can edit', () => {
        // The addresses are printed under --lan and nowhere else. Asserted as a
        // shape, not as one line of source: the block also publishes the mDNS
        // name now, and a guard that pins formatting fails on every rewrite
        // that keeps the rule.
        expect(up).toMatch(/if \(lan\)[\s\S]{0,600}ui\.onThisNetwork\(/)
        expect(up.split('ui.onThisNetwork(').length - 1).toBe(1)
        const warning = 'anyone on this network can open and edit it — auth is off.'
        expect(ui.split(warning).length - 1).toBe(1)
        expect(ui).toContain("no address yet — join a wifi or a hotspot")
    })

    it('refuses in docker mode rather than pretending, before it looks for a running server', () => {
        // A docker install that is up would otherwise be told "on this network
        // too" — the container binds 0.0.0.0, the compose publishes 127.0.0.1.
        const refused = up.indexOf("runner.describe(home).mode === 'docker') { fail(ui.lanNotInDocker())")
        const alreadyRunning = up.indexOf('if (await probeHealth(port)) { say(ui.alreadyRunning(')
        expect(refused).toBeGreaterThan(-1)
        expect(alreadyRunning).toBeGreaterThan(-1)
        expect(refused).toBeLessThan(alreadyRunning)
    })

    it('is offered in the help', () => {
        expect(ui).toContain('--lan        answer on this wifi too')
    })
})

describe('the runner under --lan', () => {
    it('hands the bind to the server as HOST', () => {
        expect(runner).toContain('HOST: host,')
        expect(runner).toContain("host = '127.0.0.1'")
    })

    it('opens the device routes to the room only on a wildcard bind', () => {
        // The lighting desk's Touch page sits behind DI_ALLOW_LAN_DEVICES; a
        // --lan start that left it closed would still 403 every phone.
        expect(runner).toContain("...(wildcard ? { DI_ALLOW_LAN_DEVICES: '1' } : {})")
        expect(runner).toContain("const wildcard = host === '0.0.0.0' || host === '::'")
    })

    it('waits for the server on loopback, since 0.0.0.0 is not an address on every OS', () => {
        // With a certificate the wait asks on the certificate's own name — a
        // browser would too, and 127.0.0.1 fails the hostname check. Without
        // one, the loopback rule this guard was written for still holds.
        expect(runner).toContain("wildcard ? '127.0.0.1' : host")
        expect(runner).toMatch(/probeHealth\(port, probeHost/)
    })
})

describe('status and where ask the server which bind is in force', () => {
    it('reads /api/config rather than any file, in both commands', () => {
        const status = cli.slice(cli.indexOf('const cmdStatus'), cli.indexOf('const cmdOpen ='))
        const where = cli.slice(cli.indexOf('const cmdWhere'), cli.indexOf('const cmdDoctor'))
        expect(status).toContain('const reach = await probeReach(home, port)')
        expect(where).toContain('const reach = running ? await probeReach(home, port) : null')
        expect(where).toContain('`reach  ${')
    })

    it('says the two states in plain words', () => {
        expect(ui).toContain("'this machine only'")
        expect(ui).toContain('this network — ')
    })

    it('never asks a docker install — its container binds 0.0.0.0 but the compose publishes 127.0.0.1', () => {
        // One helper answers loopback for docker and asks the server otherwise;
        // every site in the CLI goes through it, so no command can repeat the
        // container's own answer.
        const helper = cli.slice(cli.indexOf('const probeReach'), cli.indexOf('const cmdUp'))
        expect(helper).toContain("readState(home).mode === 'docker' ? { lan: false, addresses: [] } : probeListen(port)")
        expect(cli.split('probeListen(port)').length - 1).toBe(1)
        // open-file, update and restore each ask before their stop; status, where and
        // the already-running branch of up ask to report the reach.
        expect(cli.split('probeReach(home, ').length - 1).toBe(6)
    })
})

describe('a restart keeps the bind it found', () => {
    // `di open FILE` and `di update` stop the server and start it again. Coming
    // back on loopback after a --lan start would drop every phone in the room
    // without a word, so the bind is asked BEFORE the stop and handed back.
    it('asks before stopping, in open-file and in update', () => {
        for (const [from, to] of [['const cmdOpenFile', 'const cmdNew'], ['const cmdUpdate', 'const cmdLink'], // `di restore --snapshot` stops and stays down by design, so the slice starts
            // at the file path's own comment rather than at the command.
            ['// Out of the way first, like the snapshot path above', 'const cmdUninstall']]) {
            const body = cli.slice(cli.indexOf(from), cli.indexOf(to))
            const asked = body.indexOf('const wasLan = wasRunning ? Boolean((await probeReach(home, ')
            const stopped = body.indexOf('.stop({ home })')
            const restarted = body.indexOf("flags: { 'no-open': true, lan: wasLan }")
            expect(asked, `${from.slice(0, 40)} never asks`).toBeGreaterThan(-1)
            expect(asked, `${from.slice(0, 40)} asks after stopping`).toBeLessThan(stopped)
            expect(restarted, `${from.slice(0, 40)} restarts without the bind`).toBeGreaterThan(stopped)
        }
    })
})
