import { APIRequestContext } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:8080/forge/api';

export async function getAdminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { username: 'admin', password: process.env.SRIJAN_ADMIN_PASSWORD || 'testpass' },
  });
  const body = await res.json();
  return body.token as string;
}

export async function createWorkspaceViaApi(request: APIRequestContext, token: string, name: string): Promise<void> {
  await request.post(`${API_BASE}/workspaces`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  });
}

export async function deleteWorkspaceViaApi(request: APIRequestContext, token: string, name: string): Promise<void> {
  await request.delete(`${API_BASE}/workspaces/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
