// A model on this machine — llama.cpp, Ollama, LM Studio, anything that
// answers OpenAI's /v1/chat/completions — named by LLM_BASE_URL. No key and
// no account: this is the festival shape, where the model is a GPU box on
// the same table and there is no internet. Only ever offered to the local
// operator (see routes/aiChatRoutes.js), never on a hosted tier.

const http = require('node:http')
const https = require('node:https')

const REQUEST_TIMEOUT_MS = 120_000
const WALL_CLOCK_DEADLINE_MS = 300_000
const DEFAULT_MAX_TOKENS = 4_000

const readEnv = () => ({
  baseUrl: String(process.env.LLM_BASE_URL || '').trim().replace(/\/+$/, ''),
  model: String(process.env.LLM_MODEL || '').trim()
})

// Read at call time so tests (and `di up`, which rewrites the env) see the
// current value rather than whatever was set when the module loaded.
function describeLocalModel(env = readEnv()) {
  if (!env.baseUrl) return null
  return { baseUrl: env.baseUrl, model: env.model || null }
}

// Reasoning models put their scratchpad in <think>…</think>. llama.cpp can
// route that into `reasoning_content` on its own, but not every server does,
// so the tags are handled here as well — and a tag can arrive split across
// two stream chunks, which is why the visible text is recomputed from the
// whole reply rather than filtered chunk by chunk.
const stripThinking = (text) => String(text ?? '')
  .replace(/<think>[\s\S]*?<\/think>/gi, '')
  .replace(/<think>[\s\S]*$/i, '')

// What can safely be shown so far: strip finished thoughts, and hold back a
// trailing '<…' that may still turn into a tag.
const visibleSoFar = (raw) => stripThinking(raw).replace(/<[^>]*$/, '')

// The connection-level failures that mean "this machine cannot reach that
// host" rather than "the host answered badly". aiChatRoutes uses this to fall
// back to the local model when the internet is gone.
const OFFLINE_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE'])
const isNetworkFailure = (error) => Boolean(error && (OFFLINE_CODES.has(error.code) || OFFLINE_CODES.has(error.cause?.code)))

// Same contract as anthropicClient.streamChatCompletion: resolves
// { text, model, inputTokens, outputTokens, stopReason }, rejects with
// err.status. `env` is a test seam.
function streamLocalModel({ system, messages, maxTokens, signal, onDelta, env = readEnv() }) {
  return new Promise((resolve, reject) => {
    if (!env.baseUrl) {
      reject(Object.assign(new Error('no local model configured'), { status: 503 }))
      return
    }
    let url
    try {
      url = new URL(`${env.baseUrl}/v1/chat/completions`)
    } catch {
      reject(Object.assign(new Error(`LLM_BASE_URL is not a URL: ${env.baseUrl}`), { status: 500 }))
      return
    }
    const body = JSON.stringify({
      ...(env.model ? { model: env.model } : {}),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: Number(maxTokens) || DEFAULT_MAX_TOKENS,
      messages: [
        ...(system ? [{ role: 'system', content: String(system) }] : []),
        ...messages.map((m) => ({ role: m.role, content: String(m.content) }))
      ]
    })
    const transport = url.protocol === 'https:' ? https : http
    const req = transport.request({
      host: url.hostname,
      port: url.port || undefined,
      method: 'POST',
      path: url.pathname,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        accept: 'text/event-stream'
      },
      timeout: REQUEST_TIMEOUT_MS
    }, (res) => {
      if (res.statusCode !== 200) {
        let errBody = ''
        res.on('data', (chunk) => { errBody += chunk })
        res.on('end', () => {
          let message = `local model error ${res.statusCode}`
          try {
            message = JSON.parse(errBody)?.error?.message || message
          } catch { /* keep generic message */ }
          reject(Object.assign(new Error(message), { status: res.statusCode }))
        })
        return
      }

      let buffer = ''
      let raw = ''
      let emitted = ''
      let model = env.model || null
      let inputTokens = null
      let outputTokens = null
      let stopReason = null

      const emitUpTo = (visible) => {
        if (visible.length <= emitted.length) return
        const delta = visible.slice(emitted.length)
        emitted = visible
        try { onDelta?.(delta) } catch { /* consumer errors must not kill the stream */ }
      }

      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        buffer += chunk
        let idx
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          let event
          try {
            event = JSON.parse(payload)
          } catch {
            continue
          }
          if (event.model) model = event.model
          const choice = event.choices?.[0]
          const piece = choice?.delta?.content ?? choice?.text ?? ''
          if (piece) {
            raw += piece
            emitUpTo(visibleSoFar(raw))
          }
          if (choice?.finish_reason) stopReason = choice.finish_reason
          if (event.usage) {
            inputTokens = event.usage.prompt_tokens ?? inputTokens
            outputTokens = event.usage.completion_tokens ?? outputTokens
          }
        }
      })
      res.on('end', () => {
        const text = stripThinking(raw).trim()
        emitUpTo(stripThinking(raw))
        resolve({ text, model, inputTokens, outputTokens, stopReason })
      })
      res.on('error', reject)
    })

    req.on('timeout', () => {
      req.destroy(Object.assign(new Error('local model request timeout'), { status: 504 }))
    })
    const deadline = setTimeout(() => {
      req.destroy(Object.assign(new Error('local model request exceeded deadline'), { status: 504 }))
    }, WALL_CLOCK_DEADLINE_MS)
    req.on('close', () => clearTimeout(deadline))
    req.on('error', (error) => {
      if (error.status) {
        reject(error)
        return
      }
      const err = new Error(`The model on this machine is not answering at ${env.baseUrl}.`)
      err.status = 503
      err.code = error.code
      reject(err)
    })
    if (signal) {
      const abort = () => req.destroy(Object.assign(new Error('aborted'), { status: 499 }))
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    }
    req.write(body)
    req.end()
  })
}

module.exports = { streamLocalModel, describeLocalModel, isNetworkFailure, stripThinking, visibleSoFar }
