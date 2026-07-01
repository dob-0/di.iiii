// Import assets from Google Drive into a project. Two modes, max flexibility:
//   1. Public share link, no secrets — a single shared file downloads through the
//      uc?export=download endpoint (redirect + virus-scan-confirm aware).
//   2. GOOGLE_API_KEY present — Drive API v3 gives real metadata, public folder
//      listing (import a whole shared folder), and media download by id.
// Uses node:https directly, never global fetch: undici instantiates a WASM HTTP
// parser that OOMs under cPanel/LVE ("WebAssembly.Instance(): Out of memory").

const https = require('node:https')

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const GOOGLE_APPS_PREFIX = 'application/vnd.google-apps.'
// Native Google Docs types have no raw bytes; export them to a portable format.
const GOOGLE_APPS_EXPORT = {
  document: { mimeType: 'application/pdf', ext: '.pdf' },
  spreadsheet: { mimeType: 'text/csv', ext: '.csv' },
  presentation: { mimeType: 'application/pdf', ext: '.pdf' },
  drawing: { mimeType: 'image/png', ext: '.png' }
}

const ID_RE = /^[a-zA-Z0-9_-]{10,}$/

// Extract a Drive file/folder id from a share URL (or accept a bare id).
function parseDriveUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) return null
  if (ID_RE.test(raw) && !raw.includes('/') && !raw.includes('.')) {
    return { kind: 'file', id: raw }
  }
  let u
  try { u = new URL(raw) } catch { return null }
  let m = u.pathname.match(/\/(?:drive\/)?folders\/([a-zA-Z0-9_-]+)/)
  if (m) return { kind: 'folder', id: m[1] }
  m = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return { kind: 'file', id: m[1] }
  m = u.pathname.match(/\/(document|spreadsheets|presentation|drawings)\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return { kind: 'file', id: m[2] }
  const qid = u.searchParams.get('id')
  if (qid && ID_RE.test(qid)) return { kind: 'file', id: qid }
  return null
}

function filenameFromDisposition(header) {
  if (!header) return ''
  const star = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i)
  if (star) { try { return decodeURIComponent(star[1].replace(/"/g, '').trim()) } catch { /* fall through */ } }
  const plain = header.match(/filename="?([^"]+)"?/i)
  return plain ? plain[1].trim() : ''
}

// Binary GET that follows redirects and enforces a byte ceiling. Returns the raw
// Buffer plus a couple of headers we care about (content-type, disposition name).
function httpGetBuffer(startUrl, { headers = {}, maxBytes, maxRedirects = 6, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const visit = (target, redirectsLeft) => {
      let u
      try { u = new URL(target) } catch (e) { return reject(e) }
      const req = https.request(u, { method: 'GET', headers }, (res) => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          if (redirectsLeft <= 0) return reject(new Error('too many redirects'))
          return visit(new URL(res.headers.location, u).toString(), redirectsLeft - 1)
        }
        const chunks = []
        let size = 0
        res.on('data', (c) => {
          size += c.length
          if (maxBytes && size > maxBytes) {
            req.destroy()
            reject(new Error('asset exceeds size limit'))
            return
          }
          chunks.push(c)
        })
        res.on('end', () => resolve({
          status,
          contentType: res.headers['content-type'] || '',
          dispositionName: filenameFromDisposition(res.headers['content-disposition']),
          finalHost: u.hostname,
          body: Buffer.concat(chunks)
        }))
      })
      req.on('error', reject)
      req.setTimeout(timeoutMs, () => req.destroy(new Error('drive request timeout')))
      req.end()
    }
    visit(startUrl, maxRedirects)
  })
}

// Build the auth for a Drive API call: an OAuth bearer header (a user's own
// Drive) takes precedence; otherwise a server API key as a query param (public
// resources only). Either can be absent for the keyless uc download path.
function authFor({ apiKey, accessToken } = {}) {
  if (accessToken) return { headers: { Authorization: `Bearer ${accessToken}` }, keyQuery: '' }
  if (apiKey) return { headers: {}, keyQuery: `key=${encodeURIComponent(apiKey)}` }
  return { headers: {}, keyQuery: '' }
}

async function apiGet(pathAndQuery, auth = {}) {
  const { headers, keyQuery } = authFor(auth)
  const sep = pathAndQuery.includes('?') ? '&' : '?'
  const url = keyQuery ? `${DRIVE_API}${pathAndQuery}${sep}${keyQuery}` : `${DRIVE_API}${pathAndQuery}`
  const res = await httpGetBuffer(url, { headers: { Accept: 'application/json', ...headers } })
  let json = {}
  try { json = JSON.parse(res.body.toString('utf8')) } catch { /* non-JSON error body */ }
  return { status: res.status, json }
}

async function getFileMeta(id, auth = {}) {
  const { status, json } = await apiGet(`/files/${id}?fields=id,name,mimeType,size&supportsAllDrives=true`, auth)
  if (status !== 200) throw new Error(json?.error?.message || `Drive metadata request failed (${status})`)
  return json
}

// List a folder's direct children, or (folderId omitted) search the user's Drive
// by name. Requires an API key or an OAuth token.
async function listFiles({ folderId, query, auth = {}, pageSize = 100 } = {}) {
  const clauses = ['trashed = false']
  if (folderId) clauses.push(`'${folderId}' in parents`)
  if (query) clauses.push(`name contains '${String(query).replace(/'/g, "\\'")}'`)
  const q = encodeURIComponent(clauses.join(' and '))
  const fields = encodeURIComponent('files(id,name,mimeType,size,modifiedTime),nextPageToken')
  const { status, json } = await apiGet(
    `/files?q=${q}&fields=${fields}&pageSize=${pageSize}&orderBy=folder,modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    auth
  )
  if (status !== 200) throw new Error(json?.error?.message || `Drive listing failed (${status})`)
  return { files: json.files || [], nextPageToken: json.nextPageToken || '' }
}

async function listFolder(id, auth = {}) {
  const files = []
  let pageToken = ''
  do {
    const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    const q = encodeURIComponent(`'${id}' in parents and trashed = false`)
    const fields = encodeURIComponent('files(id,name,mimeType,size),nextPageToken')
    const { headers, keyQuery } = authFor(auth)
    const base = `${DRIVE_API}/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${page}`
    const url = keyQuery ? `${base}&${keyQuery}` : base
    const res = await httpGetBuffer(url, { headers: { Accept: 'application/json', ...headers } })
    let json = {}
    try { json = JSON.parse(res.body.toString('utf8')) } catch { /* non-JSON */ }
    if (res.status !== 200) throw new Error(json?.error?.message || `Drive folder listing failed (${res.status})`)
    for (const f of json.files || []) files.push(f)
    pageToken = json.nextPageToken || ''
  } while (pageToken)
  return files
}

function googleAppsKind(mimeType) {
  if (!mimeType || !mimeType.startsWith(GOOGLE_APPS_PREFIX)) return null
  return mimeType.slice(GOOGLE_APPS_PREFIX.length)
}

// Download one file's bytes. With an API key or OAuth token we use the Drive API
// (media, or export for native Docs); with neither we fall back to the public uc
// endpoint (public single files only).
async function downloadFile(item, { apiKey, accessToken, maxBytes } = {}) {
  const id = item.id
  const appsKind = googleAppsKind(item.mimeType)
  const { headers, keyQuery } = authFor({ apiKey, accessToken })

  if (apiKey || accessToken) {
    const suffix = keyQuery ? `&${keyQuery}` : ''
    if (appsKind) {
      const target = GOOGLE_APPS_EXPORT[appsKind]
      if (!target) throw new Error(`Cannot import Google ${appsKind} — no export format`)
      const res = await httpGetBuffer(
        `${DRIVE_API}/files/${id}/export?mimeType=${encodeURIComponent(target.mimeType)}${suffix}`,
        { maxBytes, headers }
      )
      if (res.status !== 200) throw new Error(`Drive export failed (${res.status})`)
      return { buffer: res.body, name: appendExt(item.name || id, target.ext), mimeType: target.mimeType }
    }
    const res = await httpGetBuffer(
      `${DRIVE_API}/files/${id}?alt=media&supportsAllDrives=true${suffix}`,
      { maxBytes, headers }
    )
    if (res.status !== 200) throw new Error(`Drive download failed (${res.status})`)
    return { buffer: res.body, name: item.name || id, mimeType: item.mimeType || res.contentType || 'application/octet-stream' }
  }

  // Keyless public path: uc?export=download, handling the large-file confirm gate.
  let res = await httpGetBuffer(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, { maxBytes })
  const looksHtml = /text\/html/i.test(res.contentType)
  if (looksHtml) {
    const text = res.body.toString('utf8')
    const token = (text.match(/confirm=([0-9A-Za-z_-]+)/) || [])[1]
    if (token) {
      res = await httpGetBuffer(
        `https://drive.google.com/uc?export=download&confirm=${token}&id=${encodeURIComponent(id)}`,
        { maxBytes }
      )
    }
    if (/text\/html/i.test(res.contentType)) {
      throw new Error('File is not publicly shared or is too large for keyless import (set GOOGLE_API_KEY).')
    }
  }
  if (res.status !== 200) throw new Error(`Drive download failed (${res.status})`)
  return {
    buffer: res.body,
    name: item.name || res.dispositionName || id,
    mimeType: item.mimeType || res.contentType || 'application/octet-stream'
  }
}

function appendExt(name, ext) {
  return name.toLowerCase().endsWith(ext) ? name : name + ext
}

// Resolve a share URL into the list of files to import. Folders need an API key
// or an OAuth token (a connected Drive).
async function resolveItems(url, { apiKey, accessToken } = {}) {
  const parsed = parseDriveUrl(url)
  if (!parsed) throw new Error('Not a recognizable Google Drive link.')
  const auth = { apiKey, accessToken }
  if (parsed.kind === 'folder') {
    if (!apiKey && !accessToken) {
      throw new Error('Importing a folder needs GOOGLE_API_KEY on the server, or connect your Drive; paste a single file link instead.')
    }
    const files = await listFolder(parsed.id, auth)
    return files.filter(f => !googleAppsKind(f.mimeType) || GOOGLE_APPS_EXPORT[googleAppsKind(f.mimeType)])
  }
  if (apiKey || accessToken) return [await getFileMeta(parsed.id, auth)]
  return [{ id: parsed.id }]
}

module.exports = {
  parseDriveUrl,
  resolveItems,
  downloadFile,
  listFiles,
  listFolder,
  getFileMeta,
  filenameFromDisposition,
  _httpGetBuffer: httpGetBuffer
}
