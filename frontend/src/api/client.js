import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const client = axios.create({ baseURL: `${API_BASE_URL}/api`, withCredentials: true });

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Cross-origin note: now that the frontend (Vercel) and backend (Render) are
// on different domains, client-side JS can no longer read the csrf_token
// cookie directly via document.cookie — that only exposes cookies belonging
// to the page's own origin. So instead of reading the cookie, we fetch the
// token once from a dedicated endpoint (which reads it server-side, where
// it's not cross-origin) and cache it in memory for the life of the page.
let csrfTokenPromise = null;
function getCsrfToken() {
  if (!csrfTokenPromise) {
    csrfTokenPromise = client
      .get('/auth/csrf-token')
      .then((res) => res.data.csrfToken)
      .catch(() => {
        csrfTokenPromise = null; // allow a retry on the next mutating request
        return null;
      });
  }
  return csrfTokenPromise;
}

client.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    // Fall back to the cookie read too (harmless, and keeps this working
    // unchanged for same-origin setups like local dev through the Vite proxy).
    const token = (await getCsrfToken()) || readCookie('csrf_token');
    if (token) config.headers['X-CSRF-Token'] = token;
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
  const raw = err.response?.data?.error;
  // Our own backend always sends `error` as a plain string. If it's ever
  // anything else — e.g. a platform-level error page (Vercel/Render) whose
  // JSON body happens to also use an `error` key, but nests an object like
  // {code, message} under it — treat that as "no usable message" rather
  // than risk handing an object to a component that renders it directly.
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (typeof err.message === 'string' && err.message.trim()) return err.message;
  return 'Something went wrong.';
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