// ~/.di/name/ — what this install keeps about its network name.
//
//   install.key        Ed25519 private key, PEM, mode 600 — signs every call to the name broker
//   install.pub        the public half, base64url (the 32 raw bytes), what the broker stores
//   name.json          { label, zone, name, claimedAt, brokerUrl }
//   acme-account.key   this install's own Let's Encrypt account key, 600
//   key.pem            the TLS key, made HERE and never sent anywhere, 600
//   cert.pem           the certificate for <name> and *.<name>
//   cert.json          { notAfter, issuedAt, names }
//
// Never `~/.di/tls/` (paths.mjs `tls`): that is what `di up` serves today.
// Reading never throws: absent or unreadable is "none". Every write is atomic and sets its mode on every write.
// Windows has no modes; atomicWrite ignores that there.
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { writeFileAtomic } from './atomicWrite.mjs'
import { paths } from './paths.mjs'

export const nameFiles = (home) => {
    const dir = paths(home).name
    return {
        dir,
        installKey: path.join(dir, 'install.key'),
        installPub: path.join(dir, 'install.pub'),
        nameJson: path.join(dir, 'name.json'),
        acmeAccountKey: path.join(dir, 'acme-account.key'),
        cert: path.join(dir, 'cert.pem'),
        key: path.join(dir, 'key.pem'),
        certJson: path.join(dir, 'cert.json')
    }
}

const readJson = (file) => {
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch {
        return null
    }
}

export const readName = (home) => {
    const n = readJson(nameFiles(home).nameJson)
    return n && n.label && n.name && n.zone ? n : null
}

export const readCertInfo = (home) => {
    const c = readJson(nameFiles(home).certJson)
    return c && Number.isFinite(Date.parse(c.notAfter)) && fs.existsSync(nameFiles(home).cert) ? c : null
}

const ensureDir = async (home) => {
    const { dir } = nameFiles(home)
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 })
    try { await fsp.chmod(dir, 0o700) } catch { /* no modes here */ }
}

/** A PEM private key made locally. Ed25519 for the install key, P-256 for the keys acme-client signs and serves with. */
export const makeKeyPem = (type = 'ec') => {
    const { privateKey } = type === 'ed25519'
        ? crypto.generateKeyPairSync('ed25519')
        : crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    return privateKey.export({ type: 'pkcs8', format: 'pem' })
}

/** The 32 raw public bytes of an Ed25519 private key PEM, base64url — the form the broker's /v1/claim takes. */
export const publicKeyOf = (privateKeyPem) => {
    const jwk = crypto.createPublicKey(crypto.createPrivateKey(privateKeyPem)).export({ format: 'jwk' })
    return jwk.x
}

/** The install key: made once, kept. Returns { privateKeyPem, publicKey }. */
export const ensureInstallKey = async (home) => {
    const f = nameFiles(home)
    await ensureDir(home)
    let pem = null
    try { pem = fs.readFileSync(f.installKey, 'utf8') } catch { /* made below */ }
    if (!pem) {
        pem = makeKeyPem('ed25519')
        await writeFileAtomic(f.installKey, pem, { mode: 0o600 })
    }
    const publicKey = publicKeyOf(pem)
    await writeFileAtomic(f.installPub, `${publicKey}\n`, { mode: 0o644 })
    return { privateKeyPem: pem, publicKey }
}

/** The account key for Let's Encrypt: this install's own, never shared. */
export const ensureAcmeAccountKey = async (home) => {
    const f = nameFiles(home)
    await ensureDir(home)
    try {
        const pem = fs.readFileSync(f.acmeAccountKey, 'utf8')
        if (pem) return pem
    } catch { /* made below */ }
    const pem = makeKeyPem('ec')
    await writeFileAtomic(f.acmeAccountKey, pem, { mode: 0o600 })
    return pem
}

export const writeName = async (home, record) => {
    await ensureDir(home)
    await writeFileAtomic(nameFiles(home).nameJson, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
}

/** The key lands first, the certificate next, cert.json last: cert.json is what says "there is one". */
export const writeCert = async (home, { keyPem, certPem, info }) => {
    const f = nameFiles(home)
    await ensureDir(home)
    await writeFileAtomic(f.key, keyPem, { mode: 0o600 })
    await writeFileAtomic(f.cert, certPem, { mode: 0o644 })
    await writeFileAtomic(f.certJson, `${JSON.stringify(info, null, 2)}\n`, { mode: 0o600 })
}

/** Local files only. The broker keeps the label until it is revoked. Returns the files removed. */
export const forgetName = async (home) => {
    const dir = nameFiles(home).dir
    const had = fs.existsSync(dir) ? fs.readdirSync(dir) : []
    await fsp.rm(dir, { recursive: true, force: true })
    return had
}
