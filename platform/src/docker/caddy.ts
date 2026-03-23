import { createLogger } from '../lib/logger.js';

const log = createLogger('caddy');
const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL || 'http://localhost:2019';
const APP_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
// Path to the subroute's routes array inside the terminal host route.
// Resolved once at startup by initCaddyRouteId().
let appRoutesPath: string | null = null;

function validateAppName(name: string): void {
  if (!APP_NAME_RE.test(name)) {
    throw new Error(`Invalid app name: "${name}"`);
  }
}

/**
 * Resolves the index-based path to the subroute routes array inside the
 * terminal host-matched route. Storing this path lets addRoute() insert
 * app routes inside the host block instead of after it (where terminal:true
 * would shadow them).
 * Must be called at server startup before any addRoute calls.
 */
export async function initCaddyRouteId(): Promise<void> {
  const routes = await listRoutes();
  const hostRouteIndex = routes.findIndex((r: any) => r.terminal === true);
  if (hostRouteIndex === -1) {
    log.warn('initCaddyRouteId: no terminal host route found, dynamic routes will be top-level');
    return;
  }

  appRoutesPath = `/config/apps/http/servers/srv0/routes/${hostRouteIndex}/handle/0/routes`;
  log.info({ hostRouteIndex, appRoutesPath }, 'caddy app routes path initialized');
}

export async function addRoute(appName: string, path: string, port: number): Promise<void> {
  validateAppName(appName);

  // Caddy and platform both run with network_mode: host, so app containers
  // are always reachable via their host-mapped port on loopback.
  const dial = `127.0.0.1:${port}`;

  const route = {
    '@id': `app-${appName}`,
    match: [{ path: [`${path}`, `${path}/*`] }],
    handle: [
      {
        handler: 'subroute',
        routes: [
          {
            handle: [
              {
                handler: 'rewrite',
                strip_path_prefix: path,
              },
              {
                handler: 'reverse_proxy',
                upstreams: [{ dial }],
              },
            ],
          },
        ],
      },
    ],
  };

  // Insert inside the host-matched subroute when available so the terminal
  // host route does not shadow dynamically added app routes.
  const targetUrl = appRoutesPath
    ? `${CADDY_ADMIN_URL}${appRoutesPath}`
    : `${CADDY_ADMIN_URL}/config/apps/http/servers/srv0/routes`;

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
      body: JSON.stringify(route),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err: any) {
    throw new Error(`Caddy is not reachable (${CADDY_ADMIN_URL}): ${err.message}`);
  }

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 409 || body.toLowerCase().includes('already exists') || body.toLowerCase().includes('conflict')) {
      throw new Error(`Caddy route conflict for "${appName}": route already exists`);
    }
    log.error({ status: res.status, body }, 'addRoute failed');
    throw new Error(`Caddy addRoute failed: ${res.status}`);
  }
}

export async function removeRoute(appName: string): Promise<void> {
  validateAppName(appName);

  let res: Response;
  try {
    res = await fetch(`${CADDY_ADMIN_URL}/id/app-${appName}`, {
      method: 'DELETE',
      headers: { 'Origin': 'http://localhost' },
      signal: AbortSignal.timeout(5000),
    });
  } catch (err: any) {
    throw new Error(`Caddy is not reachable (${CADDY_ADMIN_URL}): ${err.message}`);
  }

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    log.error({ status: res.status, body }, 'removeRoute failed');
    throw new Error(`Caddy removeRoute failed: ${res.status}`);
  }
}

export async function listRoutes(): Promise<any[]> {
  try {
    const res = await fetch(`${CADDY_ADMIN_URL}/config/apps/http/servers/srv0/routes`, {
      headers: { 'Origin': 'http://localhost' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
