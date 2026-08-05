# Running the DSL System on Windows — Step by Step

This gets the app running on your own Windows computer so you can click around and try it. No prior setup assumed — every tool gets installed from scratch.

You'll end up with **two things running at once**: the backend (server) and the frontend (what you see in the browser). They run in two separate terminal windows, both left open while you use the app.

---

## Step 1 — Install Node.js

Node.js runs the backend server and builds the frontend.

1. Go to **https://nodejs.org**
2. Download the **LTS** version (the button labeled "LTS," not "Current")
3. Run the installer, click Next through the defaults, let it finish
4. Open **PowerShell** (press `Windows key`, type `PowerShell`, hit Enter)
5. Check it worked:
   ```powershell
   node --version
   npm --version
   ```
   Both should print a version number (e.g. `v20.x.x`). If you get "not recognized," close and reopen PowerShell — the installer updates your PATH, but only new windows pick it up.

## Step 2 — Install PostgreSQL

This is the database that stores everything (distributors, orders, ledger).

1. Go to **https://www.postgresql.org/download/windows/**
2. Click "Download the installer" (via EDB) → download the latest version
3. Run the installer:
   - Keep the default install location
   - Keep all components checked (especially **pgAdmin 4** — a visual tool you'll use in a minute)
   - **When it asks for a password for the `postgres` superuser — pick one and write it down.** You'll need it in Step 4.
   - Keep the default port `5432`
   - Let it finish, decline the "Stack Builder" prompt at the end (not needed)

## Step 3 — Get the project files

1. Unzip `dsl-system.zip` somewhere easy to find, e.g. `C:\Users\<you>\dsl-system`
2. Open PowerShell and move into it:
   ```powershell
   cd C:\Users\<you>\dsl-system
   ```
   (Replace `<you>` with your actual Windows username, and adjust the path if you unzipped it elsewhere.)

## Step 4 — Create the database

Easiest way on Windows: use **pgAdmin 4**, which got installed with PostgreSQL.

1. Open the **Start menu** → search **pgAdmin 4** → open it
2. First time it opens, it'll ask you to set a master password for pgAdmin itself (this is separate from the postgres password — pick anything, just remember it)
3. In the left sidebar, expand **Servers → PostgreSQL** → it'll prompt for the postgres password from Step 2 → enter it
4. Right-click **Databases** → **Create** → **Database…**
5. Name it exactly: `dsl_system` → click **Save**

That's it — the database exists, but it's empty (no tables yet). We'll add those in Step 6.

## Step 5 — Configure the backend

1. In PowerShell:
   ```powershell
   cd backend
   copy .env.example .env
   ```
2. Open the new `.env` file in Notepad:
   ```powershell
   notepad .env
   ```
3. Edit these two lines:
   ```
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD_HERE@localhost:5432/dsl_system
   JWT_SECRET=any-long-random-string-you-make-up-right-now
   ```
   Replace `YOUR_PASSWORD_HERE` with the postgres password from Step 2. `JWT_SECRET` can be any string — mash your keyboard, it just needs to be long and secret.
4. Optional: change `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` near the bottom to whatever you want your first login to be. If you skip this, the defaults (shown in the file) will work fine.
5. Save and close Notepad.

## Step 6 — Install backend dependencies and set up the database tables

Still inside the `backend` folder in PowerShell:
```powershell
npm install
npm run migrate
npm run seed
```
- `npm install` downloads all the libraries the backend needs (~30 seconds).
- `npm run migrate` creates all the tables (orders, distributors, ledger, etc.) inside `dsl_system`.
- `npm run seed` creates your first login and a couple of sample records so the app isn't empty.

You should see `✔ Migration complete.` and `✔ Created admin user: ...` printed. If you see red error text instead, check the Troubleshooting section below before continuing.

## Step 7 — Start the backend

Still in the `backend` folder:
```powershell
npm run dev
```
You should see:
```
DSL backend listening on http://localhost:4000
```
**Leave this PowerShell window open and running.** This is your server — closing the window stops it.

## Step 8 — Start the frontend (in a NEW window)

1. Open a **second, separate** PowerShell window (don't close the first one)
2. Navigate to the frontend folder:
   ```powershell
   cd C:\Users\<you>\dsl-system\frontend
   npm install
   npm run dev
   ```
3. You should see something like:
   ```
   VITE ready
   ➜  Local:   http://localhost:5173/
   ```

**Leave this window open too.** You now have two windows running — backend (port 4000) and frontend (port 5173).

## Step 9 — Open the app

Open your browser and go to **http://localhost:5173**

Log in with whatever you set `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` to in Step 5 (or the defaults printed in `.env.example`: `admin@example.com` / `ChangeMe123!`).

## Stopping everything

In each PowerShell window, press `Ctrl + C` to stop that process. Closing the window also works.

## Starting it again later

You don't need to repeat all of this every time — Steps 1–6 are one-time setup. Next time, you only need:
1. Make sure PostgreSQL is running (it usually starts automatically with Windows — check by opening pgAdmin and seeing if it connects without complaint)
2. In one PowerShell window: `cd backend` → `npm run dev`
3. In another: `cd frontend` → `npm run dev`
4. Go to `http://localhost:5173`

---

## Troubleshooting

**`npm : The term 'npm' is not recognized...`**
Node.js isn't installed, or PowerShell was open before you installed it. Close all PowerShell windows, reopen, try again. If it still fails, reinstall Node.js and make sure "Add to PATH" was checked during install (it's checked by default).

**`password authentication failed for user "postgres"`**
The password in your `.env` file's `DATABASE_URL` doesn't match what you set during PostgreSQL installation. Re-check Step 5 — there's no way to "look up" a forgotten postgres password, but you can reset it: open pgAdmin → right-click the PostgreSQL server → Properties → Connection tab (or reinstall PostgreSQL if that's easier).

**`database "dsl_system" does not exist`**
You skipped or mistyped Step 4. Open pgAdmin and confirm a database named exactly `dsl_system` exists under Databases.

**`Error: listen EADDRINUSE: address already in use :::4000`**
Something is already using port 4000 — most likely you already have `npm run dev` running in another window for the backend. Check your other PowerShell windows before opening a new one. If you genuinely need to free the port:
```powershell
netstat -ano | findstr :4000
taskkill /PID <the number in the last column> /F
```

**The browser shows a blank page or "can't connect"**
Make sure *both* PowerShell windows (backend and frontend) are still open and show no red errors. If the backend window closed or crashed, the frontend has nothing to talk to.

**`ECONNREFUSED` in the frontend terminal**
The backend isn't running (or crashed). Check the backend's PowerShell window for errors — this is almost always the real problem, even though the error appears in the frontend window.

**Windows Firewall popup on first run**
Click **Allow access** — Node needs to listen on a local port, this is normal and not a security risk since it's only reachable from your own machine by default.

---

*For editing the actual code, running this on a real shared server, or anything beyond "try it out locally," see `README.md` and `PROJECT_LOG.md` in this same folder.*
