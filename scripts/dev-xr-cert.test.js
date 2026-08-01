import { describe, expect, it } from 'vitest'
import {
    buildSubjectAltName,
    certCoversAddresses,
    localAddresses,
    resolveOpenssl
} from './dev-xr-cert.mjs'

describe('buildSubjectAltName', () => {
    it('always covers localhost and the loopback', () => {
        const san = buildSubjectAltName([])
        expect(san).toContain('DNS:localhost')
        expect(san).toContain('IP:127.0.0.1')
    })

    it('includes every LAN address as an IP entry', () => {
        // The IP form matters. A cert naming the address only as a DNS entry
        // does not match when the URL is an IP, and mobile browsers reject it
        // outright — they will not even offer the "proceed anyway" escape, which
        // turns a one-tap warning into a dead end in the headset.
        const san = buildSubjectAltName(['192.168.1.231', '10.0.0.4'])
        expect(san).toContain('IP:192.168.1.231')
        expect(san).toContain('IP:10.0.0.4')
        expect(san).not.toContain('DNS:192.168.1.231')
    })

    it('does not repeat an address that is already covered', () => {
        const san = buildSubjectAltName(['127.0.0.1', '127.0.0.1'])
        expect(san.match(/127\.0\.0\.1/g)).toHaveLength(1)
    })
})

describe('localAddresses', () => {
    it('takes external IPv4 only', () => {
        // IPv6 and loopback are filtered: the headset reaches this machine on a
        // LAN IPv4, and an IPv6 entry in the SAN is noise that will never match
        // the URL anyone types.
        const interfaces = {
            'Wi-Fi': [
                { family: 'IPv4', internal: false, address: '192.168.1.231' },
                { family: 'IPv6', internal: false, address: 'fe80::1' }
            ],
            'Loopback': [{ family: 'IPv4', internal: true, address: '127.0.0.1' }]
        }
        expect(localAddresses(interfaces)).toEqual(['192.168.1.231'])
    })

    it('survives a machine with no network at all', () => {
        expect(localAddresses({})).toEqual([])
        expect(localAddresses({ 'Wi-Fi': [] })).toEqual([])
    })
})

describe('resolveOpenssl', () => {
    const never = () => false

    it('prefers an explicit OPENSSL_BIN over everything', () => {
        expect(resolveOpenssl({
            env: { OPENSSL_BIN: 'C:\\my\\openssl.exe' },
            runnable: () => true
        })).toBe('C:\\my\\openssl.exe')
    })

    it('uses PATH when openssl is genuinely on it', () => {
        expect(resolveOpenssl({ env: {}, runnable: () => true })).toBe('openssl')
    })

    it('falls back to the openssl Git for Windows ships', () => {
        // The actual failure this guards. Git for Windows installs openssl at
        // usr/bin and keeps that directory OFF the system PATH, so
        // `npm run dev:xr` died with `spawnSync openssl ENOENT` in PowerShell
        // while the identical command worked in Git Bash. It read as "VR is
        // broken" and was really "this shell cannot see that binary".
        const gitOpenssl = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
        expect(resolveOpenssl({
            platform: 'win32',
            env: {},
            runnable: never,
            exists: (candidate) => candidate === gitOpenssl
        })).toBe(gitOpenssl)
    })

    it('does not go hunting through Windows paths on macOS or Linux', () => {
        expect(() => resolveOpenssl({
            platform: 'darwin',
            env: {},
            runnable: never,
            exists: () => true
        })).toThrow(/openssl not found/)
    })

    it('throws with the fix in the message rather than a bare ENOENT', () => {
        // A raw spawn error sends you debugging the dev server, which is not
        // where the problem is.
        expect(() => resolveOpenssl({
            platform: 'win32',
            env: {},
            runnable: never,
            exists: never
        })).toThrow(/OPENSSL_BIN|Git Bash/)
    })
})

describe('certCoversAddresses', () => {
    it('accepts a cert naming every current address', () => {
        const certText = 'X509v3 Subject Alternative Name:\n DNS:localhost, IP Address:192.168.1.231'
        expect(certCoversAddresses(certText, ['192.168.1.231'])).toBe(true)
    })

    it('rejects a cert from the old network', () => {
        // Moving between wifi networks changes the IP, and the stale cert then
        // names an address that is not ours — the headset gets a mismatch it
        // cannot proceed past. This is what triggers regeneration.
        const certText = 'DNS:localhost, IP Address:10.0.0.4'
        expect(certCoversAddresses(certText, ['192.168.1.231'])).toBe(false)
    })

    it('is trivially true when there is no LAN address to cover', () => {
        expect(certCoversAddresses('DNS:localhost', [])).toBe(true)
    })
})
