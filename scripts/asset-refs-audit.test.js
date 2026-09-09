import { describe, it, expect } from 'vitest'
import { auditProjectDocument, parseArgs, TIERS } from './asset-refs-audit.mjs'

const A = 'f5c4b3e023104970a8d09a72b9bb5ecd91ecd087a27fba802188d4e68001af69'
const B = '2ccadc1ed05d21e59db17114eea8a1753deab53326bae3f3175b86c145708b77'

const codePage = {
    assets: [],
    presentationState: {
        mode: 'code',
        codeFiles: [{ name: 'index.html', content: `<script>const a="/serverXR/api/projects/open-call/assets/${A}",b="/serverXR/api/projects/open-call/assets/${B}"</script>` }]
    }
}

describe('auditProjectDocument', () => {
    // The outage, reproduced: a document that references assets the tier does
    // not hold used to be indistinguishable from a healthy one.
    it('names every referenced asset the tier does not have', async () => {
        const report = await auditProjectDocument({
            spaceId: 'beyond-form', projectId: 'open-call', document: codePage, probe: async () => false
        })
        expect(report.referenced).toBe(2)
        expect(report.missing.map((r) => r.id).sort()).toEqual([A, B].sort())
    })

    it('is silent when the bytes are there', async () => {
        const report = await auditProjectDocument({
            spaceId: 'beyond-form', projectId: 'open-call', document: codePage, probe: async () => true
        })
        expect(report.missing).toEqual([])
        expect(report.referenced).toBe(2)
    })

    // An asset we were not allowed to read is not an asset that is gone. A
    // false alarm is how an audit gets ignored.
    it('separates "not allowed to look" from "not there"', async () => {
        const report = await auditProjectDocument({
            spaceId: 'beyond-form',
            projectId: 'open-call',
            document: codePage,
            probe: async (id) => (id === A ? 'unreadable' : false)
        })
        expect(report.unreadable.map((r) => r.id)).toEqual([A])
        expect(report.missing.map((r) => r.id)).toEqual([B])
    })

    it('reports nothing for a project that references nothing', async () => {
        const report = await auditProjectDocument({
            spaceId: 'open', projectId: 'empty', document: { assets: [] }, probe: async () => false
        })
        expect(report).toMatchObject({ referenced: 0, missing: [], unreadable: [] })
    })
})

describe('parseArgs', () => {
    it('defaults to the dev box and collects repeated filters', () => {
        expect(parseArgs([])).toMatchObject({ tier: 'local', spaces: [], projects: [] })
        expect(parseArgs(['--tier', 'staging', '--space', 'beyond-form', '--space', 'wcc', '--json']))
            .toMatchObject({ tier: 'staging', spaces: ['beyond-form', 'wcc'], json: true })
    })

    it('knows all three tiers and where their tokens come from', () => {
        expect(Object.keys(TIERS)).toEqual(['local', 'staging', 'prod'])
        expect(TIERS.prod.tokenEnv).toBe('PROD_API_TOKEN')
    })
})
