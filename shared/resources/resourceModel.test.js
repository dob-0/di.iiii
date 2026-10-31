import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { KIND_IDS, bestFor, countByKind, findSecretLike, validateResources } from './resourceModel.mjs'

const example = JSON.parse(fs.readFileSync(path.join(__dirname, 'example.resources.json'), 'utf8'))
const clone = () => JSON.parse(JSON.stringify(example))

describe('resources file contract', () => {
    it('accepts the example file', () => {
        expect(validateResources(example)).toEqual([])
    })

    it('covers every kind in the example', () => {
        const counts = countByKind(example)
        for (const kind of KIND_IDS) expect(counts[kind]).toBeGreaterThan(0)
    })

    it('refuses "works" without proof, and proof without a source or date', () => {
        const doc = clone()
        delete doc.resources[0].proof
        doc.resources[1].proof = { text: 'ssh answered' }
        const errors = validateResources(doc)
        expect(errors.some((e) => e.includes('desk-pc') && e.includes('missing'))).toBe(true)
        expect(errors.some((e) => e.includes('home-server') && e.includes('no source'))).toBe(true)
        expect(errors.some((e) => e.includes('home-server') && e.includes('no date'))).toBe(true)
    })

    it('refuses "unchecked" without a why, unknown kinds, uses and states, and twin ids', () => {
        const doc = clone()
        delete doc.resources[7].why
        doc.resources[0].kind = 'spaceship'
        doc.resources[1].use = 'everyone'
        doc.resources[2].state = 'fine'
        doc.resources[3].id = 'desk-pc'
        const errors = validateResources(doc).join('\n')
        expect(errors).toMatch(/unchecked needs a why/)
        expect(errors).toMatch(/kind must be one of/)
        expect(errors).toMatch(/use must be one of/)
        expect(errors).toMatch(/state must be one of/)
        expect(errors).toMatch(/id is used twice/)
    })

    it('refuses a bestFor job that is not in tasks', () => {
        const doc = clone()
        doc.resources[0].bestFor = ['teleport']
        expect(validateResources(doc).join('\n')).toMatch(/bestFor "teleport" is not in tasks/)
    })

    it.each([
        'sk-ant-api03-abcdefghijklmnop',
        'ghp_abcdefghijklmnopqrstuvwxyz0123',
        'token: abcdef1234567890',
        'password=hunter22hunter22',
        '-----BEGIN OPENSSH PRIVATE KEY-----'
    ])('refuses a secret-looking value (%s)', (value) => {
        const doc = clone()
        doc.resources[3].secretsAt = value
        expect(findSecretLike(doc)).toEqual(['$.resources[3].secretsAt'])
        expect(validateResources(doc).join('\n')).toMatch(/looks like a secret value/)
    })

    it('does not flag where a secret lives', () => {
        expect(findSecretLike({ secretsAt: '~/.config/di-secrets (file name only), the key named "lab"' })).toEqual([])
    })
})

describe('bestFor — the pick per job', () => {
    it('orders what works, cheapest first, and skips spent', () => {
        expect(bestFor(example, 'chat').map((r) => r.id)).toEqual(['local-4b', 'plan-a'])
    })

    it('never hands others a resource that is for our own work or a person', () => {
        expect(bestFor(example, 'chat', { who: 'others' }).map((r) => r.id)).toEqual(['local-4b'])
        expect(bestFor(example, 'gpu-big', { who: 'others' }).map((r) => r.id)).toEqual(['cloud-a100'])
        expect(bestFor(example, 'gpu-big').map((r) => r.id)).toEqual(['desk-pc', 'cloud-a100'])
    })
})
