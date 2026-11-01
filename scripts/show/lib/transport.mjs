// Run a bash script on the show machine: here (`host: "local"`) or over ssh. The script goes in on
// stdin (`bash -s`), so nothing else may read that stdin; values reach it as shell-quoted
// assignments at its top, never as remote argv. stdout comes back as a Buffer (a checkpoint is a
// tarball), stderr and the exit code are always kept: the old GO threw both away (G07).
import { spawn } from 'node:child_process'

export const shq = (s) => `'${String(s ?? '').replace(/'/g, `'\\''`)}'`

/** `NAME='value'` lines for the top of a script. */
export const assignments = (vars) => Object.entries(vars).map(([k, v]) => `${k}=${shq(v)}`).join('\n')

export function makeTransport({ host, user = null, env = process.env, spawnImpl = spawn, timeoutMs = 60000 } = {}) {
    if (!host) throw new Error('no host: the profile must name the machine, or "local"')
    const local = host === 'local'
    const target = local ? null : user ? `${user}@${host}` : host
    const [cmd, argv] = local
        ? ['bash', ['-s']]
        : ['ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=3', target, 'bash', '-s']]
    return {
        where: local ? 'this machine' : target,
        local,
        run: (script) => new Promise((resolve) => {
            let child
            try {
                child = spawnImpl(cmd, argv, { env, stdio: ['pipe', 'pipe', 'pipe'] })
            } catch (error) {
                resolve({ code: 127, stdout: Buffer.alloc(0), stderr: String(error?.message || error) })
                return
            }
            const out = []
            const err = []
            let timedOut = false
            const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeoutMs)
            child.stdout.on('data', (d) => out.push(d))
            child.stderr.on('data', (d) => err.push(d))
            child.on('error', (error) => {
                clearTimeout(timer)
                resolve({ code: 127, stdout: Buffer.concat(out), stderr: String(error?.message || error) })
            })
            child.on('close', (code) => {
                clearTimeout(timer)
                const stderr = Buffer.concat(err).toString('utf8') + (timedOut ? `\n(stopped after ${timeoutMs} ms)` : '')
                resolve({ code: timedOut ? 124 : code ?? 1, stdout: Buffer.concat(out), stderr })
            })
            child.stdin.on('error', () => {})
            child.stdin.end(script)
        })
    }
}

/** The last few lines of stderr, for a NO-GO reason. */
export const tail = (text, n = 3) => String(text || '').trim().split('\n').filter(Boolean).slice(-n).join(' | ').slice(0, 400)
