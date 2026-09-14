// The one worker every node script on this page runs in. All the logic is in
// nodeScriptsHost.js; see nodeScripts.js for the page side and the budget.
import { createNodeScriptHost } from './nodeScriptsHost.js'

const host = createNodeScriptHost((message) => self.postMessage(message))
self.onmessage = (event) => host.handle(event.data)
self.postMessage({ type: 'ready' })
