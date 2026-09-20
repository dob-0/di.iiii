// `install.ps1` runs two different ways: `irm https://.../get.ps1 | iex` (the
// documented one-liner, which hands PowerShell an already-decoded string) and
// `powershell -File install.ps1` (a Windows 11 laptop opening the downloaded
// file directly). Only the second way ever reads the bytes on disk.
//
// PowerShell 5.1 has no way to know a BOM-less .ps1 is UTF-8, so it reads it
// as the system's ANSI codepage. Every non-ASCII byte in this file (an em
// dash, an ellipsis, a box-drawing run) then decodes to the wrong character —
// one of them lands on a smart quote, which breaks string parsing with
// "Missing closing '}'" / "The Try statement is missing its Catch". A BOM
// would fix the ANSI misread, but a BOM breaks `irm | iex` for some hosts, so
// the only fix that works both ways is: stay pure ASCII, no BOM.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const installPs1 = path.join(here, '..', '..', 'install.ps1')

describe('install.ps1', () => {
    it('is pure ASCII with no BOM', () => {
        const bytes = fs.readFileSync(installPs1)
        const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
        expect(hasBom).toBe(false)

        const nonAscii = []
        for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] >= 0x80) nonAscii.push({ offset: i, byte: bytes[i].toString(16) })
        }
        expect(nonAscii).toEqual([])
    })
})
