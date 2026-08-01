/**
 * dev-xr-cert.mjs — make a self-signed cert so a VR headset can reach the dev
 * server.
 *
 * WHY THIS EXISTS
 *
 * WebXR only runs in a SECURE CONTEXT. `localhost` counts as one, so VR works
 * fine in a browser on this machine — but a standalone headset is a different
 * machine, and to it the dev server is `http://192.168.1.231:5173`, a plain-HTTP
 * LAN address. Browsers switch WebXR off there, so `navigator.xr` does not even
 * exist and the piece cannot offer an Enter VR button. It looks broken; it is
 * the spec working as intended.
 *
 * The two usual ways round it both have real costs:
 *
 *   - A public tunnel (cloudflared/ngrok) gives real HTTPS, but publishes the
 *     dev server — and a serverXR running REQUIRE_AUTH=false — to the internet,
 *     and hands you a 50-character random hostname to type on a floating
 *     keyboard, in VR, every session.
 *   - USB port-forwarding (adb reverse) is private and fast, but needs the
 *     headset in developer mode, a Meta developer account, and a cable.
 *
 * This is the third way: serve the LAN address over HTTPS with a cert we make
 * ourselves. The URL stays short and memorable, nothing leaves the network, and
 * the only cost is one "not private" warning you tap through per session — after
 * which the origin IS a secure context and WebXR turns on.
 *
 * Usage:  npm run dev:xr        (generates the cert if missing, then serves)
 *         node scripts/dev-xr-cert.mjs --force   (regenerate, e.g. new IP)
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CERT_DIR = path.join(ROOT_DIR, '.dev-certs')
export const KEY_PATH = path.join(CERT_DIR, 'dev.key')
export const CERT_PATH = path.join(CERT_DIR, 'dev.crt')

/** Every address a headset might reach this machine on. */
export const localAddresses = (interfaces = os.networkInterfaces()) =>
    Object.values(interfaces)
        .flat()
        .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
        .map((entry) => entry.address)

/**
 * The SAN list. A cert without the exact IP in subjectAltName is rejected
 * outright by mobile browsers — they will not even offer the "proceed anyway"
 * escape hatch, which turns a one-tap warning into a dead end.
 */
export const buildSubjectAltName = (addresses) => {
    const entries = ['DNS:localhost', 'IP:127.0.0.1', ...addresses.map((ip) => `IP:${ip}`)]
    return [...new Set(entries)].join(',')
}

export const certExists = () => fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)

/**
 * Where Git for Windows and the common Windows installers put openssl. Ordered
 * by how likely the machine is to have it.
 */
export const WINDOWS_OPENSSL_CANDIDATES = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win32\\bin\\openssl.exe'
]

const canRun = (command) => {
    try {
        execFileSync(command, ['version'], { stdio: 'pipe' })
        return true
    } catch {
        return false
    }
}

/**
 * Which openssl to run.
 *
 * On macOS and Linux this is one lookup and PATH is right. On WINDOWS it
 * usually is not, even though nearly every machine here already has an
 * openssl: Git for Windows ships one at `usr/bin` and deliberately keeps that
 * directory off the system PATH. So `npm run dev:xr` died with
 * `spawnSync openssl ENOENT` in PowerShell while the identical command worked
 * in Git Bash — which puts Git's usr/bin on PATH itself. The failure looked
 * like "VR is broken" and was actually "this shell cannot see a binary the
 * other shell can".
 *
 * Probed rather than assumed, and OPENSSL_BIN wins, so a machine with a real
 * OpenSSL install uses that one instead of Git's.
 */
export const resolveOpenssl = ({
    platform = process.platform,
    env = process.env,
    candidates = WINDOWS_OPENSSL_CANDIDATES,
    exists = fs.existsSync,
    runnable = canRun
} = {}) => {
    if (env.OPENSSL_BIN) return env.OPENSSL_BIN
    if (runnable('openssl')) return 'openssl'

    if (platform === 'win32') {
        const found = candidates.find((candidate) => exists(candidate))
        if (found) return found
    }

    // Thrown with the fix in it. A bare ENOENT sends you looking at the dev
    // server, which is not where the problem is.
    throw new Error(
        'openssl not found — it is needed to make the dev HTTPS cert for VR.\n'
        + (platform === 'win32'
            ? '  Git for Windows ships one. Either run `npm run dev:xr` from Git Bash,\n'
              + '  or point at it directly:\n'
              + '    setx OPENSSL_BIN "C:\\Program Files\\Git\\usr\\bin\\openssl.exe"'
            : '  Install it with your package manager, or set OPENSSL_BIN to its path.')
    )
}

/**
 * True when the cert does not cover `address` — the machine moved network and
 * the old cert now names an IP that is not ours any more.
 */
export const certCoversAddresses = (certText, addresses) =>
    addresses.every((ip) => certText.includes(ip))

const generate = (openssl) => {
    const addresses = localAddresses()
    if (!addresses.length) {
        console.warn('[dev-xr-cert] no LAN address found — cert will only cover localhost')
    }

    fs.mkdirSync(CERT_DIR, { recursive: true })

    // -nodes so the key is unencrypted: Vite reads it non-interactively, and a
    // passphrase prompt would hang the dev server on start.
    execFileSync(openssl, [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', KEY_PATH,
        '-out', CERT_PATH,
        '-days', '365',
        '-subj', '/CN=di.iiii dev',
        '-addext', `subjectAltName=${buildSubjectAltName(addresses)}`
    ], { stdio: 'pipe' })

    return addresses
}

const main = () => {
    const force = process.argv.includes('--force')
    const addresses = localAddresses()
    // Resolved once, up front: if openssl is missing, say so before doing any
    // work, and never probe for it twice in one run.
    const openssl = resolveOpenssl()

    if (!force && certExists()) {
        const certText = execFileSync(openssl, ['x509', '-in', CERT_PATH, '-text', '-noout'], {
            encoding: 'utf8'
        })
        if (certCoversAddresses(certText, addresses)) {
            console.log('[dev-xr-cert] existing cert covers', addresses.join(', ') || 'localhost')
            return
        }
        console.log('[dev-xr-cert] address changed — regenerating')
    }

    generate(openssl)
    console.log('[dev-xr-cert] wrote .dev-certs/ for', addresses.join(', ') || 'localhost')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main()
}
