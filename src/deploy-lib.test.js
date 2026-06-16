import { describe, expect, it } from 'vitest'

import { getProductionPromotionPlan } from '../scripts/deploy-lib.mjs'

describe('getProductionPromotionPlan', () => {
    it('returns noop when main already matches staging', () => {
        expect(
            getProductionPromotionPlan({
                mainCommit: 'abc1234',
                stagingCommit: 'abc1234',
                mainInStaging: true,
                stagingInMain: true
            })
        ).toEqual({ type: 'noop' })
    })

    it('returns fast-forward when main is behind staging', () => {
        expect(
            getProductionPromotionPlan({
                mainCommit: 'abc1234',
                stagingCommit: 'def5678',
                mainInStaging: true,
                stagingInMain: false
            })
        ).toEqual({ type: 'fast-forward' })
    })

    it('returns abort-main-ahead when staging is behind main', () => {
        expect(
            getProductionPromotionPlan({
                mainCommit: 'def5678',
                stagingCommit: 'abc1234',
                mainInStaging: false,
                stagingInMain: true
            })
        ).toEqual({ type: 'abort-main-ahead' })
    })

    it('returns merge when main and staging diverged', () => {
        expect(
            getProductionPromotionPlan({
                mainCommit: 'abc1234',
                stagingCommit: 'def5678',
                mainInStaging: false,
                stagingInMain: false
            })
        ).toEqual({ type: 'merge' })
    })
})
