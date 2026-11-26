// The owner's open asks for Monitor → Tasks: read the ledger (read-only) and change it through
// the ONE existing tool, `ledger-add --ref`. Nothing here builds a shell string: the tool is run
// with a fixed argv (execFile), the id must match ^N[0-9]+$, the state comes from a fixed list and
// every free text is capped and stripped of control characters. Each change leaves an audit line.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')

const HOME = os.homedir()
const ID_RE = /^N[0-9]+$/
const STATES = Object.freeze({ done: 'DONE', blocked: 'BLOCKED', reopen: 'IN PROGRESS', note: 'IN PROGRESS' })
const TEXT_MAX = 600
const FIELD_MAX = 240
const TASKS_MAX = 400
const TOOL_TIMEOUT_MS = 15000

// Control characters (and the pipe that splits ledger cells) go; length is capped.
const clean = (value, max = TEXT_MAX) =>
  // eslint-disable-next-line no-control-regex
  String(value ?? '').replace(/[\u0000-\u001f\u007f|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[-\s]+/, '').trim().slice(0, max)
// (a leading dash is stripped too: a text such as "--said" must never be read as an option by ledger-add)

const defaults = () => ({
  addPath: process.env.MONITOR_LEDGER_ADD || path.join(HOME, '.local/bin/ledger-add'),
  openPath: process.env.MONITOR_LEDGER_OPEN || path.join(HOME, '.local/bin/ledger-open'),
  ledgerFile: process.env.LEDGER_FILE || path.join(HOME, 'work/OWNER_REQUESTS_2026-09-30.md'),
  auditFile: process.env.MONITOR_LEDGER_AUDIT || path.join(HOME, '.di/monitor-ledger-audit.log')
})

const run = (file, args, opts = {}) => new Promise((resolve) => {
  execFile(file, args, { timeout: TOOL_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true, env: { ...process.env, ...(opts.env || {}) }, shell: false }, (error, stdout, stderr) => {
    resolve({ ok: !error, code: error?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') })
  })
})

const LINE_RE = /^(N[0-9]+[0-9a-z.]*)\s+(\d\d-\d\d)\s+(\d\d:\d\d)\s+(\S+)\s+(.+?)\s{2,}(.*)$/

/** One line of `ledger-open --active-all` → a task, or null for headers and the footer. */
function parseOpenLine(line) {
  const m = LINE_RE.exec(line)
  if (!m) return null
  return { id: m[1], day: m[2], time: m[3], who: m[4], state: m[5].trim(), text: m[6].trim() }
}

/** Age in whole minutes from "MM-DD HH:MM" (this year; a date in the future is last year's). */
function ageMinutes(day, time, nowMs = Date.now()) {
  const [mo, d] = day.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const now = new Date(nowMs)
  let t = new Date(now.getFullYear(), mo - 1, d, h, mi).getTime()
  if (t > nowMs + 86400000) t = new Date(now.getFullYear() - 1, mo - 1, d, h, mi).getTime()
  return Math.max(0, Math.round((nowMs - t) / 60000))
}

/** The ledger rows of one family (N5517, N5517.1 …): read-only, a pipe table. */
async function historyOf(id, ledgerFile) {
  if (!ID_RE.test(id)) return []
  let text
  try { text = await fs.promises.readFile(ledgerFile, 'utf8') } catch { return [] }
  const out = []
  for (const line of text.split('\n')) {
    if (!line.startsWith(`| ${id} |`) && !line.startsWith(`| ${id}.`)) continue
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (!/^N[0-9]+(\.[0-9]+)?$/.test(cells[0] || '')) continue
    out.push({ id: cells[0], at: clean(cells[1], 20), said: clean(cells[2], 800), state: clean(cells[3], 40), evidence: clean(cells[4], 800), next: clean(cells[5], 800) })
  }
  return out
}

function createLedger(overrides = {}, { now = () => Date.now() } = {}) {
  const cfg = () => ({ ...defaults(), ...(typeof overrides === 'function' ? overrides() : overrides) })

  async function list({ days = 3 } = {}) {
    const window = [1, 3, 14].includes(Number(days)) ? Number(days) : 3
    const c = cfg()
    if (!fs.existsSync(c.openPath)) return { ok: false, reason: 'no-ledger', message: 'No ledger on this machine.', tasks: [] }
    const res = await run(c.openPath, ['--active-all', '--days', String(window)])
    if (!res.ok) return { ok: false, reason: 'failed', message: 'The ledger could not be read.', tasks: [] }
    const lines = res.stdout.split('\n')
    if (lines.some((l) => /this machine has no ledger/.test(l)) && !fs.existsSync(c.ledgerFile) && !lines.some((l) => LINE_RE.test(l))) {
      return { ok: false, reason: 'no-ledger', message: 'No ledger on this machine.', tasks: [] }
    }
    const t = now()
    const parsed = lines.map(parseOpenLine).filter(Boolean)
    const tasks = parsed.slice(0, TASKS_MAX).map((r) => ({ ...r, ageMin: ageMinutes(r.day, r.time, t) }))
    const footer = lines.find((l) => /^active\s+\d+/.test(l)) || ''
    return { ok: true, tasks, total: parsed.length, days: window, footer: clean(footer, 200), generatedAt: t }
  }

  async function detail(id) {
    if (!ID_RE.test(String(id))) return { error: 'bad_id', status: 400 }
    return { id, history: await historyOf(id, cfg().ledgerFile) }
  }

  /** action: done | blocked | reopen | note. Returns the new row or { error, status }. */
  async function change({ id, action, text, evidence, next, by }) {
    const c = cfg()
    if (!ID_RE.test(String(id || ''))) return { error: 'bad_id', status: 400 }
    const state = STATES[String(action || '')]
    if (!state) return { error: 'bad_action', status: 400 }
    const what = clean(text, TEXT_MAX)
    const proof = clean(evidence, TEXT_MAX)
    if (action === 'done' && !proof) return { error: 'evidence_required', status: 400 }
    if (action === 'note' && !what) return { error: 'text_required', status: 400 }
    if (!fs.existsSync(c.addPath)) return { error: 'no_ledger', status: 503, message: 'No ledger on this machine.' }
    const label = { done: 'done from the Monitor', blocked: 'blocked, set from the Monitor', reopen: 'reopened from the Monitor', note: 'note from the Monitor' }[action]
    const argv = ['--ref', id, what || label, state, proof || 'set on the Monitor page by the owner', clean(next, FIELD_MAX) || (action === 'done' ? 'none' : 'continue')]
    const res = await run(c.addPath, argv)
    const stamp = new Date(now()).toISOString()
    try {
      fs.mkdirSync(path.dirname(c.auditFile), { recursive: true })
      fs.appendFileSync(c.auditFile, `${stamp} by=${clean(by || 'unknown', 80)} id=${id} state=${state} ok=${res.ok}\n`)
    } catch { /* the audit is best effort; the answer still says what happened */ }
    if (!res.ok) return { error: 'tool_failed', status: 502, message: 'The ledger did not take the change.' }
    const newId = (/\b(N[0-9]+\.[0-9]+)\b/.exec(res.stdout) || [])[1] || null
    return { ok: true, row: { id: newId || id, parent: id, state, text: what || label, evidence: proof, by: clean(by || '', 80), at: stamp } }
  }

  return { list, detail, change }
}

module.exports = { createLedger, parseOpenLine, ageMinutes, clean, STATES, ID_RE }
