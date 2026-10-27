import { describe, expect, it } from 'vitest'
import { parseArgs } from './args.mjs'
import { draftBody, runPost } from './post.mjs'

describe('di post — arguments', () => {
    it('reads text, link, media and channels as values, wherever they stand', () => {
        const args = parseArgs(['post', 'draft', '--to', 'telegram,bluesky', '--text', 'A new space', '--link', 'https://diiii.xyz/x', '--media', 'a.png,s/b.png'])
        expect(args._).toEqual(['post', 'draft'])
        expect(draftBody(args.flags).body).toEqual({ text: 'A new space', channels: ['telegram', 'bluesky'], link: 'https://diiii.xyz/x', media: ['a.png', 's/b.png'] })
    })
    it('refuses a draft with no channel or nothing to say', () => {
        expect(draftBody({ text: 'x' }).error).toMatch(/which channels/)
        expect(draftBody({ to: 'telegram' }).error).toMatch(/empty/)
        expect(draftBody({ to: 'telegram', text: true }).error).toMatch(/take a value/)
    })
})

describe('di post — the commands', () => {
    const post = { id: 'ab12', status: 'draft', channels: ['telegram'], results: {}, previewUrl: 'http://h/serverXR/share/posts/ab12/preview' }
    const harness = (reply) => {
        const calls = [], out = [], errs = []
        const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: reply.ok !== false, status: reply.status || 200, json: async () => reply.body } }
        return { calls, out, errs, deps: { base: 'http://h/serverXR', headers: { Authorization: 'Bearer t' }, fetchImpl, say: (s) => out.push(s), fail: (s) => errs.push(s) } }
    }
    it('draft prints the id and the preview address', async () => {
        const h = harness({ body: { post } })
        const code = await runPost(parseArgs(['post', 'draft', '--text', 'hi', '--to', 'telegram']), h.deps)
        expect(code).toBe(0)
        expect(h.calls[0].url).toBe('http://h/serverXR/api/share/posts')
        expect(h.calls[0].init.headers.Authorization).toBe('Bearer t')
        expect(h.out.join('\n')).toContain('preview http://h/serverXR/share/posts/ab12/preview')
    })
    it('send exits 1 and says which channel failed', async () => {
        const h = harness({ body: { post: { ...post, status: 'failed', results: { telegram: { ok: false, error: 'chat not found' } } } } })
        expect(await runPost(parseArgs(['post', 'send', 'ab12']), h.deps)).toBe(1)
        expect(h.calls[0].url).toBe('http://h/serverXR/api/share/posts/ab12/send')
        expect(h.out.join('\n')).toContain('telegram: FAILED — chat not found')
    })
    it('channels lists state; a server refusal is shown in its own words', async () => {
        const ok = harness({ body: { channels: [{ name: 'telegram', state: 'missing', detail: 'set SHARE_TELEGRAM_BOT_TOKEN' }] } })
        expect(await runPost(parseArgs(['post', 'channels']), ok.deps)).toBe(0)
        expect(ok.out[0]).toMatch(/telegram\s+missing/)
        const bad = harness({ ok: false, status: 403, body: { error: 'admin only' } })
        expect(await runPost(parseArgs(['post', 'show', 'ab12']), bad.deps)).toBe(1)
        expect(bad.errs[0]).toBe('admin only')
    })
    it('show without an id and an unknown subcommand print what to type', async () => {
        const h = harness({ body: {} })
        expect(await runPost(parseArgs(['post', 'show']), h.deps)).toBe(1)
        expect(await runPost(parseArgs(['post', 'wat']), h.deps)).toBe(1)
        expect(h.errs[1]).toContain('di post draft')
    })
})
