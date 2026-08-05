# Setting Up Google Drive Backup

The Backup page lets an admin export every product, distributor, ledger entry, and order invoice as Excel files straight into their own Google Drive. To make this work, you need a free Google Cloud project and a **Client ID** — a public identifier, not a secret. This guide gets you from nothing to a working `VITE_GOOGLE_CLIENT_ID`.

You only need to do this once per deployment (e.g. once for your local dev setup, once for production if you host this elsewhere later).

---

## Step 1 — Create a Google Cloud project

1. Go to **https://console.cloud.google.com/**
2. Sign in with any Google account
3. Click the project dropdown at the top → **New Project**
4. Name it anything (e.g. "DSL System") → **Create**
5. Make sure the new project is selected in the dropdown before continuing

## Step 2 — Enable the Google Drive API

1. In the left sidebar (or search bar at top), go to **APIs & Services → Library**
2. Search for **Google Drive API**
3. Click it → **Enable**

## Step 3 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** (unless you have a Google Workspace organization and want to restrict this to it — either works for this app) → **Create**
3. Fill in the required fields:
   - App name: anything (e.g. "DSL System Backup")
   - User support email: your email
   - Developer contact email: your email
4. Save and continue through the Scopes and Test Users screens — you don't need to add anything there for now
5. On the **Test Users** step, **add your own Google account email** — while the app is in "Testing" mode (the default), only accounts you explicitly list here can sign in. Add every admin who'll use the backup feature.

## Step 4 — Create the OAuth Client ID

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: anything (e.g. "DSL Frontend")
5. Under **Authorized JavaScript origins**, add every URL this app will actually run on:
   - For local development: `http://localhost:5173`
   - For production, once you deploy: your real frontend URL (e.g. `https://yourapp.com`)
6. Leave "Authorized redirect URIs" empty — this app uses Google's token-based sign-in flow, not a redirect flow, so it isn't needed
7. Click **Create** — a Client ID will appear (looks like `123456789-abc...apps.googleusercontent.com`). Copy it.

## Step 5 — Add it to the frontend

In `frontend/.env` (create it from `frontend/.env.example` if it doesn't exist yet):
```
VITE_GOOGLE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
```
Restart the frontend dev server (`npm run dev`) after adding or changing this — Vite only reads `.env` at startup.

## Step 6 — Try it

1. Log in as an admin
2. Go to **Backup** in the sidebar
3. Click **Backup Now** — a Google sign-in popup should appear
4. Sign in with an account you added as a Test User in Step 3
5. Approve the permission request (it will say this app wants to "See, edit, create, and delete only the specific Google Drive files you use with this app" — that's the narrow `drive.file` scope this app deliberately requests, not full access to your Drive)
6. Watch the progress bar; when it finishes, click "Open folder in Drive" to confirm the files are there

---

## Troubleshooting

**"Google sign-in failed: popup_closed_by_user"**
You closed the sign-in popup before finishing. Just click Backup Now again.

**"Access blocked: this app's request is invalid"**
Usually means the current URL isn't in your Authorized JavaScript origins list (Step 4.5). Double check it matches exactly, including `http://` vs `https://` and the port number.

**"This app hasn't been verified"** warning screen
Normal for a new Google Cloud project in Testing mode — click "Advanced" → "Go to [your app name] (unsafe)" to proceed. This warning exists because Google hasn't reviewed your app (which only matters once you have real outside users beyond your Test Users list); it doesn't mean anything is actually wrong.

**Only certain Google accounts can sign in**
While the OAuth consent screen is in "Testing" mode, only emails explicitly added under Test Users (Step 3.5) can complete sign-in. Add every admin's Google account there, or look into "Publishing" the app in Google Cloud Console if you need it open to any Google account (not required for internal use with a small number of admins).

**Backup button is disabled / says "not configured yet"**
`VITE_GOOGLE_CLIENT_ID` is missing from `frontend/.env`, or the dev server wasn't restarted after adding it.

---

## What this app can and can't do with your Drive

This app requests Google's `drive.file` scope specifically — the most limited option Google offers. In plain terms: it can only see and manage files it creates itself (the backup files it uploads). It cannot browse, read, or touch anything else already in your Drive. Nothing about your Google account or sign-in is ever sent to or stored by this app's own server — the upload happens directly from your browser to Google.
