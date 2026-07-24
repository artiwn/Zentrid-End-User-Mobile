(() => {
  type AnyRecord = Record<string, any>;
  type RouteName = 'overview' | 'plant' | 'devices' | 'device' | 'alerts' | 'alert' | 'energy' | 'sales' | 'reports' | 'profile' | 'more';
  type ApiMeta = { state?: string; fetchedAt?: string; stale?: boolean; error?: string; endpoint?: string } | null;

  const api = window.ZentridEndUserAPI;
  const appRoot = document.getElementById('mobileApp');
  if (!appRoot || !api) return;
  const app = appRoot;

  const state = {
    route: 'overview' as RouteName,
    routeId: '',
    loading: true,
    refreshing: false,
    energyPeriod: 'Today',
    deviceQuery: '',
    deviceStatus: 'All',
    alertStatus: 'All',
    plants: [] as AnyRecord[],
    devices: [] as AnyRecord[],
    alerts: [] as AnyRecord[],
    telemetry: {} as unknown,
    profile: {} as AnyRecord,
    reports: [] as AnyRecord[],
    errors: [] as string[],
    logoutConfirm: false
  };

  const navigation = [
    { route: 'overview', label: 'Home', icon: '⌂' },
    { route: 'plant', label: 'Plant', icon: '☀' },
    { route: 'devices', label: 'Devices', icon: '▦' },
    { route: 'alerts', label: 'Alerts', icon: '!' },
    { route: 'more', label: 'More', icon: '•••' }
  ];

  function isRecord(value: unknown): value is AnyRecord {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character] || character));
  }

  function normalizedKey(value: string): string {
    return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  }

  function collectRecords(value: unknown, depth = 0, seen = new Set<unknown>()): AnyRecord[] {
    if (depth > 5 || !value || seen.has(value)) return [];
    seen.add(value);
    if (Array.isArray(value)) return value.flatMap(item => collectRecords(item, depth + 1, seen));
    if (!isRecord(value)) return [];
    const records: AnyRecord[] = [value];
    Object.values(value).forEach(child => {
      if (isRecord(child) || Array.isArray(child)) records.push(...collectRecords(child, depth + 1, seen));
    });
    return records;
  }

  function pick(records: AnyRecord[], keys: string[]): unknown {
    for (const record of records) {
      for (const key of keys) {
        const value = record?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
    }
    const wanted = new Set(keys.map(normalizedKey));
    for (const record of records) {
      for (const [key, value] of Object.entries(record || {})) {
        if (wanted.has(normalizedKey(key)) && value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
    }
    return undefined;
  }

  function text(records: AnyRecord[], keys: string[], fallback = 'Not provided'): string {
    const value = pick(records, keys);
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value).trim();
  }

  function numberValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const parsed = Number(value.replace(/\s/g, '').replace(/,/g, '').replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function numberFrom(records: AnyRecord[], keys: string[]): number | null {
    return numberValue(pick(records, keys));
  }

  function metric(records: AnyRecord[], keys: string[], unit = ''): string {
    const value = pick(records, keys);
    if (value === undefined || value === null || String(value).trim() === '') return '—';
    if (typeof value === 'number' && Number.isFinite(value)) {
      const formatted = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(value);
      return unit ? `${formatted} ${unit}` : formatted;
    }
    const raw = String(value).trim();
    if (!unit || /[a-zA-Z%°²]/.test(raw)) return raw;
    return `${raw} ${unit}`;
  }

  function dateText(value: unknown, includeTime = false): string {
    if (value === undefined || value === null || String(value).trim() === '') return 'Not provided';
    const raw = String(value).trim();
    const timestamp = Date.parse(raw);
    if (!Number.isFinite(timestamp)) return raw;
    return new Intl.DateTimeFormat('en-GB', includeTime
      ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short', year: 'numeric' }
    ).format(new Date(timestamp));
  }

  function money(records: AnyRecord[], amountKeys: string[]): string {
    const raw = pick(records, amountKeys);
    if (raw === undefined || raw === null || String(raw).trim() === '') return '—';
    if (typeof raw === 'string' && /[^0-9.,+\-\s]/.test(raw)) return raw.trim();
    const amount = numberValue(raw);
    if (amount === null) return String(raw);
    const currencyValue = pick(records, ['currency', 'currencyCode', 'settlementCurrency', 'paymentCurrency']);
    const currency = typeof currencyValue === 'string' ? currencyValue.trim().toUpperCase() : '';
    if (/^[A-Z]{3}$/.test(currency)) {
      try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount); }
      catch (_error) { return `${amount.toLocaleString('en-GB')} ${currency}`; }
    }
    return amount.toLocaleString('en-GB', { maximumFractionDigits: 2 });
  }

  function idOf(row: AnyRecord): string {
    return text([row], ['id', 'deviceId', 'alertId', 'plantId', 'reportId', 'uuid', 'code'], '');
  }

  function nameOf(row: AnyRecord, type: 'plant' | 'device' | 'alert' | 'report'): string {
    const keys = type === 'plant'
      ? ['name', 'plantName', 'siteName', 'title']
      : type === 'device'
        ? ['name', 'deviceName', 'displayName', 'assetName', 'serialNumber']
        : type === 'alert'
          ? ['title', 'name', 'message', 'alertName', 'description']
          : ['title', 'name', 'reportName', 'fileName'];
    return text([row], keys, `${type[0].toUpperCase()}${type.slice(1)}`);
  }

  function statusOf(row: AnyRecord): string {
    return text([row], ['status', 'state', 'healthStatus', 'operationalStatus', 'connectionStatus', 'severity'], 'Unknown');
  }

  function toneFor(value: unknown): string {
    const normalized = String(value || '').toLowerCase();
    if (/critical|fault|failed|offline|error|danger|open/.test(normalized)) return 'danger';
    if (/warning|attention|degraded|stale|medium|pending/.test(normalized)) return 'warning';
    if (/online|healthy|normal|active|closed|resolved|success|ok/.test(normalized)) return 'success';
    return 'neutral';
  }

  function routeFromHash(): { route: RouteName; id: string } {
    const raw = window.location.hash.replace(/^#\/?/, '') || 'overview';
    const [routeValue, id = ''] = raw.split('/');
    const valid: RouteName[] = ['overview','plant','devices','device','alerts','alert','energy','sales','reports','profile','more'];
    return { route: valid.includes(routeValue as RouteName) ? routeValue as RouteName : 'overview', id: decodeURIComponent(id) };
  }

  function navigate(route: RouteName, id = ''): void {
    window.location.hash = id ? `#/${route}/${encodeURIComponent(id)}` : `#/${route}`;
  }

  function resourceMeta(name: string): ApiMeta {
    return api.getState?.(name) || null;
  }

  function freshnessText(meta: ApiMeta): string {
    if (!meta) return 'Not loaded';
    if (meta.state === 'error') return 'Unavailable';
    if (meta.state === 'empty') return 'No records';
    if (!meta.fetchedAt) return meta.state === 'cached' ? 'Last saved update' : 'Up to date';
    const timestamp = Date.parse(meta.fetchedAt);
    if (!Number.isFinite(timestamp)) return meta.state === 'cached' ? 'Last saved update' : 'Up to date';
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    return minutes < 1 ? 'Updated just now' : `Updated ${minutes} min ago`;
  }

  function pageTitle(): string {
    const titles: Record<RouteName, string> = {
      overview: 'Overview', plant: 'My Plant', devices: 'Devices', device: 'Device Detail', alerts: 'Alerts',
      alert: 'Alert Detail', energy: 'Energy', sales: 'Sales & Revenue', reports: 'Reports', profile: 'Profile', more: 'More'
    };
    return titles[state.route];
  }

  function activeNavRoute(): string {
    if (['energy','sales','reports','profile','more'].includes(state.route)) return 'more';
    if (state.route === 'device') return 'devices';
    if (state.route === 'alert') return 'alerts';
    return state.route;
  }

  function shell(content: string): string {
    const profileRecords = collectRecords(state.profile);
    const userName = text(profileRecords, ['displayName', 'fullName', 'name', 'username', 'email'], 'End User');
    const initials = userName.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'EU';
    const backVisible = ['device', 'alert'].includes(state.route);
    const nav = navigation.map(item => `
      <button class="mobile-nav-item ${activeNavRoute() === item.route ? 'active' : ''}" data-route="${item.route}">
        <span class="mobile-nav-icon">${escapeHtml(item.icon)}</span><span>${escapeHtml(item.label)}</span>
      </button>`).join('');
    return `
      <div class="mobile-app-shell">
        <header class="mobile-topbar">
          <div class="mobile-topbar-main">
            ${backVisible ? '<button class="mobile-icon-button" data-action="back" aria-label="Back">‹</button>' : '<div class="mobile-brand-mark">Z</div>'}
            <div class="mobile-title-wrap"><small>Zentrid Mobile</small><h1>${escapeHtml(pageTitle())}</h1></div>
            <button class="mobile-avatar" data-route="profile" aria-label="Profile">${escapeHtml(initials)}</button>
          </div>
          <div class="mobile-sync-line">
            <span class="mobile-live-dot ${navigator.onLine ? '' : 'offline'}"></span><span>${escapeHtml(globalFreshness())}</span>
            <button data-action="refresh" ${state.refreshing ? 'disabled' : ''}>${state.refreshing ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </header>
        <main class="mobile-content">${content}</main>
        <nav class="mobile-bottom-nav" aria-label="Primary navigation">${nav}</nav>
        ${logoutDialog()}
      </div>`;
  }


  function logoutDialog(): string {
    if (!state.logoutConfirm) return '';
    return `
      <div class="mobile-dialog-backdrop" data-action="logout-cancel">
        <section class="mobile-dialog" role="dialog" aria-modal="true" aria-labelledby="logoutDialogTitle" onclick="event.stopPropagation()">
          <div class="mobile-dialog-icon">↪</div>
          <h2 id="logoutDialogTitle">Sign out?</h2>
          <p>You will need to sign in again to open your plant dashboard.</p>
          <div class="mobile-dialog-actions">
            <button type="button" class="secondary" data-action="logout-cancel">Cancel</button>
            <button type="button" class="danger" data-action="logout-confirm">Sign out</button>
          </div>
        </section>
      </div>`;
  }

  function globalFreshness(): string {
    if (navigator.onLine === false) return 'Offline';
    const metas = ['plants','devices','alerts',`energy:${state.energyPeriod}`,'profile'].map(resourceMeta).filter(Boolean) as NonNullable<ApiMeta>[];
    if (metas.some(meta => meta.state === 'live')) return 'Up to date';
    if (metas.some(meta => meta.state === 'cached')) return 'Last saved update';
    if (state.loading) return 'Updating…';
    return 'Data unavailable';
  }

  function emptyState(title: string, detail: string, action = ''): string {
    return `<section class="mobile-empty-state"><div class="mobile-empty-icon">◇</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p>${action}</section>`;
  }

  function statusPill(status: string): string {
    return `<span class="mobile-pill ${toneFor(status)}">${escapeHtml(status)}</span>`;
  }

  function metricCard(label: string, value: string, note = ''): string {
    return `<article class="mobile-metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</article>`;
  }

  function sectionHeader(title: string, actionLabel = '', actionRoute = ''): string {
    return `<div class="mobile-section-head"><h2>${escapeHtml(title)}</h2>${actionLabel ? `<button data-route="${escapeHtml(actionRoute)}">${escapeHtml(actionLabel)}</button>` : ''}</div>`;
  }

  function telemetryRecords(): AnyRecord[] {
    return collectRecords(state.telemetry);
  }

  function primaryPlant(): AnyRecord | null {
    return state.plants[0] || null;
  }

  function activeAlerts(): AnyRecord[] {
    return state.alerts.filter(row => !/closed|resolved|cleared/i.test(statusOf(row)));
  }

  function renderOverview(): string {
    const plant = primaryPlant();
    const plantRecords = plant ? collectRecords(plant) : [];
    const telemetry = telemetryRecords();
    const profile = collectRecords(state.profile);
    const firstName = text(profile, ['firstName', 'givenName', 'displayName', 'name', 'username'], 'there').split(/\s+/)[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const plantStatus = plant ? statusOf(plant) : 'Unavailable';
    const devicesOnline = state.devices.filter(row => /online|active|healthy|normal|connected/i.test(statusOf(row))).length;
    const alerts = activeAlerts();
    const currentPower = metric(telemetry, ['currentPower','activePower','powerNow','power','outputPower'], 'kW');
    const todayEnergy = metric(telemetry, ['energyToday','todayEnergy','dailyEnergy','generatedToday','generationToday','yieldToday'], 'kWh');
    const soldEnergy = metric(telemetry, ['soldToday','energySoldToday','exportEnergyToday','exportedToday','gridExportToday'], 'kWh');
    const revenue = money(telemetry, ['revenueMonth','monthlyRevenue','revenue','grossRevenue','amount']);

    return `
      <section class="mobile-greeting"><p>${escapeHtml(greeting)}, ${escapeHtml(firstName)}</p><h2>${escapeHtml(plant ? nameOf(plant, 'plant') : 'Your energy portfolio')}</h2></section>
      <section class="mobile-hero-card ${toneFor(plantStatus)}">
        <div><span class="mobile-eyebrow">System status</span><h2>${escapeHtml(plantStatus)}</h2><p>${plant ? escapeHtml(text(plantRecords, ['location','address','city','region'], 'Location not provided')) : 'No plant is assigned to this account.'}</p></div>
        <div class="mobile-hero-orb">${toneFor(plantStatus) === 'success' ? '✓' : toneFor(plantStatus) === 'danger' ? '!' : '•'}</div>
      </section>
      <section class="mobile-metric-grid">
        ${metricCard('Current Power', currentPower, 'Latest reading')}
        ${metricCard('Energy Today', todayEnergy, 'Generated')}
        ${metricCard('Sold Today', soldEnergy, 'Grid export')}
        ${metricCard('Revenue', revenue, 'Latest available')}
      </section>
      <section class="mobile-card">
        ${sectionHeader('Plant snapshot', 'View plant', 'plant')}
        <div class="mobile-stat-row"><span>Capacity</span><strong>${escapeHtml(metric(plantRecords, ['capacity','installedCapacity','nominalCapacity','powerCapacity'], 'kW'))}</strong></div>
        <div class="mobile-stat-row"><span>Devices online</span><strong>${devicesOnline}/${state.devices.length || 0}</strong></div>
        <div class="mobile-stat-row"><span>Active alerts</span><strong class="${alerts.length ? 'text-danger' : ''}">${alerts.length}</strong></div>
      </section>
      <section class="mobile-card">
        ${sectionHeader('Recent alerts', 'See all', 'alerts')}
        ${alerts.length ? alerts.slice(0, 3).map(alertCard).join('') : '<div class="mobile-inline-empty">No active alert records returned.</div>'}
      </section>`;
  }

  function renderPlant(): string {
    const plant = primaryPlant();
    if (!plant) return emptyState('Plant unavailable', 'No plant is assigned to this account.');
    const records = collectRecords(plant);
    const telemetry = telemetryRecords();
    const status = statusOf(plant);
    return `
      <section class="mobile-plant-cover">
        <div class="mobile-plant-sun">☀</div>
        <span class="mobile-eyebrow">My plant</span>
        <h2>${escapeHtml(nameOf(plant, 'plant'))}</h2>
        <p>${escapeHtml(text(records, ['location','address','city','region','country'], 'Location not provided'))}</p>
        ${statusPill(status)}
      </section>
      <section class="mobile-metric-grid">
        ${metricCard('Capacity', metric(records, ['capacity','installedCapacity','nominalCapacity'], 'kW'))}
        ${metricCard('Current Power', metric(telemetry, ['currentPower','activePower','powerNow','power'], 'kW'))}
        ${metricCard('Energy Today', metric(telemetry, ['energyToday','todayEnergy','dailyEnergy','generatedToday'], 'kWh'))}
        ${metricCard('Devices', String(state.devices.length), 'Registered')}
      </section>
      <section class="mobile-card">
        ${sectionHeader('Plant information')}
        ${infoRow('Plant ID', idOf(plant) || 'Not provided')}
        ${infoRow('Owner', text(records, ['ownerName','clientName','tenantName','organizationName']))}
        ${infoRow('Commissioned', dateText(pick(records, ['commissioningDate','commissionedAt','startDate'])))}
        ${infoRow('Timezone', text(records, ['timezone','timeZone']))}
        ${infoRow('Provider', text(records, ['provider','vendor','integrationProvider']))}
      </section>
      <section class="mobile-card">
        ${sectionHeader('Performance')}
        ${infoRow('Performance ratio', metric(telemetry, ['performanceRatio','pr'], '%'))}
        ${infoRow('Specific yield', metric(telemetry, ['specificYield','yield'], 'kWh/kWp'))}
        ${infoRow('CO₂ avoided', metric(telemetry, ['co2Avoided','co2Savings'], 'kg'))}
        ${infoRow('Last update', freshnessText(resourceMeta('plants')))}
      </section>`;
  }

  function deviceCard(row: AnyRecord): string {
    const records = collectRecords(row);
    const id = idOf(row);
    const status = statusOf(row);
    const type = text(records, ['type','deviceType','category','assetType'], 'Device');
    const primary = metric(records, ['currentPower','activePower','powerNow','power','energyToday','todayEnergy','temperature','value']);
    return `<button class="mobile-list-card" data-device-id="${escapeHtml(id)}" ${id ? '' : 'disabled'}>
      <span class="mobile-list-icon">${deviceIcon(type)}</span>
      <span class="mobile-list-body"><strong>${escapeHtml(nameOf(row, 'device'))}</strong><small>${escapeHtml(type)} · ${escapeHtml(text(records, ['serialNumber','serial','code'], 'No serial'))}</small></span>
      <span class="mobile-list-side">${statusPill(status)}<small>${escapeHtml(primary)}</small></span>
      <span class="mobile-chevron">›</span>
    </button>`;
  }

  function deviceIcon(type: string): string {
    const normalized = type.toLowerCase();
    if (normalized.includes('inverter')) return '∿';
    if (normalized.includes('meter')) return '◴';
    if (normalized.includes('logger') || normalized.includes('gateway')) return '⌁';
    if (normalized.includes('weather') || normalized.includes('sensor')) return '☼';
    if (normalized.includes('battery')) return '▰';
    return '◇';
  }

  function renderDevices(): string {
    const query = state.deviceQuery.toLowerCase();
    const filtered = state.devices.filter(row => {
      const haystack = `${nameOf(row, 'device')} ${statusOf(row)} ${text(collectRecords(row), ['type','deviceType','serialNumber','serial'], '')}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesStatus = state.deviceStatus === 'All' || statusOf(row).toLowerCase().includes(state.deviceStatus.toLowerCase());
      return matchesQuery && matchesStatus;
    });
    return `
      <section class="mobile-search-panel">
        <label class="mobile-search"><span>⌕</span><input id="deviceSearch" value="${escapeHtml(state.deviceQuery)}" placeholder="Search devices" /></label>
        <select id="deviceStatusFilter" aria-label="Device status filter">
          ${['All','Online','Offline','Warning'].map(value => `<option ${state.deviceStatus === value ? 'selected' : ''}>${value}</option>`).join('')}
        </select>
      </section>
      <section class="mobile-summary-strip">
        <div><strong>${state.devices.length}</strong><span>Total</span></div>
        <div><strong>${state.devices.filter(row => toneFor(statusOf(row)) === 'success').length}</strong><span>Healthy</span></div>
        <div><strong>${state.devices.filter(row => toneFor(statusOf(row)) !== 'success').length}</strong><span>Attention</span></div>
      </section>
      <section class="mobile-list-stack">
        ${filtered.length ? filtered.map(deviceCard).join('') : emptyState('No devices found', 'No devices match the current filters.')}
      </section>`;
  }

  function findById(rows: AnyRecord[], id: string): AnyRecord | null {
    return rows.find(row => idOf(row) === id) || null;
  }

  function renderDeviceDetail(): string {
    const device = findById(state.devices, state.routeId);
    if (!device) return emptyState('Device unavailable', 'The requested device could not be found.');
    const records = collectRecords(device);
    const status = statusOf(device);
    const type = text(records, ['type','deviceType','category','assetType'], 'Device');
    const readings = [
      ['Current Power', ['currentPower','activePower','powerNow','power','outputPower'], 'kW'],
      ['Energy Today', ['energyToday','todayEnergy','dailyEnergy','yieldToday'], 'kWh'],
      ['Efficiency', ['efficiency','conversionEfficiency','performanceRatio'], '%'],
      ['Temperature', ['temperature','deviceTemperature','internalTemperature'], '°C'],
      ['Irradiance', ['irradiance','poaIrradiance','solarIrradiance'], 'W/m²'],
      ['Signal', ['signalStrength','rssi','networkSignal'], '']
    ] as Array<[string, string[], string]>;
    return `
      <section class="mobile-detail-hero">
        <div class="mobile-detail-icon">${deviceIcon(type)}</div>
        <div><span class="mobile-eyebrow">${escapeHtml(type)}</span><h2>${escapeHtml(nameOf(device, 'device'))}</h2><p>${escapeHtml(idOf(device) || 'ID not provided')}</p></div>
        ${statusPill(status)}
      </section>
      <section class="mobile-card">
        ${sectionHeader('Current readings')}
        <div class="mobile-reading-grid">${readings.map(([label, keys, unit]) => metricCard(label, metric(records, keys, unit))).join('')}</div>
      </section>
      <section class="mobile-card">
        ${sectionHeader('Device information')}
        ${infoRow('Status', status)}
        ${infoRow('Vendor', text(records, ['vendor','manufacturer','brand']))}
        ${infoRow('Model', text(records, ['model','modelName','deviceModel']))}
        ${infoRow('Serial number', text(records, ['serialNumber','serial','sn']))}
        ${infoRow('Plant', text(records, ['plantName','siteName','plant']))}
        ${infoRow('Location', text(records, ['location','position','area']))}
        ${infoRow('Connectivity', text(records, ['connectivity','connectionType','protocol','networkType']))}
        ${infoRow('Last update', dateText(pick(records, ['updatedAt','lastSeenAt','lastUpdate','timestamp']), true))}
      </section>`;
  }

  function alertCard(row: AnyRecord): string {
    const records = collectRecords(row);
    const id = idOf(row);
    const status = statusOf(row);
    const severity = text(records, ['severity','priority','level'], status);
    return `<button class="mobile-alert-card ${toneFor(severity)}" data-alert-id="${escapeHtml(id)}" ${id ? '' : 'disabled'}>
      <span class="mobile-alert-marker"></span>
      <span class="mobile-list-body"><strong>${escapeHtml(nameOf(row, 'alert'))}</strong><small>${escapeHtml(text(records, ['deviceName','assetName','plantName','sourceName'], 'Source not provided'))}</small><small>${escapeHtml(dateText(pick(records, ['createdAt','detectedAt','timestamp','occurredAt']), true))}</small></span>
      <span class="mobile-list-side">${statusPill(severity)}</span><span class="mobile-chevron">›</span>
    </button>`;
  }

  function renderAlerts(): string {
    const counts = {
      active: activeAlerts().length,
      critical: state.alerts.filter(row => toneFor(text(collectRecords(row), ['severity','priority','level'], statusOf(row))) === 'danger').length,
      resolved: state.alerts.filter(row => /closed|resolved|cleared/i.test(statusOf(row))).length
    };
    const filtered = state.alerts.filter(row => state.alertStatus === 'All' || statusOf(row).toLowerCase().includes(state.alertStatus.toLowerCase()));
    return `
      <section class="mobile-summary-strip three">
        <div><strong>${counts.active}</strong><span>Active</span></div>
        <div><strong>${counts.critical}</strong><span>Critical</span></div>
        <div><strong>${counts.resolved}</strong><span>Resolved</span></div>
      </section>
      <section class="mobile-filter-chips">
        ${['All','Open','Resolved'].map(value => `<button class="${state.alertStatus === value ? 'active' : ''}" data-alert-filter="${value}">${value}</button>`).join('')}
      </section>
      <section class="mobile-list-stack">
        ${filtered.length ? filtered.map(alertCard).join('') : emptyState('No alerts found', 'No alerts match the current filter.')}
      </section>`;
  }

  function renderAlertDetail(): string {
    const alert = findById(state.alerts, state.routeId);
    if (!alert) return emptyState('Alert unavailable', 'The requested alert could not be found.');
    const records = collectRecords(alert);
    const status = statusOf(alert);
    const severity = text(records, ['severity','priority','level'], status);
    const linkedDeviceId = text(records, ['deviceId','assetId','sourceDeviceId'], '');
    return `
      <section class="mobile-alert-detail ${toneFor(severity)}">
        <div class="mobile-alert-symbol">!</div><span class="mobile-eyebrow">${escapeHtml(severity)}</span>
        <h2>${escapeHtml(nameOf(alert, 'alert'))}</h2><p>${escapeHtml(text(records, ['message','description','summary','details'], 'No additional explanation is available.'))}</p>
        <div class="mobile-detail-actions">${statusPill(status)}${linkedDeviceId ? `<button data-device-id="${escapeHtml(linkedDeviceId)}">Open device</button>` : ''}</div>
      </section>
      <section class="mobile-card">
        ${sectionHeader('Alert information')}
        ${infoRow('Alert ID', idOf(alert) || 'Not provided')}
        ${infoRow('Severity', severity)}
        ${infoRow('Status', status)}
        ${infoRow('Plant', text(records, ['plantName','siteName']))}
        ${infoRow('Device', text(records, ['deviceName','assetName','sourceName']))}
        ${infoRow('Detected', dateText(pick(records, ['createdAt','detectedAt','timestamp','occurredAt']), true))}
        ${infoRow('Updated', dateText(pick(records, ['updatedAt','resolvedAt','closedAt']), true))}
      </section>
      <section class="mobile-card">
        ${sectionHeader('Response information')}
        ${infoRow('Owner', text(records, ['owner','assignee','assignedTo']))}
        ${infoRow('Reference', text(records, ['reference','caseId','ticketId','supportReference']))}
        ${infoRow('Recommended action', text(records, ['recommendedAction','instruction','ownerInstruction']))}
      </section>`;
  }

  function energyRows(): AnyRecord[] {
    const all = collectRecords(state.telemetry);
    const withTime = all.filter(row => pick([row], ['timestamp','time','date','recordedAt','intervalStart']) !== undefined);
    return withTime.slice(0, 48);
  }

  function renderEnergy(): string {
    const records = telemetryRecords();
    const rows = energyRows();
    const generated = metric(records, ['generated','generation','energyGenerated','generatedEnergy','production','energyToday','todayEnergy'], 'kWh');
    const sold = metric(records, ['sold','energySold','soldEnergy','exported','exportEnergy','exportEnergyToday'], 'kWh');
    const consumed = metric(records, ['consumed','selfConsumed','consumption','selfConsumption'], 'kWh');
    const imported = metric(records, ['imported','gridImport','importEnergy'], 'kWh');
    const chartValues = rows.map(row => numberFrom([row], ['generated','generation','energy','value','activePower','power'])).filter((value): value is number => value !== null).slice(-16);
    return `
      <section class="mobile-period-control">
        ${['Today','Week','Month','Year'].map(period => `<button class="${state.energyPeriod === period ? 'active' : ''}" data-energy-period="${period}">${period}</button>`).join('')}
      </section>
      <section class="mobile-metric-grid">
        ${metricCard('Generated', generated)}${metricCard('Sold', sold)}${metricCard('Consumed', consumed)}${metricCard('Imported', imported)}
      </section>
      <section class="mobile-card">
        ${sectionHeader('Generation profile')}
        ${chartValues.length ? barChart(chartValues) : '<div class="mobile-inline-empty tall">No timestamped telemetry points returned.</div>'}
        <div class="mobile-chart-caption"><span>Period: ${escapeHtml(state.energyPeriod)}</span><span>${escapeHtml(freshnessText(resourceMeta(`energy:${state.energyPeriod}`)))}</span></div>
      </section>
      <section class="mobile-card">
        ${sectionHeader('Energy details')}
        ${infoRow('Peak power', metric(records, ['peakPower','maxPower','maximumPower'], 'kW'))}
        ${infoRow('Specific yield', metric(records, ['specificYield','yield'], 'kWh/kWp'))}
        ${infoRow('Performance ratio', metric(records, ['performanceRatio','pr'], '%'))}
        ${infoRow('CO₂ avoided', metric(records, ['co2Avoided','co2Savings'], 'kg'))}
      </section>`;
  }

  function barChart(values: number[]): string {
    const max = Math.max(...values, 1);
    return `<div class="mobile-bar-chart">${values.map((value, index) => `<span style="height:${Math.max(6, value / max * 100).toFixed(1)}%" title="${escapeHtml(value)}"><i>${index + 1}</i></span>`).join('')}</div>`;
  }

  function renderSales(): string {
    const records = [...telemetryRecords(), ...state.plants.flatMap(row => collectRecords(row))];
    const revenue = money(records, ['revenue','grossRevenue','revenueMonth','monthlyRevenue','salesRevenue']);
    const received = money(records, ['received','amountReceived','paidAmount','paymentReceived']);
    const outstanding = money(records, ['outstanding','outstandingAmount','balanceDue','unpaidAmount']);
    const sold = metric(records, ['soldEnergy','energySold','exportEnergy','exportedEnergy','soldToday'], 'kWh');
    const buyer = text(records, ['buyerName','offtaker','purchaser','customerName'], 'Not provided');
    const tariff = metric(records, ['tariff','energyTariff','pricePerKwh','rate'], '');
    const hasFinance = [revenue, received, outstanding, sold].some(value => value !== '—') || buyer !== 'Not provided' || tariff !== '—';
    return `
      <section class="mobile-finance-hero"><span class="mobile-eyebrow">Latest available</span><h2>${escapeHtml(revenue)}</h2><p>Total revenue available to this account</p></section>
      ${hasFinance ? `
        <section class="mobile-metric-grid">${metricCard('Energy Sold', sold)}${metricCard('Received', received)}${metricCard('Outstanding', outstanding)}${metricCard('Tariff', tariff)}</section>
        <section class="mobile-card">${sectionHeader('Agreement')}${infoRow('Buyer', buyer)}${infoRow('Contract', text(records, ['contractName','agreementName','ppaName']))}${infoRow('Settlement status', text(records, ['settlementStatus','paymentStatus','commercialStatus']))}${infoRow('Next settlement', dateText(pick(records, ['nextSettlementDate','settlementDate','dueDate'])))}</section>
      ` : emptyState('Sales data unavailable', 'Sales, settlement and payment information is not available for this account.')}`;
  }

  function renderReports(): string {
    if (!state.reports.length) return `
      <section class="mobile-card mobile-feature-intro"><div class="mobile-feature-icon">▤</div><h2>Reports</h2><p>Your available reports and downloads will appear here.</p></section>
      ${emptyState('No reports available', 'Report generation and scheduled delivery are not available for this account.')}`;
    return `<section class="mobile-list-stack">${state.reports.map(row => {
      const records = collectRecords(row);
      const url = text(records, ['downloadUrl','url','fileUrl'], '');
      return `<article class="mobile-report-card"><div><strong>${escapeHtml(nameOf(row, 'report'))}</strong><small>${escapeHtml(dateText(pick(records, ['createdAt','generatedAt','date'])))}</small></div>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open</a>` : '<span>Unavailable</span>'}</article>`;
    }).join('')}</section>`;
  }

  function renderProfile(): string {
    const records = collectRecords(state.profile);
    const name = text(records, ['displayName','fullName','name','username'], 'End User');
    const email = text(records, ['email','emailAddress','preferredUsername'], 'Not provided');
    const roles = window.ZentridAuth.getRoles?.() || [];
    const initials = name.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'EU';
    return `
      <section class="mobile-profile-head"><div class="mobile-profile-avatar">${escapeHtml(initials)}</div><h2>${escapeHtml(name)}</h2><p>${escapeHtml(email)}</p>${statusPill('Authenticated')}</section>
      <section class="mobile-card">
        ${sectionHeader('Account')}
        ${infoRow('User ID', text(records, ['id','userId','sub']))}
        ${infoRow('Phone', text(records, ['phone','phoneNumber','mobile']))}
        ${infoRow('Organization', text(records, ['organizationName','tenantName','companyName']))}
        ${infoRow('Role', roles.length ? roles.join(', ') : 'Not provided')}
        ${infoRow('Language', text(records, ['language','locale']))}
      </section>
      <section class="mobile-card">
        ${sectionHeader('Session')}
        ${infoRow('Status', 'Active')}
        ${infoRow('Access', 'End User')}
        ${infoRow('Updated', freshnessText(resourceMeta('profile')))}
      </section>
      <button class="mobile-danger-button" data-action="logout">Sign out</button>`;
  }

  function renderMore(): string {
    const entries = [
      ['energy','Energy','Production, export and performance','↗'],
      ['sales','Sales & Revenue','Commercial information','$'],
      ['reports','Reports','Available reports and downloads','▤'],
      ['profile','Profile','Account and session information','◉']
    ];
    return `<section class="mobile-more-grid">${entries.map(([route, title, detail, icon]) => `<button data-route="${route}"><span>${icon}</span><strong>${title}</strong><small>${detail}</small><i>›</i></button>`).join('')}</section>
      <section class="mobile-card">${sectionHeader('Application')} ${infoRow('Mode', 'Mobile app')}${infoRow('Updates', 'Automatic')}${infoRow('Offline access', 'Previous successful update')}${infoRow('Version', '1.0.4')}</section>`;
  }

  function infoRow(label: string, value: string): string {
    return `<div class="mobile-info-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function renderContent(): string {
    if (state.loading) return `<section class="mobile-loading"><div class="mobile-loader"></div><h2>Loading your account</h2><p>Preparing your dashboard…</p></section>`;
    switch (state.route) {
      case 'plant': return renderPlant();
      case 'devices': return renderDevices();
      case 'device': return renderDeviceDetail();
      case 'alerts': return renderAlerts();
      case 'alert': return renderAlertDetail();
      case 'energy': return renderEnergy();
      case 'sales': return renderSales();
      case 'reports': return renderReports();
      case 'profile': return renderProfile();
      case 'more': return renderMore();
      default: return renderOverview();
    }
  }

  function render(): void {
    app.innerHTML = shell(renderContent());
    bindEvents();
  }

  function bindEvents(): void {
    app.querySelectorAll<HTMLElement>('[data-route]').forEach(element => element.addEventListener('click', () => navigate(element.dataset.route as RouteName)));
    app.querySelectorAll<HTMLElement>('[data-device-id]').forEach(element => element.addEventListener('click', () => {
      const id = element.dataset.deviceId || '';
      if (id) navigate('device', id);
    }));
    app.querySelectorAll<HTMLElement>('[data-alert-id]').forEach(element => element.addEventListener('click', () => {
      const id = element.dataset.alertId || '';
      if (id) navigate('alert', id);
    }));
    app.querySelector('[data-action="back"]')?.addEventListener('click', () => history.back());
    app.querySelector('[data-action="refresh"]')?.addEventListener('click', () => void loadData(true));
    app.querySelector('[data-action="logout"]')?.addEventListener('click', () => { state.logoutConfirm = true; render(); });
    app.querySelectorAll('[data-action="logout-cancel"]').forEach(element => element.addEventListener('click', () => { state.logoutConfirm = false; render(); }));
    app.querySelector('[data-action="logout-confirm"]')?.addEventListener('click', () => {
      window.ZentridAuth.logout(false);
      window.location.replace('login.html?reason=logout');
    });

    const search = app.querySelector<HTMLInputElement>('#deviceSearch');
    search?.addEventListener('input', () => { state.deviceQuery = search.value; render(); requestAnimationFrame(() => {
      const next = app.querySelector<HTMLInputElement>('#deviceSearch');
      next?.focus();
      next?.setSelectionRange(next.value.length, next.value.length);
    }); });
    app.querySelector<HTMLSelectElement>('#deviceStatusFilter')?.addEventListener('change', event => {
      state.deviceStatus = (event.currentTarget as HTMLSelectElement).value;
      render();
    });
    app.querySelectorAll<HTMLElement>('[data-alert-filter]').forEach(element => element.addEventListener('click', () => {
      state.alertStatus = element.dataset.alertFilter || 'All'; render();
    }));
    app.querySelectorAll<HTMLElement>('[data-energy-period]').forEach(element => element.addEventListener('click', async () => {
      const period = element.dataset.energyPeriod || 'Today';
      if (state.energyPeriod === period) return;
      state.energyPeriod = period;
      state.refreshing = true;
      render();
      state.telemetry = await api.energy(period);
      state.refreshing = false;
      render();
    }));
  }

  async function loadData(refresh = false): Promise<void> {
    if (refresh) state.refreshing = true;
    else state.loading = true;
    render();
    state.errors = [];
    const tasks = await Promise.allSettled([
      api.plants(), api.devices({ page: 1, size: 100 }), api.alerts(), api.energy(state.energyPeriod), api.profile(), api.reports()
    ]);
    const values = tasks.map((task, index) => {
      if (task.status === 'fulfilled') return task.value;
      state.errors.push(`Resource ${index + 1}: ${String(task.reason || 'Unknown error')}`);
      return index === 3 ? {} : index === 4 ? {} : [];
    });
    state.plants = Array.isArray(values[0]) ? values[0] : [];
    state.devices = Array.isArray(values[1]) ? values[1] : [];
    state.alerts = Array.isArray(values[2]) ? values[2] : [];
    state.telemetry = values[3] || {};
    state.profile = isRecord(values[4]) ? values[4] : {};
    state.reports = Array.isArray(values[5]) ? values[5] : [];
    state.loading = false;
    state.refreshing = false;
    render();
  }

  function syncRoute(): void {
    const next = routeFromHash();
    state.route = next.route;
    state.routeId = next.id;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }

  window.addEventListener('hashchange', syncRoute);
  window.addEventListener('zentrid:connectivity', (event: Event) => {
    const online = Boolean((event as CustomEvent<{ online?: boolean }>).detail?.online);
    if (online) void loadData(true);
    else render();
  });
  window.addEventListener('zentrid:session-expired', () => {
    const next = encodeURIComponent(window.location.pathname.replace(/^\/+/, '') + window.location.hash);
    window.location.replace(`login.html?reason=session&next=${next}`);
  });
  syncRoute();
  void loadData();

})();
