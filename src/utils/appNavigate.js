let _navigate = null

export const setAppNavigate = (fn) => { _navigate = fn }

export const appNavigate = (path, { replace = false } = {}) => {
    if (_navigate) {
        _navigate(path, { replace })
        return
    }
    if (typeof window === 'undefined') return
    if (replace) {
        window.location.replace(path)
        return
    }
    window.location.assign(path)
}
