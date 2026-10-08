// @vitest-environment node
//
// A proposal's files land in the space's content-addressed blob store, where a
// file's NAME is the sha256 of its bytes. Nothing ever overwrites a blob that
// is there (copyIfMissing), and an upload of the same bytes later is
// de-duplicated onto whatever already sits under that name — so a file whose
// bytes do not match its name would stand in for the real one, for every
// project in the space that ever names it. The follow carry checks the hash
// before it offers a file (follow/assets.js) and the verbatim PUT checks it
// again; a proposal must keep the same rule. Bug sweep 2026-10-07, lane Q1.

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readBundle } from './contentProposals.js'

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex')

const made = []
afterEach(async () => {
  while (made.length) await rm(made.pop(), { recursive: true, force: true })
})

// files: { 'relative/path': 'contents' } → a .diiii (tar.gz) on disk.
const bundleWith = async (files) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dii-proposal-hash-'))
  made.push(root)
  const dir = path.join(root, 'bundle')
  const all = {
    'bundle.json': JSON.stringify({ format: 'di.space-bundle', version: 1, spaceId: 'show' }),
    'projects/door/document.json': JSON.stringify({ entities: [] }),
    ...files
  }
  for (const [name, contents] of Object.entries(all)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true })
    await writeFile(path.join(dir, name), contents)
  }
  const file = path.join(root, 'show.diiii')
  execFileSync('tar', ['-czf', file, '-C', dir, '.'])
  return file
}

describe('a proposal file is read only when every content-addressed file matches its name', () => {
  it('refuses a blob whose bytes are not the file its name says', async () => {
    const file = await bundleWith({ [`blobs/${sha256('the real photo')}`]: 'something else entirely' })
    await expect(readBundle(file)).rejects.toMatchObject({ status: 400 })
  })

  it('refuses a project file whose bytes are not the file its name says', async () => {
    const file = await bundleWith({ [`projects/door/assets/${sha256('the real video')}`]: 'something else entirely' })
    await expect(readBundle(file)).rejects.toMatchObject({ status: 400 })
  })

  it('refuses a space file whose bytes are not the file its name says', async () => {
    const file = await bundleWith({ [`space/assets/${sha256('the real poster')}`]: 'something else entirely' })
    await expect(readBundle(file)).rejects.toMatchObject({ status: 400 })
  })

  it('still reads a file whose names and bytes agree — and a legacy id, which names no hash', async () => {
    const legacyId = 'a1b2c3d4-e5f6-4711-8899-aabbccddeeff'
    const file = await bundleWith({
      [`blobs/${sha256('the real photo')}`]: 'the real photo',
      [`projects/door/assets/${sha256('the real video')}`]: 'the real video',
      [`projects/door/assets/${legacyId}`]: 'an old upload, named before names were hashes',
      [`space/assets/${sha256('the real poster')}`]: 'the real poster',
      [`space/assets/${sha256('the real poster')}.json`]: JSON.stringify({ id: sha256('the real poster'), name: 'poster.png' })
    })
    const bundle = await readBundle(file)
    try {
      expect(bundle.blobs).toEqual([sha256('the real photo')])
      expect(bundle.projects.find((p) => p.id === 'door').assetFiles.sort()).toEqual([sha256('the real video'), legacyId].sort())
      expect(bundle.spaceAssets.sort()).toEqual([sha256('the real poster'), `${sha256('the real poster')}.json`].sort())
    } finally {
      await bundle.cleanup()
    }
  })
})
