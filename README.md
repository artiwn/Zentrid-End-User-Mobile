# Zentrid End User Mobile

Standalone mobile-first PWA for FleetOS/Zentrid End Users. This repository is separate from the desktop End User portal and contains its own UI, build, authentication flow, local API proxy, Vercel routing, PWA manifest and service worker.

## Mobile screens

- Overview
- My Plant
- Devices and Device Detail
- Alerts and Alert Detail
- Energy
- Sales & Revenue
- Reports
- Profile
- More navigation

All business data is loaded from the current backend routes only:

- `GET /api/plants`
- `GET /api/devices`
- `GET /api/alerts`
- `GET /api/telemetry`
- `GET /api/Auth/me`

Unavailable backend features display honest empty/read-only states. The application does not generate mock plants, devices, alerts, energy, revenue, payments or reports.

## Local start on Windows

```powershell
npm.cmd ci
npm.cmd start
```

Open:

```text
http://localhost:5050/login.html
```

## Production build for Vercel

```powershell
npm.cmd ci
npm.cmd run build:vercel
```

The static deployment is generated in `dist`. Vercel uses `vercel.json` to proxy `/api/*` requests to the FleetOS backends.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for GitHub and Vercel steps.
