import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const client = axios.create({ baseURL: `${API_BASE_URL}/api`, withCredentials: true });

// CSRF tokens are now purely body-delivered, not cookie-based — the backend
// signs a self-contained token and hands it back in the JSON response, since
// a cross-site cookie set by Render in response to a Vercel-origin request
// isn't reliably stored by modern browsers (third-party cookie blocking,
// especially in incognito). Fetched lazily on the first mutating request and
// cached in memory for the life of the page.
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
    const token = await getCsrfToken();
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
  const details = err.response?.data?.details;
  // Our own backend always sends `error` as a plain string. If it's ever
  // anything else — e.g. a platform-level error page (Vercel/Render) whose
  // JSON body happens to also use an `error` key, but nests an object like
  // {code, message} under it — treat that as "no usable message" rather
  // than risk handing an object to a component that renders it directly.
  const hasUsableTopLevel = typeof raw === 'string' && raw.trim();

  // Validation failures (validate.js) send a generic top-level message
  // ("Invalid input.") with the actually-useful, field-specific messages in
  // `details` — surface those instead of the generic one whenever present.
  if (Array.isArray(details) && details.length > 0) {
    const messages = details.map((d) => d.message).filter(Boolean);
    if (messages.length === 1) return messages[0];
    if (messages.length > 1) return messages.join(' ');
  }

  if (hasUsableTopLevel) return raw;
  if (typeof err.message === 'string' && err.message.trim()) return err.message;
  return 'Something went wrong.';
}

// Same underlying data as apiErrorMessage, but as a { field: message } map
// instead of one combined string — for forms that want to highlight the
// specific field(s) a validation error applies to, not just show one toast.
// Returns null when the error isn't a field-validation failure (e.g. a 404,
// a 409 conflict, a generic 500) — callers should fall back to
// apiErrorMessage()'s single message in that case.
export function apiErrorFields(err) {
  const details = err.response?.data?.details;
  if (!Array.isArray(details) || details.length === 0) return null;
  const fields = {};
  for (const d of details) {
    if (d.field && d.message && !fields[d.field]) fields[d.field] = d.message;
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

// Export/invoice routes now rely on the session cookie (sent automatically
// with withCredentials), so this no longer needs to attach anything manually —
// still fetched as a blob so we can control the downloaded filename and
// trigger the browser's save dialog ourselves.
//
// `onProgress(percent)` is optional. `percent` is a 0-100 integer when the
// server sends a Content-Length header, or `null` when it doesn't (e.g. the
// export endpoints stream their response without one) — callers should show
// an indeterminate progress indicator in the `null` case rather than a fake
// percentage.
export async function downloadFile(url, filename, onProgress) {
  const res = await client.get(url, {
    responseType: 'blob',
    onDownloadProgress: onProgress
      ? (progressEvent) => {
          const percent = progressEvent.total
            ? Math.min(100, Math.round((progressEvent.loaded / progressEvent.total) * 100))
            : null;
          onProgress(percent);
        }
      : undefined,
  });
  const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}