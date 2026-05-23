// REST client — all calls go through Vite's /api proxy → localhost:3001
const BASE = '/api';

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || res.statusText), { status: res.status });
  }
  return res.json();
}

export const api = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  getDashboard:          ()         => req('GET',    '/dashboard'),
  getProduction:         (range)    => req('GET',    `/dashboard/production?range=${range}`),

  // ── Machines ───────────────────────────────────────────────────────────────
  getMachines:           ()         => req('GET',    '/machines'),
  getMachine:            (id)       => req('GET',    `/machines/${id}`),
  commandMachine:        (id, body) => req('POST',   `/machines/${id}/command`, body),

  // ── Alerts ─────────────────────────────────────────────────────────────────
  getAlerts:             ()         => req('GET',    '/alerts'),
  acknowledgeAlert:      (id)       => req('PATCH',  `/alerts/${id}/acknowledge`),
  escalateAlert:         (id)       => req('PATCH',  `/alerts/${id}/escalate`),
  closeAlert:            (id)       => req('DELETE', `/alerts/${id}`),
  markAllAlertsRead:     ()         => req('PATCH',  '/alerts/mark-all'),
  applyAlertAction:      (id, body) => req('POST',   `/alerts/${id}/apply`, body),
  getAlertStats:         ()         => req('GET',    '/alerts/stats/summary'),

  // ── SPC ────────────────────────────────────────────────────────────────────
  getSPCAll:             ()         => req('GET',    '/spc'),
  getSPC:                (machineId) => req('GET',   `/spc/${machineId}`),
  getSPCLatest:          (machineId) => req('GET',   `/spc/${machineId}/latest`),

  // ── LSS ────────────────────────────────────────────────────────────────────
  getLSSMetrics:         ()         => req('GET',    '/lss/metrics'),
  getPareto:             ()         => req('GET',    '/lss/pareto'),
  getYieldByLine:        ()         => req('GET',    '/lss/yield-by-line'),
  getDPMOTrend:          ()         => req('GET',    '/lss/dpmo-trend'),
  getDMAIC:              ()         => req('GET',    '/lss/dmaic'),

  // ── Simulator ──────────────────────────────────────────────────────────────
  getSimulator:          ()         => req('GET',    '/simulator'),
  updateSimParams:       (body)     => req('PATCH',  '/simulator/params', body),
  runSimulator:          ()         => req('POST',   '/simulator/run'),
  stopSimulator:         ()         => req('POST',   '/simulator/stop'),
  resetSimulator:        ()         => req('POST',   '/simulator/reset'),
  saveScenario:          (body)     => req('POST',   '/simulator/scenarios', body),
  deleteScenario:        (id)       => req('DELETE', `/simulator/scenarios/${id}`),

  // ── Reports ────────────────────────────────────────────────────────────────
  getReports:            ()         => req('GET',    '/reports'),
  getReport:             (id)       => req('GET',    `/reports/${id}`),
  createReport:          (body)     => req('POST',   '/reports', body),
  exportReport:          (id)       => req('GET',    `/reports/${id}/export`),
  deleteReport:          (id)       => req('DELETE', `/reports/${id}`),

  // ── Config ─────────────────────────────────────────────────────────────────
  getConfig:             ()         => req('GET',    '/config'),
  toggleWECO:            (rule, on) => req('PATCH',  `/config/weco/${rule}`, { on }),
  getSPCLimits:          ()         => req('GET',    '/config/spc-limits'),
  createSPCLimit:        (body)     => req('POST',   '/config/spc-limits', body),
  updateSPCLimit:        (id, body) => req('PATCH',  `/config/spc-limits/${id}`, body),
  deleteSPCLimit:        (id)       => req('DELETE', `/config/spc-limits/${id}`),
  getUsers:              ()         => req('GET',    '/config/users'),
  inviteUser:            (body)     => req('POST',   '/config/users', body),
  updateUser:            (id, body) => req('PATCH',  `/config/users/${id}`, body),
  deleteUser:            (id)       => req('DELETE', `/config/users/${id}`),

  // ── AI ─────────────────────────────────────────────────────────────────────
  getConversations:      ()         => req('GET',    '/ai/conversations'),
  chat:                  (body)     => req('POST',   '/ai/chat', body),
  getAIInsights:         ()         => req('GET',    '/ai/insights'),
  getAIModels:           ()         => req('GET',    '/ai/models'),

  // ── Search ─────────────────────────────────────────────────────────────────
  search:                (q)        => req('GET',    `/search?q=${encodeURIComponent(q)}`),

  // ── Profile ────────────────────────────────────────────────────────────────
  getProfile:            ()         => req('GET',    '/profile'),
  updateProfile:         (body)     => req('PATCH',  '/profile', body),
  getSessions:           ()         => req('GET',    '/profile/sessions'),
  deleteSession:         (id)       => req('DELETE', `/profile/sessions/${id}`),
  getAPITokens:          ()         => req('GET',    '/profile/api-tokens'),
  createAPIToken:        (body)     => req('POST',   '/profile/api-tokens', body),
  deleteAPIToken:        (id)       => req('DELETE', `/profile/api-tokens/${id}`),

  // ── Auth ───────────────────────────────────────────────────────────────────
  login:                 (body)     => req('POST',   '/auth/login', body),
  logout:                ()         => req('POST',   '/auth/logout'),
  changePassword:        (body)     => req('PATCH',  '/auth/password', body),
};
