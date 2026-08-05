import axios from 'axios';

const client = axios.create({ baseURL: '/api', withCredentials: true });

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// The session itself now lives in an httpOnly cookie the browser sends
// automatically — no token to attach here. What we *do* need to attach is the
// CSRF token: it's a separate, JS-readable cookie set by the backend, and the
// backend checks this header against that cookie on every state-changing
// request (double-submit CSRF pattern) since a cross-site attacker can make
// the browser send cookies, but can't read them to produce a matching header.
client.interceptors.request.use((config) => {
  const method = (config.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = readCookie('csrf_token');
    if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('dsl_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default client;

export function apiErrorMessage(err) {
  return err.response?.data?.error || err.message || 'Something went wrong.';
}

// Export/invoice routes now rely on the session cookie (sent automatically
// with withCredentials), so this no longer needs to attach anything manually —
// still fetched as a blob so we can control the downloaded filename and
// trigger the browser's save dialog ourselves.
export async function downloadFile(url, filename) {
  const res = await client.get(url, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
