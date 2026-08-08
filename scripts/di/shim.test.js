/**
 * The two shims are the only files in this project that another program parses
 * byte by byte, and cmd.exe is unforgiving about how.
 *
 * A batch file with LF-only line endings appears to work and then drifts:
 * cmd.exe re-seeks by the byte length it believes each line had, loses one byte
 * per line, and starts executing lines with their first characters eaten
 * (`setlocal` runs as `etlocal`). It surfaces as a pile of "'em' is not
 * recognized as an internal or external command" and an empty %DI_HOME%, which
 * names nothing that is actually wrong. Adding two comment lines is enough to
 * push a file that worked over the edge, so this is asserted, not remembered.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (name) => fs.readFileSync(path.join(here, 'shim', name), 'utf8')

describe('the windows shim', () => {
    const cmd = read('di.cmd')

    it('uses CRLF on every line', () => {
        const bare = cmd.split('\n').slice(0, -1).filter(line => !line.endsWith('\r'))
        expect(bare, 'cmd.exe eats leading characters from LF-only batch files').toEqual([])
    })

    it('is pure ASCII', () => {
        // A batch file is read in the console's active code page, not UTF-8, so
        // an em dash in a comment can end the line early or corrupt the byte
        // count that the CRLF rule above depends on.
        expect(cmd.match(/[^\x00-\x7F]/gu) || []).toEqual([])
    })

    it('exports the name it was invoked as', () => {
        expect(cmd).toContain('set "DI_COMMAND=%~n0"')
    })
})

describe('the unix shim', () => {
    const sh = read('di')

    it('has no CR anywhere', () => {
        // The mirror failure: a CR in a #! script makes the kernel look for an
        // interpreter whose name ends in an invisible byte.
        expect(sh).not.toContain('\r')
    })

    it('exports the name it was invoked as', () => {
        expect(sh).toContain('DI_COMMAND=$(basename "$0")')
    })
})
