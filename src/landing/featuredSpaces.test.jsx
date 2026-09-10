/* global __DI_WORKS__ */
import { describe, expect, it } from 'vitest'
import { featuredSpacesFor } from './LandingPage.jsx'
import { WORK_IDS } from '../works/works.js'

/**
 * The front door's exhibition row, on an install with no accounts.
 *
 * It used to disappear whole when the server said "local", which left an
 * artist — the owner included — with no link to WCC anywhere on his own front
 * door, on a machine that has WCC on its disk. Two different reasons had been
 * folded into one boolean; this keeps them apart.
 */
const ids = (options) => featuredSpacesFor(options).map((space) => space.id)

describe('the featured row on a local install', () => {
    it('keeps the works that are in this build', () => {
        // Under vitest the define comes from vite.config.js with no profile
        // set, so this build has every work — the hosted answer.
        expect(__DI_WORKS__).toEqual(WORK_IDS)
        for (const id of WORK_IDS) expect(ids({ isLocalInstall: true })).toContain(id)
    })

    it('still drops the spaces a fresh install does not have', () => {
        // br_id_ge and beyond-form are database rows on di-studio.xyz, not code.
        // Nothing in a local build can make those chips lead anywhere.
        expect(ids({ isLocalInstall: true })).not.toContain('br-id-ge')
        expect(ids({ isLocalInstall: true })).not.toContain('beyond-form')
    })

    it('shows everything on the hosted site', () => {
        expect(ids({ isLocalInstall: false }))
            .toEqual(['wcc', 'br-id-ge', 'beyond-form', 'algovrithm'])
        expect(ids()).toEqual(ids({ isLocalInstall: false }))
    })
})
