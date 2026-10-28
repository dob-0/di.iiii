import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// What the installer and the di command tell a person to do must be something
// that works. Three lines did not (2026-09-27): the no-node failure offered
// Docker Desktop although the di command itself runs on node, detect named a
// --docker flag nothing reads, and every "install it with" printed the old
// host. The old host still serves the same bytes for printed handouts
// (docs/deploy/DI_CLI.md), but new lines name diiii.xyz.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const SURFACES = [
    'install.sh',
    'install.ps1',
    'scripts/di/shim/di',
    'scripts/di/shim/di.cmd',
    'scripts/di/ui.mjs',
    'docs/deploy/SELF_HOST.md'
]

describe('install lines', () => {
    it.each(SURFACES)('%s prints the diiii.xyz install line, not the old host', (rel) => {
        const text = read(rel)
        expect(text).not.toMatch(/di-studio\.xyz\/get/)
        expect(text).toMatch(/diiii\.xyz\/get/)
    })

    it('the no-node failure does not offer docker, which cannot run the di command', () => {
        const sh = read('install.sh')
        const start = sh.indexOf('di.iiii could not start on this machine.')
        const message = sh.slice(start, sh.indexOf('Nothing was installed.', start))
        expect(start).toBeGreaterThan(-1)
        expect(message).not.toMatch(/docker/i)
        expect(message).toMatch(/Node\.js 22\.15 or newer/)
    })

    // install.ps1 said the opposite until 2026-10-21: "Pick whichever sounds
    // easier", Docker Desktop first. Running the line again after installing
    // Docker hits the same wall, so both installers now say the one way out.
    it('install.ps1 offers no docker anywhere and says what install.sh says', () => {
        const ps1 = read('install.ps1')
        expect(ps1).not.toMatch(/docker/i)
        const start = ps1.indexOf('di.iiii could not start on this machine.')
        const message = ps1.slice(start, ps1.indexOf('Nothing was installed.', start))
        expect(start).toBeGreaterThan(-1)
        expect(message).toMatch(/Install Node\.js 22\.15 or newer from https:\/\/nodejs\.org/)
        expect(message).toMatch(/then run this line again\./)
    })

    it('install.ps1 says at its top why it is ASCII', () => {
        const head = read('install.ps1').split('\n').slice(0, 30).join('\n')
        expect(head).toMatch(/PowerShell 5\.1/)
        expect(head).toMatch(/byte-order mark/)
        expect(head).toMatch(/charset/)
    })

    it('di doctor, with no runtime, says the one way out, not docker', async () => {
        process.env.NO_COLOR = '1'
        const { ui } = await import('./ui.mjs')
        const text = ui.noRuntime()
        expect(text).not.toMatch(/docker/i)
        expect(text).not.toMatch(/pick whichever/i)
        expect(text).toMatch(/Node\.js 22\.15 or newer from https:\/\/nodejs\.org/)
        expect(text).toMatch(/nothing was installed\./i)
    })

    it('detect names no flag the CLI does not read', () => {
        expect(read('scripts/di/detect.mjs')).not.toMatch(/\(--docker\)/)
    })
})
