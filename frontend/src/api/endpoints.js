import client from './client';

export const auth = {
  login: (email, password) => client.post('/auth/login', { email, password }),
  mfaVerify: (mfaToken, code) => client.post('/auth/mfa/verify', { mfaToken, code }),
  logout: () => client.post('/auth/logout'),
  me: () => client.get('/auth/me'),
};

export const account = {
  changePassword: (currentPassword, newPassword) => client.patch('/account/password', { currentPassword, newPassword }),
  logoutAllSessions: () => client.post('/account/logout-all-sessions'),
  mfaStatus: () => client.get('/account/mfa/status'),
  mfaSetup: () => client.post('/account/mfa/setup'),
  mfaVerifySetup: (code) => client.post('/account/mfa/verify-setup', { code }),
  mfaDisable: (password) => client.post('/account/mfa/disable', { password }),
};

export const manufacturers = {
  list: (params) => client.get('/manufacturers', { params }),
  get: (id) => client.get(`/manufacturers/${id}`),
  create: (data) => client.post('/manufacturers', data),
  update: (id, data) => client.put(`/manufacturers/${id}`, data),
  remove: (id) => client.delete(`/manufacturers/${id}`),
};

export const products = {
  list: (params) => client.get('/products', { params }),
  get: (id) => client.get(`/products/${id}`),
  create: (data) => client.post('/products', data),
  update: (id, data) => client.put(`/products/${id}`, data),
  remove: (id) => client.delete(`/products/${id}`),
};

export const distributors = {
  list: (params) => client.get('/distributors', { params }),
  get: (id) => client.get(`/distributors/${id}`),
  create: (data) => client.post('/distributors', data),
  update: (id, data) => client.put(`/distributors/${id}`, data),
  remove: (id) => client.delete(`/distributors/${id}`),
};

export const orders = {
  list: (params) => client.get('/orders', { params }),
  get: (id) => client.get(`/orders/${id}`),
  create: (data) => client.post('/orders', data),
  updateStatus: (id, order_status) => client.patch(`/orders/${id}/status`, { order_status }),
  pay: (id, amount, note) => client.post(`/orders/${id}/pay`, { amount, note }),
};

export const ledger = {
  list: (params) => client.get('/ledger', { params }),
  distributorSummary: (id) => client.get(`/ledger/distributor/${id}`),
};

export const reports = {
  dashboard: () => client.get('/reports/dashboard'),
  monthlySales: (months) => client.get('/reports/monthly-sales', { params: { months } }),
  performanceByDistributor: (params) => client.get('/reports/performance/distributors', { params }),
  performanceByRep: () => client.get('/reports/performance/reps'),
  topProducts: (limit) => client.get('/reports/top-products', { params: { limit } }),
};

export const usersApi = {
  list: () => client.get('/users'),
  create: (data) => client.post('/users', data),
  update: (id, data) => client.put(`/users/${id}`, data),
  remove: (id) => client.delete(`/users/${id}`),
};

export const exportApi = {
  invoiceUrl: (id, format) => `/export/invoice/${id}/${format}`,
  productsUrl: () => `/export/products`,
  distributorsUrl: () => `/export/distributors`,
  ordersUrl: () => `/export/orders`,
  ledgerUrl: (distributorId) => `/export/ledger${distributorId ? `?distributor_id=${distributorId}` : ''}`,
};

export const audit = {
  list: (params) => client.get('/audit', { params }),
};
