// Reads the operator's local Claude Code data (~/.claude) into a board of
// sessions, live agents, and subagent trees for the Ops Graph "Agents" section.
// Read-only over that directory by design; never exposed off-machine (see
// agentBoardRoutes). Transcripts can contain secrets — the tail parser is the
// only place message text leaves this module, and only over the local guard.
//
// Enumeration deliberately avoids parsing whole transcripts (hundreds of MB
// across sessions): metadata lines live near the head, running counters near
// the tail, so a bounded head+tail read per file is enough for the index.

const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const HEAD_BYTES = 64 * 1024
const TAIL_BYTES = 256 * 1024
// The conversation-tail read needs a much wider window than the index scan:
// a single pasted screenshot is a multi-hundred-KB line, and a 256KB window
// can contain zero complete text turns.
const DETAIL_TAIL_BYTES = 4 * 1024 * 1024
const CACHE_TTL_MS = 5000
const MAX_SESSIONS = 60
const TAIL_MESSAGES = 30
const TAIL_MESSAGE_CHARS = 600

async function readChunk(filePath, position, length) {
  const handle = await fsp.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, position)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await handle.close()
  }
}

async function readHeadTail(filePath, size) {
  if (size <= HEAD_BYTES + TAIL_BYTES) {
    return fsp.readFile(filePath, 'utf8')
  }
  const head = await readChunk(filePath, 0, HEAD_BYTES)
  const tail = await readChunk(filePath, size - TAIL_BYTES, TAIL_BYTES)
  return `${head}\n${tail}`
}

const lastMatch = (text, regex) => {
  let match = null
  for (const m of text.matchAll(regex)) match = m
  return match
}

// Typed metadata lines ("ai-title", "worktree-state", …) are small standalone
// JSON lines; parse the last complete one of each type. Chunk boundaries can
// split a line, so anything that fails to parse is skipped.
function parseTypedLines(text) {
  const found = {}
  for (const line of text.split('\n')) {
    if (!line.startsWith('{"type":"')) continue
    const type = line.slice(9, line.indexOf('"', 9))
    if (!['ai-title', 'custom-title', 'agent-name', 'worktree-state', 'pr-link'].includes(type)) continue
    try {
      found[type] = JSON.parse(line)
    } catch {
      // partial line at a chunk boundary
    }
  }
  return found
}

async function readSessionIndexEntry(projectDir, fileName, stat) {
  const filePath = path.join(projectDir, fileName)
  const text = await readHeadTail(filePath, stat.size)
  const typed = parseTypedLines(text)
  const worktree = typed['worktree-state']?.worktreeSession || null
  const branch = lastMatch(text, /"gitBranch":"([^"\\]*)"/g)?.[1] || null
  return {
    sessionId: path.basename(fileName, '.jsonl'),
    projectDir: path.basename(projectDir),
    cwd: lastMatch(text, /"cwd":"([^"\\]*)"/g)?.[1] || null,
    title: typed['custom-title']?.customTitle
      || typed['ai-title']?.aiTitle
      || typed['agent-name']?.agentName
      || null,
    branch: worktree?.worktreeBranch || branch,
    worktreePath: worktree?.worktreePath || null,
    prUrl: typed['pr-link']?.prUrl || null,
    prNumber: typed['pr-link']?.prNumber || null,
    model: lastMatch(text, /"model":"((?:claude|fable)[^"\\]*)"/g)?.[1] || null,
    messageCount: Number(lastMatch(text, /"messageCount":(\d+)/g)?.[1]) || null,
    firstTimestamp: text.match(/"timestamp":"([^"\\]+)"/)?.[1] || null,
    lastActivity: stat.mtime.toISOString(),
    bytes: stat.size
  }
}

function extractMessageText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

function createAgentBoardStore({ claudeHome = path.join(os.homedir(), '.claude') } = {}) {
  let cache = null
  let cacheAt = 0

  const projectsRoot = path.join(claudeHome, 'projects')
  const sessionsRoot = path.join(claudeHome, 'sessions')
  const jobsRoot = path.join(claudeHome, 'jobs')

  async function listTranscriptFiles() {
    const out = []
    let projectDirs = []
    try {
      projectDirs = await fsp.readdir(projectsRoot)
    } catch {
      return out
    }
    for (const dir of projectDirs) {
      const projectDir = path.join(projectsRoot, dir)
      let entries = []
      try {
        entries = await fsp.readdir(projectDir)
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.endsWith('.jsonl')) continue
        try {
          const stat = await fsp.stat(path.join(projectDir, entry))
          if (stat.isFile()) out.push({ projectDir, fileName: entry, stat })
        } catch {
          // deleted between readdir and stat
        }
      }
    }
    return out
  }

  // Live overlay from ~/.claude/sessions/<pid>.json — zero subprocesses.
  // A record whose pid is gone is a stale file, not a live session.
  async function readLiveSessions() {
    let files = []
    try {
      files = await fsp.readdir(sessionsRoot)
    } catch {
      return []
    }
    const live = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      let record
      try {
        record = JSON.parse(await fsp.readFile(path.join(sessionsRoot, file), 'utf8'))
      } catch {
        continue
      }
      if (!record?.pid || !record?.sessionId) continue
      try {
        process.kill(record.pid, 0)
      } catch (error) {
        if (error.code !== 'EPERM') continue
      }
      live.push({
        pid: record.pid,
        sessionId: record.sessionId,
        cwd: record.cwd || null,
        kind: record.kind || null,
        name: record.name || null,
        status: record.status || null,
        jobId: record.jobId || null,
        startedAt: record.startedAt || null
      })
    }
    return live
  }

  async function readJobState(sessionId) {
    try {
      const raw = await fsp.readFile(path.join(jobsRoot, sessionId.slice(0, 8), 'state.json'), 'utf8')
      const state = JSON.parse(raw)
      return {
        state: state.state || null,
        tempo: state.tempo || null,
        tokens: state.tokens || null,
        result: typeof state.output?.result === 'string'
          ? state.output.result.slice(0, TAIL_MESSAGE_CHARS)
          : null,
        children: Array.isArray(state.children) ? state.children : []
      }
    } catch {
      return null
    }
  }

  async function getBoard() {
    const now = Date.now()
    if (cache && now - cacheAt < CACHE_TTL_MS) return cache

    const files = await listTranscriptFiles()
    files.sort((a, b) => b.stat.mtime - a.stat.mtime)
    const recent = files.slice(0, MAX_SESSIONS)
    const sessions = []
    for (const file of recent) {
      try {
        sessions.push(await readSessionIndexEntry(file.projectDir, file.fileName, file.stat))
      } catch {
        // unreadable transcript — skip rather than fail the board
      }
    }

    const live = await readLiveSessions()
    const liveById = new Map(live.map((entry) => [entry.sessionId, entry]))
    for (const session of sessions) {
      const liveEntry = liveById.get(session.sessionId)
      session.live = liveEntry ? { pid: liveEntry.pid, kind: liveEntry.kind, status: liveEntry.status } : null
    }

    cache = {
      generatedAt: new Date(now).toISOString(),
      totalSessions: files.length,
      sessions,
      live
    }
    cacheAt = now
    return cache
  }

  async function findTranscript(sessionId) {
    const files = await listTranscriptFiles()
    return files.find((file) => path.basename(file.fileName, '.jsonl') === sessionId) || null
  }

  async function readSubagents(projectDir, sessionId) {
    const subagentsDir = path.join(projectDir, sessionId, 'subagents')
    let entries = []
    try {
      entries = await fsp.readdir(subagentsDir)
    } catch {
      return []
    }
    const subagents = []
    for (const entry of entries) {
      if (!entry.endsWith('.meta.json')) continue
      try {
        const meta = JSON.parse(await fsp.readFile(path.join(subagentsDir, entry), 'utf8'))
        const agentId = entry.replace(/\.meta\.json$/, '')
        let transcriptStat = null
        try {
          transcriptStat = await fsp.stat(path.join(subagentsDir, `${agentId}.jsonl`))
        } catch {
          // meta without transcript
        }
        subagents.push({
          agentId,
          agentType: meta.agentType || null,
          description: meta.description || null,
          parentAgentId: meta.parentAgentId || null,
          spawnDepth: meta.spawnDepth ?? null,
          bytes: transcriptStat?.size ?? null,
          lastActivity: transcriptStat?.mtime?.toISOString() ?? null
        })
      } catch {
        // unreadable meta — skip
      }
    }
    return subagents
  }

  // Conversation tail for the detail pane: last human/assistant text turns,
  // skipping tool results and non-text blocks. Bounded read; dedupe by uuid
  // (resumed sessions re-serialize prior entries).
  async function readTranscriptTail(filePath, size) {
    const text = size > DETAIL_TAIL_BYTES
      ? await readChunk(filePath, size - DETAIL_TAIL_BYTES, DETAIL_TAIL_BYTES)
      : await fsp.readFile(filePath, 'utf8')
    const seen = new Set()
    const messages = []
    for (const line of text.split('\n')) {
      // field order varies per line — probe cheaply before parsing
      if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      if (entry.type !== 'user' && entry.type !== 'assistant') continue
      if (entry.uuid && seen.has(entry.uuid)) continue
      if (entry.uuid) seen.add(entry.uuid)
      const messageText = extractMessageText(entry.message?.content).trim()
      if (!messageText) continue
      messages.push({
        role: entry.type,
        text: messageText.slice(0, TAIL_MESSAGE_CHARS),
        timestamp: entry.timestamp || null
      })
    }
    return messages.slice(-TAIL_MESSAGES)
  }

  async function getSessionDetail(sessionId) {
    const file = await findTranscript(sessionId)
    if (!file) return null
    const [session, subagents, tail, job] = await Promise.all([
      readSessionIndexEntry(file.projectDir, file.fileName, file.stat),
      readSubagents(file.projectDir, sessionId),
      readTranscriptTail(path.join(file.projectDir, file.fileName), file.stat.size),
      readJobState(sessionId)
    ])
    const live = (await readLiveSessions()).find((entry) => entry.sessionId === sessionId) || null
    session.live = live ? { pid: live.pid, kind: live.kind, status: live.status } : null
    return { session, subagents, tail, job }
  }

  return { getBoard, getSessionDetail }
}

module.exports = { createAgentBoardStore }
