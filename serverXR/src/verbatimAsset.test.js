// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'

import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { sweepStaleTempFiles } = require('./verbatimAsset')

describe('stale temp files in the uploads dir', () => {
    let dir = null
    afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })

    const put = async (name, ageMs) => {
        const filePath = path.join(dir, name)
        await writeFile(filePath, 'x')
        const when = new Date(Date.now() - ageMs)
        await utimes(filePath, when, when)
    }
    const HOURS = 60 * 60 * 1000

    it('removes only its own two kinds of file, only when older than an hour', async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), 'dii-sweep-'))
        await put('1700000000000-abc.verbatim', 2 * HOURS)
        await put('follow-1234.part', 2 * HOURS)
        await put('1700000000001-new.verbatim', 10 * 60 * 1000) // a transfer still running
        await put('follow-5678.part', 10 * 60 * 1000)
        await put('1700000000002-photo.jpg', 48 * HOURS)        // an upload's file: not ours
        await put('notes.part', 48 * HOURS)                     // .part, but not follow-*
        await put('follow-readme.txt', 48 * HOURS)
        await mkdir(path.join(dir, 'follow-dir.part'))          // a directory is never removed
        await mkdir(path.join(dir, 'nested'))
        await writeFile(path.join(dir, 'nested', 'deep.verbatim'), 'x')
        const old = new Date(Date.now() - 48 * HOURS)
        await utimes(path.join(dir, 'nested', 'deep.verbatim'), old, old) // only that dir, not below it

        const removed = await sweepStaleTempFiles(dir)

        expect(removed.sort()).toEqual(['1700000000000-abc.verbatim', 'follow-1234.part'])
        expect((await readdir(dir)).sort()).toEqual([
            '1700000000001-new.verbatim', '1700000000002-photo.jpg', 'follow-5678.part',
            'follow-dir.part', 'follow-readme.txt', 'nested', 'notes.part'
        ])
        expect(await readdir(path.join(dir, 'nested'))).toEqual(['deep.verbatim'])
    })

    it('a directory that is not there is nothing to sweep, not an error', async () => {
        expect(await sweepStaleTempFiles(path.join(os.tmpdir(), 'dii-sweep-does-not-exist'))).toEqual([])
    })
})
