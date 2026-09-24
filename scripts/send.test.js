import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { lookLines, parseSendArgs, planSend } from './send.mjs'

const plan = (argv) => planSend(parseSendArgs(argv))

describe('send — what it decides before touching anything', () => {
    it('goes to the rehearsal tier when no tier is named', () => {
        const p = plan(['wcc'])
        expect(p.tier).toBe('dev')
        expect(p.site).toBe('https://dev.diiii.xyz')
    })

    it('applies directly when it may, and proposes when it may not — the server decides, not a flag', () => {
        // `--direct` is "auto": apply if this person is on the space's trusted
        // list, hold it for approval otherwise. One command for both people.
        expect(plan(['wcc']).proposeArgv).toContain('--direct')
        expect(plan(['wcc', '--as-proposal']).proposeArgv).not.toContain('--direct')
    })

    it('refuses the public site unless the owner\'s word is on the command', () => {
        expect(() => plan(['wcc', '--to', 'prod'])).toThrow(/public site/)
        expect(plan(['wcc', '--to', 'prod', '--allow-production']).tier).toBe('prod')
    })

    it('takes the tier names people actually type', () => {
        expect(plan(['wcc', '--to', 'staging']).tier).toBe('dev')
        expect(plan(['wcc', '--to', 'rehearsal']).tier).toBe('dev')
        expect(() => plan(['wcc', '--to', 'live'])).toThrow(/public site/)
        expect(() => plan(['wcc', '--to', 'somewhere'])).toThrow(/unknown tier/)
    })

    it('asks which space rather than guessing one', () => {
        expect(() => plan([])).toThrow(/which space/)
        expect(() => plan(['Not A Space'])).toThrow(/is not a space id/)
    })

    it('refuses an option it does not know instead of dropping it silently', () => {
        expect(() => parseSendArgs(['wcc', '--force'])).toThrow(/unknown option --force/)
        expect(() => parseSendArgs(['wcc', 'extra'])).toThrow(/unexpected argument/)
    })

    it('passes the person through, so an approver sees whose work it is', () => {
        expect(plan(['wcc', '--from', 'Emilya']).proposeArgv).toEqual(
            expect.arrayContaining(['--from', 'Emilya'])
        )
    })

    // The server refuses a file that removes media unless the sender names the
    // exact count (contentProposals.js, 2026-09-18 incident). send carries it.
    it('carries --accept-loss through as given, and sends none when it is absent', () => {
        expect(plan(['wcc', '--accept-loss', '76']).proposeArgv).toEqual(expect.arrayContaining(['--accept-loss', '76']))
        expect(plan(['wcc']).proposeArgv).not.toContain('--accept-loss')
    })

    it('carries a dry run through and prints no links for it', () => {
        expect(plan(['wcc', '--dry-run']).proposeArgv).toContain('--dry-run')
    })

    it('names the two addresses to look at, never a temporary one', () => {
        expect(lookLines(plan(['wcc']))).toEqual([
            'look at it: https://dev.diiii.xyz/wcc',
            '           https://dev.diiii.xyz/wcc/studio'
        ])
    })

    it('sends you to this machine\'s own address for the local tier, not a bare path', () => {
        const p = plan(['wcc', '--to', 'local'])
        expect(lookLines(p, { LOCAL_API_URL: 'http://localhost:4123/serverXR' })[0])
            .toBe('look at it: http://localhost:4123/wcc')
        expect(lookLines(p, {})).toEqual(['look at it on this machine: /wcc'])
    })
})

// The decisions above are tested against the module; these two run the real
// script, so a refusal that only exists in a pure function cannot pass while
// the command itself sails on. Neither reaches a database or a tier.
describe('sendRefusals — the script itself, spawned', () => {
    const execFileAsync = promisify(execFile)
    const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const SCRIPT = path.join(ROOT_DIR, 'scripts', 'send.mjs')
    const run = async (args) => {
        try {
            const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, ...args], { cwd: ROOT_DIR })
            return { code: 0, out: stdout + stderr }
        } catch (error) {
            return { code: error.code ?? 1, out: (error.stdout || '') + (error.stderr || '') }
        }
    }

    it('refuses the public site before it exports anything', async () => {
        const { code, out } = await run(['wcc', '--to', 'prod'])
        expect(code).toBe(1)
        expect(out).toMatch(/public site/)
        expect(out).not.toMatch(/exporting/)
    })

    it('agrees with the bundle tool about what a space id looks like', async () => {
        const { code, out } = await run(['Not A Space'])
        expect(code).toBe(1)
        expect(out).toMatch(/is not a space id/)
    })
})
