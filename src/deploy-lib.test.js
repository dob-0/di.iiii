import { describe, expect, it } from 'vitest'

import { getProductionPromotionPlan } from '../scripts/deploy-lib.mjs'

describe('getProductionPromotionPlan', () => {
    it('returns noop when main already matches the source', () => {
        expect(
            getProductionPromotionPlan({
                mainCommit: 'abc1234',
                sourceCommit: 'abc1234',
                mainInSource: true,
                sourceInMain: true
            })
        ).toEqual({ type: 'noop' })
    })

    it('returns fast-forward when main is behind the source', () => {
        expect(
            getProductionPromotionPlan({
                mainCommit: 'abc1234',
                sourceCommit: 'def5678',
                mainInSource: true,
                sourceInMain: false
            })
        ).toEqual({ type: 'fast-forward' })
    })

    it('returns abort-main-ahead when the source is behind main', () => {
        expect(
            getProductionPromotionPlan({
                mainCommit: 'def5678',
                sourceCommit: 'abc1234',
                mainInSource: false,
                sourceInMain: true
            })
        ).toEqual({ type: 'abort-main-ahead' })
    })

    it('returns merge when main and the source diverged', () => {
        expect(
            getProductionPromotionPlan({
                mainCommit: 'abc1234',
                sourceCommit: 'def5678',
                mainInSource: false,
                sourceInMain: false
            })
        ).toEqual({ type: 'merge' })
    })
})
