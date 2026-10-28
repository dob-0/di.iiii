import React from 'react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import AiSetupPage, { COMMANDS, LEVELS, NO_KEY_ADDRESSES, TOOLS } from './AiSetupPage.jsx'
import { APP_PAGE_AI_SETUP, getAppLocationState, isReservedAppSegment } from '../utils/spaceRouting.js'

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (path) => readFileSync(join(repoDir, path), 'utf8')
const SETUP_MD = 'docs/ai/public/setup.md'

describe('/ai/setup — connecting an assistant', () => {
    it('is its own page at /ai/setup, and no space can take the word "ai"', () => {
        expect(getAppLocationState({ pathname: '/ai/setup', search: '' }).page).toBe(APP_PAGE_AI_SETUP)
        expect(getAppLocationState({ pathname: '/ai/setup/', search: '' }).page).toBe(APP_PAGE_AI_SETUP)
        expect(isReservedAppSegment('ai')).toBe(true)
    })

    it('owns only /ai/setup: the rest of /ai/ is the server\'s', () => {
        for (const pathname of ['/ai', '/ai/context', '/ai/setup.md', '/ai/setup/more']) {
            expect(getAppLocationState({ pathname, search: '' }).page, pathname).not.toBe(APP_PAGE_AI_SETUP)
        }
    })

    it('renders every section, with its title', () => {
        render(<AiSetupPage />)
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('connect your assistant')
        const sections = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
        expect(sections).toEqual(['any assistant, no key', 'your level, with a key', 'an assistant on your own machine', 'the door over HTTP', 'more'])
        expect(document.title).toBe('Connect your assistant — di.iiii')
    })

    it('shows every address and command a person has to copy, whole', () => {
        const { container } = render(<AiSetupPage />)
        const text = container.textContent
        for (const [url] of NO_KEY_ADDRESSES) expect(text).toContain(url)
        for (const command of Object.values(COMMANDS)) expect(text).toContain(command)
        for (const tool of TOOLS) expect(text).toContain(tool)
        expect(text).toContain(LEVELS.join(', '))
    })

    it('says the same as /ai/setup.md, the copy an assistant reads', () => {
        const md = read(SETUP_MD)
        for (const [url, note] of NO_KEY_ADDRESSES) expect(md).toContain(`- \`${url}\`: ${note}`)
        for (const [name, command] of Object.entries(COMMANDS)) expect(md, name).toContain(`    ${command}`)
        for (const tool of TOOLS) expect(md).toContain(`\`${tool}\``)
        expect(md).toContain(`six levels: ${LEVELS.join(', ')}`)
        expect(md).toMatch(/^# Connect your assistant to di\.iiii\n\n> /)
    })

    it('names the levels and the tools the server and the door really have', () => {
        // The level order of serverXR/src/aiContext.js and the tools of sdk/mcp.mjs,
        // read as text: this branch does not depend on either module being merged.
        expect(LEVELS).toEqual(['public', 'registered', 'partner', 'crew', 'core', 'owner'])
        const door = read('sdk/mcp.mjs')
        for (const tool of TOOLS.filter((t) => t !== 'di_context')) expect(door).toContain(`registerTool('${tool}'`)
    })

    it('links the markdown copy, the door sign and the API article', () => {
        render(<AiSetupPage />)
        const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
        expect(hrefs).toEqual(expect.arrayContaining(['/ai/setup.md', '/for-apps', '/wiki/api-and-agents', 'mailto:info@thedi.studio']))
    })
})
