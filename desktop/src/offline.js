'use strict'
// The address comes in the query string; only a web address becomes a link.
const target = new URLSearchParams(location.search).get('target') || ''
if (/^https?:\/\//i.test(target)) {
    document.getElementById('address').textContent = target
    document.getElementById('retry').setAttribute('href', target)
}
