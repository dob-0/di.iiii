import { describe, it, expect } from 'vitest'
import { applyLocally, byCallTime, linkLabel, propPicture } from './shootApi.js'
import { APP_PAGE_SHOOT, getAppLocationState, isReservedAppSegment } from '../utils/spaceRouting.js'

const at = (pathname) => getAppLocationState({ pathname, search: '' })

describe('the /shoot/{key} address', () => {
    it('opens the shoot sheet and keeps the key exactly as typed', () => {
        expect(at('/shoot/AbC_123-xyz')).toMatchObject({ page: APP_PAGE_SHOOT, spaceId: null, shootKey: 'AbC_123-xyz' })
    })

    it('a bare /shoot still lands on the page, which explains the link is incomplete', () => {
        expect(at('/shoot')).toMatchObject({ page: APP_PAGE_SHOOT, shootKey: '' })
    })

    it('no space can take the word', () => {
        expect(isReservedAppSegment('shoot')).toBe(true)
    })
})

describe('what the sheet shows', () => {
    const plan = { propImages: [['comb(?!at)', 'prop-comb.webp'], ['boot', 'prop-boots.webp'], ['(', 'broken.webp']] }

    it('finds a prop picture by name, so a prop the crew adds later gets one too', () => {
        expect(propPicture(plan, { text: 'Comb' })).toBe('prop-comb.webp')
        expect(propPicture(plan, { text: 'Black combat boots' })).toBe('prop-boots.webp')
        expect(propPicture(plan, { text: 'Hair gel' })).toBe('')
        expect(propPicture(plan, { text: 'Anything', img: 'own.webp' })).toBe('own.webp')
    })

    it('orders actors by call time as times, with no time last', () => {
        const cast = [{ id: 'a', callTime: '13:40' }, { id: 'b' }, { id: 'c', callTime: '9:30' }, { id: 'd', callTime: '11:00' }]
        expect(byCallTime(cast).map((c) => c.id)).toEqual(['c', 'd', 'a', 'b'])
    })

    it('labels a link by its site', () => {
        expect(linkLabel('https://www.list.am/ru/item/1')).toBe('list.am')
        expect(linkLabel('not a url')).toBe('Link')
    })

    it('shows a tick the moment it is tapped, and untick turns "actor has everything" off', () => {
        const before = { cast: [{ id: 'p', allSet: true, items: [{ id: 'r', done: true }, { id: 'w', done: true }] }], lists: [] }
        const after = applyLocally(before, [{ op: 'item.set', list: 'cast:p', item: 'r', done: false }])
        expect(after.cast[0].items[0].done).toBe(false)
        expect(after.cast[0].allSet).toBe(false)
        expect(before.cast[0].items[0].done).toBe(true)
    })
})
