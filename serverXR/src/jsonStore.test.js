import { describe, expect, it, afterEach, vi } from 'vitest'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readJson, writeJson } from './jsonStore.js'

const tmpDirs = []
async function makeTmpDir() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jsonstore-test-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tmpDirs.splice(0).map((dir) => fsp.rm(dir, { recursive: true, force: true })))
})

describe('readJson corruption recovery', () => {
  // Regression: recovering malformed JSON used to overwrite the original file
  // with the truncated recovery result, with no backup and no log — any
  // content after the corruption point was permanently and silently lost.
  it('backs up the original bytes before overwriting a recovered file', async () => {
    const dir = await makeTmpDir()
    const filePath = path.join(dir, 'scene.json')
    const corrupted = '{"objects":[{"id":"a"}]}\ngarbage-tail-that-breaks-parsing'
    await fsp.writeFile(filePath, corrupted, 'utf8')

    const recovered = await readJson(filePath, null)
    expect(recovered).toEqual({ objects: [{ id: 'a' }] })

    const dirEntries = await fsp.readdir(dir)
    const backupName = dirEntries.find((name) => name.includes('.corrupt-') && name.endsWith('.bak'))
    expect(backupName).toBeTruthy()
    const backedUp = await fsp.readFile(path.join(dir, backupName), 'utf8')
    expect(backedUp).toBe(corrupted)

    const onDisk = JSON.parse(await fsp.readFile(filePath, 'utf8'))
    expect(onDisk).toEqual({ objects: [{ id: 'a' }] })
  })
})

describe('writeJson', () => {
  it('writes the file and leaves no temp file', async () => {
    const dir = await makeTmpDir()
    const filePath = path.join(dir, 'a.json')
    await writeJson(filePath, { n: 1 })
    expect(JSON.parse(await fsp.readFile(filePath, 'utf8'))).toEqual({ n: 1 })
    expect((await fsp.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  // A write that fails half-way (ENOSPC) must leave the old file whole AND not leave its half-written temp file
  // lying next to it — before this, the temp file stayed, and a full disk got fuller.
  it('a failed write keeps the old file whole and removes its temp file', async () => {
    const dir = await makeTmpDir()
    const filePath = path.join(dir, 'b.json')
    await writeJson(filePath, { keep: 'me' })

    const realWriteFile = fsp.writeFile
    vi.spyOn(fsp, 'writeFile').mockImplementation(async (target, data, options) => {
      await realWriteFile(target, String(data).slice(0, 4), options)
      throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
    })
    await expect(writeJson(filePath, { replace: 'with something much longer' })).rejects.toThrow(/ENOSPC/)
    vi.restoreAllMocks()

    expect(JSON.parse(await fsp.readFile(filePath, 'utf8'))).toEqual({ keep: 'me' })
    expect((await fsp.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})
