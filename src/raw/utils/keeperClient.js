// The keeper: a language model the work talks to, named in the vocabulary of
// br_id_ge's rite, where a local LLM on site was the MAIN installation layer
// rather than a support service.
//
// Deliberately endpoint-shaped, not account-shaped. You paste a URL and a model
// name; nothing runs as anyone and no credential is held. That side-steps the
// open "agent authority" question in docs/architecture/RAW_WORKSPACE.md §5.2 —
// and it is also the only shape that works at a festival, where the model is a
// GPU box on the same table and there is no internet.

export const KEEPER_STATUS = {
    IDLE: 'idle',
    ASKING: 'asking',
    ANSWERED: 'answered',
    UNREACHABLE: 'unreachable',
    ERROR: 'error'
}

// Ollama's /api/chat and any OpenAI-compatible /v1/chat/completions accept the
// SAME request body, so one shape reaches both. Only the reply differs, which
// is what parseKeeperReply is for.
export const buildKeeperRequest = ({ model, system, prompt }) => {
    const messages = []
    const trimmedSystem = String(system || '').trim()
    if (trimmedSystem) messages.push({ role: 'system', content: trimmedSystem })
    messages.push({ role: 'user', content: String(prompt ?? '') })
    return { model: String(model || '').trim(), messages, stream: false }
}

// Reasoning models (qwen3 and friends) wrap their scratchpad in <think>...</think>
// and mean for it to be dropped. The rite hit this live: without stripping, the
// keeper's greeting was several paragraphs of deliberation followed by the line
// it actually meant to say.
export const stripThinking = (text) => String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // An unclosed <think> means the reply was cut off mid-thought — everything
    // from the tag on is scratchpad, so there is no answer in it to keep.
    .replace(/<think>[\s\S]*$/i, '')
    .trim()

// Ollama answers { message: { content } }; OpenAI-compatible servers answer
// { choices: [ { message: { content } } ] }. Accept either rather than making
// the person know which kind of server they pointed at.
export const parseKeeperReply = (payload) => {
    const raw = payload?.message?.content
        ?? payload?.choices?.[0]?.message?.content
        ?? payload?.choices?.[0]?.text
        ?? ''
    const text = stripThinking(raw)
    // Ollama reports why it stopped. 'length' means the model was still talking
    // when it hit its token ceiling, so the last sentence is a fragment — worth
    // telling the caller rather than presenting a truncated line as complete.
    const truncated = payload?.done_reason === 'length'
        || payload?.choices?.[0]?.finish_reason === 'length'
    return { text, truncated }
}

// A bare host is the most likely thing to be pasted ("http://localhost:11434"),
// and it is not a chat endpoint. Complete it to Ollama's, since that is what a
// local box runs; leave anything with a path alone.
//
// Except a path ending in /v1: that is the OpenAI *base* URL every such server
// prints on startup (llama.cpp, vLLM, LM Studio), and it is the thing people
// paste. Posting to it 404s, which read as "the keeper answered 404" — a
// working server reported as broken. Complete it to the chat route too.
export const resolveKeeperEndpoint = (endpoint) => {
    const trimmed = String(endpoint || '').trim().replace(/\/+$/, '')
    if (!trimmed) return ''
    try {
        const url = new URL(trimmed)
        if (url.pathname === '' || url.pathname === '/') return `${trimmed}/api/chat`
        if (/\/v1$/.test(url.pathname)) return `${trimmed}/chat/completions`
        return trimmed
    } catch {
        return trimmed
    }
}

export const askKeeper = async ({
    endpoint,
    model,
    system,
    prompt,
    signal,
    fetchImpl = typeof fetch === 'function' ? fetch : null
} = {}) => {
    const url = resolveKeeperEndpoint(endpoint)
    if (!url) return { status: KEEPER_STATUS.IDLE, text: '', error: 'No keeper endpoint set.' }
    if (!fetchImpl) return { status: KEEPER_STATUS.ERROR, text: '', error: 'No fetch available.' }

    let response
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildKeeperRequest({ model, system, prompt })),
            signal
        })
    } catch (error) {
        // A refused connection and a CORS rejection are indistinguishable from
        // here, and both mean the same thing to the person: the box isn't
        // answering. Say that instead of surfacing a TypeError.
        if (error?.name === 'AbortError') return { status: KEEPER_STATUS.IDLE, text: '', error: '' }
        return {
            status: KEEPER_STATUS.UNREACHABLE,
            text: '',
            error: `Could not reach the keeper at ${url}.`
        }
    }

    if (!response?.ok) {
        return {
            status: KEEPER_STATUS.ERROR,
            text: '',
            error: `The keeper answered ${response?.status ?? '?'}${response?.statusText ? ` ${response.statusText}` : ''}.`
        }
    }

    let payload
    try {
        payload = await response.json()
    } catch {
        return { status: KEEPER_STATUS.ERROR, text: '', error: 'The keeper sent a reply that was not JSON.' }
    }

    const { text, truncated } = parseKeeperReply(payload)
    if (!text) {
        return { status: KEEPER_STATUS.ERROR, text: '', error: 'The keeper answered with nothing.' }
    }
    return { status: KEEPER_STATUS.ANSWERED, text, truncated, error: '' }
}
