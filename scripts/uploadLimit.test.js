// Executable contract: the dev tier (dev.diiii.xyz) must take a 1 GB space file
// from `di open FILE --to`. Fails if the dev ceiling falls below 1024 MB or if
// nginx would be the smaller wall. Known fix: "dev refused an 843 MB space carry"
// (2026-11-12, owner row N3847).
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const MIN_MB = 1024

describe('dev tier upload limit', () => {
    it('docker-compose.dev.yml sets MAX_UPLOAD_MB to at least 1024 MB', () => {
        const m = read('docker-compose.dev.yml').match(/^\s*MAX_UPLOAD_MB:\s*\$\{DEV_MAX_UPLOAD_MB:-(\d+)\}/m)
        expect(m, 'MAX_UPLOAD_MB with a DEV_MAX_UPLOAD_MB default must be in the dev server env').toBeTruthy()
        expect(Number(m[1])).toBeGreaterThanOrEqual(MIN_MB)
    })

    it('production keeps its 100 MB default', () => {
        expect(read('docker-compose.yml')).toMatch(/MAX_UPLOAD_MB:\s*\$\{MAX_UPLOAD_MB:-100\}/)
    })

    it('nginx lets a bundle upload through above the dev ceiling, unbuffered, with a long read timeout', () => {
        const conf = read('nginx.conf')
        const start = conf.indexOf('location ~ ^/serverXR/api/spaces/(bundle|')
        expect(start).toBeGreaterThan(-1)
        const block = conf.slice(start, conf.indexOf('}', start))
        const size = block.match(/client_max_body_size\s+(\d+)m;/)
        expect(Number(size?.[1])).toBeGreaterThanOrEqual(MIN_MB)
        expect(block).toMatch(/proxy_request_buffering\s+off;/)
        expect(Number(block.match(/proxy_read_timeout\s+(\d+)s;/)?.[1])).toBeGreaterThanOrEqual(600)
    })

    it('the server lifts Node requestTimeout when the ceiling is above the default', () => {
        expect(read('serverXR/src/index.js')).toMatch(/config\.maxUploadBytes > 100 \* 1024 \* 1024\) httpServer\.requestTimeout = 0/)
    })

    // Cloudflare refuses a body over ~100 MB, so a bigger file goes in parts of at
    // most 64 MB (serverXR/src/chunkedUploads.js); nginx must take a part of that size.
    it('nginx takes a 64 MB part on the chunked-upload part route', () => {
        const conf = read('nginx.conf')
        const start = conf.indexOf('location ~ ^/serverXR/api/space-uploads/')
        expect(start).toBeGreaterThan(-1)
        const block = conf.slice(start, conf.indexOf('}', start))
        expect(Number(block.match(/client_max_body_size\s+(\d+)m;/)?.[1])).toBeGreaterThanOrEqual(65)
        expect(block).toMatch(/proxy_request_buffering\s+off;/)
    })

    it('the client switches to parts above 90 MB, under the ~100 MB Cloudflare cap', () => {
        expect(read('scripts/di/chunkedUpload.mjs')).toMatch(/CHUNK_THRESHOLD = 90 \* 1024 \* 1024/)
        expect(read('scripts/di/cli.mjs')).toMatch(/bytes > CHUNK_THRESHOLD/)
        expect(read('scripts/space-proposal.mjs')).toMatch(/> CHUNK_THRESHOLD/)
    })
})
