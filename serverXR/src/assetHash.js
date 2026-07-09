const fs = require('node:fs')
const crypto = require('node:crypto')

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i

const isSha256AssetId = (value = '') => SHA256_HEX_REGEX.test(String(value).trim())

const hashFileSha256 = (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(filePath)
  stream.on('error', reject)
  stream.on('data', (chunk) => hash.update(chunk))
  stream.on('end', () => resolve(hash.digest('hex')))
})

module.exports = {
  SHA256_HEX_REGEX,
  isSha256AssetId,
  hashFileSha256
}
