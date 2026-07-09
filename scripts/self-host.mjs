/**
 * self-host.mjs — one command from a clone (plus optionally a space bundle)
 * to a running local copy of di.iiii.
 *
 *   npm run selfhost                          # fresh install, blank main space
 *   npm run selfhost -- my.space-bundle.tar.gz            # import + run
 *   npm run selfhost -- my.space-bundle.tar.gz --as demo  # import under a new id
 *
 * Does, in order, skipping anything already done:
 *   1. npm install (root + serverXR) if node_modules is missing
 *   2. create serverXR/.env from .env.example with local-friendly defaults
 *      (REQUIRE_AUTH=false) and an empty serverXR/.env.local
 *   3. import the bundle via scripts/space-bundle.mjs (if one is given)
 *   4. start the dev stack (serverXR + Vite) and print the space URL
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_DIR = path.join(ROOT_DIR, 'serverXR')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const log = (msg) => console.log(`[selfhost] ${msg}`)
const die = (msg) => { console.error(`[selfhost] ERROR: ${msg}`); process.exit(1) }

const args = process.argv.slice(2)
const bundlePath = args.find((a) => !a.startsWith('--')) || null
const asIndex = args.indexOf('--as')
const spaceIdOverride = asIndex !== -1 ? args[asIndex + 1] : null

const run = (command, commandArgs, options = {}) => {
    const result = spawnSync(command, commandArgs, { cwd: ROOT_DIR, stdio: 'inherit', ...options })
    if (result.status !== 0) die(`${command} ${commandArgs.join(' ')} failed (exit ${result.status})`)
}

// 1. dependencies
if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules'))) {
    log('installing root dependencies…')
    run(npmCommand, ['install'])
}
if (!fs.existsSync(path.join(SERVER_DIR, 'node_modules'))) {
    log('installing serverXR dependencies…')
    run(npmCommand, ['install'], { cwd: SERVER_DIR })
}

// 2. env files
const envPath = path.join(SERVER_DIR, '.env')
const envLocalPath = path.join(SERVER_DIR, '.env.local')
if (!fs.existsSync(envPath)) {
    const examplePath = path.join(SERVER_DIR, '.env.example')
    if (!fs.existsSync(examplePath)) die('serverXR/.env.example missing — is this a full checkout?')
    let env = await fsp.readFile(examplePath, 'utf8')
    env = /^REQUIRE_AUTH=/m.test(env)
        ? env.replace(/^REQUIRE_AUTH=.*$/m, 'REQUIRE_AUTH=false')
        : env + '\nREQUIRE_AUTH=false\n'
    if (!/^CORS_ORIGINS=/m.test(env)) env += 'CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173\n'
    await fsp.writeFile(envPath, env)
    log('created serverXR/.env (auth off — local self-host defaults)')
}
if (!fs.existsSync(envLocalPath)) await fsp.writeFile(envLocalPath, '')

// 3. bundle import
let spaceId = null
if (bundlePath) {
    if (!fs.existsSync(path.resolve(bundlePath))) die(`bundle not found: ${bundlePath}`)
    const importArgs = [path.join(ROOT_DIR, 'scripts/space-bundle.mjs'), 'import', path.resolve(bundlePath)]
    if (spaceIdOverride) importArgs.push('--as', spaceIdOverride)
    log(`importing ${path.basename(bundlePath)}…`)
    const result = spawnSync(process.execPath, importArgs, { cwd: ROOT_DIR, encoding: 'utf8' })
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    if (result.status !== 0) process.exit(result.status ?? 1)
    const match = (result.stdout || '').match(/imported ".+" as "([^"]+)"/)
    spaceId = match ? match[1] : spaceIdOverride
}

// 4. run
log(`starting dev stack…${spaceId ? ` your space: http://localhost:5173/${spaceId}` : ''}`)
const dev = spawn(npmCommand, ['run', 'dev'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32'
})
dev.on('exit', (code) => process.exit(code ?? 0))
