import { API_BASE_URL } from './config'

const BASE_PATH = '/api/admin/promo-engine'

function getAuthHeaders() {
  const token = localStorage.getItem('access_token')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function buildQuery(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value))
    }
  })
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

function getErrorMessage(body, fallback) {
  const detail = body?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (detail.message) return detail.message
  return JSON.stringify(detail)
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${BASE_PATH}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(getErrorMessage(body, response.statusText || 'Ошибка запроса'))
  }
  return body
}

async function download(path) {
  const response = await fetch(`${API_BASE_URL}${BASE_PATH}${path}`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(getErrorMessage(body, response.statusText || 'Ошибка запроса'))
  }
  return response.blob()
}

export const adminPromoEngineApi = {
  getStats: () => request('/stats'),
  backfillMasterReferralCodes: () =>
    request('/master-referral-codes/backfill', { method: 'POST' }),
  listCampaigns: (params) => request(`/campaigns${buildQuery(params)}`),
  createCampaign: (payload) =>
    request('/campaigns', { method: 'POST', body: JSON.stringify(payload) }),
  updateCampaign: (id, payload) =>
    request(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  listCodes: (params) => request(`/codes${buildQuery(params)}`),
  createCode: (payload) =>
    request('/codes', { method: 'POST', body: JSON.stringify(payload) }),
  bulkCreateCodes: (payload) =>
    request('/codes/bulk-create', { method: 'POST', body: JSON.stringify(payload) }),
  exportCodes: (params) => download(`/codes/export${buildQuery(params)}`),
  updateCode: (id, payload) =>
    request(`/codes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  listRedemptions: (params) => request(`/redemptions${buildQuery(params)}`),
  listGrants: (params) => request(`/grants${buildQuery(params)}`),
  listLedger: (params) => request(`/ledger${buildQuery(params)}`),
}
