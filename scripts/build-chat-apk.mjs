#!/usr/bin/env node
// Build the studio chat's Android app, put it where di.net can hand it out, and
// say what it did — the whole recipe from docs/deploy/STUDIO_CHAT_APK.md as one
// command, because a recipe carried out by hand is a recipe carried out
// differently each time.
//
// The three things that went wrong when this WAS done by hand, now impossible:
//
//   1. `yes | bubblewrap build` answers the version prompt too, and "y" becomes
//      the app's versionName. Nothing is piped into it here; the version is
//      written into twa-manifest.json and app/build.gradle before the build.
//   2. The version code has to RISE, or the new app cannot install over the old
//      one on anybody's phone. --bump does that; a build that would repeat a
//      version code is refused.
//   3. The APK on the console's host is what people actually receive. Copying
//      it is part of the build, not a thing to remember afterwards.
//
// Usage:
//   node scripts/build-chat-apk.mjs                 # rebuild at the current version
//   node scripts/build-chat-apk.mjs --bump          # raise the patch version and the code
//   node scripts/build-chat-apk.mjs --bump --deliver  # …and scp it to the console host
//   node scripts/build-chat-apk.mjs --check         # say what would happen, touch nothing

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const twaDir = path.join(repoRoot, 'android-twa')
const manifestPath = path.join(twaDir, 'twa-manifest.json')
const gradlePath = path.join(twaDir, 'app', 'build.gradle')
const checksumPath = path.join(twaDir, 'manifest-checksum.txt')
const apkPath = path.join(twaDir, 'app-release-signed.apk')

const KEYSTORE = process.env.CHAT_APK_KEYSTORE
  || path.join(process.env.HOME || '', 'di-backups/keystores/dii-studio-chat.keystore')
const PASSWORD_FILE = process.env.CHAT_APK_PASSWORD_FILE
  || path.join(process.env.HOME || '', 'di-backups/keystores/dii-studio-chat.password')
const JDK = process.env.CHAT_APK_JDK || path.join(process.env.HOME || '', 'android-sdk/jdk')
// Where di.net reads it. Same default as the bot's CHAT_APK_PATH.
const DELIVER_TO = process.env.CHAT_APK_DELIVER_TO || 'dii-vps:/var/lib/di-inner/di-studio-chat.apk'

const args = new Set(process.argv.slice(2))
const bump = args.has('--bump')
const deliver = args.has('--deliver')
const check = args.has('--check') || args.has('--dry-run')

const die = (message) => { console.error(`chat-apk: ${message}`); process.exit(1) }
const say = (message) => console.log(`chat-apk: ${message}`)

if (!existsSync(manifestPath)) die(`no twa-manifest.json at ${manifestPath} — see docs/deploy/STUDIO_CHAT_APK.md`)
if (!existsSync(KEYSTORE)) die(`no signing key at ${KEYSTORE}. An APK signed with a different key cannot update an installed one, so this refuses rather than making a second identity.`)
if (!existsSync(PASSWORD_FILE)) die(`no keystore password at ${PASSWORD_FILE}`)
if (!existsSync(JDK)) die(`no JDK at ${JDK} — bubblewrap and Gradle both refuse a JDK newer than 17`)

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const currentName = String(manifest.appVersionName || '1.0.0')
const currentCode = Number(manifest.appVersionCode || 1)

const nextName = () => {
  const parts = currentName.split('.').map((n) => Number(n) || 0)
  while (parts.length < 3) parts.push(0)
  parts[2] += 1
  return parts.join('.')
}

const versionName = bump ? nextName() : currentName
const versionCode = bump ? currentCode + 1 : currentCode

say(`host ${manifest.host} · package ${manifest.packageId}`)
say(`version ${currentName} (${currentCode})${bump ? ` → ${versionName} (${versionCode})` : ' — unchanged'}`)
if (deliver) say(`will deliver to ${DELIVER_TO}`)
if (check) {
  say('--check: nothing was built or copied.')
  process.exit(0)
}

if (bump) {
  manifest.appVersionName = versionName
  manifest.appVersion = versionName
  manifest.appVersionCode = versionCode
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  // Gradle is what the build actually reads; the manifest is what the next
  // build reads. Both, or the APK carries a version nobody chose.
  const gradle = readFileSync(gradlePath, 'utf8')
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`)
  writeFileSync(gradlePath, gradle)

  // bubblewrap prompts when the manifest has changed under it, and a prompt in
  // a script is a hang or a wrong answer. Tell it the change is intended.
  writeFileSync(checksumPath, createHash('sha1').update(readFileSync(manifestPath)).digest('hex'))
}

const password = readFileSync(PASSWORD_FILE, 'utf8').trim()
const env = {
  ...process.env,
  JAVA_HOME: JDK,
  BUBBLEWRAP_KEYSTORE_PASSWORD: password,
  BUBBLEWRAP_KEY_PASSWORD: password
}

say('building…')
try {
  execFileSync('npx', ['--yes', '@bubblewrap/cli@latest', 'build', '--skipPwaValidation'], {
    cwd: twaDir,
    env,
    stdio: 'inherit',
    // No stdin: if bubblewrap ever asks something, it must fail rather than be
    // answered by whatever happens to be on the pipe.
    input: ''
  })
} catch {
  die('bubblewrap failed — see the output above')
}

if (!existsSync(apkPath)) die('the build finished but there is no app-release-signed.apk')

const badging = execFileSync(
  path.join(path.dirname(JDK), 'build-tools/34.0.0/aapt'),
  ['dump', 'badging', apkPath],
  { encoding: 'utf8' }
).split('\n')[0]
say(badging.trim())

if (!badging.includes(`versionName='${versionName}'`)) {
  die(`the APK says ${badging.trim()} but ${versionName} was asked for — refusing to hand out a build nobody chose`)
}

if (deliver) {
  say(`copying to ${DELIVER_TO}`)
  execFileSync('scp', ['-q', apkPath, DELIVER_TO], { stdio: 'inherit' })
  say('delivered — di.net will hand out this build from now on')
}

say('done')
