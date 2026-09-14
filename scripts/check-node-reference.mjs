#!/usr/bin/env node
/**
 * check-node-reference.mjs — docs/nodes/* must match what
 * generate-node-reference.mjs would produce right now.
 *
 * Same shape as docs:ai:check / sync-agent-docs.mjs: the generator exports
 * its pure content-builders, this script re-runs them in memory and diffs
 * against the checked-in files, never writing anything itself. A node's
 * ports changing in the registry, or an example's story/build() changing,
 * without re-running `npm run docs:nodes` fails CI here.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { buildAll, repoRoot } from './generate-node-reference.mjs'

const readFileSafe = async (relativePath) => {
    try {
        return await fs.readFile(path.join(repoRoot, relativePath), 'utf8')
    } catch {
        return null
    }
}

const main = async () => {
    const expected = buildAll()
    const errors = []
    for (const [relativePath, content] of expected) {
        const onDisk = await readFileSafe(relativePath)
        if (onDisk === null) {
            errors.push(`${relativePath} is missing — run \`npm run docs:nodes\`.`)
        } else if (onDisk !== content) {
            errors.push(`${relativePath} is stale — run \`npm run docs:nodes\` and commit the result.`)
        }
    }
    if (errors.length) {
        console.error('Node reference checks failed:')
        errors.forEach((error) => console.error(`- ${error}`))
        process.exit(1)
    }
    console.log(`Node reference is up to date (${expected.size} files).`)
}

await main()
