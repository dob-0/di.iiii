// One hash, imported by BOTH the build-time extractor and the browser panel,
// so the two can never drift into hashing differently. It exists to answer a
// single question — "is the source the manifest measured still the source the
// browser fetched?" — and a mismatch turns into a visible refusal instead of
// the wrong lines shown confidently. Not cryptographic on purpose: nothing
// here is a security boundary, and djb2 over the JS string sidesteps the trap
// a byte-based hash walks into (the em-dashes in this codebase's comments are
// 3 UTF-8 bytes but 1 UTF-16 unit, so byte counts and string offsets disagree
// by exactly the number of non-ASCII characters, silently).
export function fingerprintSource(text) {
    let hash = 5381
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
}
