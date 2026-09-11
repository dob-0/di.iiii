/**
 * The small model that comes with di.iiii.
 *
 * The ask, in the owner's words: "the smallest model which can rule and
 * direct" — one that arrives with the platform, works for a VJ with no GPU and
 * no account, and is there when the internet is not. This file is how it gets
 * onto the machine and how it runs.
 *
 * IT IS FETCHED, NEVER BUNDLED. The release artifact is a few megabytes and the
 * weights are 859 MiB; nothing is downloaded until somebody types
 * `di keeper get`. The CLI's one standing promise about the network is that the
 * only unsolicited outbound request is the daily version check
 * (docs/deploy/DI_CLI.md), and a background prefetch of most of a gigabyte
 * would break it.
 *
 * WHICH MODEL, and why this one. Benched on CPU on 2026-09-11 against eight
 * candidates ≤2B: twelve requests routed into one JSON action — two of which
 * must route to NOTHING, one written in Armenian — free-form and under a
 * grammar, plus help questions. granite-4.0-h-1b was the only model that got
 * all twelve right in both modes and the only one that filled every field
 * without being forced to. LFM2-1.2B, the earlier pick from an easier bench,
 * got seven and routed half of everything to the same action.
 *
 *   model                 size    right action (free)   licence
 *   granite-4.0-h-1b      860 MB  12/12                 Apache-2.0
 *   Qwen3-1.7B            1.1 GB  11/12                 Apache-2.0
 *   Qwen3-0.6B            610 MB  10/12                 Apache-2.0
 *   LFM2.5-1.2B           698 MB   9/12                 LFM (see below)
 *   LFM2-1.2B             731 MB   7/12                 LFM
 *
 * The licence is not a footnote here: LFM Open License v1.0 is Apache's text
 * plus a clause withdrawing commercial use from any entity over $10M of annual
 * revenue. Redistributable, but not something an open platform can hand to
 * everyone who installs it. Granite is Apache-2.0 with nothing attached.
 *
 * WHAT RUNS IT. llama.cpp's own release build for this platform — a CPU build,
 * 11–17 MB, no GPU and no toolchain. The server already knows how to talk to
 * anything that answers OpenAI's /v1/chat/completions (serverXR
 * localModelClient.js, named by LLM_BASE_URL), so `di keeper get` writes that
 * one line into di.env and the model is simply there.
 *
 * INTEGRITY. Both downloads are verified against a checksum published by a
 * different endpoint than the bytes: HuggingFace's LFS pointer for the weights,
 * the GitHub API's asset digest for the binary. That proves the CDN handed over
 * what the index says it should — nothing more, and it is worth saying which.
 */
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

import { paths, isWindows } from './paths.mjs'
import { readEnv, writeEnv } from './state.mjs'

export const MODEL = {
    name: 'granite-4.0-h-1b',
    repo: 'ibm-granite/granite-4.0-h-1b-GGUF',
    file: 'granite-4.0-h-1b-Q4_K_M.gguf',
    licence: 'Apache-2.0',
    bytes: 901_162_208
}

// Pinned, not "latest". llama.cpp cuts a release per build — several a day —
// and an install that silently follows the tip is an install nobody can
// reproduce when it breaks at a venue. Moving this constant is a one-line
// change with a test run behind it. `--build` overrides it for an experiment.
export const LLAMA_BUILD = 'b10909'

// The CPU builds. No CUDA, no ROCm, no Vulkan: the machine this is for is a
// laptop at a festival, and a GPU build that does not match the driver fails
// at load rather than falling back.
const LLAMA_ASSET = {
    'linux-x64': 'llama-{build}-bin-ubuntu-x64.tar.gz',
    'linux-arm64': 'llama-{build}-bin-ubuntu-arm64.tar.gz',
    'darwin-arm64': 'llama-{build}-bin-macos-arm64.tar.gz',
    'darwin-x64': 'llama-{build}-bin-macos-x64.tar.gz',
    'win32-x64': 'llama-{build}-bin-win-cpu-x64.zip',
    'win32-arm64': 'llama-{build}-bin-win-cpu-arm64.zip'
}

// 8090 is deliberately NOT the default: that is the port a hand-rolled
// llama.cpp stack on this desk already uses, and two servers fighting over it
// is a confusing first five minutes.
export const KEEPER_PORT = 8099

export const platformKey = () => `${process.platform}-${process.arch}`

export const keeperPaths = (home) => {
    const p = paths(home)
    const root = path.join(p.home, 'keeper')
    return {
        root,
        bin: path.join(root, 'bin'),
        server: path.join(root, 'bin', isWindows ? 'llama-server.exe' : 'llama-server'),
        models: path.join(root, 'models'),
        model: path.join(root, 'models', MODEL.file),
        pidFile: path.join(p.run, 'keeper.pid'),
        log: path.join(p.logs, 'keeper.log')
    }
}

const sha256 = async (file) => {
    const hash = crypto.createHash('sha256')
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
    return hash.digest('hex')
}

// Streamed, not buffered. install.mjs's download() reads the whole body into a
// Buffer, which is fine for a 4 MB release and is 859 MiB of resident memory
// here — on the kind of laptop this exists for.
const streamTo = async (url, target, onProgress = null) => {
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok || !response.body) throw new Error(`download failed (${response.status})`)
    const total = Number(response.headers.get('content-length') || 0)
    let seen = 0
    const body = Readable.fromWeb(response.body)
    if (onProgress) {
        body.on('data', (chunk) => {
            seen += chunk.length
            onProgress(seen, total)
        })
    }
    await pipeline(body, fs.createWriteStream(target))
}

/** The weights' checksum, from HuggingFace's LFS pointer — not from the CDN. */
const modelChecksum = async (model = MODEL) => {
    const answer = await fetch(`https://huggingface.co/${model.repo}/raw/main/${model.file}`, { redirect: 'follow' })
    if (!answer.ok) throw new Error(`cannot read the model index (${answer.status})`)
    const pointer = await answer.text()
    const oid = /oid sha256:([0-9a-f]{64})/.exec(pointer)
    const size = /size (\d+)/.exec(pointer)
    if (!oid) throw new Error('the model index carries no checksum')
    return { sha256: oid[1], bytes: size ? Number(size[1]) : null }
}

/** The binary's asset URL and checksum, from the GitHub release API. */
const llamaAsset = async (build = LLAMA_BUILD, key = platformKey()) => {
    const template = LLAMA_ASSET[key]
    if (!template) throw new Error(`no llama.cpp build published for ${key}`)
    const wanted = template.replace('{build}', build)
    const answer = await fetch(`https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${build}`, {
        headers: { accept: 'application/vnd.github+json' }
    })
    if (!answer.ok) throw new Error(`cannot read llama.cpp ${build} (${answer.status})`)
    const release = await answer.json()
    const asset = (release.assets || []).find((entry) => entry.name === wanted)
    if (!asset) throw new Error(`llama.cpp ${build} has no ${wanted}`)
    return {
        name: asset.name,
        url: asset.browser_download_url,
        bytes: asset.size,
        sha256: String(asset.digest || '').replace(/^sha256:/, '') || null
    }
}

const unpack = async (archive, into) => {
    const windowsZip = archive.endsWith('.zip')
    const command = windowsZip && !isWindows ? 'unzip' : 'tar'
    const args = windowsZip && !isWindows
        ? ['-q', '-o', archive, '-d', into]
        : ['-xf', archive, '-C', into]
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'ignore' })
        child.on('error', reject)
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`))))
    })
}

// The archive holds a build directory (llama-b10909/) with the binaries and
// every ggml .so beside them. All of it is needed and all of it is flattened
// into keeper/bin, because llama-server loads its backends from its own
// directory and a nested layout means setting LD_LIBRARY_PATH forever after.
const flattenInto = async (from, into) => {
    const entries = await fsp.readdir(from, { withFileTypes: true })
    for (const entry of entries) {
        const source = path.join(from, entry.name)
        if (entry.isDirectory()) { await flattenInto(source, into); continue }
        await fsp.copyFile(source, path.join(into, entry.name))
        if (/^llama-|\.(so|dylib|dll)/.test(entry.name)) {
            await fsp.chmod(path.join(into, entry.name), 0o755).catch(() => {})
        }
    }
}

export const keeperStatus = async (home) => {
    const k = keeperPaths(home)
    const [model, server] = await Promise.all([
        fsp.stat(k.model).catch(() => null),
        fsp.stat(k.server).catch(() => null)
    ])
    const env = readEnv(home)
    let pid = 0
    try { pid = Number(await fsp.readFile(k.pidFile, 'utf8')) } catch { pid = 0 }
    let running = false
    if (pid) { try { process.kill(pid, 0); running = true } catch { running = false } }
    return {
        installed: Boolean(model && server),
        model: model ? MODEL.name : null,
        modelBytes: model?.size ?? 0,
        // A half-finished get: the bytes are there and the wrong size. Said out
        // loud rather than left to fail at load with a parse error.
        modelComplete: Boolean(model && model.size === MODEL.bytes),
        serverBinary: server ? k.server : null,
        wired: env.LLM_BASE_URL === `http://127.0.0.1:${KEEPER_PORT}`,
        running,
        pid,
        port: KEEPER_PORT,
        root: k.root
    }
}

/**
 * Fetch the binary and the weights, verify both, and write the one line of env
 * that makes the platform use them. Idempotent: a file already on disk with the
 * right checksum is left alone, so an interrupted get is resumed by running it
 * again.
 */
export const getKeeper = async (home, { build = LLAMA_BUILD, onStep = () => {}, onProgress = null } = {}) => {
    const k = keeperPaths(home)
    await fsp.mkdir(k.bin, { recursive: true })
    await fsp.mkdir(k.models, { recursive: true })

    // ── the runner ──────────────────────────────────────────────────────
    const have = await fsp.stat(k.server).catch(() => null)
    if (!have) {
        onStep('looking up llama.cpp ' + build)
        const asset = await llamaAsset(build)
        const staging = await fsp.mkdtemp(path.join(k.root, 'staging-'))
        try {
            onStep(`fetching ${asset.name} (${(asset.bytes / 1e6).toFixed(0)} MB)`)
            const archive = path.join(staging, asset.name)
            await streamTo(asset.url, archive, onProgress)
            if (asset.sha256) {
                const got = await sha256(archive)
                if (got !== asset.sha256) throw new Error(`${asset.name} does not match its published checksum — refusing it`)
            }
            onStep('unpacking')
            await unpack(archive, staging)
            await fsp.rm(archive, { force: true })
            await flattenInto(staging, k.bin)
        } finally {
            await fsp.rm(staging, { recursive: true, force: true })
        }
        if (!fs.existsSync(k.server)) throw new Error('that build carries no llama-server')
    }

    // ── the weights ─────────────────────────────────────────────────────
    const model = await fsp.stat(k.model).catch(() => null)
    if (!model || model.size !== MODEL.bytes) {
        onStep('looking up the model')
        const published = await modelChecksum()
        onStep(`fetching ${MODEL.file} (${(MODEL.bytes / 1e6).toFixed(0)} MB) — this is the long part`)
        const partial = `${k.model}.partial`
        await streamTo(`https://huggingface.co/${MODEL.repo}/resolve/main/${MODEL.file}`, partial, onProgress)
        onStep('checking it')
        const got = await sha256(partial)
        if (got !== published.sha256) {
            await fsp.rm(partial, { force: true })
            throw new Error('the model does not match its published checksum — refusing it')
        }
        await fsp.rename(partial, k.model)
    }

    // ── and the one line that makes it the platform's ───────────────────
    await writeEnv(home, {
        LLM_BASE_URL: `http://127.0.0.1:${KEEPER_PORT}`,
        LLM_MODEL: MODEL.name
    })
    return keeperStatus(home)
}

/**
 * Start it, detached, with its pid beside the server's — the same shape as the
 * mDNS publisher, and for the same reason: `di down` has to end both.
 *
 * CPU only and deliberately modest: 4 threads and a 4096 context answer a
 * routing request in about two seconds on a thin laptop, and leave the machine
 * to the thing the person actually came to do.
 */
export const startKeeper = async (home, { port = KEEPER_PORT, threads = 4 } = {}) => {
    const k = keeperPaths(home)
    const status = await keeperStatus(home)
    if (!status.installed) return null
    if (status.running) return status
    await fsp.mkdir(paths(home).run, { recursive: true })
    await fsp.mkdir(paths(home).logs, { recursive: true })
    const log = fs.openSync(k.log, 'a')
    const child = spawn(k.server, [
        '-m', k.model,
        '--host', '127.0.0.1',
        '--port', String(port),
        '-c', '4096',
        '-ngl', '0',
        '-t', String(threads)
    ], {
        cwd: k.bin,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', log, log]
    })
    child.unref()
    if (!child.pid) return null
    await fsp.writeFile(k.pidFile, String(child.pid))
    return keeperStatus(home)
}

export const stopKeeper = async (home) => {
    const k = keeperPaths(home)
    let pid = 0
    try { pid = Number(await fsp.readFile(k.pidFile, 'utf8')) } catch { return false }
    if (!pid) return false
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
    await fsp.rm(k.pidFile, { force: true })
    return true
}

/** Wait for it to answer. A cold start is about a second; a slow disk, more. */
export const keeperReady = async (port = KEEPER_PORT, timeoutMs = 60_000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        try {
            const answer = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
            if (answer.ok) return true
        } catch { /* not yet */ }
        await new Promise((resolve) => { setTimeout(resolve, 500) })
    }
    return false
}

/** Take it off the machine. The weights are a download, never the artist's work. */
export const removeKeeper = async (home) => {
    await stopKeeper(home)
    const k = keeperPaths(home)
    await fsp.rm(k.root, { recursive: true, force: true })
    const env = readEnv(home)
    // null, not '': writeEnv drops null keys, and an empty LLM_BASE_URL would
    // still read as "a model is configured" to anything that only checks the
    // key's presence.
    if (env.LLM_BASE_URL === `http://127.0.0.1:${KEEPER_PORT}`) {
        await writeEnv(home, { LLM_BASE_URL: null, LLM_MODEL: null })
    }
}
