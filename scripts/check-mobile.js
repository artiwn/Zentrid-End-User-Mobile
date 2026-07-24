const fs = require('fs');

const requireProxy = process.argv.includes('--require-proxy');
const required = [
  'dist/index.html', 'dist/login.html', 'dist/offline.html', 'dist/manifest.webmanifest', 'dist/sw.js',
  'dist/assets/css/mobile.css', 'dist/assets/js/api-client.js', 'dist/assets/js/mobile-api.js',
  'dist/assets/js/auth-guard.js', 'dist/assets/js/app.js', 'dist/assets/js/login.js', 'dist/assets/js/pwa.js',
  'dist/assets/icons/icon-192.png', 'dist/assets/icons/icon-512.png',
  'dist/assets/icons/icon-maskable-512.png', 'dist/assets/icons/apple-touch-icon.png'
];
if (requireProxy) required.push('dist/proxy-server.js');

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing mobile build artifact: ${file}`);
}

const app = fs.readFileSync('dist/assets/js/app.js', 'utf8');
const api = fs.readFileSync('dist/assets/js/mobile-api.js', 'utf8');
for (const token of ['overview','plant','devices','device','alerts','alert','energy','sales','reports','profile','more']) {
  if (!app.includes(token)) throw new Error(`Mobile route missing: ${token}`);
}
for (const endpoint of ['/api/plants','/api/devices','/api/alerts','/api/telemetry','/api/Auth/me']) {
  if (!api.includes(endpoint)) throw new Error(`API route missing: ${endpoint}`);
}
for (const forbidden of ['OWNER-TPL-','RPT-OWNER-','INV-ARM-001','Arpi Plant 01']) {
  if (app.includes(forbidden) || api.includes(forbidden)) throw new Error(`Forbidden mock value found: ${forbidden}`);
}
for (const pattern of [/resource\([^)]*['"]\/api\/EndUser\//, /resource\([^)]*['"]\/api\/Ui\/dashboard/]) {
  if (pattern.test(api)) throw new Error(`Unavailable backend route is still actively requested: ${pattern}`);
}

const loginHtml = fs.readFileSync('dist/login.html', 'utf8');
const css = fs.readFileSync('dist/assets/css/mobile.css', 'utf8');
if (loginHtml.includes('mobile-login-energy-card') || loginHtml.includes('Live API')) throw new Error('Obsolete technical login card is still visible.');
if (!css.includes('min-height: 100dvh') || !css.includes('min-height: 100svh')) throw new Error('Dynamic mobile login viewport protection is missing.');
for (const phrase of ['Live API data','Cached API data','API data unavailable','Latest API values','No API reports','Live backend API','/api/Auth/me','Connecting to Zentrid API services']) {
  if (app.includes(phrase)) throw new Error(`Technical UI copy is still visible: ${phrase}`);
}

const manifest = JSON.parse(fs.readFileSync('dist/manifest.webmanifest', 'utf8'));
if (!Array.isArray(manifest.icons) || !manifest.icons.some(icon => icon.purpose === 'maskable')) throw new Error('Maskable PWA icon is missing.');
if (!manifest.icons.some(icon => icon.sizes === '192x192') || !manifest.icons.some(icon => icon.sizes === '512x512')) throw new Error('Required PWA icon sizes are missing.');
const sw = fs.readFileSync('dist/sw.js', 'utf8');
if (!sw.includes('zentrid-mobile-shell-v1.0.4') || !sw.includes('/offline.html') || !sw.includes('SKIP_WAITING')) throw new Error('PWA cache, offline fallback or update flow is missing.');
const pwa = fs.readFileSync('dist/assets/js/pwa.js', 'utf8');
if (!pwa.includes('beforeinstallprompt') || !pwa.includes('updatefound') || !pwa.includes('controllerchange')) throw new Error('PWA install/update lifecycle is incomplete.');
if (!app.includes('zentrid:session-expired') || !app.includes('logout-confirm') || !app.includes('Sign out?')) throw new Error('Session expiration redirect or logout confirmation is missing.');
const offline = fs.readFileSync('dist/offline.html', 'utf8');
if (!offline.includes('You’re offline') || !offline.includes('Try again')) throw new Error('Offline screen is incomplete.');

const html = fs.readFileSync('dist/index.html','utf8');
if (!html.includes('viewport-fit=cover') || !html.includes('manifest.webmanifest') || !html.includes('apple-touch-icon.png')) throw new Error('Mobile/PWA metadata missing.');
console.log(`Mobile build check passed: ${required.length} artifacts, 11 routes, API-only adapter${requireProxy ? ', local proxy' : ', static deployment'}.`);
