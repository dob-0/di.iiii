import { describe, expect, it } from 'vitest'
import { DIFFERS, MISSING, SAME, compareSpaces } from './compare.js'
import { hash } from './hash.js'
import { connect } from './index.js'

const fingerprint = (over = {}) => ({
    id: 'x',
    isPublic: false,
    permanent: true,
    publishedProjectId: 'p',
    sceneVersion: 10,
    projects: [{ id: 'p', body: 'aaa', assets: ['a1', 'a2'], shared: true }],
    ...over
})
const cmp = (a, b) => compareSpaces({ name: 'staging', fingerprint: a }, { name: 'prod', fingerprint: b })

describe('hash', () => {
    it('ignores key order, so two identical documents look identical', () => {
        expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 }))
        expect(hash({ a: { x: 1, y: 2 } })).toBe(hash({ a: { y: 2, x: 1 } }))
    })

    it('still notices a change', () => {
        expect(hash({ a: 1 })).not.toBe(hash({ a: 2 }))
        expect(hash(null)).not.toBe(hash([]))
    })
})

describe('comparing two copies of a space', () => {
    it('calls two identical copies in step', () => {
        expect(cmp(fingerprint(), fingerprint())).toMatchObject({ state: SAME, summary: 'in step' })
    })

    it('says who is missing rather than inventing a difference', () => {
        expect(cmp(fingerprint(), null)).toMatchObject({ state: MISSING, onlyOn: 'staging' })
        expect(cmp(null, null)).toMatchObject({ state: MISSING })
    })

    // Who can see it comes first and is said in those words.
    it('puts the door first when the door differs', () => {
        const out = cmp(fingerprint(), fingerprint({ isPublic: true }))
        expect(out.state).toBe(DIFFERS)
        expect(out.notes[0]).toContain('THE DOOR DIFFERS')
        expect(out.notes[0]).toContain('staging is private, prod is public')
    })

    // The field everyone reads is lastTouchedAt, and it is bumped by anything
    // that brushes a space. Edits are what count.
    it('decides who is ahead by scene edits, not by any timestamp', () => {
        const out = cmp(fingerprint({ sceneVersion: 167 }), fingerprint({ sceneVersion: 121 }))
        expect(out.ahead).toBe('staging')
        expect(out.summary).toContain('46 more scene edit')
    })

    it('names a space that will delete itself', () => {
        expect(cmp(fingerprint(), fingerprint({ permanent: false })).summary).toContain('not permanent on prod')
    })

    it('notices a project on one side only', () => {
        const out = cmp(fingerprint(), fingerprint({ projects: [] }))
        expect(out.projects.find((p) => p.id === 'p')).toMatchObject({ state: MISSING, onlyOn: 'a' })
    })

    it('notices the same project with different bytes', () => {
        const out = cmp(fingerprint(), fingerprint({ projects: [{ id: 'p', body: 'bbb', assets: ['a1', 'a2'], shared: true }] }))
        expect(out.projects[0].notes).toContain('content')
    })

    // The same COUNT of different files is the worst case, so the ids are
    // compared and not the length.
    it('compares asset ids, not how many there are', () => {
        const out = cmp(fingerprint(), fingerprint({ projects: [{ id: 'p', body: 'aaa', assets: ['b1', 'b2'], shared: true }] }))
        expect(out.projects[0].notes.join(' ')).toContain("2 asset(s) only a's document names")
        expect(out.projects[0].notes.join(' ')).toContain("2 asset(s) only b's document names")
    })

    it('notices when one side is published and the other is not', () => {
        const out = cmp(fingerprint(), fingerprint({ projects: [{ id: 'p', body: 'aaa', assets: ['a1', 'a2'], shared: false }] }))
        expect(out.projects[0].notes.join(' ')).toContain('published: a=true b=false')
    })
})

const server = (routes) => {
    const fetchImpl = async (url, options = {}) => {
        const key = `${options.method || 'GET'} ${new URL(url).pathname}`
        const answer = typeof routes[key] === 'function' ? routes[key]() : routes[key]
        if (answer === undefined) return new Response('{}', { status: 404 })
        return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 })
    }
    return connect({ base: 'http://localhost:4000/serverXR', token: 't', fetchImpl })
}

describe('space.fingerprint', () => {
    it('gathers what has to match, and leaves out the timestamp that lies', async () => {
        const di = await server({
            'GET /serverXR/api/spaces/x': { body: { space: { id: 'x', isPublic: false, permanent: true, publishedProjectId: 'p', sceneVersion: 7, lastTouchedAt: 12345 } } },
            'GET /serverXR/api/spaces/x/projects': { body: { projects: [{ id: 'p' }] } },
            'GET /serverXR/api/projects/p/document': { body: { document: { presentationState: { codeFiles: [{ name: 'index.html', content: 'hi' }] }, publishState: { shareEnabled: true }, assets: [{ id: 'a2' }, { id: 'a1' }] } } }
        })
        const out = await di.run('space.fingerprint', { space: 'x' })
        expect(out).toMatchObject({ id: 'x', isPublic: false, permanent: true, sceneVersion: 7 })
        expect(out).not.toHaveProperty('lastTouchedAt')
        expect(out.projects[0]).toMatchObject({ id: 'p', shared: true, assets: ['a1', 'a2'] })
        expect(out.projects[0].body).toEqual(expect.any(String))
    })

    it('is null for a space that is not there', async () => {
        const di = await server({ 'GET /serverXR/api/spaces/x': { status: 404, body: {} } })
        await expect(di.run('space.fingerprint', { space: 'x' })).resolves.toBeNull()
    })
})

describe('project.checkAssets', () => {
    const doc = (n) => ({ body: { document: { assets: Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `f${i}.pdf`, url: `/serverXR/api/projects/p/assets/a${i}` })) } } })

    // The failure that looks most like success: prod's di-library promised 51
    // and served 0, and comparing documents would never have found it — both
    // sides name the same ids.
    it('says so in a sentence when the server has none of them', async () => {
        const routes = { 'GET /serverXR/api/projects/p/document': doc(51) }
        for (let i = 0; i < 51; i += 1) routes[`HEAD /serverXR/api/projects/p/assets/a${i}`] = { status: 404, body: {} }
        const out = await (await server(routes)).run('project.checkAssets', { project: 'p' })
        expect(out).toMatchObject({ promised: 51, present: 0 })
        expect(out.verdict).toContain('THIS SERVER HAS NONE OF THEM')
    })

    it('counts a partial miss', async () => {
        const routes = { 'GET /serverXR/api/projects/p/document': doc(3) }
        routes['HEAD /serverXR/api/projects/p/assets/a0'] = { status: 200, body: {} }
        routes['HEAD /serverXR/api/projects/p/assets/a1'] = { status: 200, body: {} }
        routes['HEAD /serverXR/api/projects/p/assets/a2'] = { status: 404, body: {} }
        const out = await (await server(routes)).run('project.checkAssets', { project: 'p' })
        expect(out.verdict).toBe('1 of 3 files are missing on this server')
        expect(out.missing).toEqual([{ id: 'a2', name: 'f2.pdf', status: 404 }])
    })

    it('is content with a document that names no files', async () => {
        const out = await (await server({ 'GET /serverXR/api/projects/p/document': { body: { document: { assets: [] } } } }))
            .run('project.checkAssets', { project: 'p' })
        expect(out.verdict).toBe('the document names no files')
    })

    it('catches an asset entry with no url at all', async () => {
        const out = await (await server({ 'GET /serverXR/api/projects/p/document': { body: { document: { assets: [{ id: 'a', name: 'x.pdf' }] } } } }))
            .run('project.checkAssets', { project: 'p' })
        expect(out.missing[0]).toMatchObject({ reason: 'no url in the document' })
    })
})
