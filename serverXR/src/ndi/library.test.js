// @vitest-environment node

// Where each OS keeps the NDI® runtime, and what we say when it is not there.
// Everything here runs on fake env + fake fs: the lookup order is the contract, and CI
// has no NDI runtime on any platform (nor does the machine this was written on).
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { ndiLibraryCandidates, locateNdiLibrary, loadNdi, probeNdi, howFor } = require('./library.js')

// A filesystem that contains exactly these paths.
const fakeFs = (...paths) => ({ existsSync: (p) => paths.includes(p) })
// A koffi that loads exactly these paths and refuses everything else.
const fakeKoffi = (...loadable) => ({
  load: (p) => {
    if (!loadable.includes(p)) throw new Error(`cannot open shared object file: ${p}`)
    return { handle: p }
  }
})

const WIN_DLL = 'C:\\Program Files\\NDI\\NDI 6 Runtime\\v6\\Processing.NDI.Lib.x64.dll'
const WIN_DLL_V5 = 'C:\\Program Files\\NDI\\NDI 5 Runtime\\v5\\Processing.NDI.Lib.x64.dll'

describe('finding the NDI runtime', () => {
  it('asks DI_NDI_LIB first, on every platform', () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
      const found = locateNdiLibrary({
        platform,
        env: { DI_NDI_LIB: '/opt/ndi/libndi.so.6', NDI_RUNTIME_DIR_V6: 'C:\\Program Files\\NDI\\NDI 6 Runtime\\v6' },
        fs: fakeFs('/opt/ndi/libndi.so.6', WIN_DLL)
      })
      expect(found.path).toBe('/opt/ndi/libndi.so.6')
      expect(found.from).toBe('DI_NDI_LIB')
    }
  })

  it('on Windows reads %NDI_RUNTIME_DIR_V6%, then V5, and joins the x64 DLL name', () => {
    const six = locateNdiLibrary({
      platform: 'win32',
      env: { NDI_RUNTIME_DIR_V6: 'C:\\Program Files\\NDI\\NDI 6 Runtime\\v6', NDI_RUNTIME_DIR_V5: 'C:\\Program Files\\NDI\\NDI 5 Runtime\\v5' },
      fs: fakeFs(WIN_DLL, WIN_DLL_V5)
    })
    expect(six.path).toBe(WIN_DLL)
    expect(six.from).toBe('NDI_RUNTIME_DIR_V6')

    // Only the old runtime installed: V5 is the answer, not "nothing".
    const five = locateNdiLibrary({
      platform: 'win32',
      env: { NDI_RUNTIME_DIR_V5: 'C:\\Program Files\\NDI\\NDI 5 Runtime\\v5' },
      fs: fakeFs(WIN_DLL_V5)
    })
    expect(five.path).toBe(WIN_DLL_V5)
    expect(five.from).toBe('NDI_RUNTIME_DIR_V5')
  })

  it('on Windows finds nothing when the runtime dir variables are unset', () => {
    const found = locateNdiLibrary({ platform: 'win32', env: {}, fs: fakeFs(WIN_DLL) })
    expect(found.path).toBeNull()
    expect(found.candidates).toEqual([])
  })

  it('on macOS looks in /usr/local/lib, then the SDK folder', () => {
    const usr = locateNdiLibrary({ platform: 'darwin', env: {}, fs: fakeFs('/usr/local/lib/libndi.dylib', '/Library/NDI SDK for Apple/lib/macOS/libndi.dylib') })
    expect(usr.path).toBe('/usr/local/lib/libndi.dylib')

    const sdk = locateNdiLibrary({ platform: 'darwin', env: {}, fs: fakeFs('/Library/NDI SDK for Apple/lib/macOS/libndi.dylib') })
    expect(sdk.path).toBe('/Library/NDI SDK for Apple/lib/macOS/libndi.dylib')
  })

  it('on Linux offers the loader its bare soname first, newest first, then the usual directories', () => {
    // The order we would TRY (nothing filtered by what happens to exist here).
    const order = ndiLibraryCandidates({ platform: 'linux', env: {} }).map((c) => c.path)
    expect(order.slice(0, 3)).toEqual(['libndi.so.6', 'libndi.so.5', 'libndi.so'])
    expect(order).toContain('/usr/lib/libndi.so.6')
    expect(order).toContain('/usr/local/lib/libndi.so.6')
    expect(order.indexOf('/usr/lib/libndi.so.6')).toBeLessThan(order.indexOf('/usr/lib/libndi.so.5'))
    // A bare name is a question only the loader can answer, so it is never reported
    // as a find: `path` stays null until a file is really seen on disk.
    expect(locateNdiLibrary({ platform: 'linux', env: {}, fs: fakeFs() }).path).toBeNull()
    expect(locateNdiLibrary({ platform: 'linux', env: {}, fs: fakeFs('/usr/local/lib/libndi.so.5') }).path).toBe('/usr/local/lib/libndi.so.5')
  })
})

describe('loading it, and what we say when we cannot', () => {
  it('loads the first candidate that opens, and hands back the koffi handle', () => {
    const result = loadNdi({
      platform: 'win32',
      env: { NDI_RUNTIME_DIR_V6: 'C:\\Program Files\\NDI\\NDI 6 Runtime\\v6' },
      fs: fakeFs(WIN_DLL),
      requireKoffi: () => fakeKoffi(WIN_DLL)
    })
    expect(result.ok).toBe(true)
    expect(result.path).toBe(WIN_DLL)
    expect(result.lib).toEqual({ handle: WIN_DLL })
  })

  it('on Linux falls through the bare sonames to the one the loader accepts', () => {
    const result = loadNdi({
      platform: 'linux',
      env: {},
      fs: fakeFs(),
      requireKoffi: () => fakeKoffi('libndi.so.5')
    })
    expect(result.ok).toBe(true)
    expect(result.path).toBe('libndi.so.5')
  })

  it('says no-koffi when the optional FFI package is missing — and names npm, not NDI', () => {
    const result = loadNdi({
      platform: 'linux',
      requireKoffi: () => { throw new Error("Cannot find module 'koffi'") }
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('no-koffi')
    expect(result.how).toMatch(/npm install/)
    expect(result.how).not.toMatch(/ndi\.video/)
  })

  it('says not-installed with the right sentence per platform when nothing is there', () => {
    const win = loadNdi({ platform: 'win32', env: {}, fs: fakeFs(), requireKoffi: () => fakeKoffi() })
    expect(win).toMatchObject({ ok: false, reason: 'not-installed', how: 'install NDI Tools from ndi.video, then restart di' })

    const mac = loadNdi({ platform: 'darwin', env: {}, fs: fakeFs(), requireKoffi: () => fakeKoffi() })
    expect(mac).toMatchObject({ ok: false, reason: 'not-installed', how: 'install NDI Tools from ndi.video, then restart di' })

    // Linux has no NDI Tools installer — the sentence must not send a person hunting for one.
    const linux = loadNdi({ platform: 'linux', env: {}, fs: fakeFs(), requireKoffi: () => fakeKoffi() })
    expect(linux).toMatchObject({ ok: false, reason: 'not-installed', how: 'install libndi, then restart di' })
    expect(howFor('linux')).toBe('install libndi, then restart di')
  })

  it('separates "a library is there but will not load" from "there is none"', () => {
    const result = loadNdi({
      platform: 'linux',
      env: { DI_NDI_LIB: '/opt/broken/libndi.so.6' },
      fs: fakeFs('/opt/broken/libndi.so.6'),
      requireKoffi: () => fakeKoffi() // loads nothing
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('load-failed')
    expect(result.detail).toMatch(/cannot open/)
    expect(result.how).toBe('install libndi, then restart di')
  })
})

describe('the cheap probe the parent uses before forking a child', () => {
  it('reports no-koffi without loading anything', () => {
    let loaded = false
    const result = probeNdi({
      platform: 'linux',
      fs: fakeFs(),
      resolveKoffi: () => { loaded = true; throw new Error("Cannot find module 'koffi'") }
    })
    expect(result).toMatchObject({ ok: false, reason: 'no-koffi' })
    expect(loaded).toBe(true) // resolve was TRIED — it just did not load the module
  })

  it('refuses early on Windows with no runtime, but lets Linux ask the loader itself', () => {
    const win = probeNdi({ platform: 'win32', env: {}, fs: fakeFs(), resolveKoffi: () => '/koffi' })
    expect(win).toMatchObject({ ok: false, reason: 'not-installed' })

    // On Linux the bare sonames are candidates the loader may still satisfy, so the
    // probe lets the child try and report for itself — `certain: false` says as much.
    const linux = probeNdi({ platform: 'linux', env: {}, fs: fakeFs(), resolveKoffi: () => '/koffi' })
    expect(linux).toMatchObject({ ok: true, certain: false })

    const seen = probeNdi({ platform: 'linux', env: {}, fs: fakeFs('/usr/lib/libndi.so.6'), resolveKoffi: () => '/koffi' })
    expect(seen).toMatchObject({ ok: true, certain: true, path: '/usr/lib/libndi.so.6' })
  })
})
