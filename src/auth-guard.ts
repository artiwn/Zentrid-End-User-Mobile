(() => {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if (page === 'login.html' || !window.ZentridAuth) return;
  const allowed = ['enduser','clientuser','clientportaluser','assetowner','owner','investor','organizationuser'];
  const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[ _-]+/g, '');
  const roleAllowed = () => (window.ZentridAuth.getRoles?.() || []).some((role: string) => allowed.includes(normalize(role)));
  const redirect = (reason: string) => {
    const next = encodeURIComponent(window.location.pathname.replace(/^\/+/, '') + window.location.hash);
    window.ZentridAuth.logout?.(false);
    window.location.replace(`login.html?reason=${reason}&next=${next}`);
  };
  if (!window.ZentridAuth.getAccessToken?.()) { redirect('session'); return; }
  const roles = window.ZentridAuth.getRoles?.() || [];
  if (roles.length && !roleAllowed()) { redirect('role'); return; }
  if (window.ZentridAuth.isAuthenticated?.() && roleAllowed()) return;
  void window.ZentridAuth.ensureSession?.('').then(async (valid: boolean) => {
    if (!valid) { redirect('session'); return; }
    if (!(window.ZentridAuth.getRoles?.() || []).length) await window.ZentridAuth.me?.();
    if (!roleAllowed()) redirect('role');
  }).catch(() => redirect('session'));
})();
