// A console line that comes from ANOTHER site is not di.iiii's fault. A page
// can frame an artist's own site, and that site's analytics beacon (Cloudflare
// rum, 9x "blocked by CORS ... origin 'null'" in the audit capture) lands in
// our console. verify:surfaces counted it as a failure of the page (F155).
// Only lines from the checked site's own origin can fail a surface.
const originOf = (value) => {
  try { return new URL(value).origin } catch { return null }
}

// `text` is the console text, `locationUrl` the script/resource that logged it
// (Playwright's ConsoleMessage.location().url). Foreign when the logger lives
// on another origin, or when every address the text names does.
export const isForeignConsoleLine = ({ text = '', locationUrl = '' }, baseUrl) => {
  const base = originOf(baseUrl)
  if (!base) return false
  const source = originOf(locationUrl)
  if (source && source !== base) return true
  const named = (String(text).match(/https?:\/\/[^\s'")]+/g) || []).map(originOf).filter(Boolean)
  return named.length > 0 && named.every((origin) => origin !== base)
}
