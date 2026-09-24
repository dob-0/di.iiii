#!/usr/bin/env node
/**
 * Run sdk/evals/di.xml through Claude Code itself, with ONLY a di.iiii MCP
 * server attached — the client the owner actually uses, rather than a lab
 * harness. The mcp-builder guide's own runner (scripts/evaluation.py) needs
 * an ANTHROPIC_API_KEY; this one needs a signed-in `claude`.
 *
 *   node sdk/evals/run.mjs --base http://127.0.0.1:47812/serverXR \
 *       --token-file ~/.config/di/eval.token --server sdk/mcp.mjs \
 *       --label new --model sonnet --out report-new.json
 *
 * Isolation, stated so a reader can judge it: built-in tools are off
 * (--tools ""), only this MCP server is loaded (--strict-mcp-config), and each
 * question runs in an empty temporary directory, so no project instructions
 * load. The user's global instructions and memory still load — `--bare` would
 * drop them but also skips the keychain the sign-in lives in.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i === -1 ? fallback : process.argv[i + 1]
}
const HERE = path.dirname(fileURLToPath(import.meta.url))
const base = arg('base')
const server = path.resolve(arg('server', path.join(HERE, '..', 'mcp.mjs')))
const token = readFileSync(arg('token-file'), 'utf8').trim()
const model = arg('model', 'sonnet')
const label = arg('label', 'run')
const parallel = Number(arg('parallel', '3'))
const out = arg('out', `eval-${label}.json`)
const only = arg('only') ? arg('only').split(',').map(Number) : null
if (!base) throw new Error('--base is required')

export const parseEvaluation = (xml) => [...xml.matchAll(/<qa_pair>\s*<question>([\s\S]*?)<\/question>\s*<answer>([\s\S]*?)<\/answer>\s*<\/qa_pair>/g)]
    .map((m, i) => ({ n: i + 1, question: m[1].trim(), answer: m[2].trim() }))

const PROMPT = (q) =>
    `${q}\n\nUse only the di tools to find out. Reply with the final answer alone inside <answer></answer>.`

const askOne = (qa) => new Promise((resolve) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'di-eval-'))
    const config = path.join(dir, 'mcp.json')
    writeFileSync(config, JSON.stringify({
        mcpServers: { di: { command: process.execPath, args: [server, '--base', base], env: { DI_TOKEN: token } } }
    }))
    const started = Date.now()
    const child = spawn('claude', [
        '-p', PROMPT(qa.question),
        '--model', model,
        '--output-format', 'stream-json', '--verbose',
        '--tools', '',
        '--strict-mcp-config', '--mcp-config', config,
        '--allowedTools', 'mcp__di',
        '--no-session-persistence'
    ], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
    let raw = ''
    let err = ''
    child.stdout.on('data', (c) => { raw += c })
    child.stderr.on('data', (c) => { err += c })
    child.on('exit', (code) => {
        rmSync(dir, { recursive: true, force: true })
        const events = raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
        const toolCalls = events
            .filter((e) => e.type === 'assistant')
            .flatMap((e) => e.message?.content || [])
            .filter((c) => c.type === 'tool_use')
            .map((c) => c.name)
        const result = events.find((e) => e.type === 'result') || {}
        const text = String(result.result || '')
        const got = (text.match(/<answer>([\s\S]*?)<\/answer>/) || [])[1]?.trim() ?? null
        resolve({
            n: qa.n,
            expected: qa.answer,
            got,
            correct: got !== null && got.toLowerCase() === qa.answer.toLowerCase(),
            toolCalls: toolCalls.length,
            tools: toolCalls,
            turns: result.num_turns ?? null,
            costUsd: result.total_cost_usd ?? null,
            inputTokens: result.usage ? (result.usage.input_tokens || 0) + (result.usage.cache_read_input_tokens || 0) + (result.usage.cache_creation_input_tokens || 0) : null,
            outputTokens: result.usage?.output_tokens ?? null,
            seconds: Math.round((Date.now() - started) / 100) / 10,
            exit: code,
            ...(code !== 0 ? { stderr: err.slice(0, 500) } : {})
        })
    })
})

const main = async () => {
    const qas = parseEvaluation(readFileSync(path.join(HERE, 'di.xml'), 'utf8')).filter((qa) => !only || only.includes(qa.n))
    const results = []
    const queue = [...qas]
    await Promise.all(Array.from({ length: parallel }, async () => {
        while (queue.length) {
            const qa = queue.shift()
            const r = await askOne(qa)
            results.push(r)
            process.stderr.write(`${label} q${r.n}: ${r.correct ? 'OK ' : 'NO '} got=${JSON.stringify(r.got)} calls=${r.toolCalls} ${r.seconds}s\n`)
        }
    }))
    results.sort((a, b) => a.n - b.n)
    const sum = (k) => results.reduce((s, r) => s + (r[k] || 0), 0)
    const report = {
        label, model, server, base, at: new Date().toISOString(),
        score: `${results.filter((r) => r.correct).length}/${results.length}`,
        toolCalls: sum('toolCalls'), inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'),
        costUsd: Math.round(sum('costUsd') * 10000) / 10000, seconds: Math.round(sum('seconds')),
        results
    }
    writeFileSync(out, JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ label: report.label, score: report.score, toolCalls: report.toolCalls, inputTokens: report.inputTokens, outputTokens: report.outputTokens, costUsd: report.costUsd }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
