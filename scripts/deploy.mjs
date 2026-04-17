import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { getProductionPromotionPlan } from './deploy-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const nodeCommand = process.execPath
const remoteDefaults = {
    sshTarget: process.env.DEPLOY_SSH_TARGET || 'distudio@di-studio.xyz',
    stagingRepo: process.env.DEPLOY_REMOTE_STAGING_REPO || '/home/distudio/repositories/di.iiii-staging',
    productionRepo: process.env.DEPLOY_REMOTE_PRODUCTION_REPO || '/home/distudio/repositories/di.iiii-production'
}

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
  npm run deploy -- staging
  npm run deploy -- production
  npm run deploy -- host staging
  npm run deploy -- host production
  npm run deploy -- remote staging
  npm run deploy -- remote production
  npm run deploy -- smoke staging
  npm run deploy -- smoke production
  npm run deploy -- build staging
  npm run deploy -- build production

Shortcuts:
  npm run deploy:status
  npm run deploy:dev
  npm run deploy:staging
  npm run deploy:production
  npm run deploy:host:staging
  npm run deploy:host:production
  npm run deploy:remote:staging
  npm run deploy:remote:production

Rules:
  - dev does not deploy to hosting directly
  - run dev/staging promotion commands from a clean dev branch
  - production promotion fast-forwards main when possible, or merges origin/staging into main if the branches diverged
  - host commands are for the cPanel clone or server repo, not your laptop
  - remote commands SSH from your laptop into the cPanel host and run the host apply there

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
        case 'stage':
            return 'staging'
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
        case 'staging':
        case 'production':
            return first
        case 'host':
        case 'hosting':
        case 'apply':
            return `host:${second}`
        case 'remote':
        case 'ssh':
            return `remote:${second}`
        case 'smoke':
        case 'check':
            return `smoke:${second}`
        case 'build':
        case 'release':
            return `build:${second}`
        default:
            return first
    }
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
    console.log('  dev -> integration only')
    console.log('  staging -> https://staging.di-studio.xyz')
    console.log('  production -> https://di-studio.xyz')
    console.log(`Remote staging host: ${remoteDefaults.sshTarget}:${remoteDefaults.stagingRepo}`)
    console.log(`Remote production host: ${remoteDefaults.sshTarget}:${remoteDefaults.productionRepo}`)
}

const buildRemoteDeployCommand = (deployEnv) => {
    const repoPath = deployEnv === 'staging'
        ? remoteDefaults.stagingRepo
        : remoteDefaults.productionRepo
    const cpanelBranch = deployEnv === 'staging' ? 'cpanel-staging' : 'cpanel-production'

    return [
        'ssh',
        remoteDefaults.sshTarget,
        `cd ${quoteArg(repoPath)} && git pull --ff-only origin ${cpanelBranch} && bash scripts/cpanel-apply-prebuilt-release.sh ${deployEnv}`
    ]
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
            console.log('Dev is the integration lane only; it does not deploy to hosting directly.')
            return
        }
        console.log('Promoted current dev HEAD to origin/dev.')
        console.log('Dev is the integration lane only; it does not deploy to hosting directly.')
    },
    staging: async () => {
        await ensureCleanWorktree()
        await ensureBranch('dev', 'deploy staging')
        await runMaybe('git', ['push', 'origin', 'HEAD:dev', 'HEAD:staging'])
        if (options.dryRun) {
            console.log('Would promote current dev HEAD to origin/dev and origin/staging.')
            console.log('GitHub would then publish cpanel-staging automatically.')
            console.log('Next on the host: npm run deploy -- host staging')
            return
        }
        console.log('Promoted current dev HEAD to origin/dev and origin/staging.')
        console.log('GitHub should now publish cpanel-staging automatically.')
        console.log('Next: run `npm run deploy -- host staging` on the staging host, or click cPanel Deploy HEAD Commit.')
    },
    production: async () => {
        await ensureCleanWorktree()
        await runMaybe('git', ['fetch', 'origin', 'main', 'staging'])

        const [mainCommit, stagingCommit, mainInStaging, stagingInMain] = await Promise.all([
            getFullCommit('origin/main'),
            getFullCommit('origin/staging'),
            isAncestor('origin/main', 'origin/staging'),
            isAncestor('origin/staging', 'origin/main')
        ])

        const plan = getProductionPromotionPlan({
            mainCommit,
            stagingCommit,
            mainInStaging,
            stagingInMain
        })

        if (plan.type === 'noop') {
            console.log(`origin/main already matches origin/staging at ${shortCommit(mainCommit)}.`)
            console.log('Nothing to promote.')
            return
        }

        if (plan.type === 'abort-main-ahead') {
            throw new Error(
                `origin/main (${shortCommit(mainCommit)}) already contains origin/staging (${shortCommit(stagingCommit)}) and additional commits. Refusing to roll production back. Bring the main-only work into staging first, then rerun deploy:production.`
            )
        }

        if (plan.type === 'fast-forward') {
            await runMaybe('git', ['push', 'origin', `${stagingCommit}:main`])
            if (options.dryRun) {
                console.log(`Would fast-forward origin/main from ${shortCommit(mainCommit)} to ${shortCommit(stagingCommit)}.`)
                console.log('GitHub would then publish cpanel-production automatically.')
                console.log('Next on the host: let cron apply production automatically, or run npm run deploy -- host production')
                return
            }
            console.log(`Fast-forwarded origin/main from ${shortCommit(mainCommit)} to ${shortCommit(stagingCommit)}.`)
            console.log('GitHub should now publish cpanel-production automatically.')
            console.log('Next: let cron apply production automatically, or run `npm run deploy -- host production` on the production host.')
            return
        }

        if (options.dryRun) {
            console.log(
                `Would create a merge commit on top of origin/main (${shortCommit(mainCommit)}) that brings in origin/staging (${shortCommit(stagingCommit)}), then push that merge to origin/main.`
            )
            console.log('GitHub would then publish cpanel-production automatically.')
            console.log('Next on the host: let cron apply production automatically, or run npm run deploy -- host production')
            return
        }

        const originalHead = await getHeadState()
        let switchedHead = false

        try {
            await runCommand('git', ['switch', '--detach', 'origin/main'])
            switchedHead = true

            const mergeResult = await captureCommand('git', [
                'merge',
                '--no-ff',
                '-m',
                'Promote origin/staging to main for production deploy',
                'origin/staging'
            ])

            printCapturedOutput(mergeResult)

            if (mergeResult.code !== 0) {
                throw new Error(
                    `Could not automatically merge origin/staging (${shortCommit(stagingCommit)}) into origin/main (${shortCommit(mainCommit)}). Resolve the branch drift manually and rerun deploy:production.`
                )
            }

            const mergedCommit = await getCurrentCommit()
            await runCommand('git', ['push', 'origin', 'HEAD:main'])

            console.log(
                `Merged origin/staging (${shortCommit(stagingCommit)}) into origin/main (${shortCommit(mainCommit)}) as ${mergedCommit}.`
            )
            console.log('GitHub should now publish cpanel-production automatically.')
            console.log('Next: let cron apply production automatically, or run `npm run deploy -- host production` on the production host.')
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
    'host:staging': async () => {
        await runMaybe('bash', ['scripts/cpanel-apply-prebuilt-release.sh', 'staging'])
        if (options.dryRun) {
            console.log('Would apply the staging prebuilt release on this host.')
            return
        }
        console.log('Applied the staging prebuilt release on this host.')
    },
    'host:production': async () => {
        await runMaybe('bash', ['scripts/cpanel-apply-prebuilt-release.sh', 'production'])
        if (options.dryRun) {
            console.log('Would apply the production prebuilt release on this host.')
            return
        }
        console.log('Applied the production prebuilt release on this host.')
    },
    'remote:staging': async () => {
        const [command, ...args] = buildRemoteDeployCommand('staging')
        await runMaybe(command, args)
        if (options.dryRun) {
            console.log('Would SSH to the cPanel host and apply the staging prebuilt release there.')
            return
        }
        console.log('Triggered the staging prebuilt release on the remote cPanel host.')
    },
    'remote:production': async () => {
        const [command, ...args] = buildRemoteDeployCommand('production')
        await runMaybe(command, args)
        if (options.dryRun) {
            console.log('Would SSH to the cPanel host and apply the production prebuilt release there.')
            return
        }
        console.log('Triggered the production prebuilt release on the remote cPanel host.')
    },
    'smoke:staging': async () => {
        await runMaybe(nodeCommand, ['scripts/smoke-check-cpanel.mjs', '--base-url', 'https://staging.di-studio.xyz'])
    },
    'smoke:production': async () => {
        await runMaybe(nodeCommand, ['scripts/smoke-check-cpanel.mjs', '--base-url', 'https://di-studio.xyz'])
    },
    'build:staging': async () => {
        await runMaybe(nodeCommand, ['scripts/stage-cpanel-nodeapp-release.mjs'], {
            env: {
                ...process.env,
                DEPLOY_ENV: 'staging'
            }
        })
        if (options.dryRun) {
            console.log('Would build the local staging cPanel bundle in .deploy/cpanel/.')
            return
        }
        console.log('Built the local staging cPanel bundle in .deploy/cpanel/.')
    },
    'build:production': async () => {
        await runMaybe(nodeCommand, ['scripts/stage-cpanel-nodeapp-release.mjs'], {
            env: {
                ...process.env,
                DEPLOY_ENV: 'production'
            }
        })
        if (options.dryRun) {
            console.log('Would build the local production cPanel bundle in .deploy/cpanel/.')
            return
        }
        console.log('Built the local production cPanel bundle in .deploy/cpanel/.')
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
