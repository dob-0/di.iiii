// @vitest-environment node
// Continue, never recreate (N1880): the stem rule and what `di new` does with the server's answer.
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { createSpace, reasonFromFlags, EXIT_CONTINUE } from './continueGuard.mjs'

const { stemOf, sameStem } = createRequire(import.meta.url)('../../shared/continueStem.cjs')

describe('stemOf / sameStem', () => {
    it('strips -3d, -test, -vN, -N, -copy and dates from the end', () => {
        expect(stemOf('cinema-house-3d')).toBe('cinema-house')
        expect(stemOf('Hall Test 2026-11-01')).toBe('hall')
        expect(stemOf('moxir-v2')).toBe('moxir')
        expect(stemOf('newcomer-2')).toBe('newcomer')
        expect(stemOf('show-copy-3d')).toBe('show')
    })
    it('matches one place under its decorations, and not unrelated names', () => {
        expect(sameStem('cinema-house', 'cinema-house-3d')).toBe(true)
        expect(sameStem('Cinema House', 'cinema-house-v2')).toBe(true)
        expect(sameStem('moxir', 'dilijan')).toBe(false)
        expect(sameStem('v2', 'v3')).toBe(false)
    })
    it('allows one typo only in long stems', () => {
        expect(sameStem('philharmonia-hall', 'philharmonia-hal')).toBe(true)
        expect(sameStem('abcd', 'abce')).toBe(false)
    })
    it('numbered rooms and halls are different things; a swapped letter is not a typo (verifier #1243 finding 2)', () => {
        expect(sameStem('room-6', 'room-7')).toBe(false)
        expect(sameStem('hall-1', 'hall-2')).toBe(false)
        expect(sameStem('apollo-11', 'apollo-13')).toBe(false)
        expect(sameStem('studio-north', 'studio-nortk')).toBe(false)
        expect(sameStem('moxir', 'moxir-2')).toBe(true)
        expect(sameStem('room', 'room-6')).toBe(true)
    })
})

describe('createSpace (di new)', () => {
    const reply = (status, json) => async () => ({ status, ok: status < 400, json: async () => json })
    it('turns space_exists_similar into the continue line and never creates', async () => {
        const out = await createSpace({
            base: 'http://x', label: 'cinema-house-3d',
            fetchImpl: reply(409, { error: 'space_exists_similar', existing: 'cinema-house', label: 'Cinema House' })
        })
        expect(out.status).toBe('continue')
        expect(out.message).toBe('continue: cinema-house (Cinema House) — use it; to add this work as a project: di move PROJECT --to <space>')
        expect(EXIT_CONTINUE).toBe(2)
    })
    it('sends newAnyway only with a written reason', async () => {
        let sent
        const fetchImpl = async (_url, init) => { sent = JSON.parse(init.body); return { status: 201, ok: true, json: async () => ({ space: { id: 'x' } }) } }
        await createSpace({ base: 'http://x', label: 'x', fetchImpl })
        expect(sent.newAnyway).toBeUndefined()
        await createSpace({ base: 'http://x', label: 'x', newAnyway: 'a different venue', fetchImpl })
        expect(sent.newAnyway).toBe('a different venue')
        expect(reasonFromFlags({ 'new-anyway': true })).toBe('')
        expect(reasonFromFlags({ 'new-anyway': 'a different venue' })).toBe('a different venue')
    })
    it('passes other errors through', async () => {
        const out = await createSpace({ base: 'http://x', label: 'x', fetchImpl: reply(409, { error: 'Space already exists.' }) })
        expect(out).toEqual({ status: 'error', error: 'Space already exists.' })
    })
})
