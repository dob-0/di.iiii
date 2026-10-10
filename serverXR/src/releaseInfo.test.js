// @vitest-environment node
//
// GET /api/health tells a caller which release a server is. A hosted image, the
// standby runtime and a cPanel bundle carry that beside the server
// (<root>/release.json, written at build). An installed `di` does not: its
// stamp is written by scripts/pack-runtime.mjs at the VERSION root, one folder
// above serverXR/, in the packer's own shape (version, gitCommit, packedAt).
// The loader used to look only beside the server, so every installed di
// answered release = all null (measured on aylmo, 2026-10-09 and again
// 2026-10-10) and "the installed di runs the commit dev runs" could be checked
// with `di --version` and nothing else.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { EMPTY_RELEASE_INFO, loadReleaseInfo, normalizeReleaseInfo } = require('./releaseInfo')
const { config } = require('./config')

// The real file `scripts/pack-runtime.mjs` wrote for the dev-channel build that
// aylmo runs: ~/.di/versions/0.4.4-dev.5b37c82f/release.json, read 2026-10-10.
// Copied, not made up: the key names here are the packer's, so a rename on
// either side shows up as a failure in this file.
const PACKED_BY_THE_DEV_CHANNEL = Object.freeze({
  version: '0.4.4-dev.5b37c82f',
  profile: 'local',
  gitCommit: '5b37c82fcd8c5a4446f536090e3868a4f248c43c',
  works: ['wcc', 'algovrithm'],
  schemaVersion: 1,
  packedAt: '2026-10-09T13:58:49.745Z',
  node: 'v22.23.3'
})

let tmp
let savedOverride

// <tmp>/<name>/ is what `di` unpacks to ~/.di/versions/<name>/: release.json at
// the top, the server in serverXR/ beside it. Returns the server's own folder,
// which is what index.js hands to loadReleaseInfo (config.directories.root).
const lay = (name, { versionRoot = null, beside = null } = {}) => {
  const root = path.join(tmp, name)
  const server = path.join(root, 'serverXR')
  fs.mkdirSync(server, { recursive: true })
  if (versionRoot !== null) {
    fs.writeFileSync(path.join(root, 'release.json'), typeof versionRoot === 'string' ? versionRoot : JSON.stringify(versionRoot))
  }
  if (beside !== null) {
    fs.writeFileSync(path.join(server, 'release.json'), typeof beside === 'string' ? beside : JSON.stringify(beside))
  }
  return server
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-info-'))
  savedOverride = process.env.SERVERXR_RELEASE_FILE
  delete process.env.SERVERXR_RELEASE_FILE
})

afterEach(() => {
  if (savedOverride === undefined) delete process.env.SERVERXR_RELEASE_FILE
  else process.env.SERVERXR_RELEASE_FILE = savedOverride
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('an installed di says which release it is', () => {
  it('reads the stamp the packer left at the version root', () => {
    const info = loadReleaseInfo(lay('0.4.4-dev.5b37c82f', { versionRoot: PACKED_BY_THE_DEV_CHANNEL }))

    expect(info.gitCommit).toBe('5b37c82fcd8c5a4446f536090e3868a4f248c43c')
    expect(info.version).toBe('0.4.4-dev.5b37c82f')
    // The packer calls it packedAt; health has always called it generatedAt.
    expect(info.generatedAt).toBe('2026-10-09T13:58:49.745Z')
    // A build named by its version has no other id: the version is the release's id.
    expect(info.releaseId).toBe('0.4.4-dev.5b37c82f')
    // An install is not a deploy tier and was not built from a named branch: nothing is invented.
    expect(info.deployEnv).toBeNull()
    expect(info.sourceRef).toBeNull()
  })

  it('still names its version when it was packed before commits were recorded', () => {
    const info = loadReleaseInfo(lay('0.4.3', { versionRoot: { version: '0.4.3', profile: 'local', schemaVersion: 1 } }))

    expect(info.version).toBe('0.4.3')
    expect(info.releaseId).toBe('0.4.3')
    expect(info.gitCommit).toBeNull()
  })

  it('answers the same commit the dev channel installed it from (the check this exists for)', () => {
    // `di update --channel dev` compares the hub's release.gitCommit with the
    // sha8 at the end of the installed version name. Health must agree with it.
    const info = loadReleaseInfo(lay('0.4.4-dev.5b37c82f', { versionRoot: PACKED_BY_THE_DEV_CHANNEL }))

    expect(info.version.endsWith(`-dev.${info.gitCommit.slice(0, 8)}`)).toBe(true)
  })

  it('lays the stamp where the server runs: serverXR/ is directly inside the version root', () => {
    // The loader goes one folder up from config.directories.root. That is only
    // the version root because the packer copies serverXR/ to <stage>/serverXR/
    // and writes <stage>/release.json (scripts/pack-runtime.mjs); the second
    // half of that contract is in scripts/di/installedReleaseStamp.test.js.
    expect(path.basename(config.directories.root)).toBe('serverXR')
  })
})

describe('the other places a stamp has always lived are untouched', () => {
  it('prefers the file beside the server (a hosted image, the standby runtime, a cPanel bundle)', () => {
    const info = loadReleaseInfo(lay('image', {
      beside: { deployEnv: 'dev', sourceRef: 'dev', gitCommit: 'abcdef1234567890', releaseId: 'cpanel-20260412-120000', generatedAt: '2026-04-12T12:00:00.000Z' },
      versionRoot: PACKED_BY_THE_DEV_CHANNEL
    }))

    expect(info).toEqual({
      deployEnv: 'dev',
      sourceRef: 'dev',
      gitCommit: 'abcdef1234567890',
      releaseId: 'cpanel-20260412-120000',
      generatedAt: '2026-04-12T12:00:00.000Z',
      version: null
    })
  })

  it('keeps the id a build gave itself; the version is only what is used when there is none', () => {
    expect(normalizeReleaseInfo({ releaseId: 'cpanel-1', version: '9.9.9' }).releaseId).toBe('cpanel-1')
    expect(normalizeReleaseInfo({ version: '9.9.9' }).releaseId).toBe('9.9.9')
  })

  it('still reads the branch and commit from a git block', () => {
    const info = normalizeReleaseInfo({ git: { branch: 'dev', commit: 'c0ffee' } })

    expect(info.sourceRef).toBe('dev')
    expect(info.gitCommit).toBe('c0ffee')
  })

  it('SERVERXR_RELEASE_FILE names the one file to read and nothing else is tried', () => {
    const server = lay('override', { versionRoot: PACKED_BY_THE_DEV_CHANNEL })
    process.env.SERVERXR_RELEASE_FILE = path.join(tmp, 'no-such-release.json')

    expect(loadReleaseInfo(server)).toEqual({ ...EMPTY_RELEASE_INFO })

    const named = path.join(tmp, 'named.json')
    fs.writeFileSync(named, JSON.stringify({ deployEnv: 'test', gitCommit: 'abc' }))
    process.env.SERVERXR_RELEASE_FILE = named

    expect(loadReleaseInfo(server)).toMatchObject({ deployEnv: 'test', gitCommit: 'abc', version: null })
  })

  it('a source checkout has no stamp and says so with nulls, not a guess', () => {
    expect(loadReleaseInfo(lay('checkout'))).toEqual({ ...EMPTY_RELEASE_INFO })
    expect(Object.values(EMPTY_RELEASE_INFO).every((value) => value === null)).toBe(true)
  })
})

describe('a stamp that cannot be read does not hide one that can', () => {
  it('goes on to the version root when the file beside the server is broken', () => {
    const info = loadReleaseInfo(lay('half-written', { beside: '{"deployEnv": "de', versionRoot: PACKED_BY_THE_DEV_CHANNEL }))

    expect(info.version).toBe('0.4.4-dev.5b37c82f')
  })

  it('does not take a list or a bare string for a stamp', () => {
    expect(loadReleaseInfo(lay('a-list', { versionRoot: '[]' }))).toEqual({ ...EMPTY_RELEASE_INFO })
    expect(loadReleaseInfo(lay('a-string', { versionRoot: '"0.4.4"' }))).toEqual({ ...EMPTY_RELEASE_INFO })
  })

  it('answers with nulls, and does not throw, when nothing can be read', () => {
    expect(loadReleaseInfo(lay('garbage', { versionRoot: 'not json at all' }))).toEqual({ ...EMPTY_RELEASE_INFO })
    expect(loadReleaseInfo(path.join(tmp, 'does', 'not', 'exist', 'serverXR'))).toEqual({ ...EMPTY_RELEASE_INFO })
  })
})
