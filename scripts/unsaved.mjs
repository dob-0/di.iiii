#!/usr/bin/env node
/**
 * unsaved.mjs — every piece of work under these folders that lives only on this machine.
 *
 *   npm run unsaved -- ~/dev ~/Desktop        # scan folders for git repos (any project, not only di.iiii)
 *   npm run unsaved                           # just this checkout, all its worktrees
 *   node scripts/unsaved.mjs --json <dir>...  # for another script
 *   node scripts/unsaved.mjs --older-than 24 --notify --log <file> <dir>...
 *                                             # the daily watch (scripts/unsaved-watch/)
 *
 *   --older-than <hours>  report only what has sat here longer than that (today's work is not news)
 *   --notify              also raise a desktop notification when something is only here, or a repo
 *                         could not be read (Linux notify-send, Windows toast, macOS osascript)
 *   --log <file>          append the report, with a timestamp, to this file — the one place to look
 *
 * Exit code: 0 when nothing is only-here, 1 when something is, 2 when a repo could
 * not be read. See scripts/unsaved-lib.mjs for what counts and why.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { findRepos, formatRepo, isClean, olderThan, scanRepo } from './unsaved-lib.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const parseArgs = (argv) => {
  const args = { json: false, notify: false, olderThan: 0, log: null, dirs: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') args.json = true
    else if (a === '--notify') args.notify = true
    else if (a === '--older-than') args.olderThan = Number(argv[++i]) || 0
    else if (a === '--log') args.log = argv[++i]
    else if (!a.startsWith('--')) args.dirs.push(a)
  }
  return args
}

// One line a notification can hold. The full list lives in the log / terminal.
export const summaryLine = (onlyHere, errors) => {
  const parts = []
  if (onlyHere.length) parts.push(`${onlyHere.length} repo${onlyHere.length === 1 ? ' holds' : 's hold'} work that exists only on this machine`)
  if (errors.length) parts.push(`${errors.length} repo${errors.length === 1 ? '' : 's'} could not be checked`)
  return parts.join('; ')
}

const notify = (title, body) => {
  // A notification that cannot be shown must never hide the finding: the log and
  // the exit code still carry it, so a failure here is swallowed on purpose.
  try {
    if (process.platform === 'linux') {
      execFileSync('notify-send', ['--app-name=di', '--urgency=normal', title, body], { stdio: 'ignore', timeout: 10_000 })
    } else if (process.platform === 'darwin') {
      execFileSync('osascript', ['-e', `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`], { stdio: 'ignore', timeout: 10_000 })
    } else if (process.platform === 'win32') {
      // WinRT toast through PowerShell — no module to install. The text travels
      // base64-encoded so no quoting in it can break out of the script.
      const b64 = (t) => Buffer.from(t, 'utf8').toString('base64')
      const ps = [
        '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null',
        `$t = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(title)}'))`,
        `$b = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(body)}'))`,
        '$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
        '$n = $x.GetElementsByTagName("text"); $n.Item(0).InnerText = $t; $n.Item(1).InnerText = $b',
        '$toast = [Windows.UI.Notifications.ToastNotification]::new($x)',
        // The PowerShell app id is registered on every Windows install, so the toast shows without setup.
        '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe").Show($toast)'
      ].join('; ')
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 20_000 })
    }
  } catch { /* see above */ }
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const repos = args.dirs.length ? [...new Set(args.dirs.flatMap((d) => findRepos(d)))] : [ROOT_DIR]
  const results = repos.map((repo) => olderThan(scanRepo(repo), args.olderThan))

  const onlyHere = results.filter((r) => !r.error && !isClean(r))
  const errors = results.filter((r) => r.error)
  const lines = []
  if (!onlyHere.length && !errors.length) {
    lines.push(`  SAVED — ${results.length} repo${results.length === 1 ? '' : 's'} checked, nothing lives only on this machine` +
      (args.olderThan ? ` for longer than ${args.olderThan} h` : ''))
  } else {
    lines.push(`  ONLY ON THIS MACHINE — ${summaryLine(onlyHere, errors)}:`)
    for (const r of [...onlyHere, ...errors]) {
      lines.push('')
      lines.push(`  ${r.repo}`)
      lines.push(...formatRepo(r))
    }
  }

  if (args.json) console.log(JSON.stringify({ checkedAt: new Date().toISOString(), olderThanHours: args.olderThan, repos: results }, null, 2))
  else console.log(lines.join('\n'))

  if (args.log) {
    try {
      fs.mkdirSync(path.dirname(args.log), { recursive: true })
      fs.appendFileSync(args.log, `\n=== ${new Date().toISOString()} — ${results.length} repos under ${args.dirs.join(', ') || ROOT_DIR}\n${lines.join('\n')}\n`)
    } catch (error) {
      console.error(`  could not write the log ${args.log}: ${error.message}`)
    }
  }
  if (args.notify && (onlyHere.length || errors.length)) {
    notify('Work only on this machine', `${summaryLine(onlyHere, errors)}.${args.log ? ` List: ${args.log}` : ' Run: npm run unsaved'}`)
  }

  process.exitCode = errors.length ? 2 : onlyHere.length ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
