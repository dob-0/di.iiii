import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { getProductionPromotionPlan } from './deploy-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const nodeCommand = process.execPath
const rawArgs = process.argv.slice(2)
const options = {
    dryRun: false,
    allowDirty: false
}
const positionals = []

for (const value of rawArgs) {
    if (value === '--dry-run') {
        options.dryRun = true
        continue
    }
    if (value === '--allow-dirty') {
        options.allowDirty = true
        continue
    }
    positionals.push(value)
}

const printHelp = () => {
    console.log(`Simple deploy helper

Usage:
  npm run deploy -- status
  npm run deploy -- dev
  npm run deploy -- production
  npm run deploy -- smoke dev
  npm run deploy -- smoke production

Shortcuts:
  npm run deploy:status
  npm run deploy:dev
  npm run deploy:production

Rules:
  - tiers: local -> dev (https://dev.diiii.xyz, branch dev) -> production (branch main)
  - run the dev promotion command from a clean dev branch
  - production promotion fast-forwards main when possible, or merges origin/dev into main with dev-preferred conflict resolution if the branches diverged
  - a push to dev runs deploy-vps-dev.yml; a push to main runs deploy-vps.yml (both deploy the Hetzner VPS)

Flags:
  --dry-run
  --allow-dirty
`)
}

const quoteArg = (value) => {
    if (!value) return "''"
    if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
        return value
    }
    return `'${value.replace(/'/g, `'\\''`)}'`
}

const formatCommand = (command, args) => [command, ...args].map(quoteArg).join(' ')

const captureCommand = (command, args, extraOptions = {}) => new Promise((resolve) => {
    const child = spawn(command, args, {
        cwd: extraOptions.cwd || repoRoot,
        env: extraOptions.env || process.env,
        stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString()
    })
    child.on('error', (error) => {
        resolve({
            code: 1,
            stdout: '',
            stderr: error.message
        })
    })
    child.on('exit', (code) => {
        resolve({
            code: code ?? 1,
            stdout: stdout.trim(),
            stderr: stderr.trim()
        })
    })
})

const runCommand = (command, args, extraOptions = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        cwd: extraOptions.cwd || repoRoot,
        env: extraOptions.env || process.env,
        stdio: 'inherit'
    })

    child.on('error', (error) => {
        reject(error)
    })
    child.on('exit', (code) => {
        if (code === 0) {
            resolve()
            return
        }
        reject(new Error(`${formatCommand(command, args)} exited with code ${code ?? 'unknown'}`))
    })
})

const runMaybe = async (command, args, extraOptions = {}) => {
    if (options.dryRun) {
        console.log(`[dry-run] ${formatCommand(command, args)}`)
        return
    }
    await runCommand(command, args, extraOptions)
}

const readGit = async (args) => {
    const result = await captureCommand('git', args)
    if (result.code !== 0) {
        const stderr = result.stderr || `git ${args.join(' ')} failed`
        throw new Error(stderr)
    }
    return result.stdout
}

const getCurrentBranch = async () => {
    const currentBranch = await readGit(['branch', '--show-current'])
    return currentBranch.trim()
}

const getCurrentCommit = async () => {
    const currentCommit = await readGit(['rev-parse', '--short', 'HEAD'])
    return currentCommit.trim()
}

const getFullCommit = async (ref) => {
    const commit = await readGit(['rev-parse', '--verify', ref])
    return commit.trim()
}

const getWorktreeState = async () => {
    const worktree = await readGit(['status', '--short'])
    return worktree.trim()
}

const getHeadState = async () => {
    const branch = await getCurrentBranch()
    if (branch) {
        return {
            type: 'branch',
            ref: branch
        }
    }

    return {
        type: 'detached',
        ref: await getFullCommit('HEAD')
    }
}

const restoreHeadState = async (headState) => {
    if (!headState || options.dryRun) {
        return
    }

    if (headState.type === 'branch') {
        await runCommand('git', ['switch', headState.ref])
        return
    }

    await runCommand('git', ['switch', '--detach', headState.ref])
}

const ensureCleanWorktree = async () => {
    if (options.allowDirty || options.dryRun) {
        return
    }

    const worktree = await getWorktreeState()
    if (worktree) {
        throw new Error(
            'Worktree is not clean. Commit or stash your changes first, or rerun with --allow-dirty.'
        )
    }
}

const ensureBranch = async (expectedBranch, actionLabel) => {
    const currentBranch = await getCurrentBranch()
    if (currentBranch !== expectedBranch) {
        throw new Error(`${actionLabel} must run from '${expectedBranch}', but you are on '${currentBranch}'.`)
    }
}

const isAncestor = async (ancestorRef, descendantRef) => {
    const result = await captureCommand('git', ['merge-base', '--is-ancestor', ancestorRef, descendantRef])
    if (result.code === 0) {
        return true
    }
    if (result.code === 1) {
        return false
    }
    throw new Error(result.stderr || `Unable to compare ${ancestorRef} and ${descendantRef}.`)
}

const hasMergeInProgress = async () => {
    const result = await captureCommand('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])
    if (result.code === 0) {
        return true
    }
    if (result.code === 1) {
        return false
    }
    throw new Error(result.stderr || 'Unable to inspect merge state.')
}

const printCapturedOutput = (result) => {
    if (result.stdout) {
        console.log(result.stdout)
    }
    if (result.stderr) {
        console.error(result.stderr)
    }
}

const shortCommit = (value) => value.slice(0, 7)

const normalizeEnv = (value) => {
    switch ((value || '').toLowerCase()) {
        case 'prod':
            return 'production'
        case 'dev':
            return 'dev'
        default:
            return (value || '').toLowerCase()
    }
}

const normalizeAction = (values) => {
    if (values.length === 0) {
        return 'help'
    }

    const [firstRaw, secondRaw] = values
    const first = (firstRaw || '').toLowerCase()
    const second = normalizeEnv(secondRaw)

    switch (first) {
        case 'help':
        case '--help':
        case '-h':
            return 'help'
        case 'status':
            return 'status'
        case 'dev':
            return 'dev'
        case 'production':
            return first
        case 'smoke':
        case 'check':
            return `smoke:${second}`
        default:
            return first
    }
}

if (positionals.some((value) => ['staging', 'stage'].includes((value || '').toLowerCase()))) {
    console.error('"staging" is now "dev"')
    process.exit(1)
}

const action = normalizeAction(positionals)

const printStatus = async () => {
    const [branch, commit, worktree] = await Promise.all([
        getCurrentBranch(),
        getCurrentCommit(),
        getWorktreeState()
    ])

    console.log(`Branch: ${branch || '(detached HEAD)'}`)
    console.log(`Commit: ${commit}`)
    console.log(`Worktree: ${worktree ? 'dirty' : 'clean'}`)
    console.log('Deploy lanes:')
    console.log('  dev -> https://dev.diiii.xyz (the dev tier)')
    console.log('  production -> https://di-studio.xyz')
}

const handlers = {
    help: async () => {
        printHelp()
    },
    status: async () => {
        await printStatus()
    },
    dev: async () => {
        await ensureCleanWorktree()
        await ensureBranch('dev', 'deploy dev')
        await runMaybe('git', ['push', 'origin', 'HEAD:dev'])
        if (options.dryRun) {
            console.log('Would promote current dev HEAD to origin/dev.')
            console.log('GitHub would then run deploy-vps-dev.yml (push to dev triggers it).')
            return
        }
        console.log('Promoted current dev HEAD to origin/dev.')
        console.log('GitHub should now run deploy-vps-dev.yml, which deploys the dev tier.')
        console.log('Next: wait for it, then `npm run deploy -- smoke dev`.')
    },
    production: async () => {
        await ensureCleanWorktree()
        await runMaybe('git', ['fetch', 'origin', 'main', 'dev'])

        const [mainCommit, sourceCommit, mainInSource, sourceInMain] = await Promise.all([
            getFullCommit('origin/main'),
            getFullCommit('origin/dev'),
            isAncestor('origin/main', 'origin/dev'),
            isAncestor('origin/dev', 'origin/main')
        ])

        const plan = getProductionPromotionPlan({
            mainCommit,
            sourceCommit,
            mainInSource,
            sourceInMain
        })

        if (plan.type === 'noop') {
            console.log(`origin/main already matches origin/dev at ${shortCommit(mainCommit)}.`)
            console.log('Nothing to promote.')
            return
        }

        if (plan.type === 'abort-main-ahead') {
            throw new Error(
                `origin/main (${shortCommit(mainCommit)}) already contains origin/dev (${shortCommit(sourceCommit)}) and additional commits. Refusing to roll production back. Bring the main-only work into dev first, then rerun deploy:production.`
            )
        }

        if (plan.type === 'fast-forward') {
            await runMaybe('git', ['push', 'origin', `${sourceCommit}:main`])
            if (options.dryRun) {
                console.log(`Would fast-forward origin/main from ${shortCommit(mainCommit)} to ${shortCommit(sourceCommit)}.`)
                console.log('GitHub would then run deploy-vps.yml (push to main triggers it).')
                return
            }
            console.log(`Fast-forwarded origin/main from ${shortCommit(mainCommit)} to ${shortCommit(sourceCommit)}.`)
            console.log('GitHub should now run deploy-vps.yml, which deploys production.')
            console.log('Next: wait for it, then `npm run deploy -- smoke production`.')
            return
        }

        if (options.dryRun) {
            console.log(
                `Would create a merge commit on top of origin/main (${shortCommit(mainCommit)}) that brings in origin/dev (${shortCommit(sourceCommit)}), preferring dev on conflicting hunks, then push that merge to origin/main.`
            )
            console.log('GitHub would then run deploy-vps.yml (push to main triggers it).')
            return
        }

        const originalHead = await getHeadState()
        let switchedHead = false

        try {
            await runCommand('git', ['switch', '--detach', 'origin/main'])
            switchedHead = true

            // Keep main-only history, but let the integration branch (dev) win on conflicting lines.
            const mergeResult = await captureCommand('git', [
                'merge',
                '--no-ff',
                '-X',
                'theirs',
                '-m',
                'Promote origin/dev to main for production deploy',
                'origin/dev'
            ])

            printCapturedOutput(mergeResult)

            if (mergeResult.code !== 0) {
                throw new Error(
                    `Could not automatically merge origin/dev (${shortCommit(sourceCommit)}) into origin/main (${shortCommit(mainCommit)}) even with dev-preferred conflict resolution. Resolve the branch drift manually and rerun deploy:production.`
                )
            }

            const mergedCommit = await getCurrentCommit()
            await runCommand('git', ['push', 'origin', 'HEAD:main'])

            console.log(
                `Merged origin/dev (${shortCommit(sourceCommit)}) into origin/main (${shortCommit(mainCommit)}) as ${mergedCommit}.`
            )
            console.log('GitHub should now run deploy-vps.yml, which deploys production.')
            console.log('Next: wait for it, then `npm run deploy -- smoke production`.')
        } catch (error) {
            if (switchedHead && await hasMergeInProgress()) {
                await runCommand('git', ['merge', '--abort'])
            }
            throw error
        } finally {
            if (switchedHead) {
                await restoreHeadState(originalHead)
            }
        }
    },
    'smoke:dev': async () => {
        await runMaybe(nodeCommand, ['scripts/smoke-check.mjs', '--base-url', 'https://dev.diiii.xyz'])
    },
    'smoke:production': async () => {
        await runMaybe(nodeCommand, ['scripts/smoke-check.mjs', '--base-url', 'https://di-studio.xyz'])
    }
}

const main = async () => {
    const handler = handlers[action]
    if (!handler) {
        printHelp()
        throw new Error(`Unsupported deploy command '${positionals.join(' ')}'.`)
    }

    await handler()
}

main().catch((error) => {
    console.error(`[deploy] ${error.message}`)
    process.exitCode = 1
})
