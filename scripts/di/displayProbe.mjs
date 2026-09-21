/**
 * The displays this machine has, asked of the OS.
 *
 * Thin on purpose: stageDisplays.mjs decides WHAT to run and how to read the
 * answer; this runs it. Every command gets a short leash and a swallowed
 * failure, because a probe runs on every supervisor tick and a stage box
 * with a broken xrandr still has a screen — `readProbe` says "one screen,
 * assumed" and the kiosk goes full-screen on it, unplaced.
 */

import { spawnSync } from 'node:child_process'
import process from 'node:process'

import { probeCommands, readProbe } from './stageDisplays.mjs'

const TIMEOUT_MS = 4000

const runOne = ({ command, args }) => {
    try {
        const result = spawnSync(command, args, { encoding: 'utf8', timeout: TIMEOUT_MS, windowsHide: true })
        return result.status === 0 ? String(result.stdout || '') : ''
    } catch {
        return ''
    }
}

/**
 * @param {object} [options]
 * @param {string} [options.platform]  defaults to this process's
 * @param {object} [options.env]       defaults to this process's
 * @param {(command: {command: string, args: string[]}) => string} [options.run]  injected by tests
 */
export const probeDisplays = ({ platform = process.platform, env = process.env, run = runOne } = {}) => {
    const outputs = {}
    for (const command of probeCommands(platform, env)) outputs[command.key] = run(command)
    return readProbe({ platform, env, outputs })
}
