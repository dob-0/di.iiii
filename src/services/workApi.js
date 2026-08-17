import { apiFetch } from './apiClient.js'

// These endpoints only exist on a local dev serverXR (see devLocalGuard.js
// server-side) — production returns 404, which callers surface as an error
// state on the panel rather than crashing the graph.
export const fetchWorkStatus = async (opts = {}) => apiFetch('/api/work-status', opts)

export const startAgentRun = async (prompt, cwd, opts = {}) =>
    apiFetch('/api/agent-runs', { method: 'POST', body: { prompt, cwd }, ...opts })

export const fetchAgentRun = async (runId, opts = {}) => apiFetch(`/api/agent-runs/${runId}`, opts)

export const stopAgentRun = async (runId, opts = {}) =>
    apiFetch(`/api/agent-runs/${runId}/stop`, { method: 'POST', ...opts })
