const fs = require('fs');

const requireProxy = process.argv.includes('--require-proxy');
const required = [
  'dist/index.html', 'dist/login.html', 'dist/manifest.webmanifest', 'dist/sw.js',
  'dist/assets/css/mobile.css', 'dist/assets/js/api-client.js', 'dist/assets/js/mobile-api.js',
  'dist/assets/js/auth-guard.js', 'dist/assets/js/app.js', 'dist/assets/js/login.js'
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
const html = fs.readFileSync('dist/index.html','utf8');
if (!html.includes('viewport-fit=cover') || !html.includes('manifest.webmanifest')) throw new Error('Mobile/PWA metadata missing.');
console.log(`Mobile build check passed: ${required.length} artifacts, 11 routes, API-only adapter${requireProxy ? ', local proxy' : ', static deployment'}.`);
