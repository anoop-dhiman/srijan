import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ branch: 'main', remoteUrl: null }),
}));

import { apiFetch } from '../lib/api';
import { Dashboard } from '../components/Dashboard';
import type { WorkspaceInfo } from '../hooks/useChat';

const mockWorkspaces: WorkspaceInfo[] = [
  {
    name: 'my-react-app',
    sessionCount: 3,
    runningContainerCount: 2,
    totalCostUsd: 0.024,
    lastActivityAt: '2024-01-10T12:00:00.000Z',
  },
  {
    name: 'backend-api',
    sessionCount: 1,
    runningContainerCount: 0,
    totalCostUsd: null,
    lastActivityAt: null,
  },
];

describe('Dashboard', () => {
  const onRefresh = vi.fn();
  const onViewSessions = vi.fn();
  const onCreateWorkspace = vi.fn().mockResolvedValue(undefined);

  const renderDashboard = (workspaces = mockWorkspaces) =>
    render(
      <Dashboard
        workspaces={workspaces}
        onRefresh={onRefresh}
        onViewSessions={onViewSessions}
        onCreateWorkspace={onCreateWorkspace}
      />
    );

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: git status returns successfully, containers/apps return empty arrays
    vi.mocked(apiFetch).mockResolvedValue({ branch: 'main', remoteUrl: null });
  });

  it('renders Refresh button', () => {
    renderDashboard([]);
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('shows empty message when no workspaces', () => {
    renderDashboard([]);
    expect(screen.getByText(/no workspaces yet/i)).toBeInTheDocument();
  });

  it('renders workspace cards', () => {
    renderDashboard();
    expect(screen.getByText('my-react-app')).toBeInTheDocument();
    expect(screen.getByText('backend-api')).toBeInTheDocument();
  });

  it('shows session and container counts', () => {
    renderDashboard();
    expect(screen.getByText('3 sessions')).toBeInTheDocument();
    expect(screen.getByText('2 containers running')).toBeInTheDocument();
  });

  it('shows cost when available', () => {
    renderDashboard();
    expect(screen.getByText('$0.0240')).toBeInTheDocument();
  });

  it('calls onViewSessions with workspace name when View Sessions is clicked', async () => {
    renderDashboard();
    const btns = screen.getAllByText('View Sessions');
    fireEvent.click(btns[0]);
    expect(onViewSessions).toHaveBeenCalledWith('my-react-app');
  });

  it('calls onRefresh when Refresh is clicked', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Refresh'));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('shows active badge when workspace has containers', () => {
    renderDashboard();
    const badges = screen.getAllByText('active');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows New Workspace button', () => {
    renderDashboard();
    expect(screen.getByText('New Workspace')).toBeInTheDocument();
  });

  it('shows creation panel when New Workspace is clicked', () => {
    renderDashboard([]);
    fireEvent.click(screen.getByText('New Workspace'));
    expect(screen.getByText('New Repo')).toBeInTheDocument();
    expect(screen.getByText('Clone Repo')).toBeInTheDocument();
  });

  it('fetches containers when Containers is expanded', async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/git/')) return { branch: 'main', remoteUrl: null };
      if (typeof url === 'string' && url.includes('/containers')) return [
        { Id: 'abc', Names: ['/my-app'], Image: 'my-app:latest', State: 'running', Status: 'Up', Ports: [] },
      ];
      if (typeof url === 'string' && url.includes('/apps')) return [];
      return {};
    });

    renderDashboard();
    const containersBtns = screen.getAllByText('Containers');
    fireEvent.click(containersBtns[0]);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/containers?workspace=my-react-app'));
    });
  });
});
