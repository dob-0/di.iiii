// @vitest-environment node
//
// A version-2 file carries the space's light show (space/lighting/show.json). The
// first bug: dev refused such a file at the end of a 843 MB send ("this file is
// format 2; this di.iiii reads 1"). A proposal must read it, say so in its
// summary, and write it the desk's way on apply, keeping the replaced show as
// show.prev.json. A show here that the file does not carry stays untouched.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createContentProposals, readBundle } from './contentProposals.js'

const made = []
afterEach(async () => {
  while (made.length) await rm(made.pop(), { recursive: true, force: true })
})

const SHOW = { fixtures: [{ id: 'a' }, { id: 'b' }], scenes: [{ id: 's1' }], looks: [], output: { enabled: true } }
const OTHER = { fixtures: [{ id: 'a' }], scenes: [], looks: [] }

const tmp = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-proposal-show-'))
  made.push(dir)
  return dir
}

const bundleWith = async ({ version = 2, show = null }) => {
  const root = await tmp()
  const dir = path.join(root, 'bundle')
  const all = {
    'bundle.json': JSON.stringify({ format: 'di.space-bundle', version, spaceId: 'show' }),
    'projects/door/document.json': JSON.stringify({ entities: [] }),
    ...(show ? { 'space/lighting/show.json': typeof show === 'string' ? show : JSON.stringify(show) } : {})
  }
  for (const [name, contents] of Object.entries(all)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true })
    await writeFile(path.join(dir, name), contents)
  }
  const file = path.join(root, 'show.diiii')
  execFileSync('tar', ['-czf', file, '-C', dir, '.'])
  return file
}

// A space whose only project ('door') already matches the file, so the show is the only thing that can change.
const harness = async ({ current = null } = {}) => {
  const spacesDir = await tmp()
  const lightDir = path.join(spacesDir, 'show', 'lighting')
  if (current) {
    await mkdir(lightDir, { recursive: true })
    await writeFile(path.join(lightDir, 'show.json'), JSON.stringify(current))
  }
  const onLightShowWritten = vi.fn()
  const projectDir = path.join(spacesDir, 'show', 'projects', 'door')
  await mkdir(projectDir, { recursive: true })
  await writeFile(path.join(projectDir, 'document.json'), JSON.stringify({ entities: [] }))
  const proposals = createContentProposals({
    config: {},
    dataDir: await tmp(),
    spacesDir,
    approvalGate: {},
    spaceHistory: { beforeChange: async () => ({ id: 'rp1' }), summarizeChanges: () => [] },
    loadSpaceMeta: async () => ({ id: 'show', label: 'Show', kind: 'normal' }),
    findProjectById: async () => ({ spaceId: 'show', meta: { documentVersion: 1 } }),
    listProjectsInSpace: async () => [{ id: 'door', slug: 'door', title: 'Door' }],
    getSpacePaths: () => ({ scenePath: path.join(spacesDir, 'show', 'scene.json'), assetsDir: path.join(spacesDir, 'show', 'assets') }),
    restoreSpaceProjectDocuments: async () => [],
    replaceSceneAndBroadcast: async () => null,
    onLightShowWritten,
    logger: { warn() {}, info() {}, error() {} }
  })
  return { proposals, lightDir, onLightShowWritten }
}

const send = (proposals, file, extra = {}) =>
  proposals.submit({ spaceId: 'show', uploadPath: file, authState: { isUnrestricted: true }, mode: 'auto', ...extra })
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

describe('a proposal reads a file that carries a light show', () => {
  it('reads format 2 and takes the show (without the rig)', async () => {
    const bundle = await readBundle(await bundleWith({ show: SHOW }))
    try {
      expect(bundle.lightShow).toEqual({ fixtures: SHOW.fixtures, scenes: SHOW.scenes, looks: [] })
    } finally { await bundle.cleanup() }
  })

  it('refuses format 3 and a light show that is not a show', async () => {
    await expect(readBundle(await bundleWith({ version: 3 }))).rejects.toMatchObject({ status: 400, message: /format 3/ })
    await expect(readBundle(await bundleWith({ show: '[1,2]' }))).rejects.toMatchObject({ status: 400, message: /light show/ })
    await expect(readBundle(await bundleWith({ show: '{nope' }))).rejects.toMatchObject({ status: 400, message: /light show/ })
  })

  it('names the show, its counts and that it replaces one, in the summary', async () => {
    const { proposals } = await harness({ current: OTHER })
    const out = await send(proposals, await bundleWith({ show: SHOW }), { dryRun: true })
    expect(out.summary.lightShow).toMatchObject({ inFile: true, changed: true, hadOne: true, counts: '2 fixtures, 1 scene, 0 looks' })
    expect(out.text).toContain('Light show: replaced (2 fixtures, 1 scene, 0 looks)')
  })

  it('apply writes show.json and keeps the replaced show as show.prev.json, then tells the desk', async () => {
    const { proposals, lightDir, onLightShowWritten } = await harness({ current: OTHER })
    const out = await send(proposals, await bundleWith({ show: SHOW }))
    expect(out.status).toBe('applied')
    expect(out.result.lightShow).toBe(true)
    expect(read(path.join(lightDir, 'show.json'))).toEqual({ fixtures: SHOW.fixtures, scenes: SHOW.scenes, looks: [] })
    expect(read(path.join(lightDir, 'show.prev.json'))).toEqual(OTHER)
    expect(fs.existsSync(path.join(lightDir, 'show.json.tmp'))).toBe(false)
    expect(onLightShowWritten).toHaveBeenCalledWith('show')
  })

  it('a space with no show yet gets one, with no prev', async () => {
    const { proposals, lightDir } = await harness()
    const out = await send(proposals, await bundleWith({ show: SHOW }))
    expect(out.status).toBe('applied')
    expect(read(path.join(lightDir, 'show.json')).fixtures).toHaveLength(2)
    expect(fs.existsSync(path.join(lightDir, 'show.prev.json'))).toBe(false)
  })

  it('an identical show (key order aside, rig aside) is no change and writes nothing', async () => {
    const same = { looks: [], scenes: SHOW.scenes, fixtures: SHOW.fixtures }
    const { proposals, lightDir, onLightShowWritten } = await harness({ current: same })
    const out = await send(proposals, await bundleWith({ show: SHOW }))
    expect(out.status).toBe('nothing_to_apply')
    expect(out.summary.lightShow.changed).toBe(false)
    expect(fs.existsSync(path.join(lightDir, 'show.prev.json'))).toBe(false)
    expect(onLightShowWritten).not.toHaveBeenCalled()
  })

  it('a version-1 file leaves the space\'s own show untouched', async () => {
    const { proposals, lightDir, onLightShowWritten } = await harness({ current: OTHER })
    const out = await send(proposals, await bundleWith({ version: 1 }), { dryRun: true })
    expect(out.summary.lightShow.inFile).toBe(false)
    const applied = await send(proposals, await bundleWith({ version: 1 }))
    expect(applied.status).toBe('nothing_to_apply')
    expect(read(path.join(lightDir, 'show.json'))).toEqual(OTHER)
    expect(onLightShowWritten).not.toHaveBeenCalled()
  })

  it('a version-1 file that carries a show file anyway does not touch the show', async () => {
    const { proposals, lightDir } = await harness({ current: OTHER })
    await send(proposals, await bundleWith({ version: 1, show: SHOW }))
    expect(read(path.join(lightDir, 'show.json'))).toEqual(OTHER)
  })
})
