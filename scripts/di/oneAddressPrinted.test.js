// @vitest-environment node
//
// ONE address in what di prints (docs/ai/one-local-address.md §7 D1 + D2, 2026-10-13).
// The owner, 2026-10-13: "fix the di.iiii links here in my machine — mine is
// local.thedi.studio, in others other — fix mine too and make only one way to work."
//
// When http://diiii.localhost/ was ASKED and answered as THIS di.iiii, `di status`
// and `di up` lead with it, and the certificate's name moves to ONE extra line for
// phones and headsets. When it was not, they print what they always printed and say
// why in one dim line. A machine that may not hold :80 yet still prints ONE NAME.
//
// The door on :80 is the one thing a test cannot open (no root, and on a machine
// with the dev-router someone else holds it), so the answer from :80 is handed in;
// everything else — the install, its server, the CLI itself — is real.
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { main } from './cli.mjs'
import { probePrettyLocalName } from './probe.mjs'
import { ONE_LOCAL_NAME, namedFallback, ownBase, phonesUrl, printedAddress } from './state.mjs'
import { ui } from './ui.mjs'

const answers = vi.hoisted(() => ({ door: null }))
vi.mock('./probe.mjs', async (importOriginal) => ({ ...(await importOriginal()), probeDoorConfig: async () => answers.door }))

// A throwaway self-signed certificate for the name local.thedi.studio (CN + SAN),
// valid to 2126, made with openssl for this test; its key was not kept. Only the
// NAME in it is read.
const CERT_PEM = String.raw`-----BEGIN CERTIFICATE-----
MIIBrzCCAVagAwIBAgIUOIyB5E0czFnzFQxxNn5632JF1KMwCgYIKoZIzj0EAwIw
HTEbMBkGA1UEAwwSbG9jYWwudGhlZGkuc3R1ZGlvMCAXDTI2MTAxMzExMDU1MloY
DzIxMjYwOTE5MTEwNTUyWjAdMRswGQYDVQQDDBJsb2NhbC50aGVkaS5zdHVkaW8w
WTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATe+TdB9tYjLstFztACVrx5oNK5PtAs
w71ysUe2gQoi5Ii6Bo6B50uUQLrL5dmnzCHbQGbNFB0Yqkzj+VeV1HYHo3IwcDAd
BgNVHQ4EFgQUUFxuyi3ko/F99f/iEG4C+k8ofDAwHwYDVR0jBBgwFoAUUFxuyi3k
o/F99f/iEG4C+k8ofDAwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHREEFjAUghJsb2Nh
bC50aGVkaS5zdHVkaW8wCgYIKoZIzj0EAwIDRwAwRAIgYw+cNo68H7r22srnqZxG
qqOXeuf4JyXfFPtj3rFaeecCIA7BAkNjr4v3GPjU142lMF2+zbMFA50hgUvEvpJT
XjmG
-----END CERTIFICATE-----`

const HERE = path.dirname(fileURLToPath(import.meta.url))
const dirs = []
const servers = []
afterEach(() => {
    answers.door = null
    delete process.env.DI_HOME
    process.exitCode = undefined
    for (const s of servers.splice(0)) s.close()
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

// eslint-disable-next-line no-control-regex
const plain = (text) => String(text).replace(/\u001b\[[0-9;]*m/g, '')
const config = (id) => ({ machine: { id, name: 'm' } })
const itIsThisDi = { askSelf: async () => config('aaa'), askDoor: async () => ({ status: 200, config: config('aaa') }) }
const nothingOnPort80 = { askSelf: async () => config('aaa'), askDoor: async () => null, askPretty: async () => null }

// a dot in the path, always (reference: the hidden-directory trap)
const installedHome = ({ cert = false, port = null } = {}) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-printed.address-'))
    dirs.push(home)
    fs.mkdirSync(path.join(home, 'versions', '1.0.0', 'serverXR', 'src'), { recursive: true })
    fs.symlinkSync(path.join(home, 'versions', '1.0.0'), path.join(home, 'current'))
    fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify({ mode: 'node', version: '1.0.0' }))
    if (port) fs.writeFileSync(path.join(home, 'di.env'), `PORT=${port}\n`)
    if (cert) {
        fs.mkdirSync(path.join(home, 'tls'))
        fs.writeFileSync(path.join(home, 'tls', 'cert.pem'), CERT_PEM)
        fs.writeFileSync(path.join(home, 'tls', 'key.pem'), 'readCert only checks that this file exists')
    }
    return home
}

describe('printedAddress: the one address when it is this di, else what was always printed', () => {
    it('this di, no certificate → the one address, nothing for phones', async () => {
        const home = installedHome()
        expect(await printedAddress(home, 4391, itIsThisDi)).toEqual({ url: 'http://diiii.localhost/', one: true, phones: null, why: null })
    })

    it('this di, with a certificate → the one address first; the certificate name only as the phones address', async () => {
        const home = installedHome({ cert: true })
        const got = await printedAddress(home, 443, itIsThisDi)
        expect(got.url).toBe('http://diiii.localhost/')
        expect(got.url).not.toContain('thedi.studio')
        expect(got).toMatchObject({ one: true, phones: 'https://local.thedi.studio', why: null })
        // off 443 the port is part of the phones address, as publicUrl always wrote it
        expect((await printedAddress(home, 4443, itIsThisDi)).phones).toBe('https://local.thedi.studio:4443')
    })

    it('not this di → the fallback, no phones line, and why', async () => {
        const home = installedHome({ cert: true })
        const got = await printedAddress(home, 443, nothingOnPort80)
        expect(got).toEqual({ url: 'https://local.thedi.studio', one: false, phones: null, why: 'nothing answers on port 80' })
        const given = await printedAddress(home, 4391, { ...nothingOnPort80, fallback: 'http://diiii.localhost:4391' })
        expect(given.url).toBe('http://diiii.localhost:4391')
        const another = await printedAddress(home, 443, { askSelf: async () => config('aaa'), askDoor: async () => ({ status: 200, config: config('bbb') }) })
        expect(another).toMatchObject({ one: false, why: expect.stringMatching(/opens another di\.iiii/) })
    })

    it('without a certificate the fallback is the old loopback address', async () => {
        const home = installedHome()
        expect((await printedAddress(home, 4391, nothingOnPort80)).url).toBe('http://localhost:4391')
    })

    it('phonesUrl is the certificate\'s address, or nothing', () => {
        expect(phonesUrl(installedHome(), 4391)).toBeNull()
        expect(phonesUrl(installedHome({ cert: true }), 443)).toBe('https://local.thedi.studio')
    })
})

describe('ownBase: where a link to one of this install\'s own pages starts', () => {
    // The page a person is sent to: <base>/<space>. Three rows, as the owner decided them.
    const link = async (home, port, asked) => `${await ownBase(home, port, asked)}/my-show`

    it('judged → http://diiii.localhost/<space>, with a certificate or without', async () => {
        expect(await link(installedHome(), 4000, itIsThisDi)).toBe('http://diiii.localhost/my-show')
        expect(await link(installedHome({ cert: true }), 443, itIsThisDi)).toBe('http://diiii.localhost/my-show')
    })

    it('not judged, with a certificate → the certificate\'s name, the port kept off 443', async () => {
        const home = installedHome({ cert: true })
        expect(await link(home, 443, nothingOnPort80)).toBe('https://local.thedi.studio/my-show')
        expect(await link(home, 4443, nothingOnPort80)).toBe('https://local.thedi.studio:4443/my-show')
    })

    it('not judged, no certificate → http://localhost:4000/<space>', async () => {
        expect(await link(installedHome(), 4000, nothingOnPort80)).toBe('http://localhost:4000/my-show')
    })

    it('another di.iiii on :80 is not this one: the old address, never the one address', async () => {
        const another = { askSelf: async () => config('aaa'), askDoor: async () => ({ status: 200, config: config('bbb') }), askPretty: async () => null }
        expect(await link(installedHome({ cert: true }), 443, another)).toBe('https://local.thedi.studio/my-show')
        expect(await link(installedHome(), 4000, another)).toBe('http://localhost:4000/my-show')
    })

    it('never ends in a slash (a path follows it) and is the address printedAddress gives, nothing of its own', async () => {
        for (const asked of [itIsThisDi, nothingOnPort80]) {
            for (const home of [installedHome(), installedHome({ cert: true })]) {
                const base = await ownBase(home, 4000, asked)
                expect(base.endsWith('/')).toBe(false)
                expect(base).toBe((await printedAddress(home, 4000, asked)).url.replace(/\/+$/, ''))
            }
        }
    })
})

describe('what di up prints', () => {
    const doors = (text) => plain(text).split('\n').filter((line) => /^\s+(tools|spaces|light|wiki)\s/.test(line))

    it('this di with a certificate: the one address leads, ONE line carries the certificate name', () => {
        const text = plain(ui.running('http://localhost:443', ['a', 'b'], {
            spaceCount: 2, prettyUrl: 'http://diiii.localhost/', secure: true, one: true, phones: 'https://local.thedi.studio'
        }))
        const lines = text.split('\n')
        expect(lines[0]).toBe('di.iiii is running.  http://diiii.localhost/')
        const withName = lines.filter((line) => line.includes('thedi.studio'))
        expect(withName).toEqual(['  phones and headsets: https://local.thedi.studio'])
        // every door hangs off the bare name — a slash too many would be a second address
        expect(doors(text).length).toBe(4)
        expect(text).toContain('http://diiii.localhost/tools')
        expect(text).not.toContain('localhost//')
        expect(text).not.toMatch(/not this di\.iiii yet/)
    })

    it('this di, no certificate: the one address, and no phones line to make up', () => {
        const text = plain(ui.running('http://localhost:4000', [], { prettyUrl: 'http://diiii.localhost/', one: true }))
        expect(text.split('\n')[0]).toBe('di.iiii is running.  http://diiii.localhost/')
        expect(text).not.toContain('phones and headsets')
        expect(text).toContain('the same link on every machine with di')
    })

    it('not this di: what it always printed, plus ONE dim line saying why', () => {
        const text = plain(ui.running('http://localhost:443', [], {
            prettyUrl: 'https://local.thedi.studio', secure: true, one: false, why: 'nothing answers on port 80'
        }))
        expect(text.split('\n')[0]).toBe('di.iiii is running.  https://local.thedi.studio')
        expect(text.split('\n').filter((line) => line.includes('is not this di.iiii yet'))).toEqual([
            '  http://diiii.localhost/ is not this di.iiii yet: nothing answers on port 80'
        ])
        expect(text).not.toContain('phones and headsets')
    })

    it('a .localhost name is this machine only — it is never called an address "on the phones"', () => {
        const text = plain(ui.running('http://localhost:4000', [], { prettyUrl: 'http://diiii.localhost:4000', one: false, why: 'nothing answers on port 80' }))
        expect(text).not.toMatch(/on the phones/)
        expect(text).toContain('this machine only')
        // the room's own name (di.local, --lan) is still one address for the phones
        expect(plain(ui.running('http://localhost:4000', [], { prettyUrl: 'http://di.local:4000' }))).toMatch(/here and on the phones/)
    })

    it('already running says the same: the one address, the phones line, or why not', () => {
        const judged = plain(ui.alreadyRunning('http://diiii.localhost/', { lan: false }, false, { one: true, phones: 'https://local.thedi.studio' })).split('\n')
        expect(judged).toEqual(['already running — http://diiii.localhost/  this machine only', '  phones and headsets: https://local.thedi.studio'])
        const notJudged = plain(ui.alreadyRunning('https://local.thedi.studio', { lan: false }, false, { one: false, why: 'nothing answers on port 80' })).split('\n')
        expect(notJudged).toEqual(['already running — https://local.thedi.studio  this machine only', '  http://diiii.localhost/ is not this di.iiii yet: nothing answers on port 80'])
        // callers from before the fourth argument still print one line
        expect(plain(ui.alreadyRunning('http://localhost:4000'))).toBe('already running — http://localhost:4000')
    })

    it('the wiring in cmdUp: the judgement decides the card and the browser; --lan still hands phones the certificate name', () => {
        const cli = fs.readFileSync(path.join(HERE, 'cli.mjs'), 'utf8')
        const up = cli.slice(cli.indexOf('const cmdUp'), cli.indexOf('Mention a newer version'))
        expect(up).toContain('printedAddress(home, port')
        expect(up).toContain('openBrowser(address.url)')
        expect(up).toMatch(/ui\.running\([\s\S]{0,400}one: address\.one/)
        expect(up).toMatch(/ui\.alreadyRunning\(address\.url/)
        // phones in the room are told the certificate's name, never a .localhost one
        expect(up).toContain('cert ? prettyUrl : (named ? nameUrl(named, port) : null)')
    })
})

describe('one NAME even before :80 is allowed', () => {
    it('the pretty-name probe asks diiii.localhost, and prints it only when it answered', async () => {
        const asked = []
        const ask = async (port, host, basePath, scheme) => { asked.push({ port, host, basePath, scheme }); return true }
        expect(await probePrettyLocalName(4391, undefined, 'http', { ask })).toBe(ONE_LOCAL_NAME)
        expect(asked).toEqual([{ port: 4391, host: 'diiii.localhost', basePath: '/serverXR', scheme: 'http' }])
        expect(await probePrettyLocalName(4391, undefined, 'http', { ask: async () => false })).toBeNull()
    })

    it('no second name is left in what di prints or in the wiki', () => {
        const files = [
            ...fs.readdirSync(HERE).filter((name) => name.endsWith('.mjs')).map((name) => path.join(HERE, name)),
            path.join(HERE, '..', '..', 'src', 'wiki', 'wikiContent.js')
        ]
        expect(files.length).toBeGreaterThan(10)
        for (const file of files) expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/\bdi\.localhost\b/)
    })
})

// The real CLI, in this process, against a real (fake) server on a spare port and
// a real install directory — only the answer from :80 is handed in.
describe('the real `di status` and `di up` on an install', () => {
    const listen = (handler) => new Promise((resolve) => {
        const s = http.createServer(handler).listen(0, '127.0.0.1', () => { servers.push(s); resolve(s.address().port) })
    })
    const install = async () => {
        const port = await listen((req, res) => {
            res.setHeader('content-type', 'application/json')
            // a POST body is read and dropped; only the answer matters here
            const reply = (body) => req.on('end', () => res.end(body)).resume()
            if (req.url === '/serverXR/api/health') return res.end('{"ok":true}')
            if (req.url === '/serverXR/api/config') return res.end(JSON.stringify({ config: config('aaa') }))
            if (req.method === 'POST' && req.url === '/serverXR/api/spaces') return reply('{"space":{"id":"my-show"}}')
            if (req.method === 'POST' && req.url === '/serverXR/api/spaces/bundle') return reply('{"spaceId":"my-show"}')
            res.statusCode = 404
            return res.end('{}')
        })
        return { home: installedHome({ port }), port }
    }
    const run = async (home, ...argv) => {
        process.env.DI_HOME = home
        const before = process.argv
        process.argv = ['node', 'di', ...argv]
        const out = []
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { out.push(String(chunk)); return true })
        try { await main() } finally { spy.mockRestore(); process.argv = before }
        return plain(out.join('')).split('\n')
    }

    it('status leads with the one address when :80 answers as this di', async () => {
        const { home, port } = await install()
        answers.door = { status: 200, config: config('aaa') }
        const lines = await run(home, 'status')
        expect(lines[0]).toMatch(/^running \(node\) · 1\.0\.0 · http:\/\/diiii\.localhost\/( · |$)/)
        expect(lines[0]).not.toContain(`localhost:${port}`)
        expect(lines.join('\n')).not.toMatch(/not this di\.iiii yet/)
    })

    it('status falls back to the one name with its port (it answers there) and says why in ONE line when :80 is silent, or another di', async () => {
        const { home, port } = await install()
        answers.door = null
        let lines = await run(home, 'status')
        expect(lines[0]).toContain(`http://diiii.localhost:${port}`)
        expect(lines.filter((line) => line.includes('is not this di.iiii yet'))).toEqual(['http://diiii.localhost/ is not this di.iiii yet: nothing answers on port 80'])
        answers.door = { status: 200, config: config('bbb') }
        lines = await run(home, 'status')
        expect(lines.filter((line) => line.includes('is not this di.iiii yet')).length).toBe(1)
        expect(lines.join('\n')).toContain('opens another di.iiii on this machine')
    })

    it('di up on a running install prints the one address too', async () => {
        const { home, port } = await install()
        answers.door = { status: 200, config: config('aaa') }
        const lines = await run(home, 'up', '--no-open')
        expect(lines[0]).toMatch(/^already running — http:\/\/diiii\.localhost\//)
        answers.door = null
        const fallback = await run(home, 'up', '--no-open')
        expect(fallback[0]).toContain(`already running — http://diiii.localhost:${port}`)
        expect(fallback.join('\n')).toContain('is not this di.iiii yet: nothing answers on port 80')
    })

    it('di new prints the link to the new space under the one address too, and the one name with its port when it is not judged', async () => {
        const { home, port } = await install()
        answers.door = { status: 200, config: config('aaa') }
        expect((await run(home, 'new', 'my', 'show')).slice(0, 2)).toEqual(['made my-show.', '  http://diiii.localhost/my-show'])
        answers.door = null
        expect((await run(home, 'new', 'my', 'show')).slice(0, 2)).toEqual(['made my-show.', `  http://diiii.localhost:${port}/my-show`])
    })

    it('di open FILE prints the link to the opened space under the one address too, and the one name with its port when it is not judged', async () => {
        const { home, port } = await install()
        const file = path.join(home, 'my-show.diiii')
        fs.writeFileSync(file, 'the fake server takes any bytes')
        answers.door = { status: 200, config: config('aaa') }
        expect((await run(home, 'open', file)).slice(0, 2)).toEqual(['opened my-show.', '  http://diiii.localhost/my-show'])
        answers.door = null
        expect((await run(home, 'open', file)).slice(0, 2)).toEqual(['opened my-show.', `  http://diiii.localhost:${port}/my-show`])
    })
})

describe('every link di prints to its own pages is decided in one place', () => {
    const cli = fs.readFileSync(path.join(HERE, 'cli.mjs'), 'utf8')
    const between = (from, to) => cli.slice(cli.indexOf(from), cli.indexOf(to))

    it('di open asks printedAddress, not a copy of its rule; the browser gets what was printed', () => {
        const open = between('const cmdOpen = ', 'THE FILE MENU')
        expect(open).toContain('printedAddress(home, port)')
        expect(open).not.toMatch(/\boneAddress\(|publicUrl\(/)
        expect(open).toMatch(/say\(url\)\s+openBrowser\(url\)/)
    })

    it('di open FILE (running, and stopped) and di new build the link to the space on ownBase', () => {
        const opened = [...between('const cmdOpenFile = ', 'const cmdNew = ').matchAll(/ui\.opened\(.*\)/g)]
        const made = [...between('const cmdNew = ', 'const cmdMove = ').matchAll(/ui\.made\(.*\)/g)]
        const printed = [...opened, ...made].map((match) => match[0])
        expect(printed.length).toBe(3)
        for (const line of printed) {
            expect(line).toContain('await ownBase(home')
            expect(line).not.toMatch(/publicUrl\(|localUrl\(/)
        }
    })

    it('left on the certificate\'s name on purpose: the projector machine\'s kiosk and health, and the base di ndi scan asks', () => {
        const stage = fs.readFileSync(path.join(HERE, 'stage.mjs'), 'utf8')
        expect(stage).toContain('publicUrl(home, port)')
        expect(stage).not.toContain('ownBase')
        expect(between('const cmdNdi = ', 'const cmdStage = ')).toContain('publicUrl(home, resolvePort(home))')
    })
})

describe('one rule for the fallback: a machine without :80 still says ONE thing (owner 2026-10-13: "make only one way to work")', () => {
    const nameAnswers = { ...nothingOnPort80, askPretty: async () => ONE_LOCAL_NAME }

    it('no certificate, the one name answers on the port → http://diiii.localhost:<port> in status, open, new and open FILE alike', async () => {
        const home = installedHome()
        expect((await printedAddress(home, 4000, nameAnswers)).url).toBe('http://diiii.localhost:4000')
        expect(`${await ownBase(home, 4000, nameAnswers)}/my-show`).toBe('http://diiii.localhost:4000/my-show')
        expect(await namedFallback(home, 4000, nameAnswers)).toBe('http://diiii.localhost:4000')
    })

    it('no certificate, the name does not answer → localhost:<port>, as before', async () => {
        expect(await namedFallback(installedHome(), 4000, { askPretty: async () => null })).toBe('http://localhost:4000')
    })

    it('a certificate wins, and the name is then not asked at all', async () => {
        const askPretty = vi.fn(async () => ONE_LOCAL_NAME)
        expect(await namedFallback(installedHome({ cert: true }), 443, { askPretty })).toBe('https://local.thedi.studio')
        expect(askPretty).not.toHaveBeenCalled()
    })
})
