import { describe, expect, it } from 'vitest'

import { NODE_FLOOR, decideCommandName, decideMode, parseVersion, satisfiesFloor } from './detect.mjs'

describe('parseVersion', () => {
    it('reads a plain version', () => {
        expect(parseVersion('22.15.0')).toEqual([22, 15, 0])
    })

    it('reads the v-prefixed form node itself prints', () => {
        expect(parseVersion('v22.18.1')).toEqual([22, 18, 1])
    })

    it('ignores a prerelease suffix', () => {
        expect(parseVersion('23.0.0-nightly20250101')).toEqual([23, 0, 0])
    })

    it('treats junk as zero rather than throwing', () => {
        // `node -v` on a broken shim can return anything at all. A wrong answer
        // that fails the floor is recoverable; a crash inside detection is not.
        expect(parseVersion('not a version')).toEqual([0, 0, 0])
        expect(parseVersion(null)).toEqual([0, 0, 0])
        expect(parseVersion(undefined)).toEqual([0, 0, 0])
    })
})

describe('satisfiesFloor', () => {
    it('accepts the floor exactly', () => {
        expect(satisfiesFloor(NODE_FLOOR)).toBe(true)
    })

    it('rejects the version that ships node:sqlite behind a flag', () => {
        // The whole reason the floor is not serverXR's ">=22.5.0": 22.6 boots
        // and then dies on an unknown module.
        expect(satisfiesFloor('22.6.0')).toBe(false)
    })

    it('accepts a newer minor and a newer major', () => {
        expect(satisfiesFloor('22.18.0')).toBe(true)
        expect(satisfiesFloor('24.0.0')).toBe(true)
    })

    it('rejects an older major even with a huge minor', () => {
        expect(satisfiesFloor('20.99.99')).toBe(false)
    })

    it('rejects nothing at all', () => {
        expect(satisfiesFloor(null)).toBe(false)
        expect(satisfiesFloor('')).toBe(false)
    })
})

describe('decideMode', () => {
    it('picks docker when the daemon runs and the images are public', () => {
        const result = decideMode({ dockerRunning: true, imagesPullable: true })

        expect(result.mode).toBe('docker')
    })

    it('falls back to node when docker runs but the images are private', () => {
        // This is today's real state — GHCR returns 403 anonymously. Choosing
        // docker here would 403 halfway through a stranger's first install.
        const result = decideMode({
            dockerRunning: true,
            imagesPullable: false,
            systemNode: '22.18.0'
        })

        expect(result.mode).toBe('node')
        expect(result.nodeSource).toBe('system')
        expect(result.reason).toContain('not public')
    })

    it('falls back to node when docker is installed but not running', () => {
        // Docker Desktop on the dock, never launched. `docker` resolves, the
        // daemon does not answer.
        const result = decideMode({
            dockerRunning: false,
            imagesPullable: true,
            systemNode: '22.18.0'
        })

        expect(result.mode).toBe('node')
    })

    it('uses the system node when it is new enough', () => {
        const result = decideMode({ systemNode: '22.20.0' })

        expect(result).toMatchObject({ mode: 'node', nodeSource: 'system' })
    })

    it('prefers a vendored node over a too-old system node', () => {
        const result = decideMode({ systemNode: '20.11.0', vendoredNode: '22.18.0' })

        expect(result).toMatchObject({ mode: 'node', nodeSource: 'vendored' })
    })

    it('downloads a node when the system one is too old and nothing is vendored', () => {
        const result = decideMode({ systemNode: '20.11.0', canReachNodeOrg: true })

        expect(result).toMatchObject({ mode: 'node', nodeSource: 'download' })
    })

    it('downloads a node when there is none at all', () => {
        const result = decideMode({ canReachNodeOrg: true })

        expect(result).toMatchObject({ mode: 'node', nodeSource: 'download' })
    })

    it('gives up only when there is no docker, no node, and no way to get one', () => {
        const result = decideMode({})

        expect(result.mode).toBe('none')
        expect(result.nodeSource).toBe(null)
    })

    it('gives up when docker is running but unusable and node cannot be fetched', () => {
        const result = decideMode({ dockerRunning: true, imagesPullable: false, canReachNodeOrg: false })

        expect(result.mode).toBe('none')
        expect(result.reason).toContain('docker')
    })

    it('obeys a forced docker choice without probing', () => {
        // Someone who typed --docker wants docker to fail loudly, not to be
        // quietly moved somewhere else.
        const result = decideMode({ forcedMode: 'docker', dockerRunning: false, imagesPullable: false })

        expect(result.mode).toBe('docker')
    })

    it('obeys a forced node choice and still reports where node comes from', () => {
        const result = decideMode({ forcedMode: 'node', dockerRunning: true, imagesPullable: true, systemNode: '22.18.0' })

        expect(result).toMatchObject({ mode: 'node', nodeSource: 'system' })
    })
})

describe('decideCommandName', () => {
    it('takes di, and installs dii alongside it', () => {
        expect(decideCommandName({ foreignDiOnPath: false })).toEqual({
            primary: 'di',
            alias: 'dii',
            shadowed: false
        })
    })

    it('never shadows a foreign di already on PATH', () => {
        // `di` is a real disk-information utility packaged on Debian and
        // Fedora. Silently taking it would break a machine we were invited on to.
        expect(decideCommandName({ foreignDiOnPath: true })).toEqual({
            primary: 'dii',
            alias: null,
            shadowed: true
        })
    })
})
