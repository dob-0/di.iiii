// Minimal streaming client for the Anthropic Messages API over node:https.
// Deliberately not the official SDK and not global fetch: undici's WASM HTTP
// parser dies under constrained hosts (see httpClient.js), and every outbound
// call in this codebase uses node:https directly. The user's API key arrives
// per call (decrypted from aiConnectionStore) and is never logged or stored
// here.

const https = require('node:https')

const ANTHROPIC_HOST = 'api.anthropic.com'
const ANTHROPIC_VERSION = '2023-06-01'
const REQUEST_TIMEOUT_MS = 120_000

// The models a di.iiii account may call through the proxy. Keep small and
// current-generation — the ceiling on max_tokens below is the cost control.
const ALLOWED_MODELS = new Set([
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-haiku-4-5-20251001'
])
const DEFAULT_MODEL = 'claude-sonnet-5'
const MAX_TOKENS_CEILING = 4096

// messages: [{role:'user'|'assistant', content:string}]
// onDelta(text) fires per streamed text chunk.
// Resolves { text, model, inputTokens, outputTokens, stopReason }.
// Rejects with err.status carrying Anthropic's HTTP status when available.
// `transport` is a test seam: {host, port, rejectUnauthorized} lets the wire
// protocol be exercised against a local fixture server; production callers
// omit it and always hit api.anthropic.com.
function streamChatCompletion({ apiKey, model, system, messages, maxTokens, signal, onDelta, transport }) {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      const err = new Error('missing api key')
      err.status = 401
      reject(err)
      return
    }
    const resolvedModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL
    const body = JSON.stringify({
      model: resolvedModel,
      max_tokens: Math.min(Number(maxTokens) || MAX_TOKENS_CEILING, MAX_TOKENS_CEILING),
      stream: true,
      ...(system ? { system } : {}),
      messages: messages.map((m) => ({ role: m.role, content: String(m.content) }))
    })

    const req = https.request({
      host: transport?.host || ANTHROPIC_HOST,
      ...(transport?.port ? { port: transport.port } : {}),
      ...(transport?.rejectUnauthorized === false ? { rejectUnauthorized: false } : {}),
      method: 'POST',
      path: '/v1/messages',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      timeout: REQUEST_TIMEOUT_MS
    }, (res) => {
      if (res.statusCode !== 200) {
        let errBody = ''
        res.on('data', (chunk) => { errBody += chunk })
        res.on('end', () => {
          let message = `anthropic error ${res.statusCode}`
          try {
            message = JSON.parse(errBody)?.error?.message || message
          } catch { /* keep generic message */ }
          const err = new Error(message)
          err.status = res.statusCode
          reject(err)
        })
        return
      }

      let buffer = ''
      let text = ''
      let inputTokens = null
      let outputTokens = null
      let stopReason = null

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
          if (event.type === 'message_start') {
            inputTokens = event.message?.usage?.input_tokens ?? null
          } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            text += event.delta.text
            try { onDelta?.(event.delta.text) } catch { /* consumer errors must not kill the stream */ }
          } else if (event.type === 'message_delta') {
            outputTokens = event.usage?.output_tokens ?? outputTokens
            stopReason = event.delta?.stop_reason ?? stopReason
          } else if (event.type === 'error') {
            const err = new Error(event.error?.message || 'anthropic stream error')
            err.status = 502
            req.destroy()
            reject(err)
          }
        }
      })
      res.on('end', () => resolve({ text, model: resolvedModel, inputTokens, outputTokens, stopReason }))
      res.on('error', reject)
    })

    req.on('timeout', () => {
      req.destroy(Object.assign(new Error('anthropic request timeout'), { status: 504 }))
    })
    req.on('error', reject)
    if (signal) {
      const abort = () => req.destroy(Object.assign(new Error('aborted'), { status: 499 }))
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    }
    req.write(body)
    req.end()
  })
}

module.exports = { streamChatCompletion, ALLOWED_MODELS, DEFAULT_MODEL, MAX_TOKENS_CEILING }
