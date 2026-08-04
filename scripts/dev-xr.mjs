/**
 * dev-xr.mjs — `npm run dev:xr`. The dev stack, served over HTTPS so a VR
 * headset on the same wifi can actually enter VR.
 *
 * Makes the cert if needed, then hands off to the normal dev stack with the
 * flag vite.config.js looks for. Everything else — ports, proxy, HMR — is
 * unchanged, so this is the ordinary dev server with one difference.
 *
 * Why HTTPS is the whole point: WebXR requires a secure context. `localhost` is
 * one, so VR works in a browser on this machine — but a standalone headset sees
 * the server as a plain-http LAN address, where browsers switch WebXR off
 * entirely. No secure context, no navigator.xr, no Enter VR button, and nothing
 * the app can do about it. See scripts/dev-xr-cert.mjs for the alternatives and
 * why this one won.
 *
 * A self-signed cert means one "connection is not private" warning per session
 * in the headset — tap Advanced, then proceed. After that the origin counts as
 * secure and WebXR is on.
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { localAddresses } from './dev-xr-cert.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Generated in a child process rather than imported and called, so a broken
// openssl fails here with its own message instead of halfway through boot.
execFileSync(process.execPath, [path.join(ROOT_DIR, 'scripts/dev-xr-cert.mjs')], {
    stdio: 'inherit',
    cwd: ROOT_DIR
})

const addresses = localAddresses()

console.log('')
console.log('  Open this IN THE HEADSET browser:')
for (const address of addresses) {
    console.log(`    https://${address}:5173/algovrithm`)
}
if (!addresses.length) {
    console.log('    (no LAN address found — is wifi on?)')
}
console.log('')
console.log('  The headset will warn that the connection is not private.')
console.log('  That is the self-signed cert. Tap Advanced, then proceed —')
console.log('  after that WebXR is enabled and Enter VR appears.')
console.log('')
console.log('  The headset must be on the same wifi as this machine.')
console.log('')

const child = spawn(process.execPath, [path.join(ROOT_DIR, 'scripts/dev-stack.mjs')], {
    stdio: 'inherit',
    cwd: ROOT_DIR,
    env: { ...process.env, DEV_XR_HTTPS: '1' }
})

child.on('exit', (code) => process.exit(code ?? 0))
