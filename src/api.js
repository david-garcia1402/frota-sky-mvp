async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(path, { credentials: 'include', ...options, headers });
  const type = res.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const message = payload?.error?.message || `Erro ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.code = payload?.error?.code;
    throw err;
  }
  return payload;
}

export const api = {
  health: () => request('/api/health'),
  me: () => request('/api/auth/me'),
  register: (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  dashboard: () => request('/api/dashboard'),
  vehicles: (q = '') => request(`/api/vehicles${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createVehicle: (data) => request('/api/vehicles', { method: 'POST', body: JSON.stringify(data) }),
  updateVehicle: (id, data) => request(`/api/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteVehicle: (id) => request(`/api/vehicles/${id}`, { method: 'DELETE' }),
  drivers: () => request('/api/drivers'),
  createDriver: (data) => request('/api/drivers', { method: 'POST', body: JSON.stringify(data) }),
  fuel: () => request('/api/fuel'),
  createFuel: (data) => request('/api/fuel', { method: 'POST', body: JSON.stringify(data) }),
  maintenance: () => request('/api/maintenance'),
  createMaintenance: (data) => request('/api/maintenance', { method: 'POST', body: JSON.stringify(data) }),
  alerts: () => request('/api/alerts'),
  readAlert: (id) => request(`/api/alerts/${id}/read`, { method: 'POST' }),
  suppliers: () => request('/api/suppliers'),
  createSupplier: (data) => request('/api/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  documents: (entityType, entityId) => request(`/api/documents?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`),
  createDocument: (data) => request('/api/documents', { method: 'POST', body: JSON.stringify(data) }),
  inspections: () => request('/api/inspections'),
  createInspection: (data) => request('/api/inspections', { method: 'POST', body: JSON.stringify(data) }),
  upload: async (kind, entityId, file) => {
    const res = await fetch(`/api/uploads/${encodeURIComponent(kind)}/${encodeURIComponent(entityId)}`, {
      method: 'PUT', credentials: 'include', headers: { 'content-type': file.type }, body: file,
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error?.message || 'Falha no upload.');
    return payload;
  },
};
