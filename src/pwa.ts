(() => {
  type InstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  };

  let installPrompt: InstallPromptEvent | null = null;
  let reloading = false;

  function dispatchConnectivity(): void {
    window.dispatchEvent(new CustomEvent('zentrid:connectivity', {
      detail: { online: navigator.onLine }
    }));
  }

  function removeUpdatePrompt(): void {
    document.querySelector('[data-pwa-update]')?.remove();
  }

  function showUpdatePrompt(registration: ServiceWorkerRegistration): void {
    if (!registration.waiting || document.querySelector('[data-pwa-update]')) return;
    const prompt = document.createElement('aside');
    prompt.className = 'mobile-update-prompt';
    prompt.dataset.pwaUpdate = 'true';
    prompt.setAttribute('role', 'status');
    prompt.setAttribute('aria-live', 'polite');
    prompt.innerHTML = `
      <div><strong>Update available</strong><span>Restart Zentrid to use the latest version.</span></div>
      <button type="button" data-pwa-update-now>Update</button>
      <button type="button" class="dismiss" data-pwa-update-later aria-label="Dismiss update">×</button>`;
    document.body.append(prompt);
    prompt.querySelector('[data-pwa-update-now]')?.addEventListener('click', () => {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
    prompt.querySelector('[data-pwa-update-later]')?.addEventListener('click', removeUpdatePrompt);
  }

  async function registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      if (registration.waiting) showUpdatePrompt(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdatePrompt(registration);
        });
      });
      window.setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
    } catch (_error) {
      // The app remains usable when service workers are unavailable.
    }
  }

  async function install(): Promise<boolean> {
    if (!installPrompt) return false;
    const prompt = installPrompt;
    installPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    window.dispatchEvent(new CustomEvent('zentrid:pwa-install-result', { detail: choice }));
    return choice.outcome === 'accepted';
  }

  window.ZentridPWA = {
    canInstall: () => Boolean(installPrompt),
    install
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new CustomEvent('zentrid:pwa-install-available'));
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    window.dispatchEvent(new CustomEvent('zentrid:pwa-installed'));
  });

  window.addEventListener('online', dispatchConnectivity);
  window.addEventListener('offline', dispatchConnectivity);
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => void registerServiceWorker());
})();
