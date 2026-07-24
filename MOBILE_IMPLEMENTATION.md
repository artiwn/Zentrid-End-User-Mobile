# Mobile implementation scope

This is an independent codebase, not a responsive patch inside the desktop portal.

## Architecture

- Mobile-first single-page application with hash routing.
- Standalone login screen and End User role validation.
- Bottom navigation designed for phone use.
- Installable PWA manifest and static-shell service worker.
- Same-origin Express proxy for Auth and Data APIs.
- API snapshots contain only previous successful backend responses.
- No desktop HTML or desktop CSS dependencies.

## Backend limitations represented honestly

The current backend does not expose dedicated End User dashboard, reports, sales, settlement, payment or profile-update controllers. The mobile application combines the available plant/device/alert/telemetry identity data and shows empty/read-only states for unavailable features instead of creating local values.


## PWA and session readiness

- Version: 1.0.4
- Apple touch icon, 192/512 icons and maskable Android icon
- Offline navigation fallback
- Service worker update prompt and old-cache cleanup
- Runtime session-expiration redirect
- Logout confirmation
