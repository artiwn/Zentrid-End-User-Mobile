# GitHub and Vercel deployment

This repository is ready to deploy directly from GitHub to Vercel.

## 1. Push to GitHub

Create an empty GitHub repository, then run from this project folder:

```powershell
git init
git add .
git commit -m "Initial Zentrid End User Mobile"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

Do not commit `node_modules`, `dist`, `.env`, or local log files. They are excluded by `.gitignore`.

## 2. Import into Vercel

1. Open Vercel and choose **Add New → Project**.
2. Import the GitHub repository.
3. Keep the project root as the repository root.
4. Vercel reads `vercel.json` automatically:
   - Build command: `npm run build:vercel`
   - Output directory: `dist`
5. Deploy.

No Vercel environment variables are required for the current FleetOS endpoints. `vercel.json` proxies same-origin `/api/*` requests to the real Auth and Data backends.

## 3. Open on a phone

After deployment, open:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/login.html
```

The deployment uses HTTPS, so the PWA can be installed from a supported mobile browser.

## 4. Local development

```powershell
npm.cmd ci
npm.cmd start
```

Open:

```text
http://localhost:5050/login.html
```

Local development uses the Express proxy in `src/proxy-server.ts`. Vercel deployment uses external rewrites from `vercel.json` instead.

## API routing

- `/api/Auth/*` → `https://fleetosauth.unisys.am/api/Auth/*`
- `/.well-known/*` → `https://fleetosauth.unisys.am/.well-known/*`
- `/api/*` → `https://fleetosapi.unisys.am/api/*`

The browser always calls the deployed application's own origin, avoiding direct browser CORS calls to the backend domains.
