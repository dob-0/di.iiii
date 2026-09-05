// @vitest-environment node
//
// The desk carries its own three suites (tests/), written against plain node so the
// club machine can run them without vitest. This makes them part of `npm test` here:
// unit (engine, drivers, FX), wiring (the interface reaches the ids and routes it
// thinks it does) and the end-to-end HTTP suite on a throwaway desk of its own.

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const run = (file) => spawnSync(process.execPath, [path.join(here, 'tests', file)], {
  env: { ...process.env, ARTNET_OFFLINE: '1' },
  encoding: 'utf8',
  timeout: 180000
})

describe('the lighting desk', () => {
  for (const file of ['test.js', 'test-wiring.js', 'test-http.js']) {
    it(`${file} passes`, () => {
      const r = run(file)
      const tail = (r.stdout || '').split('\n').filter((l) => !l.startsWith('  ok')).join('\n')
      expect(r.status, tail + (r.stderr || '')).toBe(0)
    }, 200000)
  }
})
