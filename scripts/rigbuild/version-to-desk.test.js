import { describe, expect, it } from 'vitest'
import { deskBaseOf, otherProjectsOnDesk, summaryOf } from './version-to-desk.mjs'

const fx = [
    { key: 'a:1', universe: 1 }, { key: 'a:2', universe: 2 }, { key: 'a:3', universe: 2 },
    { key: 'b:1', universe: 1 }, { key: 'c:x:y', universe: 1 }, { key: 'b:2', universe: 1 }
]

describe('version-to-desk', () => {
    it('lists the other projects, sorted and once', () => {
        expect(otherProjectsOnDesk(fx, 'a')).toEqual(['b', 'c'])
        expect(otherProjectsOnDesk(fx, 'b')).toEqual(['a', 'c'])
        expect(otherProjectsOnDesk([], 'a')).toEqual([])
        expect(otherProjectsOnDesk(undefined, 'a')).toEqual([])
        expect(otherProjectsOnDesk([{ key: 'a:1' }], 'a')).toEqual([])
    })
    it('takes the desk base from the api', () => {
        expect(deskBaseOf('http://diiii.localhost/serverXR')).toBe('http://diiii.localhost/light')
        expect(deskBaseOf('https://x.test/serverXR/')).toBe('https://x.test/light')
    })
    it('summarises the desk', () => {
        const s = summaryOf(fx, { cues: { n: 50, index: 0, name: 'The road in', running: true } }, 'a')
        expect(s.perProject).toEqual({ a: 3, b: 2, c: 1 })
        expect([s.u1, s.u2]).toEqual([1, 2])
        expect(s.runner).toEqual({ n: 50, index: 0, name: 'The road in', running: true })
        expect(summaryOf(fx, null, 'zz').runner.n).toBeNull()
    })
})
