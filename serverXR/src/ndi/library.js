// Finding and loading the NDI® runtime — the one the PERSON installed.
//
// di.iiii never ships this library (docs/architecture/NDI.md: the licence position).
// We look where NDI's own installers put it and `dlopen` what is there. Both halves
// are optional: `koffi` (the FFI, an optionalDependency) and the runtime itself.
// Nothing here runs at server boot, and `loadNdi()` is only ever called inside the
// forked child (worker.js) — a proprietary library never lives in serverXR's process.
//
// Where the names come from: Processing.NDI.Lib.h (MIT-licensed header of the NDI SDK,
// mirrored at github.com/DistroAV/DistroAV → lib/ndi/Processing.NDI.Lib.h):
//   NDILIB_LIBRARY_NAME  "Processing.NDI.Lib.x64.dll" | "libndi.dylib" | "libndi.so.6"
//   NDILIB_REDIST_FOLDER "NDI_RUNTIME_DIR_V6"   (V5 for the previous runtime)
const nodeFs = require('fs')
const nodePath = require('path')

const WINDOWS_DLL = 'Processing.NDI.Lib.x64.dll'
const RUNTIME_DIR_ENVS = ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5']
const MAC_PATHS = [
  '/usr/local/lib/libndi.dylib',
  // Where "NDI SDK for Apple" unpacks.
  '/Library/NDI SDK for Apple/lib/macOS/libndi.dylib'
]
const LINUX_NAMES = ['libndi.so.6', 'libndi.so.5', 'libndi.so']
const LINUX_DIRS = ['/usr/lib', '/usr/local/lib']

const HOW = {
  win32: 'install NDI Tools from ndi.video, then restart di',
  darwin: 'install NDI Tools from ndi.video, then restart di',
  linux: 'install libndi, then restart di'
}
const HOW_KOFFI = 'run "npm install" in serverXR so the optional koffi package is present, then restart di'

const howFor = (platform = process.platform) => HOW[platform] || HOW.linux

// The ordered list of things worth trying. `bare: true` is a name for the system
// loader to resolve (Linux) — it cannot be checked with fs, only by trying it.
function ndiLibraryCandidates({ env = process.env, platform = process.platform } = {}) {
  const join = platform === 'win32' ? nodePath.win32.join : nodePath.posix.join
  const out = []
  const explicit = String(env.DI_NDI_LIB || '').trim()
  if (explicit) out.push({ path: explicit, from: 'DI_NDI_LIB', bare: false })

  if (platform === 'win32') {
    for (const name of RUNTIME_DIR_ENVS) {
      const dir = String(env[name] || '').trim()
      if (dir) out.push({ path: join(dir, WINDOWS_DLL), from: name, bare: false })
    }
  } else if (platform === 'darwin') {
    for (const p of MAC_PATHS) out.push({ path: p, from: 'macos', bare: false })
  } else {
    for (const name of LINUX_NAMES) out.push({ path: name, from: 'loader', bare: true })
    for (const dir of LINUX_DIRS) {
      for (const name of LINUX_NAMES) out.push({ path: join(dir, name), from: dir, bare: false })
    }
  }
  return out
}

// What is actually there: absolute candidates that exist, plus the bare names (which
// only the loader can answer for). `path` is the first absolute hit, or null.
function locateNdiLibrary({ env = process.env, platform = process.platform, fs = nodeFs } = {}) {
  const candidates = ndiLibraryCandidates({ env, platform }).filter((c) => {
    if (c.bare) return true
    try { return fs.existsSync(c.path) } catch { return false }
  })
  const found = candidates.find((c) => !c.bare) || null
  return { path: found ? found.path : null, from: found ? found.from : null, candidates }
}

// → { ok:true, lib, koffi, path } | { ok:false, reason, how, detail? }
//   reason: 'no-koffi'      the optional FFI package is not installed
//           'not-installed' no NDI runtime anywhere we know to look
//           'load-failed'   a runtime is there but would not load
function loadNdi({
  env = process.env,
  platform = process.platform,
  fs = nodeFs,
  requireKoffi = () => require('koffi')
} = {}) {
  let koffi
  try {
    koffi = requireKoffi()
  } catch (error) {
    return { ok: false, reason: 'no-koffi', how: HOW_KOFFI, detail: String(error?.message || error) }
  }

  const { path: foundPath, candidates } = locateNdiLibrary({ env, platform, fs })
  let lastError = null
  for (const candidate of candidates) {
    try {
      const lib = koffi.load(candidate.path)
      return { ok: true, lib, koffi, path: candidate.path }
    } catch (error) {
      lastError = error
    }
  }
  // A file we could see refused to load → that is a different sentence from "nothing here".
  if (foundPath) {
    return { ok: false, reason: 'load-failed', how: howFor(platform), detail: String(lastError?.message || lastError) }
  }
  return { ok: false, reason: 'not-installed', how: howFor(platform) }
}

// The parent's question — "is it even worth starting the child?" — answered without
// loading anything: koffi is only RESOLVED (a path lookup), the runtime only stat'ed.
function probeNdi({
  env = process.env,
  platform = process.platform,
  fs = nodeFs,
  resolveKoffi = () => require.resolve('koffi')
} = {}) {
  try {
    resolveKoffi()
  } catch (error) {
    return { ok: false, reason: 'no-koffi', how: HOW_KOFFI, detail: String(error?.message || error) }
  }
  const { path: foundPath, candidates } = locateNdiLibrary({ env, platform, fs })
  if (!candidates.length) return { ok: false, reason: 'not-installed', how: howFor(platform) }
  // Only bare loader names left (Linux): cannot know without trying — the child will say.
  return { ok: true, path: foundPath, certain: Boolean(foundPath) }
}

module.exports = { ndiLibraryCandidates, locateNdiLibrary, loadNdi, probeNdi, howFor, HOW_KOFFI }
