import { APIRequestContext, Page } from '@playwright/test';

/**
 * Opens the workspace picker in the Chat view and selects the given workspace,
 * enabling the textarea for typing.
 */
export async function selectWorkspaceInChat(page: Page, wsName: string): Promise<void> {
  // Open workspace picker (button shows "Select…" when nothing is selected, or current ws name)
  const pickerBtn = page.locator('button').filter({ hasText: /Select…|Select/i }).first();
  if (await pickerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pickerBtn.click();
  }
  // Click the workspace option by name
  const wsBtn = page.locator('button').filter({ hasText: wsName }).first();
  if (await wsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await wsBtn.click();
  }
  // Wait until textarea becomes enabled
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
}

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

export async function getWorkspaceGitStatus(request: APIRequestContext, token: string, name: string) {
  const res = await request.get(`${API_BASE}/git/${name}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function initWorkspaceGit(request: APIRequestContext, token: string, name: string) {
  await request.post(`${API_BASE}/git/init`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  });
}
