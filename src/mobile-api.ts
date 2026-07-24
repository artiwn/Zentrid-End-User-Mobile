(() => {
  type AnyRecord = Record<string, any>;
  type ResourceState = 'live' | 'cached' | 'empty' | 'error';
  type ResourceMeta = {
    resource: string;
    endpoint: string;
    state: ResourceState;
    fetchedAt: string;
    stale: boolean;
    error: string;
  };

  const SNAPSHOT_PREFIX = 'zentrid_end_user_mobile_api_snapshot_v100:';
  const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const states: Record<string, ResourceMeta> = {};

  function isRecord(value: unknown): value is AnyRecord {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function userScope(): string {
    const claims = window.ZentridAuth?.getJwtClaims?.() || window.ZentridAuth?.getSession?.()?.claims || {};
    return String(claims.sub || claims.nameid || claims.unique_name || 'anonymous').replace(/[^a-z0-9_-]/gi, '_');
  }

  function snapshotKey(resource: string): string {
    return `${SNAPSHOT_PREFIX}${userScope()}:${resource}`;
  }

  function unwrap(payload: unknown): unknown {
    if (!isRecord(payload)) return payload;
    for (const key of ['data', 'result', 'payload']) {
      if (payload[key] !== undefined && payload[key] !== null) return payload[key];
    }
    return payload;
  }

  function list(payload: unknown): AnyRecord[] {
    const value = unwrap(payload);
    if (Array.isArray(value)) return value.filter(isRecord);
    if (!isRecord(value)) return [];
    for (const key of ['items', 'results', 'records', 'content', 'rows', 'values']) {
      if (Array.isArray(value[key])) return value[key].filter(isRecord);
    }
    return [];
  }

  function object(payload: unknown): AnyRecord {
    const value = unwrap(payload);
    return isRecord(value) ? value : {};
  }

  function passthrough(payload: unknown): unknown {
    return unwrap(payload);
  }

  function saveSnapshot(resource: string, data: unknown, fetchedAt: string): void {
    try {
      localStorage.setItem(snapshotKey(resource), JSON.stringify({ data, fetchedAt }));
    } catch (_error) {
      // Snapshot persistence is optional and stores only successful API responses.
    }
  }

  function readSnapshot<T>(resource: string): { data: T; fetchedAt: string } | null {
    try {
      const raw = localStorage.getItem(snapshotKey(resource));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data?: T; fetchedAt?: string };
      const timestamp = Date.parse(String(parsed.fetchedAt || ''));
      if (!parsed.fetchedAt || !Number.isFinite(timestamp) || Date.now() - timestamp > SNAPSHOT_MAX_AGE_MS) {
        localStorage.removeItem(snapshotKey(resource));
        return null;
      }
      return { data: parsed.data as T, fetchedAt: parsed.fetchedAt };
    } catch (_error) {
      return null;
    }
  }

  async function request(path: string, baseUrl: string, timeoutMs = 12_000): Promise<unknown> {
    if (!window.ZentridAuth?.request) throw new Error('Zentrid API client is not available.');
    return window.ZentridAuth.request(path, {
      baseUrl,
      timeoutMs,
      retry: 1
    });
  }

  function isEmptyValue(value: unknown): boolean {
    if (Array.isArray(value)) return value.length === 0;
    if (isRecord(value)) return Object.keys(value).length === 0;
    return value === null || value === undefined || value === '';
  }

  async function resource<T>(
    resourceName: string,
    endpoint: string,
    baseUrl: string,
    normalize: (payload: unknown) => T,
    empty: T
  ): Promise<T> {
    try {
      const data = normalize(await request(endpoint, baseUrl));
      const fetchedAt = new Date().toISOString();
      saveSnapshot(resourceName, data, fetchedAt);
      states[resourceName] = {
        resource: resourceName,
        endpoint,
        state: isEmptyValue(data) ? 'empty' : 'live',
        fetchedAt,
        stale: false,
        error: ''
      };
      return data;
    } catch (error) {
      const cached = readSnapshot<T>(resourceName);
      const message = String((error as { message?: unknown })?.message || 'The API is temporarily unavailable.');
      if (cached) {
        states[resourceName] = {
          resource: resourceName,
          endpoint,
          state: 'cached',
          fetchedAt: cached.fetchedAt,
          stale: true,
          error: message
        };
        return cached.data;
      }
      states[resourceName] = {
        resource: resourceName,
        endpoint,
        state: 'error',
        fetchedAt: '',
        stale: false,
        error: message
      };
      return empty;
    }
  }

  function unavailable<T>(resourceName: string, description: string, empty: T): Promise<T> {
    states[resourceName] = {
      resource: resourceName,
      endpoint: description,
      state: 'empty',
      fetchedAt: new Date().toISOString(),
      stale: false,
      error: ''
    };
    return Promise.resolve(empty);
  }

  const capabilities = Object.freeze({
    overview: false,
    plants: true,
    devices: true,
    alerts: true,
    energy: true,
    reportsList: false,
    profileRead: true,
    salesRevenue: false,
    reportGenerate: false,
    profileUpdate: false,
    notificationPreferencesUpdate: false,
    reportDeliveryUpdate: false
  });

  window.ZentridEndUserAPI = {
    capabilities,
    getState: (resourceName: string) => states[resourceName] || null,

    // The deployed Swagger does not expose a dedicated End User dashboard or overview.
    // Overview and My Plant combine the real plants, devices, alerts and telemetry resources below.
    dashboard: (_period = 'Today', _page = 1, _size = 100) =>
      unavailable('dashboard', 'No dashboard endpoint in the current backend', {}),
    overview: () =>
      unavailable('overview', 'No End User overview endpoint in the current backend', {}),

    plants: () =>
      resource('plants', '/api/plants', window.ZentridConfig.apiBaseUrl, list, []),
    devices: (_options: AnyRecord = {}) =>
      resource('devices', '/api/devices', window.ZentridConfig.apiBaseUrl, list, []),
    alerts: () =>
      resource('alerts', '/api/alerts', window.ZentridConfig.apiBaseUrl, list, []),

    // The current backend exposes telemetry rather than a dedicated Energy controller.
    // The Energy runtime reads only explicit timestamped energy/power fields from this payload.
    energy: (period = 'Today') =>
      resource(`energy:${period}`, '/api/telemetry', window.ZentridConfig.apiBaseUrl, passthrough, {}),

    // No reports endpoint is present in the supplied Swagger. Do not issue a request that is known to 404.
    reports: () =>
      unavailable('reports', 'No reports endpoint in the current backend', []),

    // Identity/profile data is available from the Auth service.
    profile: () =>
      resource('profile', '/api/Auth/me', window.ZentridConfig.authBaseUrl, object, {}),

    endpointAudit: () => ({
      implemented: [
        'GET /api/Auth/me',
        'GET /api/plants',
        'GET /api/devices',
        'GET /api/alerts',
        'GET /api/telemetry'
      ],
      unavailable: [
        'GET /api/Ui/dashboard',
        'GET /api/EndUser/overview',
        'GET /api/EndUser/plants',
        'GET /api/EndUser/devices',
        'GET /api/EndUser/alerts',
        'GET /api/EndUser/energy',
        'GET /api/EndUser/reports',
        'GET /api/EndUser/profile'
      ],
      missing: [
        'Dedicated End User overview/dashboard endpoint',
        'Dedicated energy aggregation endpoint',
        'Sales, settlement and payment endpoints',
        'Reports list/generation/download endpoints',
        'Profile update endpoint',
        'Notification and report-delivery preference endpoints'
      ]
    })
  };
})();
