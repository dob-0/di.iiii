// The scene deck's one error type (docs/architecture/RIG_BUILD.md §21). `code` is the typed reason a
// screen can branch on; `message` says it in words; `detail` carries the facts (groups, seconds, field).
export class SceneDeckError extends Error {
    constructor(code, message, detail = {}) {
        super(message)
        this.name = 'SceneDeckError'
        this.code = code
        this.detail = detail
    }
}
