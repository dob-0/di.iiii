import React from 'react'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ForAppsPage, { ANONYMOUS_READS_PER_MINUTE, IDENTIFIED_READS_PER_MINUTE } from './ForAppsPage.jsx'
import { APP_PAGE_FOR_APPS, getAppLocationState, isReservedAppSegment } from '../utils/spaceRouting.js'

const require = createRequire(import.meta.url)
const server = require('../../serverXR/src/appVisitors.js')
const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (path) => readFileSync(join(repoDir, path), 'utf8')

describe('/for-apps — the door sign for programs', () => {
    it('is its own page, and no space can take the word', () => {
        expect(getAppLocationState({ pathname: '/for-apps', search: '' }).page).toBe(APP_PAGE_FOR_APPS)
        expect(isReservedAppSegment('for-apps')).toBe(true)
    })

    // The sign quotes the limits the server enforces. A sign that quotes the
    // wrong number is worse than no sign.
    it('quotes the same limits the server enforces', () => {
        expect(ANONYMOUS_READS_PER_MINUTE).toBe(server.ANONYMOUS_READS_PER_MINUTE)
        expect(IDENTIFIED_READS_PER_MINUTE).toBe(server.IDENTIFIED_READS_PER_MINUTE)
        expect(read('public/llms.txt')).toContain(`${server.IDENTIFIED_READS_PER_MINUTE} API reads a minute`)
        expect(read('public/llms.txt')).toContain(`get ${server.ANONYMOUS_READS_PER_MINUTE}.`)
    })

    it('shows how to identify, the limits, and what is off-limits', () => {
        render(<ForAppsPage />)
        expect(screen.getByText(/SpaceMirror\/1\.4 \( ops@example\.org \)/)).toBeTruthy()
        expect(screen.getByText(new RegExp(`${IDENTIFIED_READS_PER_MINUTE} API reads a`))).toBeTruthy()
        expect(screen.getByText(new RegExp(`${ANONYMOUS_READS_PER_MINUTE} API reads a`))).toBeTruthy()
        expect(screen.getByText('/admin')).toBeTruthy()
        expect(screen.getByText(/Private spaces, and anything else behind sign-in/)).toBeTruthy()
    })

    // The example on the sign must be one the server actually accepts as an
    // identified app, or the sign teaches a format that earns nothing.
    it('teaches a User-Agent the server reads as an identified app', () => {
        expect(server.classifyUserAgent('SpaceMirror/1.4 ( ops@example.org )').kind).toBe('app')
        expect(server.classifyUserAgent('my-research-bot/0.2 (+https://example.org/bot)').kind).not.toBe('anonymous')
        expect(server.classifyUserAgent('YourApp/1.0 (you@example.com)').kind).toBe('app')
    })

    // The owner's call, 2026-09-13: welcome every AI crawler. robots.txt keeps
    // its two Disallow lines and must never grow a block for a named agent.
    it('robots.txt welcomes every crawler and points programs at the sign', () => {
        const robots = read('public/robots.txt')
        expect(robots).toContain('/for-apps')
        expect(robots).toContain('/llms.txt')
        const rules = robots.split('\n').filter((line) => line && !line.startsWith('#'))
        expect(rules.filter((line) => /^User-agent:/i.test(line))).toEqual(['User-agent: *'])
        expect(rules.filter((line) => /^Disallow:/i.test(line))).toEqual(['Disallow: /admin', 'Disallow: /preferences'])
    })
})
