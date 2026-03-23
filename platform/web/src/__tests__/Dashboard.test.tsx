/* eslint-disable @typescript-eslint/no-explicit-any */
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
  const onDeleteWorkspace = vi.fn().mockResolvedValue(undefined);

  const renderDashboard = (workspaces = mockWorkspaces) =>
    render(
      <Dashboard
        workspaces={workspaces}
        onRefresh={onRefresh}
        onViewSessions={onViewSessions}
        onCreateWorkspace={onCreateWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
      />
    );

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: git status returns successfully, containers/apps return empty arrays
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/apps')) return [];
      return { branch: 'main', remoteUrl: null };
    });
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

  it('renders delete button in each workspace card', () => {
    renderDashboard();
    // Each card has a trash icon button (title="Delete workspace")
    const deleteBtns = screen.getAllByTitle('Delete workspace');
    expect(deleteBtns).toHaveLength(mockWorkspaces.length);
  });

  it('shows confirmation modal when delete button is clicked', async () => {
    renderDashboard();
    const deleteBtns = screen.getAllByTitle('Delete workspace');
    fireEvent.click(deleteBtns[0]);
    expect(screen.getAllByText('Delete Workspace').length).toBeGreaterThan(0);
    expect(screen.getByText(/permanently delete/i)).toBeInTheDocument();
  });

  it('shows session count warning in confirmation modal', async () => {
    renderDashboard();
    const deleteBtns = screen.getAllByTitle('Delete workspace');
    fireEvent.click(deleteBtns[0]); // my-react-app has 3 sessions
    expect(screen.getByText(/3 sessions and their history will be deleted/i)).toBeInTheDocument();
  });

  it('calls onDeleteWorkspace with workspace name on confirm', async () => {
    renderDashboard();
    const deleteBtns = screen.getAllByTitle('Delete workspace');
    fireEvent.click(deleteBtns[0]);
    // Click the destructive "Delete Workspace" button inside the modal
    const confirmBtn = screen.getAllByText('Delete Workspace').find(el => el.tagName === 'BUTTON');
    fireEvent.click(confirmBtn!);
    await waitFor(() => {
      expect(onDeleteWorkspace).toHaveBeenCalledWith('my-react-app');
    });
  });

  it('closes modal on cancel without calling onDeleteWorkspace', async () => {
    renderDashboard();
    const deleteBtns = screen.getAllByTitle('Delete workspace');
    fireEvent.click(deleteBtns[0]);
    expect(screen.getByText(/permanently delete/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/permanently delete/i)).not.toBeInTheDocument();
    expect(onDeleteWorkspace).not.toHaveBeenCalled();
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

describe('Dashboard — Git auth UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const onRefresh = vi.fn();
  const onViewSessions = vi.fn();
  const onCreateWorkspace = vi.fn().mockResolvedValue(undefined);
  const onDeleteWorkspace = vi.fn().mockResolvedValue(undefined);

  const mockWorkspace: WorkspaceInfo = {
    name: 'test-repo',
    sessionCount: 0,
    runningContainerCount: 0,
    totalCostUsd: null,
    lastActivityAt: null,
  };

  function renderWithGitInfo(credInfo: object) {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes('/status')) return { branch: 'main', remoteUrl: 'https://github.com/user/repo.git' };
      if (url.includes('/credentials')) return credInfo;
      if (url.includes('/apps')) return [];
      return {};
    });
    render(
      <Dashboard
        workspaces={[mockWorkspace]}
        onRefresh={onRefresh}
        onViewSessions={onViewSessions}
        onCreateWorkspace={onCreateWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
      />
    );
  }

  it('fetches git status and credentials on mount', async () => {
    renderWithGitInfo({ configured: false });
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/git/test-repo/status');
      expect(apiFetch).toHaveBeenCalledWith('/git/test-repo/credentials');
    });
  });

  it('shows Auth badge (unconfigured) when no credentials saved', async () => {
    renderWithGitInfo({ configured: false });
    await waitFor(() => {
      expect(screen.getByText('Auth')).toBeInTheDocument();
    });
  });

  it('shows provider label badge when credentials are configured', async () => {
    renderWithGitInfo({ configured: true, provider: 'github', username: 'alice' });
    await waitFor(() => {
      // Auth badge shows "GitHub" as the provider label (the Lock button)
      const authBadge = screen.getAllByText(/GitHub/i).find(
        el => el.tagName === 'BUTTON' || el.closest('button') !== null
      );
      expect(authBadge).toBeDefined();
    });
  });

  it('Push button triggers POST to push endpoint', async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string, opts?: any) => {
      if (url.includes('/status')) return { branch: 'main', remoteUrl: 'https://github.com/user/repo.git' };
      if (url.includes('/credentials')) return { configured: true, provider: 'github', username: 'alice' };
      if (url.includes('/push') && opts?.method === 'POST') return { ok: true };
      if (url.includes('/apps')) return [];
      return {};
    });

    render(
      <Dashboard
        workspaces={[mockWorkspace]}
        onRefresh={onRefresh}
        onViewSessions={onViewSessions}
        onCreateWorkspace={onCreateWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
      />
    );

    await waitFor(() => screen.getByText('Push'));
    fireEvent.click(screen.getByText('Push'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/git/test-repo/push', expect.objectContaining({ method: 'POST' }));
    });
  });

  it('shows Provider select and token input in auth configure panel', async () => {
    renderWithGitInfo({ configured: false });
    await waitFor(() => screen.getByText('Auth'));

    // Click the Auth badge to open configure panel
    fireEvent.click(screen.getByText('Auth'));

    await waitFor(() => {
      expect(screen.getByText('Provider')).toBeInTheDocument();
      expect(screen.getByText('Personal Access Token')).toBeInTheDocument();
    });
  });

  it('calls POST credentials when Save Credentials is clicked', async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string, opts?: any) => {
      if (url.includes('/status')) return { branch: 'main', remoteUrl: 'https://github.com/user/repo.git' };
      if (url.includes('/credentials') && !opts) return { configured: false };
      if (url.includes('/credentials') && opts?.method === 'POST') return { ok: true };
      if (url.includes('/apps')) return [];
      return {};
    });

    render(
      <Dashboard
        workspaces={[mockWorkspace]}
        onRefresh={onRefresh}
        onViewSessions={onViewSessions}
        onCreateWorkspace={onCreateWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
      />
    );

    await waitFor(() => screen.getByText('Auth'));
    fireEvent.click(screen.getByText('Auth'));

    // GitHub Personal Access Token placeholder
    await waitFor(() => screen.getByPlaceholderText(/Personal Access Token/i));
    fireEvent.change(screen.getByPlaceholderText(/Personal Access Token/i), {
      target: { value: 'ghp_mytesttoken' },
    });

    fireEvent.click(screen.getByText('Save Credentials'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/git/test-repo/credentials',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});

describe('Dashboard — CreateWorkspacePanel auth toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({ branch: 'main', remoteUrl: null });
  });

  const renderDashboard = () =>
    render(
      <Dashboard
        workspaces={[]}
        onRefresh={vi.fn()}
        onViewSessions={vi.fn()}
        onCreateWorkspace={vi.fn().mockResolvedValue(undefined)}
        onDeleteWorkspace={vi.fn().mockResolvedValue(undefined)}
      />
    );

  it('shows auth toggle in Clone Repo tab', async () => {
    renderDashboard();
    fireEvent.click(screen.getByText('New Workspace'));
    fireEvent.click(screen.getByText('Clone Repo'));
    await waitFor(() => {
      expect(screen.getByText(/Add authentication/i)).toBeInTheDocument();
    });
  });

  it('reveals GitAuthFields when auth toggle is clicked in Clone tab', async () => {
    renderDashboard();
    fireEvent.click(screen.getByText('New Workspace'));
    fireEvent.click(screen.getByText('Clone Repo'));

    await waitFor(() => screen.getByText(/Add authentication/i));
    fireEvent.click(screen.getByText(/Add authentication/i));

    await waitFor(() => {
      expect(screen.getByText('Provider')).toBeInTheDocument();
      expect(screen.getByText('Personal Access Token')).toBeInTheDocument();
    });
  });
});

describe('Dashboard — CreateWorkspacePanel template selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({ branch: 'main', remoteUrl: null });
  });

  it('template dropdown renders in New Repo tab', async () => {
    render(
      <Dashboard
        workspaces={[]}
        onRefresh={vi.fn()}
        onViewSessions={vi.fn()}
        onCreateWorkspace={vi.fn().mockResolvedValue(undefined)}
        onDeleteWorkspace={vi.fn().mockResolvedValue(undefined)}
      />
    );
    fireEvent.click(screen.getByText('New Workspace'));
    await waitFor(() => {
      expect(screen.getByDisplayValue('None')).toBeInTheDocument();
    });
  });

  it('selecting python template passes template to onCreateWorkspace', async () => {
    const onCreateWorkspace = vi.fn().mockResolvedValue(undefined);
    render(
      <Dashboard
        workspaces={[]}
        onRefresh={vi.fn()}
        onViewSessions={vi.fn()}
        onCreateWorkspace={onCreateWorkspace}
        onDeleteWorkspace={vi.fn().mockResolvedValue(undefined)}
      />
    );
    fireEvent.click(screen.getByText('New Workspace'));
    await waitFor(() => screen.getByDisplayValue('None'));

    fireEvent.change(screen.getByDisplayValue('None'), { target: { value: 'python' } });

    const nameInput = screen.getByPlaceholderText('my-project');
    fireEvent.change(nameInput, { target: { value: 'my-python-app' } });
    fireEvent.click(screen.getByText('Create Workspace'));

    await waitFor(() => {
      expect(onCreateWorkspace).toHaveBeenCalledWith(
        'my-python-app',
        expect.objectContaining({ template: 'python' })
      );
    });
  });

  it('none template does not pass template field to onCreateWorkspace', async () => {
    const onCreateWorkspace = vi.fn().mockResolvedValue(undefined);
    render(
      <Dashboard
        workspaces={[]}
        onRefresh={vi.fn()}
        onViewSessions={vi.fn()}
        onCreateWorkspace={onCreateWorkspace}
        onDeleteWorkspace={vi.fn().mockResolvedValue(undefined)}
      />
    );
    fireEvent.click(screen.getByText('New Workspace'));
    await waitFor(() => screen.getByDisplayValue('None'));

    const nameInput = screen.getByPlaceholderText('my-project');
    fireEvent.change(nameInput, { target: { value: 'plain-app' } });
    fireEvent.click(screen.getByText('Create Workspace'));

    await waitFor(() => {
      const call = onCreateWorkspace.mock.calls[0];
      expect(call[1]?.template).toBeUndefined();
    });
  });
});
