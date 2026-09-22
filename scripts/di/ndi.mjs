/**
 * The NDI® runtime, fetched onto this machine.
 *
 * WHY THIS FILE EXISTS. di.iiii can put an operator's picture on the network as
 * an NDI source, and take another machine's NDI source in as an operator
 * (serverXR/src/ndi/, docs/architecture/NDI.md). Both halves need a library we
 * are not allowed to ship: di.iiii is AGPL-3.0, the runtime is Vizrt's under
 * their own EULA, and putting the binary in our repo or our release artifact
 * would be redistribution. So the library arrives the only honest way — the
 * person downloads it from Vizrt, and this file is the command that does the
 * clicking for them. Same bargain as `di keeper get` and the model weights
 * (keeper.mjs): FETCHED, NEVER BUNDLED, and not one byte until somebody types
 * the words.
 *
 * WHERE IT GOES. `~/.di/ndi/lib/`, and `DI_NDI_LIB` in di.env points at it.
 * That variable is the first thing serverXR's library.js tries, ahead of the
 * system paths, so this needs no root on any of the three platforms — which is
 * the point. An artist at a venue does not have the machine's admin password,
 * and `sudo pacman -S` is not an instruction that survives contact with a
 * borrowed laptop.
 *
 * WHAT EACH PLATFORM ACTUALLY SHIPS — read from the real downloads, 2026-09-22:
 *
 *   linux    Install_NDI_SDK_v6_Linux.tar.gz   62 MB   a tarball holding a
 *            self-extracting shell script; the payload is a second tar.gz glued
 *            on after a `__NDI_ARCHIVE_BEGIN__` line. Carries seven builds:
 *            x86_64, i686, aarch64 and four Raspberry Pi ARM variants.
 *   darwin   Install_NDI_SDK_v6_Apple.pkg     225 MB   a xar archive whose
 *            NDI_SDK_Component.pkg/Payload is a gzipped cpio. Nothing has to be
 *            installed to get the dylib out — bsdtar reads both layers, and
 *            bsdtar IS macOS's tar.
 *   win32    NDI 6 Runtime.exe                9.6 MB   Inno Setup 6.1. This is
 *            the REDISTRIBUTABLE (ndi.link/NDIRedistV6), not the 42 MB SDK: it
 *            is the runtime and nothing else, which is all we load. Inno's
 *            silent switches are documented and stable, so it installs
 *            unattended into our own directory.
 *
 * ON INTEGRITY, PLAINLY. keeper.mjs can check its downloads against a checksum
 * published by a different endpoint than the bytes (HuggingFace's LFS pointer,
 * GitHub's asset digest). NDI publishes no such thing, and the URLs are
 * version-agnostic — `Install_NDI_SDK_v6_Linux.tar.gz` is whatever 6.x is
 * current, so a checksum pinned in this file would be wrong by design the day
 * Vizrt cuts 6.3.3. What we do instead, and what it is worth:
 *   · TLS to Vizrt's own CDN, which is what any download gets;
 *   · the archive must actually contain the library we expected, at the path
 *     we expected — a redirect to a login page or an error document fails here;
 *   · the extracted file must be a real shared object for THIS platform, by
 *     magic number, not by extension;
 *   · and `--sha256 HEX` refuses anything else, for a person who has a
 *     checksum from somewhere they trust and wants it enforced.
 * The receipt written beside the library records what arrived, so a second
 * machine can be compared against the first. That is the honest description:
 * this proves the bytes are loadable and came from Vizrt over TLS. It does not
 * prove Vizrt's CDN was not compromised, and no checksum we could write here
 * would prove that either.
 *
 * NDI® is a registered trademark of Vizrt NDI AB — https://ndi.video
 */
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

import { paths, isWindows } from './paths.mjs'
import { readEnv, writeEnv } from './state.mjs'

/** The major runtime line. Bumping this is a deliberate, tested change. */
export const NDI_MAJOR = 6

const BASE = 'https://downloads.ndi.tv'

/**
 * One descriptor per platform. `bytes` is what the CDN served when this was
 * written — used only to print a size before a long download, never to decide
 * whether a file is good.
 */
export const NDI_DOWNLOAD = {
    linux: {
        url: `${BASE}/SDK/NDI_SDK_Linux/Install_NDI_SDK_v${NDI_MAJOR}_Linux.tar.gz`,
        file: `Install_NDI_SDK_v${NDI_MAJOR}_Linux.tar.gz`,
        bytes: 61_792_217,
        form: 'linux-sh'
    },
    darwin: {
        url: `${BASE}/SDK/NDI_SDK_Mac/Install_NDI_SDK_v${NDI_MAJOR}_Apple.pkg`,
        file: `Install_NDI_SDK_v${NDI_MAJOR}_Apple.pkg`,
        bytes: 225_463_783,
        form: 'apple-pkg'
    },
    win32: {
        // ndi.link/NDIRedistV6 resolves here. The redist, not the SDK: 9.6 MB
        // against 42, and it carries the one DLL we load.
        url: `${BASE}/SDK/NDI_SDK/NDI%20${NDI_MAJOR}%20Runtime.exe`,
        file: `NDI ${NDI_MAJOR} Runtime.exe`,
        bytes: 9_648_232,
        form: 'inno'
    }
}

/** What library.js will look for, per platform. */
export const LIB_NAME = {
    linux: `libndi.so.${NDI_MAJOR}`,
    darwin: 'libndi.dylib',
    win32: 'Processing.NDI.Lib.x64.dll'
}

/**
 * Which build inside the Linux tarball. There is exactly one aarch64 build and
 * it is labelled rpi4 — it is a plain aarch64 ELF and runs on any aarch64
 * Linux with a current glibc, so that label is packaging, not a restriction.
 * 32-bit ARM is the one case a machine cannot answer for itself: armv6 (Pi 1,
 * Zero) and armv7 (Pi 2/3/4) need different builds and `process.arch` says
 * only 'arm'. Pi 4 is the default because it is what people have; `--variant`
 * is there for the Zero in the drawer.
 */
export const LINUX_BUILD = {
    x64: 'x86_64-linux-gnu',
    ia32: 'i686-linux-gnu',
    arm64: 'aarch64-rpi4-linux-gnueabi',
    arm: 'arm-rpi4-linux-gnueabihf'
}

export const LINUX_VARIANTS = [
    'x86_64-linux-gnu',
    'i686-linux-gnu',
    'aarch64-rpi4-linux-gnueabi',
    'arm-rpi1-linux-gnueabihf',
    'arm-rpi2-linux-gnueabihf',
    'arm-rpi3-linux-gnueabihf',
    'arm-rpi4-linux-gnueabihf'
]

export const platformKey = () => `${process.platform}-${process.arch}`

/** → the descriptor, or null on a platform NDI publishes nothing for. */
export const ndiDownloadFor = (platform = process.platform) => NDI_DOWNLOAD[platform] || null

export const ndiPaths = (home) => {
    const p = paths(home)
    const root = path.join(p.home, 'ndi')
    const name = LIB_NAME[process.platform] || LIB_NAME.linux
    return {
        root,
        lib: path.join(root, 'lib'),
        library: path.join(root, 'lib', name),
        licences: path.join(root, 'licences'),
        receipt: path.join(root, 'receipt.json'),
        // Windows only: where the Inno installer is told to put itself.
        sdk: path.join(root, 'sdk')
    }
}

const sha256 = async (file) => {
    const hash = crypto.createHash('sha256')
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
    return hash.digest('hex')
}

// Streamed, like keeper's: 225 MB on a festival laptop is not a Buffer.
const streamTo = async (url, target, onProgress = null) => {
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok || !response.body) throw new Error(`download failed (${response.status})`)
    const total = Number(response.headers.get('content-length') || 0)
    let seen = 0
    const body = Readable.fromWeb(response.body)
    if (onProgress) {
        body.on('data', (chunk) => { seen += chunk.length; onProgress(seen, total) })
    }
    await pipeline(body, fs.createWriteStream(target))
}

/**
 * bsdtar by full path on Windows, else `tar`.
 *
 * Windows has two tars and the wrong one is usually first on PATH: Git for
 * Windows' GNU tar reads a leading `C:` as a REMOTE HOST and fails with
 * "Cannot connect to C:", naming neither tar nor the drive. The trap is
 * already written down in reference-di-cli-traps; this is the third place it
 * would have bitten.
 */
const tarBinary = () => (isWindows ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar')

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true, ...options })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (${code})`))))
})

/** Every regular file under a tree, relative to it. */
const walk = async (dir, base = dir) => {
    let entries = []
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return [] }
    const out = []
    for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) out.push(...await walk(full, base))
        else out.push({ full, rel: path.relative(base, full), name: entry.name })
    }
    return out
}

/**
 * Is this actually a shared library for this platform? Magic numbers, not the
 * extension — an HTML error page saved as `libndi.so.6` has the right name and
 * would otherwise be installed, then fail at dlopen with a sentence about ELF
 * headers that names nothing a person can act on.
 */
export const looksLikeLibrary = (head, platform = process.platform) => {
    if (!head || head.length < 4) return false
    if (platform === 'linux') return head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46
    if (platform === 'win32') return head[0] === 0x4d && head[1] === 0x5a
    // Mach-O 64, either endianness, plus a universal ("fat") binary.
    const be = head.readUInt32BE(0)
    return be === 0xfeedfacf || be === 0xcffaedfe || be === 0xcafebabe || be === 0xbebafeca
}

const assertLibrary = async (file, platform = process.platform) => {
    const handle = await fsp.open(file, 'r')
    try {
        const head = Buffer.alloc(8)
        await handle.read(head, 0, 8, 0)
        if (!looksLikeLibrary(head, platform)) {
            throw new Error('what arrived is not a library for this machine — refusing it')
        }
    } finally {
        await handle.close()
    }
    const stat = await fsp.stat(file)
    // The real thing is ~27 MB. Anything under a megabyte is a stub or a stub
    // of an error.
    if (stat.size < 1_000_000) throw new Error(`that library is only ${stat.size} bytes — refusing it`)
    return stat.size
}

/** A licence file worth carrying beside the library. */
const isLicence = (f) => /licen[cs]e/i.test(f.name) && /\.(txt|rtf)$/i.test(f.name)

/**
 * A libarchive tar, for the formats GNU tar cannot read (xar). On macOS `tar`
 * is bsdtar; elsewhere bsdtar is a separate binary that may or may not be
 * there, and the caller gets a sentence naming what to install rather than
 * "tar failed (2)".
 */
const archiveBinary = async () => {
    if (isWindows) return tarBinary()
    if (process.platform === 'darwin') return 'tar'
    for (const candidate of ['bsdtar', 'tar']) {
        try {
            await run(candidate, ['--version'])
            if (candidate === 'bsdtar') return candidate
        } catch { /* try the next */ }
    }
    throw new Error('this needs bsdtar (libarchive) to read an Apple package')
}

// ── the three unpackings ────────────────────────────────────────────────────

/**
 * Linux: a tarball containing `Install_NDI_SDK_v6_Linux.sh`, which is a shell
 * script with a tar.gz glued on after `__NDI_ARCHIVE_BEGIN__`. We never RUN
 * it — it only wants an EULA keypress before doing this same split — so the
 * payload is cut out by line number and untarred directly.
 */
export const unpackLinux = async (archive, into, { variant }) => {
    await run(tarBinary(), ['-xf', archive, '-C', into])
    const files = await walk(into)
    const installer = files.find((f) => /^Install_NDI_SDK_v\d+_Linux\.sh$/.test(f.name))
    if (!installer) throw new Error('that archive carries no NDI installer script')
    const text = await fsp.readFile(installer.full, 'latin1')
    const lines = text.split('\n')
    const marker = lines.findIndex((line) => line.trim() === '__NDI_ARCHIVE_BEGIN__')
    if (marker === -1) throw new Error('that installer has no payload marker — the format changed')
    // Byte offset of the line AFTER the marker. latin1 is 1 byte per char, so
    // the character count IS the byte count — which is the whole reason it is
    // read that way rather than as utf8.
    const offset = lines.slice(0, marker + 1).join('\n').length + 1
    const payload = path.join(into, 'payload.tar.gz')
    await pipeline(fs.createReadStream(installer.full, { start: offset }), fs.createWriteStream(payload))
    const out = path.join(into, 'sdk')
    await fsp.mkdir(out, { recursive: true })
    await run(tarBinary(), ['-xzf', payload, '-C', out])
    const found = (await walk(out)).filter((f) => f.name.startsWith(`libndi.so.${NDI_MAJOR}`))
    const wanted = found.find((f) => f.rel.includes(variant))
    if (!wanted) {
        const had = [...new Set(found.map((f) => path.basename(path.dirname(f.rel))))].sort()
        throw new Error(`that SDK has no ${variant} build${had.length ? ` — it carries: ${had.join(', ')}` : ''}`)
    }
    return { library: wanted.full, licences: (await walk(out)).filter(isLicence) }
}

/**
 * macOS: a xar archive whose NDI_SDK_Component.pkg/Payload is a gzipped cpio.
 *
 * `pkgutil --expand-full` is tried first because it is macOS's own tool for
 * exactly this and it unwraps both layers in one call. bsdtar is the fallback:
 * libarchive reads xar, and macOS's `tar` IS bsdtar — but only when that build
 * carries libxml2, which is not a promise Apple makes anywhere, so it is the
 * second choice rather than the first. On any other platform (which is how
 * this gets tested without a Mac) bsdtar is all there is.
 *
 * The pkg is never handed to `installer`: that wants admin and would put the
 * library somewhere this command does not own.
 */
export const unpackApple = async (archive, into) => {
    const out = path.join(into, 'sdk')
    await fsp.mkdir(out, { recursive: true })

    let expanded = false
    if (process.platform === 'darwin') {
        try {
            await run('/usr/sbin/pkgutil', ['--expand-full', archive, path.join(into, 'expanded')])
            expanded = true
        } catch { expanded = false }
    }

    if (expanded) {
        const files = await walk(path.join(into, 'expanded'))
        const wanted = files.find((f) => f.name === LIB_NAME.darwin && f.rel.includes('macOS'))
            || files.find((f) => f.name === LIB_NAME.darwin)
        if (!wanted) throw new Error('that package carries no libndi.dylib')
        return { library: wanted.full, licences: files.filter(isLicence) }
    }

    const bsd = await archiveBinary()
    await run(bsd, ['-xf', archive, '-C', into])
    const payload = (await walk(into)).find((f) => f.name === 'Payload')
    if (!payload) throw new Error('that package carries no payload')
    await run(bsd, ['-xf', payload.full, '-C', out])
    const files = await walk(out)
    const wanted = files.find((f) => f.name === LIB_NAME.darwin && f.rel.includes('macOS'))
        || files.find((f) => f.name === LIB_NAME.darwin)
    if (!wanted) throw new Error('that package carries no libndi.dylib')
    return { library: wanted.full, licences: files.filter(isLicence) }
}

/**
 * Windows: Inno Setup 6.1, installed unattended into our own directory.
 *
 * `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR=` are Inno's documented
 * switches and have been since 5.x. The DLL is then found by NAME under that
 * directory rather than at a guessed subpath, because the layout inside is
 * Vizrt's to change and the filename is the part library.js actually cares
 * about.
 *
 * If it refuses — an installer that insists on elevation is the likely
 * reason — the error says so and `di ndi get` can be run again after the
 * person installs it themselves: the second run finds the DLL through
 * NDI_RUNTIME_DIR_V6 and copies it, with nothing to download.
 */
export const unpackInno = async (archive, into, { sdkDir }) => {
    await fsp.mkdir(sdkDir, { recursive: true })
    try {
        await run(archive, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', `/DIR=${sdkDir}`], { cwd: into })
    } catch (error) {
        throw new Error(`the NDI installer would not run unattended (${error.message}). install it yourself from ndi.video, then run this again — it will find it.`)
    }
    const wanted = (await walk(sdkDir)).find((f) => f.name.toLowerCase() === LIB_NAME.win32.toLowerCase())
    if (!wanted) throw new Error('the installer ran but left no Processing.NDI.Lib.x64.dll')
    return { library: wanted.full, licences: (await walk(sdkDir)).filter(isLicence) }
}

/**
 * Windows, the already-installed case: NDI's own installers set
 * NDI_RUNTIME_DIR_V6 (or V5). If the runtime is already on the machine there
 * is nothing to download — copy it and be done. Checked BEFORE the network,
 * so a person who installed NDI Tools last year never waits for a byte.
 */
const alreadyOnMachine = async (env = process.env) => {
    for (const key of [`NDI_RUNTIME_DIR_V${NDI_MAJOR}`, 'NDI_RUNTIME_DIR_V5']) {
        const dir = String(env[key] || '').trim()
        if (!dir) continue
        const candidate = path.join(dir, LIB_NAME.win32)
        try {
            await fsp.access(candidate)
            return { path: candidate, from: key }
        } catch { /* named a directory that is not there any more */ }
    }
    return null
}

// ── status, get, remove ─────────────────────────────────────────────────────

export const ndiStatus = async (home) => {
    const n = ndiPaths(home)
    const lib = await fsp.stat(n.library).catch(() => null)
    const env = readEnv(home)
    let receipt = null
    try { receipt = JSON.parse(await fsp.readFile(n.receipt, 'utf8')) } catch { receipt = null }
    return {
        installed: Boolean(lib),
        library: lib ? n.library : null,
        bytes: lib?.size ?? 0,
        // di.env points at THIS library, not merely at some library: a stale
        // DI_NDI_LIB from a moved install is worth saying out loud.
        wired: env.DI_NDI_LIB === n.library,
        pointedAt: env.DI_NDI_LIB || null,
        version: receipt?.version || null,
        variant: receipt?.variant || null,
        sha256: receipt?.sha256 || null,
        fetchedAt: receipt?.fetchedAt || null,
        source: receipt?.source || null,
        root: n.root,
        platform: process.platform,
        supported: Boolean(ndiDownloadFor())
    }
}

/**
 * Fetch the runtime, verify it, put it where di.iiii looks, and write the one
 * line of env that makes the platform use it.
 *
 * Idempotent: a library already on disk is left alone unless `force`. An
 * interrupted get is resumed by running it again — the download goes to a
 * staging directory INSIDE ~/.di (never /tmp: staging in /tmp and renaming into
 * $HOME is EXDEV on any machine with a separate tmpfs, which is most of them).
 */
export const getNdi = async (home, {
    variant = null,
    expectSha256 = null,
    force = false,
    onStep = () => {},
    onProgress = null,
    env = process.env
} = {}) => {
    const n = ndiPaths(home)
    const platform = process.platform
    const descriptor = ndiDownloadFor(platform)
    if (!descriptor) throw new Error(`NDI publishes no runtime for ${platform}`)

    const already = await ndiStatus(home)
    if (already.installed && !force) {
        if (!already.wired) await writeEnv(home, { DI_NDI_LIB: n.library })
        return ndiStatus(home)
    }

    await fsp.mkdir(n.lib, { recursive: true })
    await fsp.mkdir(n.licences, { recursive: true })

    // Windows: is it already here from NDI's own installer?
    if (platform === 'win32') {
        const found = await alreadyOnMachine(env)
        if (found) {
            onStep(`already on this machine — ${found.from}`)
            await fsp.copyFile(found.path, n.library)
            const bytes = await assertLibrary(n.library, platform)
            await fsp.writeFile(n.receipt, `${JSON.stringify({
                version: `v${NDI_MAJOR}`, variant: null, bytes,
                sha256: await sha256(n.library),
                source: found.from, fetchedAt: new Date().toISOString()
            }, null, 2)}\n`)
            await writeEnv(home, { DI_NDI_LIB: n.library })
            return ndiStatus(home)
        }
    }

    const build = variant || LINUX_BUILD[process.arch] || LINUX_BUILD.x64
    if (platform === 'linux' && !LINUX_VARIANTS.includes(build)) {
        throw new Error(`no such build: ${build} — one of ${LINUX_VARIANTS.join(', ')}`)
    }

    const staging = await fsp.mkdtemp(path.join(n.root, 'staging-'))
    try {
        onStep(`fetching ${descriptor.file} (${(descriptor.bytes / 1e6).toFixed(0)} MB) from downloads.ndi.tv`)
        const archive = path.join(staging, descriptor.file)
        await streamTo(descriptor.url, archive, onProgress)

        const got = await sha256(archive)
        if (expectSha256 && got.toLowerCase() !== String(expectSha256).toLowerCase()) {
            throw new Error(`that download is ${got}, not the checksum you gave — refusing it`)
        }

        onStep('unpacking')
        const unpacked = descriptor.form === 'linux-sh' ? await unpackLinux(archive, staging, { variant: build })
            : descriptor.form === 'apple-pkg' ? await unpackApple(archive, staging)
                : await unpackInno(archive, staging, { sdkDir: n.sdk })

        // Into place via a temporary name in the SAME directory, so a half-copied
        // library is never what DI_NDI_LIB points at.
        const partial = `${n.library}.partial`
        await fsp.copyFile(unpacked.library, partial)
        const bytes = await assertLibrary(partial, platform)
        await fsp.chmod(partial, 0o755).catch(() => {})
        await fsp.rename(partial, n.library)

        // The licence travels with the library. It is Vizrt's, and a person who
        // has the binary is entitled to read the terms it came under without
        // going back to a website.
        // Deduplicated by name: the SDK repeats the same licence file once per
        // architecture, and eight copies of one text is not eight licences.
        const seen = new Set()
        for (const licence of unpacked.licences) {
            if (seen.has(licence.name) || seen.size >= 8) continue
            seen.add(licence.name)
            await fsp.copyFile(licence.full, path.join(n.licences, licence.name)).catch(() => {})
        }

        await fsp.writeFile(n.receipt, `${JSON.stringify({
            version: `v${NDI_MAJOR}`,
            variant: platform === 'linux' ? build : null,
            bytes,
            sha256: await sha256(n.library),
            archiveSha256: got,
            source: descriptor.url,
            fetchedAt: new Date().toISOString(),
            host: os.hostname()
        }, null, 2)}\n`)
    } finally {
        await fsp.rm(staging, { recursive: true, force: true })
    }

    await writeEnv(home, { DI_NDI_LIB: n.library })
    return ndiStatus(home)
}

/**
 * Ask the INSTALLED di.iiii to load it — the only check that means anything.
 *
 * A file of the right shape in the right place still proves nothing: the whole
 * question is whether serverXR's own loader can dlopen it in the process that
 * will do the sending. So this runs that loader, in that version, and reports
 * what the library says its version is. Skipped with a reason rather than
 * failed when there is no install yet, or no koffi — neither is a fault, and
 * `di ndi get` on a machine with no di.iiii on it yet is a legitimate order of
 * operations.
 */
export const verifyNdi = async (home, { versionDir = null, nodeBinary = 'node' } = {}) => {
    const n = ndiPaths(home)
    if (!versionDir) return { checked: false, why: 'di.iiii is not installed here yet' }
    const loader = path.join(versionDir, 'serverXR', 'src', 'ndi', 'library.js')
    if (!fs.existsSync(loader)) return { checked: false, why: 'this di.iiii is older than the NDI lane' }
    const script = [
        'const { loadNdi } = require(process.argv[1])',
        'const r = loadNdi()',
        'if (!r.ok) { console.log(JSON.stringify({ ok: false, reason: r.reason, how: r.how })); process.exit(0) }',
        'const { bindNdi } = require(process.argv[2])',
        'const b = bindNdi(r.koffi, r.lib, { send: true })',
        'const ok = b.fn.initialize()',
        'console.log(JSON.stringify({ ok, version: String(b.fn.version() || ""), path: r.path, canSend: Boolean(b.fn.sendNoConnections) }))',
        'b.fn.destroy()'
    ].join('\n')
    const binding = path.join(versionDir, 'serverXR', 'src', 'ndi', 'binding.js')
    return new Promise((resolve) => {
        const child = spawn(nodeBinary, ['-e', script, loader, binding], {
            cwd: path.join(versionDir, 'serverXR'),
            env: { ...process.env, DI_NDI_LIB: n.library },
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
        })
        let out = ''
        child.stdout.on('data', (chunk) => { out += chunk })
        child.on('error', () => resolve({ checked: false, why: 'could not start node' }))
        child.on('exit', () => {
            try {
                const parsed = JSON.parse(out.trim().split('\n').pop() || '{}')
                resolve({ checked: true, ...parsed })
            } catch {
                resolve({ checked: false, why: 'the loader said nothing we could read' })
            }
        })
    })
}

/** Take it off. It is a download, never the artist's work. */
export const removeNdi = async (home) => {
    const n = ndiPaths(home)
    await fsp.rm(n.root, { recursive: true, force: true })
    const env = readEnv(home)
    // null, not '': writeEnv drops null keys, and an empty DI_NDI_LIB still
    // reads as "a runtime is configured" to anything checking only presence.
    if (env.DI_NDI_LIB === n.library) await writeEnv(home, { DI_NDI_LIB: null })
}
