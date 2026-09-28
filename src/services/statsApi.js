import { apiFetch } from './apiClient.js'

// The site's own first-party counts for the last 30 days (serverXR/src/routes/trackRoutes.js,
// admin only): { since, windowDays, totals: { view, signup }, byDay: [{ day, event_type, count }],
// topPaths: [{ path, count }], topReferrers: [{ referrer_host, count }] }.
export const getSiteStats = async () => apiFetch('/api/stats')
