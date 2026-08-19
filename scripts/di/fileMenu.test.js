// @vitest-environment node
//
// The Blender shape: you install the app, and your work is files you open and
// save. The document format already existed — a space bundle carries the scene,
// the whole op-log, every project and asset, portable to any install — but it
// had no door on it: `node scripts/space-bundle.mjs export <id>` is not a thing
// anyone saves their work with. These are the properties the door has to have.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const read = (p) => fs.readFileSync(path.join(HERE, p), 'utf8')
const cli = read('./cli.mjs')
const ui = read('./ui.mjs')
const bundle = read('../space-bundle.mjs')

describe('the file menu exists', () => {
    it('routes new, save, open and spaces', () => {
        for (const verb of ['new: cmdNew', 'save: cmdSave', 'spaces: cmdSpaces', 'open: cmdOpen']) {
            expect(cli, `${verb} is not routed`).toContain(verb)
        }
    })

    it('keeps `di open` meaning the app, and `di open FILE` meaning the file', () => {
        // Overloaded deliberately: both read as English, and a file argument is
        // either there or it is not.
        expect(cli).toContain("if (args._[1]) { await cmdOpenFile(args, args._[1]); return }")
    })

    it('says all four in the help, in words about work rather than about bundles', () => {
        for (const line of ['new NAME', 'save SPACE', 'open FILE', 'spaces']) {
            expect(ui, `${line} is missing from help`).toContain(line)
        }
        expect(ui).toContain('one file, everything in it')
    })
})

describe('the document says what wrote it', () => {
    it('stamps the writing version and its data shape into the manifest', () => {
        // A file outlives the app that made it. Without these an install cannot
        // tell "old file, open it" from "future file, refuse it".
        expect(bundle).toContain('writtenBy: stamp.appVersion')
        expect(bundle).toContain('schemaVersion: stamp.schemaVersion')
    })

    it('refuses a file from a newer di.iiii by name rather than half-importing it', () => {
        expect(bundle).toContain('this file was written by a newer di.iiii')
        expect(bundle).toContain('manifest.schemaVersion > mine')
    })

    it('still opens a file with no stamp at all — every bundle written before today', () => {
        // Number.isInteger on both sides: an unstamped manifest is unknown, and
        // unknown must read as "open it", never as "shape 0, older than
        // everything" or, worse, as a reason to refuse.
        expect(bundle).toContain('Number.isInteger(manifest.schemaVersion) && Number.isInteger(mine)')
    })

    it('writes .diiii but opens what it wrote before', () => {
        expect(bundle).toContain("const BUNDLE_EXT = '.diiii'")
        // Import takes a path, so the old .space-bundle.tar.gz name still opens
        // with no special case — and the CLI strips either when naming a space.
        expect(cli).toContain('\\.diiii$|\\.space-bundle\\.tar\\.gz$')
    })
})

describe('opening a file is not a server-management task', () => {
    it('stops the server, imports, and puts it back if it was up', () => {
        const stop = cli.indexOf('if (wasRunning) { try { await runnerFor(home).stop({ home }) }')
        const importAt = cli.indexOf("const toolArgs = ['import', resolved]")
        const restart = cli.indexOf("if (wasRunning) await cmdUp({ _: [], flags: { 'no-open': true } })\n    if (code !== 0)")
        expect(stop).toBeGreaterThan(-1)
        expect(importAt).toBeGreaterThan(stop)
        expect(restart).toBeGreaterThan(importAt)
    })

    it('leaves the last word to the failure, not to the restart banner', () => {
        expect(cli).toContain('fail(ui.openedNothing(')
        expect(ui).toContain('Your di.iiii is unchanged.')
    })

    it('saves without stopping anything, because reading is not writing', () => {
        const save = cli.slice(cli.indexOf('const cmdSave'), cli.indexOf('const cmdOpenFile'))
        expect(save).not.toContain('runnerFor(home).stop')
    })
})

// The browser's half of the same idea: a Save on every space card and an Open
// beside Create. Source-level, because the behaviour is covered by the server
// contracts and what this guards against is the wiring being deleted.
describe('the file menu in the browser', () => {
    const hub = fs.readFileSync(path.join(HERE, '../../src/studio/components/SpaceHub.jsx'), 'utf8')
    const service = fs.readFileSync(path.join(HERE, '../../src/services/serverSpaces.js'), 'utf8')

    it('offers Save on a card and Open beside Create', () => {
        expect(hub).toContain('Save to file')
        expect(hub).toContain('Open a file')
        expect(hub).toContain("accept=\".diiii,.tar.gz\"")
    })

    it('downloads by navigating, rather than pulling a whole bundle into memory', () => {
        expect(service).toContain('window.location.assign(`${apiBaseUrl}/api/spaces/${id}/bundle`)')
    })

    it('offers another name when one is already taken, instead of only refusing', () => {
        // The single failure with a way out. A terminal says "--as <newId>";
        // a page can just ask.
        expect(hub).toContain("clash?.code !== 'space_exists'")
        expect(hub).toContain('Open it under another name')
        expect(service).toContain('error.code = data?.code')
    })

    it('clears the picker so the same file can be tried twice', () => {
        // Without this a failed open cannot be retried: choosing the same file
        // fires no change event.
        expect(hub).toContain('event.target.value = \'\'')
    })
})
