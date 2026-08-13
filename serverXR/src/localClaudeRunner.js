// Chat backend for operators without an API key: drives the machine's own
// `claude` CLI (subscription login — Pro/Max) in non-interactive mode. This
// only ever runs for loopback requests on a non-production server (the same
// guard as the agent board): it is the local install's path, never a hosted
// multi-user path — the CLI is the *operator's* Claude.
//
// Conversation continuity is Claude Code's own session mechanism: the first
// turn creates a session, its id is stored on the chat row, and later turns
// --resume it. Tools: none are allowlisted, and -p mode auto-denies anything
// that would need permission — this is a conversation, not an agent run.

const { spawn } = require('node:child_process')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { config } = require('./config')

const RUN_TIMEOUT_MS = 180_000
const SESSION_ID_SHAPE = /^[a-zA-Z0-9-]{8,64}$/
const SYSTEM_PROMPT = 'You are Claude, chatting with a creator inside di.iiii, a browser-native XR authoring studio. Conversational replies only — you have no tools here. Be concise and practical.'

// Availability is probed asynchronously (spawnSync here froze the whole
// event loop for the probe's duration on every first panel mount). Until the
// probe resolves the answer is pessimistically false — the panel's next
// providers poll picks up the real value.
let availabilityCache = null
let availabilityProbe = null

function isLocalClaudeAvailable() {
  if (availabilityCache !== null) return availabilityCache
  if (!availabilityProbe) {
    availabilityProbe = new Promise((resolve) => {
      let child
      try {
        child = spawn('claude', ['--version'], { stdio: 'ignore' })
      } catch {
        resolve(false)
        return
      }
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false) }, 10_000)
      child.on('error', () => { clearTimeout(timer); resolve(false) })
      child.on('close', (code) => { clearTimeout(timer); resolve(code === 0) })
    }).then((ok) => { availabilityCache = ok; return ok })
  }
  return false
}
// warm the cache at boot so the first real request already knows
isLocalClaudeAvailable()

const extractText = (content) => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

// Resolves { text, model, sessionId, inputTokens, outputTokens }.
// onDelta fires per assistant message (message-grained, not token-grained —
// the CLI's stream-json emits whole assistant turns).
async function runLocalClaude({ prompt, resumeSessionId, onDelta, signal, binary = 'claude' }) {
  // Under the app's own data dir, not the shared world-writable /tmp — a
  // co-tenant could pre-create a /tmp path and choose the CLAUDE.md the
  // spawned claude picks up.
  const cwd = path.join(config.directories.dataDir, 'agent-chat')
  await fsp.mkdir(cwd, { recursive: true })

  if (resumeSessionId && !SESSION_ID_SHAPE.test(resumeSessionId)) {
    throw Object.assign(new Error('invalid resume session id'), { status: 400 })
  }

  return new Promise((resolve, reject) => {
    // The prompt goes over STDIN, never argv: a message starting with "-"
    // (e.g. "--help", "-1 or -2?") would otherwise be parsed as CLI flags,
    // since -p's value is optional.
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--append-system-prompt', SYSTEM_PROMPT,
      ...(resumeSessionId ? ['--resume', resumeSessionId] : [])
    ]
    const child = spawn(binary, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdin.on('error', () => {})
    child.stdin.end(prompt)

    let buffer = ''
    let text = ''
    let model = null
    let sessionId = resumeSessionId || null
    let inputTokens = null
    let outputTokens = null
    let stderrTail = ''
    let settled = false

    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(reject, Object.assign(new Error('local claude timed out'), { status: 504 }))
    }, RUN_TIMEOUT_MS)
    if (signal) {
      const abort = () => {
        child.kill('SIGKILL')
        finish(reject, Object.assign(new Error('aborted'), { status: 499 }))
      }
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line.startsWith('{')) continue
        let event
        try {
          event = JSON.parse(line)
        } catch {
          continue
        }
        if (event.session_id) sessionId = event.session_id
        if (event.type === 'assistant') {
          const piece = extractText(event.message?.content)
          model = event.message?.model || model
          const usage = event.message?.usage
          if (usage) {
            inputTokens = (inputTokens || 0) + (usage.input_tokens || 0)
            outputTokens = (outputTokens || 0) + (usage.output_tokens || 0)
          }
          if (piece) {
            text += (text ? '\n' : '') + piece
            try { onDelta?.(piece) } catch { /* consumer errors must not kill the run */ }
          }
        } else if (event.type === 'result' && typeof event.result === 'string' && !text) {
          text = event.result
        }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderrTail = (stderrTail + chunk).slice(-2000) })
    child.on('error', (error) => finish(reject, Object.assign(error, { status: 500 })))
    child.on('close', (code) => {
      if (code !== 0) {
        finish(reject, Object.assign(
          new Error(stderrTail.trim().split('\n').pop() || `local claude exited ${code}`),
          { status: 502 }
        ))
        return
      }
      finish(resolve, { text, model: model || 'claude (local)', sessionId, inputTokens, outputTokens })
    })
  })
}

module.exports = { runLocalClaude, isLocalClaudeAvailable }
