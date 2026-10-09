// @vitest-environment node
//
// A .diiii holds regular files and directories, nothing else — the same rule
// scripts/space-bundle.mjs applies on import (one helper, ./bundleMembers.js).
// The proposal reader reads only what the file itself carries: every path it
// opens resolves inside the directory it unpacked into (OWASP ASVS 4.0.3
// V12.3.1 / V12.3.2 — user-supplied paths and archive members stay inside
// the intended directory).

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile, link } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readBundle } from './contentProposals.js'

const made = []
afterEach(async () => {
  while (made.length) await rm(made.pop(), { recursive: true, force: true })
})

const tempDir = async (prefix) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  made.push(dir)
  return dir
}

const CANARY = 'canary-from-another-space'

// Another space's folder on the same server, outside any bundle.
const otherSpace = async () => {
  const root = await tempDir('dii-proposal-other-')
  const space = path.join(root, 'spaces', 'other')
  await mkdir(path.join(space, 'projects', 'p1'), { recursive: true })
  await writeFile(path.join(space, 'scene.json'), JSON.stringify({ objects: [{ id: CANARY }] }))
  await writeFile(path.join(space, 'meta.json'), JSON.stringify({ label: CANARY }))
  await writeFile(path.join(space, 'projects', 'p1', 'document.json'), JSON.stringify({ entities: [{ id: CANARY }] }))
  return space
}

// build(dir) adds members to a minimal bundle; returns the .diiii path.
const craft = async (build) => {
  const root = await tempDir('dii-proposal-members-')
  const dir = path.join(root, 'bundle')
  await mkdir(path.join(dir, 'projects', 'door'), { recursive: true })
  await writeFile(path.join(dir, 'bundle.json'), JSON.stringify({ format: 'di.space-bundle', version: 1, spaceId: 'show' }))
  await writeFile(path.join(dir, 'projects', 'door', 'document.json'), JSON.stringify({ entities: [] }))
  await build(dir)
  const file = path.join(root, 'show.diiii')
  execFileSync('tar', ['-czf', path.basename(file), '-C', dir, '.'], { cwd: root })
  return file
}

// Every di-proposal-* directory readBundle made under tmpRoot is gone again.
const unpackDirsLeft = async (tmpRoot) => (await readdir(tmpRoot)).filter((n) => n.startsWith('di-proposal-'))

const readRefused = async (file) => {
  const tmpRoot = await tempDir('dii-proposal-tmproot-')
  let result = null
  let error = null
  try { result = await readBundle(file, { tmpRoot }) } catch (e) { error = e }
  if (result) await result.cleanup()
  return { result, error, left: await unpackDirsLeft(tmpRoot) }
}

describe('a proposal file is read only from inside itself', () => {
  it('refuses a directory symlink member (space → another space) and reads nothing through it', async () => {
    const victim = await otherSpace()
    const file = await craft(async (dir) => { await symlink(victim, path.join(dir, 'space')) })
    const { result, error, left } = await readRefused(file)
    expect(result?.scene ?? null).toBeNull()
    expect(JSON.stringify(result ?? {})).not.toContain(CANARY)
    expect(error).toMatchObject({ status: 400 })
    expect(left).toEqual([])
  })

  it('refuses a project directory symlink member (projects/<id> → another project)', async () => {
    const victim = await otherSpace()
    const file = await craft(async (dir) => { await symlink(path.join(victim, 'projects', 'p1'), path.join(dir, 'projects', 'stolen')) })
    const { result, error } = await readRefused(file)
    expect(JSON.stringify(result ?? {})).not.toContain(CANARY)
    expect(error).toMatchObject({ status: 400 })
  })

  it('refuses a file symlink member and a hard link member', async () => {
    const victim = await otherSpace()
    const withSymlink = await craft(async (dir) => {
      await mkdir(path.join(dir, 'space'), { recursive: true })
      await symlink(path.join(victim, 'scene.json'), path.join(dir, 'space', 'scene.json'))
    })
    expect((await readRefused(withSymlink)).error).toMatchObject({ status: 400 })

    const withHardLink = await craft(async (dir) => {
      await mkdir(path.join(dir, 'space'), { recursive: true })
      await writeFile(path.join(dir, 'space', 'meta.json'), '{}')
      await link(path.join(dir, 'space', 'meta.json'), path.join(dir, 'space', 'scene.json'))
    })
    expect((await readRefused(withHardLink)).error).toMatchObject({ status: 400 })
  })

  it('refuses a member that climbs out with ../ and writes nothing outside', async () => {
    const root = await tempDir('dii-proposal-dotdot-')
    const dir = path.join(root, 'bundle')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'bundle.json'), JSON.stringify({ format: 'di.space-bundle', version: 1 }))
    await writeFile(path.join(root, 'escape.txt'), CANARY)
    const file = path.join(root, 'climb.diiii')
    // -P keeps the ../ in the stored name, which is what a crafted file does.
    execFileSync('tar', ['-czPf', file, '-C', dir, 'bundle.json', '../escape.txt'])
    expect(execFileSync('tar', ['-tzf', file], { encoding: 'utf8' })).toContain('../escape.txt')
    fs.rmSync(path.join(root, 'escape.txt'))

    const tmpRoot = await tempDir('dii-proposal-tmproot-')
    await expect(readBundle(file, { tmpRoot })).rejects.toMatchObject({ status: 400 })
    expect(fs.existsSync(path.join(tmpRoot, 'escape.txt'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'escape.txt'))).toBe(false)
    expect(await unpackDirsLeft(tmpRoot)).toEqual([])
  })

  it('still reads a plain file of regular files and directories', async () => {
    const file = await craft(async (dir) => {
      await mkdir(path.join(dir, 'space'), { recursive: true })
      await writeFile(path.join(dir, 'space', 'scene.json'), JSON.stringify({ objects: [{ id: 'cube' }] }))
    })
    const bundle = await readBundle(file)
    try {
      expect(bundle.scene).toEqual({ objects: [{ id: 'cube' }] })
      expect(bundle.projects.map((p) => p.id)).toEqual(['door'])
    } finally {
      await bundle.cleanup()
    }
  })
})
