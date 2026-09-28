/**
 * stack.mjs — a throwaway di.iiii stack for ONE target worktree.
 *
 * serverXR (the target's own code) on a free port with its own DATA_ROOT under
 * the run's output folder, and the target's Vite dev server on another free
 * port proxying to it. Never 4000/5173/443/80, never the shared local tier:
 * every key the target's serverXR/.env(.local) sets is blanked unless the rig
 * sets it itself, because dotenv never overrides a key already in the
 * environment — without that, a worktree whose .env.local points at the
 * machine's tier would have the rig writing into it.
 *
 * Vite runs in DEV mode on purpose: the walker's pose hook
 * (window.__diiWalkerRef) exists only in dev builds.
 */
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

export const freePort = (avoid = [80, 443, 4000, 5173]) => new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
        const { port } = srv.address()
        srv.close(() => (avoid.includes(port) ? freePort(avoid).then(resolve, reject) : resolve(port)))
    })
    srv.on('error', reject)
})

const envKeys = (file) => {
    try {
        return fs.readFileSync(file, 'utf8').split(/\r?\n/)
            .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
            .map((l) => l.slice(0, l.indexOf('=')).replace(/^export\s+/, '').trim())
    } catch { return [] }
}

const waitFor = async (url, ms, what, logFile) => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(1500) })
            if (r.ok) return
        } catch { /* not yet */ }
        await new Promise((r) => setTimeout(r, 400))
    }
    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').slice(-25).join('\n') : '(no log)'
    throw new Error(`${what} did not come up at ${url} within ${ms} ms. Last log lines (${logFile}):\n${tail}`)
}

export async function startStack({ worktree, outDir, token, say = console.log, beforeServer = null }) {
    const serverDir = path.join(worktree, 'serverXR')
    if (!fs.existsSync(path.join(worktree, 'node_modules'))) throw new Error(`${worktree} has no node_modules — run npm ci there first`)
    if (!fs.existsSync(path.join(serverDir, 'node_modules'))) throw new Error(`${serverDir} has no node_modules — run npm --prefix serverXR ci there first`)
    const dataRoot = path.join(outDir, 'data')
    fs.mkdirSync(dataRoot, { recursive: true })
    const serverPort = await freePort()
    const vitePort = await freePort([80, 443, 4000, 5173, serverPort])

    const blank = {}
    for (const k of [...envKeys(path.join(serverDir, '.env')), ...envKeys(path.join(serverDir, '.env.local'))]) blank[k] = ''
    const serverEnv = {
        ...process.env, ...blank,
        NODE_ENV: 'development',
        PORT: String(serverPort),
        HOST: '127.0.0.1',
        DATA_ROOT: dataRoot,
        DB_PATH: path.join(dataRoot, 'di.db'),
        ADMIN_API_TOKEN: token,
        REQUIRE_AUTH: 'false'
    }
    // Import work (bundles) that must land before the server opens the DB.
    if (beforeServer) await beforeServer({ dataRoot, serverEnv })

    const logs = { server: path.join(outDir, 'serverXR.log'), vite: path.join(outDir, 'vite.log') }
    const procs = []
    const server = spawn(process.execPath, ['src/index.js'], { cwd: serverDir, env: serverEnv, stdio: ['ignore', fs.openSync(logs.server, 'w'), fs.openSync(logs.server, 'a')], detached: true })
    procs.push(server)
    const viteBin = path.join(worktree, 'node_modules', 'vite', 'bin', 'vite.js')
    const viteEnv = { ...process.env, VITE_PROXY_API_TARGET: `http://127.0.0.1:${serverPort}`, BROWSER: 'none' }
    delete viteEnv.DEV_BROWSER
    const vite = spawn(process.execPath, [viteBin, '--port', String(vitePort), '--strictPort', '--host', '127.0.0.1'], { cwd: worktree, env: viteEnv, stdio: ['ignore', fs.openSync(logs.vite, 'w'), fs.openSync(logs.vite, 'a')], detached: true })
    procs.push(vite)

    const stop = () => {
        for (const p of procs) {
            try { process.kill(-p.pid, 'SIGTERM') } catch { /* gone */ }
        }
    }
    process.on('exit', stop)
    try {
        await waitFor(`http://127.0.0.1:${serverPort}/serverXR/api/health`, 40000, 'serverXR', logs.server)
        await waitFor(`http://127.0.0.1:${vitePort}/`, 60000, 'vite', logs.vite)
    } catch (e) { stop(); throw e }

    const apiBase = `http://127.0.0.1:${serverPort}/serverXR`
    const api = async (method, p, body) => {
        const r = await fetch(`${apiBase}${p}`, {
            method,
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: body === undefined ? undefined : JSON.stringify(body)
        })
        return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }
    }
    let commit = ''
    try { commit = execFileSync('git', ['-C', worktree, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() } catch { /* not git */ }
    let branch = ''
    try { branch = execFileSync('git', ['-C', worktree, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim() } catch { /* not git */ }
    say(`[stack] ${worktree} (${branch}@${commit}) — serverXR :${serverPort}, vite :${vitePort}, data ${dataRoot}`)
    return { base: `http://127.0.0.1:${vitePort}`, apiBase, api, stop, dataRoot, commit, branch, logs }
}
