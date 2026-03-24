const BASE_URL = '/forge/api';

export function getToken(): string | null {
  return localStorage.getItem('srijan_token');
}

export function setToken(token: string): void {
  localStorage.setItem('srijan_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('srijan_token');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function logout(): void {
  clearToken();
  window.location.reload();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    const hadToken = !!token;
    clearToken();
    if (hadToken) window.location.reload();
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Request failed');
  return data;
}

export function getCurrentUser(): { userId: string; username: string; role: string } | null {
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.userId || !payload.username) return null;
    return { userId: payload.userId, username: payload.username, role: payload.role || 'admin' };
  } catch {
    return null;
  }
}

export function createChatSocket(): WebSocket {
  const token = getToken();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return new WebSocket(`${protocol}//${host}/forge/api/chat?token=${token}`);
}

export async function getClaudeOAuthStatus(): Promise<{ connected: boolean; email?: string; subscriptionType?: string; expiresAt?: number }> {
  return apiFetch('/auth/claude-oauth/status');
}

export async function connectClaudeOAuth(accessToken: string): Promise<void> {
  await apiFetch('/auth/claude-oauth/token', { method: 'POST', body: JSON.stringify({ accessToken }) });
}

export async function disconnectClaudeOAuth(): Promise<void> {
  await apiFetch('/auth/claude-oauth', { method: 'DELETE' });
}

export interface AgentRole {
  id: string;
  name: string;
  display_name: string;
  description: string;
  system_prompt_addition: string;
  allowed_tools: string | null;
  blocked_tools: string;
  subdir: string;
  is_default: number;
}

export async function getRoles(): Promise<AgentRole[]> {
  return apiFetch('/roles');
}

export async function createRole(data: Partial<AgentRole>): Promise<AgentRole> {
  return apiFetch('/roles', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateRole(id: string, data: Partial<AgentRole>): Promise<AgentRole> {
  return apiFetch(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteRole(id: string): Promise<void> {
  await apiFetch(`/roles/${id}`, { method: 'DELETE' });
}
