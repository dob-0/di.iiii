import { describe, expect, it, vi } from 'vitest'
import {
    KEEPER_STATUS,
    askKeeper,
    buildKeeperRequest,
    parseKeeperReply,
    resolveKeeperEndpoint,
    stripThinking
} from './keeperClient.js'

const okResponse = (payload) => ({ ok: true, status: 200, json: async () => payload })

describe('stripThinking', () => {
    it('drops a reasoning model\'s scratchpad and keeps the answer', () => {
        expect(stripThinking('<think>weighing it up</think>Welcome, traveller.'))
            .toBe('Welcome, traveller.')
    })

    it('drops an unclosed <think> entirely — a cut-off thought contains no answer', () => {
        // The failure this guards: returning the model's deliberation to the
        // visitor because the closing tag never arrived.
        expect(stripThinking('<think>still deciding how to greet')).toBe('')
    })

    it('leaves ordinary text alone', () => {
        expect(stripThinking('  Welcome.  ')).toBe('Welcome.')
    })
})

describe('parseKeeperReply', () => {
    it('reads an Ollama reply', () => {
        expect(parseKeeperReply({ message: { content: 'from ollama' } }))
            .toEqual({ text: 'from ollama', truncated: false })
    })

    it('reads an OpenAI-compatible reply', () => {
        expect(parseKeeperReply({ choices: [{ message: { content: 'from openai' } }] }))
            .toEqual({ text: 'from openai', truncated: false })
    })

    it('reports truncation rather than presenting a fragment as complete', () => {
        expect(parseKeeperReply({ message: { content: 'a blessing that stops mid-' }, done_reason: 'length' }).truncated)
            .toBe(true)
        expect(parseKeeperReply({ choices: [{ message: { content: 'cut' }, finish_reason: 'length' }] }).truncated)
            .toBe(true)
    })
})

describe('resolveKeeperEndpoint', () => {
    it('completes a bare host to a chat endpoint', () => {
        expect(resolveKeeperEndpoint('http://localhost:11434')).toBe('http://localhost:11434/api/chat')
        expect(resolveKeeperEndpoint('http://localhost:11434/')).toBe('http://localhost:11434/api/chat')
    })

    it('completes an OpenAI base URL to the chat route', () => {
        // The regression: llama.cpp (and vLLM, and LM Studio) print
        // ".../v1" on startup, so that is what gets pasted. POSTing to it
        // 404s, and the panel reported a working server as broken.
        expect(resolveKeeperEndpoint('http://127.0.0.1:8090/v1'))
            .toBe('http://127.0.0.1:8090/v1/chat/completions')
        expect(resolveKeeperEndpoint('http://127.0.0.1:8090/v1/'))
            .toBe('http://127.0.0.1:8090/v1/chat/completions')
    })

    it('leaves an explicit path alone', () => {
        expect(resolveKeeperEndpoint('https://box.local/v1/chat/completions'))
            .toBe('https://box.local/v1/chat/completions')
    })

    it('treats empty as unset', () => {
        expect(resolveKeeperEndpoint('')).toBe('')
        expect(resolveKeeperEndpoint(undefined)).toBe('')
    })
})

describe('buildKeeperRequest', () => {
    it('omits an empty system message instead of sending a blank one', () => {
        expect(buildKeeperRequest({ model: 'qwen3', system: '   ', prompt: 'hello' }).messages)
            .toEqual([{ role: 'user', content: 'hello' }])
    })

    it('never streams — the panel reads one reply', () => {
        expect(buildKeeperRequest({ model: 'm', prompt: 'p' }).stream).toBe(false)
    })
})

describe('askKeeper', () => {
    it('returns the answer', async () => {
        const fetchImpl = vi.fn(async () => okResponse({ message: { content: 'Welcome.' } }))
        const result = await askKeeper({ endpoint: 'http://box:11434', model: 'qwen3', prompt: 'hi', fetchImpl })
        expect(result).toMatchObject({ status: KEEPER_STATUS.ANSWERED, text: 'Welcome.' })
        expect(fetchImpl.mock.calls[0][0]).toBe('http://box:11434/api/chat')
    })

    it('reports an unreachable box rather than throwing', async () => {
        // The real shape of this failure: fetch rejects with a TypeError for
        // both a refused connection and a CORS block. Neither should surface
        // as an exception in a panel.
        const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch') })
        const result = await askKeeper({ endpoint: 'http://box:11434', model: 'm', prompt: 'p', fetchImpl })
        expect(result.status).toBe(KEEPER_STATUS.UNREACHABLE)
        expect(result.error).toContain('Could not reach the keeper')
    })

    it('treats an aborted request as idle, not an error', async () => {
        const fetchImpl = vi.fn(async () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            throw error
        })
        const result = await askKeeper({ endpoint: 'http://box:11434', model: 'm', prompt: 'p', fetchImpl })
        expect(result.status).toBe(KEEPER_STATUS.IDLE)
        expect(result.error).toBe('')
    })

    it('reports a non-OK status', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' }))
        const result = await askKeeper({ endpoint: 'http://box:11434', model: 'm', prompt: 'p', fetchImpl })
        expect(result.status).toBe(KEEPER_STATUS.ERROR)
        expect(result.error).toContain('404')
    })

    it('does not call out at all when no endpoint is set', async () => {
        const fetchImpl = vi.fn()
        const result = await askKeeper({ endpoint: '', model: 'm', prompt: 'p', fetchImpl })
        expect(result.status).toBe(KEEPER_STATUS.IDLE)
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('calls an empty answer an error instead of reporting success with no text', async () => {
        // A model that returns only a <think> block leaves nothing after
        // stripping; that is a failure, not a silent empty success.
        const fetchImpl = vi.fn(async () => okResponse({ message: { content: '<think>hm</think>' } }))
        const result = await askKeeper({ endpoint: 'http://box:11434', model: 'm', prompt: 'p', fetchImpl })
        expect(result.status).toBe(KEEPER_STATUS.ERROR)
        expect(result.text).toBe('')
    })
})
