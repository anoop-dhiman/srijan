const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL || 'http://localhost:2019';

export async function addRoute(appName: string, path: string, port: number): Promise<void> {
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
                upstreams: [{ dial: `host.docker.internal:${port}` }],
              },
            ],
          },
        ],
      },
    ],
  };

  const res = await fetch(`${CADDY_ADMIN_URL}/config/apps/http/servers/srv0/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(route),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Caddy addRoute failed: ${res.status} ${body}`);
  }
}

export async function removeRoute(appName: string): Promise<void> {
  const res = await fetch(`${CADDY_ADMIN_URL}/id/app-${appName}`, {
    method: 'DELETE',
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Caddy removeRoute failed: ${res.status} ${body}`);
  }
}

export async function listRoutes(): Promise<any[]> {
  try {
    const res = await fetch(`${CADDY_ADMIN_URL}/config/apps/http/servers/srv0/routes`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
