// Fakes for the name broker tests: a KV that is a Map, a Cloudflare DNS API and
// a dev tier answered by one fetch stub that records every call.
import { handle } from '../src/worker.js'
import { bytesToBase64url, signedMessage } from '../src/sign.js'

export const ZONE = 'l.di-studio.xyz'
export const ADMIN = 'admin-secret-for-tests'
export const BASE = 'https://broker.test'

export function fakeKv() {
  const map = new Map()
  return {
    map,
    async get(key) {
      return map.has(key) ? map.get(key) : null
    },
    async put(key, value) {
      map.set(key, String(value))
    },
    async delete(key) {
      map.delete(key)
    }
  }
}

// accounts: token → { id, name } the dev tier knows.
export function fakeWorld({ accounts = {}, failDns = false } = {}) {
  const records = []
  const calls = []
  let nextId = 1
  const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = (init.method || 'GET').toUpperCase()
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ host: url.host, method, path: url.pathname + url.search, body, headers: init.headers || {} })
    if (url.host === 'dev.diiii.xyz') {
      const token = String(init.headers?.authorization || '').replace(/^Bearer /, '')
      const who = accounts[token]
      return who ? reply(200, { user: who, token: { id: 't1' } }) : reply(401, { error: 'cli_token_invalid' })
    }
    if (url.host === 'api.cloudflare.com') {
      if (failDns) return reply(500, { success: false, errors: [{ code: 1000, message: 'down' }] })
      const idMatch = /\/dns_records\/([^/?]+)$/.exec(url.pathname)
      if (method === 'GET') {
        const type = url.searchParams.get('type')
        const name = url.searchParams.get('name')
        return reply(200, { success: true, result: records.filter((r) => r.type === type && r.name === name) })
      }
      if (method === 'POST') {
        const record = { id: `r${nextId++}`, ...body }
        records.push(record)
        return reply(200, { success: true, result: record })
      }
      if (method === 'PATCH' && idMatch) {
        const record = records.find((r) => r.id === idMatch[1])
        Object.assign(record, body)
        return reply(200, { success: true, result: record })
      }
      if (method === 'DELETE' && idMatch) {
        const at = records.findIndex((r) => r.id === idMatch[1])
        records.splice(at, 1)
        return reply(200, { success: true, result: { id: idMatch[1] } })
      }
    }
    return reply(404, { error: 'no such fake route' })
  }
  const env = {
    ZONE,
    CF_ZONE_ID: 'zone123',
    CF_API_TOKEN: 'cf-token-for-tests',
    ADMIN_TOKEN: ADMIN,
    DI_API_BASE: 'https://dev.diiii.xyz/serverXR',
    LABELS: fakeKv()
  }
  const send = (method, path, { body, headers = {} } = {}) =>
    handle(new Request(BASE + path, { method, headers, body: body === undefined ? undefined : body }), env, { fetchImpl })
  return { env, records, calls, fetchImpl, send }
}

export async function makeKey() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey)
  return { pair, pubkey: bytesToBase64url(raw) }
}

export async function signHeaders(key, label, method, path, body = '', ts = Math.floor(Date.now() / 1000)) {
  const message = new TextEncoder().encode(await signedMessage(method, path, ts, body))
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key.pair.privateKey, message)
  return { 'x-di-label': label, 'x-di-ts': String(ts), 'x-di-sig': bytesToBase64url(sig) }
}

export async function claimOne(world, key, { token = 'tok-dob', labelHint } = {}) {
  const res = await world.send('POST', '/v1/claim', {
    body: JSON.stringify({ pubkey: key.pubkey, loginToken: token, ...(labelHint ? { labelHint } : {}) })
  })
  return { res, data: res.status === 201 ? await res.json() : await res.json().catch(() => null) }
}

// A signed call as an install makes it.
export async function signed(world, key, label, method, path, data) {
  const body = data === undefined ? '' : JSON.stringify(data)
  const headers = await signHeaders(key, label, method, path, body)
  return world.send(method, path, { body: body || undefined, headers })
}
