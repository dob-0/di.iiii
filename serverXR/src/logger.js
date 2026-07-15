// Minimal structured logger: timestamp + level prefix, still writes to
// console.log/console.error under the hood so Docker/systemd log capture
// (stdout/stderr) is unaffected. No new dependency — see package.json,
// which keeps deps deliberately minimal for this self-hostable project.

function formatArg(arg) {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack || arg.message
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function format(level, args) {
  const timestamp = new Date().toISOString()
  const message = args.map(formatArg).join(' ')
  return `${timestamp} [${level}] ${message}`
}

const logger = {
  debug(...args) {
    console.log(format('DEBUG', args))
  },
  info(...args) {
    console.log(format('INFO', args))
  },
  warn(...args) {
    console.warn(format('WARN', args))
  },
  error(...args) {
    console.error(format('ERROR', args))
  },
}

module.exports = logger
module.exports.logger = logger
