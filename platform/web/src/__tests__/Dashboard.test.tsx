import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Refresh button', () => {
    render(<Dashboard workspaces={[]} onRefresh={onRefresh} onViewSessions={onViewSessions} />);
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('shows empty message when no workspaces', () => {
    render(<Dashboard workspaces={[]} onRefresh={onRefresh} onViewSessions={onViewSessions} />);
    expect(screen.getByText(/no workspaces yet/i)).toBeInTheDocument();
  });

  it('renders workspace cards', () => {
    render(<Dashboard workspaces={mockWorkspaces} onRefresh={onRefresh} onViewSessions={onViewSessions} />);
    expect(screen.getByText('my-react-app')).toBeInTheDocument();
    expect(screen.getByText('backend-api')).toBeInTheDocument();
  });

  it('shows session and container counts', () => {
    render(<Dashboard workspaces={mockWorkspaces} onRefresh={onRefresh} onViewSessions={onViewSessions} />);
    expect(screen.getByText('3 sessions')).toBeInTheDocument();
    expect(screen.getByText('2 containers running')).toBeInTheDocument();
  });

  it('shows cost when available', () => {
    render(<Dashboard workspaces={mockWorkspaces} onRefresh={onRefresh} onViewSessions={onViewSessions} />);
    expect(screen.getByText('$0.0240')).toBeInTheDocument();
  });

  it('calls onViewSessions with workspace name when View Sessions is clicked', async () => {
    render(<Dashboard workspaces={mockWorkspaces} onRefresh={onRefresh} onViewSessions={onViewSessions} />);
    const btns = screen.getAllByText('View Sessions');
    fireEvent.click(btns[0]);
    expect(onViewSessions).toHaveBeenCalledWith('my-react-app');
  });

  it('calls onRefresh when Refresh is clicked', () => {
    render(<Dashboard workspaces={mockWorkspaces} onRefresh={onRefresh} onViewSessions={onViewSessions} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('shows active badge when workspace has containers', () => {
    render(<Dashboard workspaces={mockWorkspaces} onRefresh={onRefresh} onViewSessions={onViewSessions} />);
    const badges = screen.getAllByText('active');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('fetches containers when Containers is expanded', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce([
        { Id: 'abc', Names: ['/my-app'], Image: 'my-app:latest', State: 'running', Status: 'Up', Ports: [] },
      ])
      .mockResolvedValueOnce([]);

    render(<Dashboard workspaces={mockWorkspaces} onRefresh={onRefresh} onViewSessions={onViewSessions} />);
    const containersBtns = screen.getAllByText('Containers');
    fireEvent.click(containersBtns[0]);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/containers?workspace=my-react-app'));
    });
  });
});
