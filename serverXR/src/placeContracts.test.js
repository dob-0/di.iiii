// @vitest-environment node

// THE ONE THING THIS LANE MUST NEVER GET WRONG: on a hosted di.iiii the build
// route does not exist. Not 403, not an empty 200 — 404, the same answer /light
// and /ndi give, because a deployed server should not admit the route is a thing
// (serverXR/src/localRuntimeGuard.js). The phone reads that 404 as "the copy is
// built on the studio machine", which is the truth, and the footage keeps
// collecting either way.
//
// Two real serverXR processes are booted for this: one that knows it is local
// (DI_LOCAL=1) and one that is production and hosted. The same request goes to
// both. A unit test of the guard would prove the guard; only this proves the
// ROUTE is behind it — which is the mistake worth catching, because adding a
// route and forgetting the middleware fails no other test in the repo.
//
// The reconstruction itself is never run here. PLACE_SCRIPT points at a stub that
// writes a step line and exits, so what is under test is the route's own
// behaviour: what it copies, what it spawns, what it writes down, and how it
// reads a build's state back off the disk.
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ENTRY = path.join(HERE, 'index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.on('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close((error) => (error ? reject(error) : resolve(port)))
  })
})

// Stands in for scripts/place/place.mjs: prints one of the step lines the real
// one prints, then leaves. Enough for the route to have something to read a step
// out of, and nothing like an hour of Meshroom.
const STUB_PLACE = `
console.log('A place called "stub"')
console.log('— 1/5 frames')
console.log(JSON.stringify(process.argv.slice(2)))
`

const startServer = async ({ local }) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-place-cwd-'))
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-place-data-'))
  const stub = path.join(cwd, 'stub-place.mjs')
  await writeFile(stub, STUB_PLACE)
  const port = await getFreePort()

  const env = {
    ...process.env,
    PORT: String(port),
    APP_BASE_PATH: '/serverXR',
    DATA_ROOT: dataRoot,
    API_TOKEN: 'test-token',
    CORS_ORIGINS: '*',
    AUTH_SESSION_SECRET: 'test-session-secret',
    REQUIRE_AUTH: '',
    PLACE_SCRIPT: stub,
    // No Meshroom on a CI runner, and the route must say L4 rather than
    // pretending a 13 GB unpack is there.
    PLACE_MESHROOM: path.join(cwd, 'no-meshroom-here')
  }
  if (local) {
    // What `di up` looks like: a real install that KNOWS it is local.
    env.NODE_ENV = 'production'
    env.DI_LOCAL = '1'
  } else {
    // What a hosted tier looks like.
    env.NODE_ENV = 'production'
    delete env.DI_LOCAL
  }
  delete env.SPACES_DIR
  delete env.UPLOADS_DIR

  const child = spawn(process.execPath, [SERVER_ENTRY], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })

  const baseUrl = `http://127.0.0.1:${port}/serverXR`
  const deadline = Date.now() + 25000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the server exited while booting (code ${child.exitCode})\n${logs}`)
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) break
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`the server never became healthy\n${logs}`)
    await wait(200)
  }

  return {
    baseUrl,
    dataRoot,
    stub,
    getLogs: () => logs,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM')
        const exited = await Promise.race([new Promise((r) => child.once('exit', r)), wait(3000).then(() => false)])
        if (exited === false && child.exitCode === null) {
          child.kill('SIGKILL')
          await new Promise((r) => child.once('exit', r))
        }
      }
      await rm(cwd, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  }
}

const post = (base, route, body) => fetch(`${base}${route}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
  body: JSON.stringify(body || {})
})

const get = (base, route) => fetch(`${base}${route}`, { headers: { Authorization: 'Bearer test-token' } })

// Real JPEG bytes. The upload route re-encodes an image to strip EXIF/GPS and
// REFUSES one it cannot scrub (415), so a hand-rolled minimal file is not a
// shortcut here — and the route under test then has to find these same bytes
// again in the blob store, addressed by their own sha256.
const aPhotograph = () => sharp({
  create: { width: 32, height: 32, channels: 3, background: { r: 40, g: 44, b: 52 } }
}).jpeg().toBuffer()

// A space with a footage room in it, made the way a phone would: create the
// space, create <space>-sources, upload a photograph, hang it.
const collectAWalk = async (base, spaceId) => {
  const madeSpace = await post(base, '/api/spaces', { label: spaceId, slug: spaceId, permanent: true })
  expect(madeSpace.status).toBeLessThan(400)
  const project = `${spaceId}-sources`
  const madeProject = await post(base, `/api/spaces/${spaceId}/projects`, {
    title: `${spaceId} — what it was made of`,
    slug: project
  })
  expect(madeProject.status).toBeLessThan(400)

  const jpeg = await aPhotograph()
  const form = new FormData()
  form.append('asset', new Blob([jpeg], { type: 'image/jpeg' }), 'still-001.jpg')
  const uploaded = await fetch(`${base}/api/projects/${project}/assets`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
    body: form
  })
  expect(uploaded.status).toBe(200)
  const { asset } = await uploaded.json()

  const document = await (await get(base, `/api/projects/${project}/document`)).json()
  const wrote = await post(base, `/api/projects/${project}/ops`, {
    baseVersion: Number(document.version) || 0,
    ops: [
      { type: 'upsertAsset', payload: { asset } },
      {
        type: 'createEntity',
        payload: {
          entity: {
            id: 'scan-1',
            type: 'image',
            name: 'still 1',
            components: {
              transform: { position: [0, 1.6, -3], rotation: [Math.PI / 2, 0, 0], scale: [0.36, 0.36, 0.36] },
              media: { assetId: asset.id, fit: 'contain' },
              animation: { mode: 'static', speed: 1, amplitude: 1 }
            }
          }
        }
      },
      // The measured wall, the way the phone writes it: text in the room, because
      // normalizeProjectDocument drops any field it does not already know.
      {
        type: 'createEntity',
        payload: {
          entity: {
            id: 'scan-measured-wall',
            type: 'text',
            name: 'wall · 8.30 m',
            components: {
              transform: { position: [-6, 1.6, -3], rotation: [0, 0, 0], scale: [1, 1, 1] },
              text: { value: 'wall · 8.30 m', variant: '2d', billboard: true },
              animation: { mode: 'static', speed: 1, amplitude: 1 }
            }
          }
        }
      }
    ]
  })
  expect(wrote.status).toBe(200)
  return { project, assetId: asset.id }
}

describe('the place build route on a HOSTED di.iiii', () => {
  let hosted = null
  beforeAll(async () => { hosted = await startServer({ local: false }) }, 60000)
  afterAll(async () => { if (hosted) await hosted.stop() })

  it('does not admit the route exists', async () => {
    await collectAWalk(hosted.baseUrl, 'hosted-place')
    const asked = await post(hosted.baseUrl, '/api/spaces/hosted-place/place/build')
    expect(asked.status).toBe(404)
    const looked = await get(hosted.baseUrl, '/api/spaces/hosted-place/place/build')
    expect(looked.status).toBe(404)
  })

  // The footage still collects — that is the whole argument for building
  // scanning into di.iiii rather than leaving it to a separate application. If
  // this ever fails, a walk taken against the dev tier is a walk lost.
  it('still takes the footage a phone collects', async () => {
    const { project } = await collectAWalk(hosted.baseUrl, 'hosted-collect')
    const document = await (await get(hosted.baseUrl, `/api/projects/${project}/document`)).json()
    const ids = document.document.entities.map((entity) => entity.id)
    expect(ids).toContain('scan-1')
    expect(ids).toContain('scan-measured-wall')
    expect(document.document.assets).toHaveLength(1)
  })
})

describe('the place build route on a LOCAL di.iiii', () => {
  let local = null
  beforeAll(async () => { local = await startServer({ local: true }) }, 60000)
  afterAll(async () => { if (local) await local.stop() })

  it('says nothing has been built yet', async () => {
    await collectAWalk(local.baseUrl, 'local-idle')
    const looked = await get(local.baseUrl, '/api/spaces/local-idle/place/build')
    expect(looked.status).toBe(200)
    expect((await looked.json()).status).toBe('idle')
  })

  it('refuses a space that has collected nothing, and says so in words', async () => {
    const made = await post(local.baseUrl, '/api/spaces', { label: 'local-empty', slug: 'local-empty', permanent: true })
    expect(made.status).toBeLessThan(400)
    const asked = await post(local.baseUrl, '/api/spaces/local-empty/place/build')
    expect(asked.status).toBe(409)
    expect((await asked.json()).error).toMatch(/collected/i)
  })

  it('404s a space that is not there at all, rather than starting something', async () => {
    const asked = await post(local.baseUrl, '/api/spaces/no-such-place/place/build')
    expect(asked.status).toBe(404)
  })

  it('carries the footage out of the room and spawns the pipeline over it', async () => {
    await collectAWalk(local.baseUrl, 'local-build')
    const asked = await post(local.baseUrl, '/api/spaces/local-build/place/build', { dryRun: true })
    expect(asked.status).toBe(202)
    const body = await asked.json()
    expect(body.carried).toBe(1)
    expect(body.status).toBe('running')

    // The measured wall came out of the ROOM — nothing was sent in the body, and
    // the route must not have guessed.
    expect(body.scaleEdge).toBe(8.3)
    expect(body.scaleSource).toBe('measured')
    // No Meshroom unpacked on this machine, so the rented GPU, said out loud.
    expect(body.gpu).toBe('L4')

    // What it actually ran, read off the stub's own output.
    const logPath = path.join(local.dataRoot, 'place', 'local-build', 'build.log')
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const text = await readFile(logPath, 'utf8').catch(() => '')
      if (text.includes('[')) break
      await wait(100)
    }
    const log = await readFile(logPath, 'utf8')
    const args = JSON.parse(log.split('\n').find((line) => line.startsWith('[')))
    expect(args).toContain('--from')
    expect(args).toContain('--name')
    expect(args[args.indexOf('--name') + 1]).toBe('local-build')
    expect(args).toContain('--scale-edge')
    expect(args[args.indexOf('--scale-edge') + 1]).toBe('8.3')
    // THE ONE THAT WOULD HANG EVERY PICTURE TWICE: the phone already put the
    // footage on the sources wall.
    expect(args).toContain('--no-sources')
    expect(args).not.toContain('--door-guess')

    const footage = args[args.indexOf('--from') + 1]
    expect(footage).toContain(path.join('place', 'local-build', 'footage'))
    const carried = await readFile(path.join(footage, '0001.jpg')).catch(() => null)
    expect(carried, 'the photograph was copied out of the blob store').not.toBeNull()
  })

  // An asset id in a stored document is whatever a client wrote — normalizeAsset
  // only does ensureString on it — and this route turns one into a filesystem
  // path and then hands the bytes to a subprocess, and by default up to a rented
  // box. A walk collected from a phone on the LAN is enough to write the op.
  it('will not carry a file an asset id points OUT of the space at', async () => {
    const { project } = await collectAWalk(local.baseUrl, 'local-escape')

    const secret = path.join(local.dataRoot, 'not-footage.txt')
    await writeFile(secret, 'this must never reach the pipeline')

    const document = await (await get(local.baseUrl, `/api/projects/${project}/document`)).json()
    const climb = path.relative(path.join(local.dataRoot, 'spaces', 'local-escape', 'blobs'), secret)
    const wrote = await post(local.baseUrl, `/api/projects/${project}/ops`, {
      baseVersion: Number(document.version) || 0,
      ops: [{
        type: 'upsertAsset',
        payload: { asset: { id: climb, name: 'innocent.jpg', mimeType: 'image/jpeg' } }
      }]
    })
    expect(wrote.status, 'the op itself is accepted — the id is only a string to the schema').toBe(200)

    const asked = await post(local.baseUrl, '/api/spaces/local-escape/place/build', { dryRun: true })
    expect(asked.status).toBe(202)
    const body = await asked.json()
    // The real photograph still travels; only the climbing id is dropped.
    expect(body.carried).toBe(1)

    const logPath = path.join(local.dataRoot, 'place', 'local-escape', 'build.log')
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const text = await readFile(logPath, 'utf8').catch(() => '')
      if (text.includes('[')) break
      await wait(100)
    }
    const args = JSON.parse((await readFile(logPath, 'utf8')).split('\n').find((line) => line.startsWith('[')))
    const footage = args[args.indexOf('--from') + 1]
    const escaped = await readFile(path.join(footage, '0002.jpg'), 'utf8').catch(() => null)
    expect(escaped, 'nothing outside the space was copied into the footage').toBeNull()
  })

  it('prefers the number the phone sent over the one in the room', async () => {
    await collectAWalk(local.baseUrl, 'local-number')
    const asked = await post(local.baseUrl, '/api/spaces/local-number/place/build', { scaleEdge: 24, dryRun: true })
    const body = await asked.json()
    expect(body.scaleEdge).toBe(24)
    expect(body.scaleSource).toBe('measured')
  })

  // A guess is a guess and says so: the room is not left in the reconstruction's
  // own arbitrary units, and nothing claims a size nobody measured.
  it('calls an unmeasured room a GUESS rather than inventing a size', async () => {
    const made = await post(local.baseUrl, '/api/spaces', { label: 'local-guess', slug: 'local-guess', permanent: true })
    expect(made.status).toBeLessThan(400)
    const project = 'local-guess-sources'
    await post(local.baseUrl, `/api/spaces/local-guess/projects`, { title: 'footage', slug: project })
    const jpeg = await aPhotograph()
    const form = new FormData()
    form.append('asset', new Blob([jpeg], { type: 'image/jpeg' }), 'still-001.jpg')
    const uploaded = await fetch(`${local.baseUrl}/api/projects/${project}/assets`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: form
    })
    expect(uploaded.status).toBe(200)
    const { asset } = await uploaded.json()
    const document = await (await get(local.baseUrl, `/api/projects/${project}/document`)).json()
    await post(local.baseUrl, `/api/projects/${project}/ops`, {
      baseVersion: Number(document.version) || 0,
      ops: [{ type: 'upsertAsset', payload: { asset } }]
    })

    const asked = await post(local.baseUrl, '/api/spaces/local-guess/place/build', { dryRun: true })
    expect(asked.status).toBe(202)
    const body = await asked.json()
    expect(body.scaleEdge).toBeNull()
    expect(body.scaleSource).toBe('guess')

    const logPath = path.join(local.dataRoot, 'place', 'local-guess', 'build.log')
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const text = await readFile(logPath, 'utf8').catch(() => '')
      if (text.includes('[')) break
      await wait(100)
    }
    const args = JSON.parse((await readFile(logPath, 'utf8')).split('\n').find((line) => line.startsWith('[')))
    expect(args).toContain('--door-guess')
    expect(args).not.toContain('--scale-edge')
  })

  // The build outlives the request, so the status has to be readable off the
  // disk afterwards — including by a server that was restarted since. A stub
  // that exits at once builds no hall, which is exactly the "it stopped" case,
  // and the reason has to be the real tail of its log and not a made-up sentence.
  it('reads a finished-and-built-nothing build as failed, with the real reason', async () => {
    await collectAWalk(local.baseUrl, 'local-after')
    await post(local.baseUrl, '/api/spaces/local-after/place/build', { dryRun: true })
    let body = null
    for (let attempt = 0; attempt < 60; attempt += 1) {
      body = await (await get(local.baseUrl, '/api/spaces/local-after/place/build')).json()
      if (body.status !== 'running') break
      await wait(150)
    }
    expect(body.status).toBe('failed')
    expect(body.error).toContain('1/5 frames')
    expect(body.step).toBe('frames (1 of 5)')
  })

  // A phone whose screen locked and came back presses the button again. That is
  // not a second build.
  it('hands back the job already running rather than starting a second one', async () => {
    const workRoot = path.join(local.dataRoot, 'place', 'local-twice')
    await mkdir(workRoot, { recursive: true })
    await collectAWalk(local.baseUrl, 'local-twice')
    // A status file naming a pid that IS alive — this test process — is exactly
    // what a running build looks like from the route's side.
    await writeFile(path.join(workRoot, 'build-status.json'), JSON.stringify({
      startedAt: Date.now(),
      pid: process.pid,
      space: 'local-twice',
      gpu: 'local',
      scaleEdge: 8.3
    }))
    const asked = await post(local.baseUrl, '/api/spaces/local-twice/place/build')
    expect(asked.status).toBe(200)
    expect((await asked.json()).status).toBe('running')
  })
})
