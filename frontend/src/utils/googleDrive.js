import { GOOGLE_CLIENT_ID } from '../config';

// Deliberately narrow scope: drive.file only grants access to files THIS app
// creates (or that the user explicitly opens with it) — never the user's
// existing Drive contents. That's a meaningful difference from the broader
// `drive` scope, which would let the app see/read everything in their Drive.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let tokenClient = null;

function getTokenClient() {
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google sign-in script has not loaded yet — check your internet connection and reload.');
  }
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: () => {}, // overridden per-call below
    });
  }
  return tokenClient;
}

// Requests a fresh Google access token via a popup sign-in/consent screen.
// `prompt: 'consent'` forces the account chooser + consent screen every
// single time rather than silently reusing a prior grant — this is
// deliberate (per the user's requirement), not a limitation: nothing about
// this session is ever cached, stored, or reused across backups.
export function requestGoogleAccessToken() {
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(new Error('Google Drive backup isn\'t configured yet. See GOOGLE_DRIVE_SETUP.md.'));
  }
  return new Promise((resolve, reject) => {
    const client = getTokenClient();
    client.callback = (response) => {
      if (response.error) reject(new Error(`Google sign-in failed: ${response.error}`));
      else resolve(response.access_token);
    };
    client.requestAccessToken({ prompt: 'consent' });
  });
}

async function driveFetch(accessToken, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Drive request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Finds a folder by exact name under a given parent (or Drive root if no
// parent given). Returns its id, or null if it doesn't exist yet.
async function findFolder(accessToken, name, parentId) {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and ${parentClause} and trashed=false`
  );
  const data = await driveFetch(accessToken, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken, name, parentId) {
  const data = await driveFetch(accessToken, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });
  return data.id;
}

// Finds-or-creates a folder by name — avoids piling up duplicate "DSL System
// Backups" parent folders across multiple backup runs.
export async function findOrCreateFolder(accessToken, name, parentId) {
  const existing = await findFolder(accessToken, name, parentId);
  return existing || createFolder(accessToken, name, parentId);
}

// Uploads a single file (as a Blob) into a Drive folder using a multipart
// request — the standard way to send both metadata and file bytes in one
// call to the Drive API.
export async function uploadFileToFolder(accessToken, folderId, filename, blob) {
  const metadata = { name: filename, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Upload of "${filename}" failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

export function driveFolderUrl(folderId) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
