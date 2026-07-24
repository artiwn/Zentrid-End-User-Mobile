(() => {
  const qs = (name: string) => new URLSearchParams(window.location.search).get(name);
  const allowedRoles = ['enduser','clientuser','clientportaluser','assetowner','owner','investor','organizationuser'];
  const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[ _-]+/g, '');

  function setStatus(message: string, tone = 'info'): void {
    const box = document.getElementById('loginStatus');
    if (!box) return;
    box.textContent = message;
    box.className = `mobile-login-status ${tone}`;
  }

  function nextUrl(): string {
    const next = qs('next');
    if (!next) return 'index.html';
    const safe = next.replace(/\\/g, '/').replace(/^\.\//, '');
    return safe.includes('://') || safe.startsWith('/') || safe.startsWith('../') ? 'index.html' : safe;
  }

  function intro(): string {
    if (qs('reason') === 'role') return 'This account does not have End User mobile access.';
    if (qs('reason') === 'session') return 'Your session expired. Sign in again.';
    if (qs('reason') === 'logout') return 'You have signed out.';
    return 'Sign in to monitor your plant from your phone.';
  }

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const username = (form.elements.namedItem('username') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Signing in…';
    setStatus('Signing you in securely…');
    try {
      await window.ZentridAuth.login(username, password);
      const valid = await window.ZentridAuth.ensureSession('');
      if (!valid) throw new Error('Unable to verify the authenticated session.');
      if (!(window.ZentridAuth.getRoles() || []).length) await window.ZentridAuth.me();
      const allowed = window.ZentridAuth.getRoles().some((role: string) => allowedRoles.includes(normalize(role)));
      if (!allowed) {
        window.ZentridAuth.logout(false);
        throw new Error('This account does not have End User portal access.');
      }
      setStatus('Login successful. Opening mobile dashboard…', 'success');
      window.location.href = nextUrl();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to sign in.', 'error');
      button.disabled = false;
      button.textContent = 'Sign in';
    }
  }

  const form = document.getElementById('loginForm');
  form?.addEventListener('submit', submit);
  const status = document.getElementById('loginStatus');
  if (status) status.textContent = intro();
})();
