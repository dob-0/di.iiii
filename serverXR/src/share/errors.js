// One error type for the share door. `code` is a short slug the routes map to
// an HTTP status and the preview page shows; `message` never holds a secret.

class ShareError extends Error {
  constructor(code, message, { status = 0, channel = '' } = {}) {
    super(message)
    this.name = 'ShareError'
    this.code = code
    this.status = status
    this.channel = channel
  }
}

// Strip every known secret out of a string before it is stored or returned.
const redact = (text, secrets = []) => {
  let out = String(text == null ? '' : text)
  for (const secret of secrets) {
    if (secret && String(secret).length >= 4) out = out.split(String(secret)).join('***')
  }
  return out
}

module.exports = { ShareError, redact }
