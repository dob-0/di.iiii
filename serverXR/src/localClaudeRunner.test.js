// @vitest-environment node

// Drives runLocalClaude against a fake `claude` binary (a node script that
// prints stream-json lines), pinning the parse: assistant text, session id,
// usage accumulation, and the non-zero-exit error path.

import { createRequire } from 'node:module'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { runLocalClaude } = require('./localClaudeRunner.js')

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'fake-claude-'))

function makeFakeBinary(name, script) {
  const file = path.join(tmpDir, name)
  writeFileSync(file, `#!/usr/bin/env node\n${script}`)
  chmodSync(file, 0o755)
  return file
}

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }))

describe('localClaudeRunner', () => {
  it('parses stream-json: deltas, session id, usage, final text', async () => {
    const binary = makeFakeBinary('claude-ok', `
      const lines = [
        { type: 'system', subtype: 'init', session_id: 'sess-42' },
        { type: 'assistant', message: { model: 'claude-opus-5', usage: { input_tokens: 5, output_tokens: 2 }, content: [{ type: 'text', text: 'part one' }] } },
        { type: 'assistant', message: { model: 'claude-opus-5', usage: { input_tokens: 0, output_tokens: 3 }, content: [{ type: 'text', text: 'part two' }] } },
        { type: 'result', result: 'ignored: text already streamed', session_id: 'sess-42' }
      ]
      for (const line of lines) process.stdout.write(JSON.stringify(line) + '\\n')
    `)
    const deltas = []
    const result = await runLocalClaude({ prompt: 'hi', onDelta: (t) => deltas.push(t), binary })

    expect(deltas).toEqual(['part one', 'part two'])
    expect(result).toEqual({
      text: 'part one\npart two',
      model: 'claude-opus-5',
      sessionId: 'sess-42',
      inputTokens: 5,
      outputTokens: 5
    })
  })

  it('surfaces a failed run as an error with stderr, not silence', async () => {
    const binary = makeFakeBinary('claude-bad', `
      process.stderr.write('not logged in\\n')
      process.exit(1)
    `)
    await expect(runLocalClaude({ prompt: 'hi', binary })).rejects.toThrow('not logged in')
  })
})
