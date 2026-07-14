import { describe, expect, it, afterEach } from 'vitest'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readJson } from './jsonStore.js'

const tmpDirs = []
async function makeTmpDir() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jsonstore-test-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(async () => {
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
