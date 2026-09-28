/**
 * machine.mjs — keep the rig a good citizen on a shared, hot laptop.
 *
 * aylmo's CPU sits at 98–100 °C under load and froze on 2026-09-27 during a
 * software-rendered browser run (memory: reference_aylmo_cpu_heat). So each
 * browser session the rig opens:
 *   1. waits until the CPU package is at or below --max-temp (85 °C) — `sensors`;
 *   2. holds the machine-wide browser lock (one browser at a time across every
 *      agent session) — `flock` on --lock, the shared file every session uses;
 *   3. is short, and is closed before the lock is released;
 *   4. aborts if WebGL is not on a hardware GPU (suites.mjs checks the
 *      renderer string for SwiftShader / llvmpipe).
 * The GPU's state is read from sysfs, never `nvidia-smi` (which wakes it).
 */
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'

export const DEFAULT_LOCK = '/tmp/claude-1000/-home-dob/11e8ee0c-fc40-410b-8843-e87d2d3e4c84/scratchpad/locks/browser.lock'

export function packageTempC() {
    try {
        const out = execFileSync('sensors', [], { encoding: 'utf8' })
        const m = out.match(/Package id 0:\s*\+?([\d.]+)/)
        return m ? Number(m[1]) : null
    } catch { return null }
}

export function snapshot() {
    const snap = { loadavg: os.loadavg().map((x) => Number(x.toFixed(2))), cpus: os.cpus().length, packageC: packageTempC() }
    try { snap.gpuRuntime = fs.readFileSync('/sys/bus/pci/devices/0000:01:00.0/power/runtime_status', 'utf8').trim() } catch { /* not this box */ }
    snap.busy = snap.loadavg[0] > snap.cpus * 0.5
    return snap
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function waitCool(maxC, { say = console.log, maxWaitMs = 30 * 60 * 1000 } = {}) {
    const t0 = Date.now()
    let told = false
    for (;;) {
        const t = packageTempC()
        if (t === null || t <= maxC) {
            if (told) say(`  [heat] package ${t} °C — going`)
            return { waitedMs: Date.now() - t0, packageC: t }
        }
        if (!told) { say(`  [heat] package ${t} °C > ${maxC} °C — waiting to cool`); told = true }
        if (Date.now() - t0 > maxWaitMs) throw new Error(`CPU package stayed above ${maxC} °C for ${Math.round(maxWaitMs / 60000)} min (last ${t} °C) — not starting a browser`)
        await sleep(10000)
    }
}

/** Blocks until this process holds the flock on `file`; returns release(). */
export async function acquireLock(file, { say = console.log } = {}) {
    if (!file || file === 'none') return () => {}
    fs.mkdirSync(file.replace(/\/[^/]+$/, ''), { recursive: true })
    const t0 = Date.now()
    // -o: only flock itself holds the lock, so ending its process group frees it.
    // The holder watches THIS process: if the rig is killed (TaskStop, Ctrl+C,
    // a crash) the lock frees within 2 s. It used to be `sleep 86400`, which
    // outlived a killed rig and held every session's browser lock for 40 min.
    const watch = `echo held; while kill -0 ${process.pid} 2>/dev/null; do sleep 2; done`
    const holder = spawn('flock', ['-o', file, 'sh', '-c', watch], { stdio: ['ignore', 'pipe', 'inherit'], detached: true })
    let waitingSaid = false
    const timer = setInterval(() => { if (!waitingSaid) { say(`  [lock] waiting for ${file}`); waitingSaid = true } }, 3000)
    await new Promise((resolve, reject) => {
        holder.stdout.on('data', (d) => { if (String(d).includes('held')) resolve() })
        holder.on('exit', (code) => reject(new Error(`flock exited ${code} before the lock was held`)))
    })
    clearInterval(timer)
    if (waitingSaid) say(`  [lock] held after ${Math.round((Date.now() - t0) / 1000)} s`)
    const release = () => { try { process.kill(-holder.pid, 'SIGTERM') } catch { /* gone */ } }
    process.on('exit', release)
    return release
}
