import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock dependencies before importing App
vi.mock('../lib/api', () => ({
  isAuthenticated: vi.fn(),
  logout: vi.fn(),
  apiFetch: vi.fn().mockResolvedValue({ name: 'test', path: '/tmp/test' }),
}));

vi.mock('../hooks/useChat', () => ({
  useChat: vi.fn(),
}));

vi.mock('../components/Chat', () => ({
  Chat: () => <div data-testid="chat" />,
}));

vi.mock('../components/Settings', () => ({
  Settings: ({ open }: { open: boolean }) =>
    open ? <div data-testid="settings-panel" /> : null,
}));

vi.mock('../components/Login', () => ({
  Login: ({ onLogin }: { onLogin: () => void }) => (
    <button data-testid="login" onClick={onLogin}>Login</button>
  ),
}));

vi.mock('../components/Dashboard', () => ({
  Dashboard: () => <div data-testid="dashboard" />,
}));

vi.mock('../components/WorkspaceEmptyState', () => ({
  WorkspaceEmptyState: ({ onCreate }: { onCreate: (name: string) => Promise<void> }) => (
    <div data-testid="workspace-empty-state">
      <button onClick={() => onCreate('new-ws')}>Create</button>
    </div>
  ),
}));

import { isAuthenticated, logout } from '../lib/api';
import { useChat } from '../hooks/useChat';
import App from '../App';

const mockWorkspace = {
  name: 'my-workspace',
  sessionCount: 0,
  runningContainerCount: 0,
  totalCostUsd: null,
  lastActivityAt: null,
};

const mockChat = {
  messages: [],
  sessions: [],
  currentSession: null,
  isConnected: true,
  isLoading: false,
  agentStatus: '',
  sessionActivity: {},
  sessionCosts: {},
  workspaces: [mockWorkspace],
  currentWorkspace: 'my-workspace',
  setCurrentWorkspace: vi.fn(),
  fetchWorkspaces: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn(),
  disconnect: vi.fn(),
  sendMessage: vi.fn(),
  joinSession: vi.fn(),
  newSession: vi.fn(),
  deleteSession: vi.fn(),
};

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useChat).mockReturnValue(mockChat);
  });

  describe('unauthenticated', () => {
    it('renders Login when not authenticated', () => {
      vi.mocked(isAuthenticated).mockReturnValue(false);
      render(<App />);
      expect(screen.getByTestId('login')).toBeInTheDocument();
      expect(screen.queryByText('Srijan')).not.toBeInTheDocument();
    });
  });

  describe('authenticated — global header', () => {
    beforeEach(() => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });

    it('renders the Srijan wordmark in the header', () => {
      render(<App />);
      const header = document.querySelector('header')!;
      expect(header).toContainElement(screen.getByText('Srijan'));
    });

    it('shows Connected status when isConnected=true', () => {
      render(<App />);
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('shows Disconnected status when isConnected=false', () => {
      vi.mocked(useChat).mockReturnValue({ ...mockChat, isConnected: false });
      render(<App />);
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('shows green dot when connected', () => {
      render(<App />);
      const dot = document.querySelector('.bg-green-500');
      expect(dot).toBeInTheDocument();
    });

    it('shows red dot when disconnected', () => {
      vi.mocked(useChat).mockReturnValue({ ...mockChat, isConnected: false });
      render(<App />);
      const dot = document.querySelector('.bg-red-500');
      expect(dot).toBeInTheDocument();
    });

    it('shows admin username', () => {
      render(<App />);
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    it('shows Logout button', () => {
      render(<App />);
      expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    });

    it('calls logout() when Logout is clicked', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
      expect(logout).toHaveBeenCalledOnce();
    });

    it('renders the Chat component by default', () => {
      render(<App />);
      expect(screen.getByTestId('chat')).toBeInTheDocument();
    });

    it('connects WebSocket on mount', () => {
      render(<App />);
      expect(mockChat.connect).toHaveBeenCalled();
    });

    it('renders a theme toggle button in the header', () => {
      render(<App />);
      expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
    });

    it('theme toggle button is in the header', () => {
      render(<App />);
      const header = document.querySelector('header')!;
      expect(header).toContainElement(screen.getByRole('button', { name: 'Toggle theme' }));
    });
  });

  describe('empty workspace state', () => {
    beforeEach(() => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });

    it('shows WorkspaceEmptyState when no workspaces exist', () => {
      vi.mocked(useChat).mockReturnValue({ ...mockChat, workspaces: [] });
      render(<App />);
      expect(screen.getByTestId('workspace-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
    });

    it('shows Chat when workspaces exist', () => {
      render(<App />);
      expect(screen.getByTestId('chat')).toBeInTheDocument();
      expect(screen.queryByTestId('workspace-empty-state')).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    beforeEach(() => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });

    it('switches to Dashboard when Dashboard tab is clicked', () => {
      render(<App />);
      // Both desktop and mobile nav render the same tabs; click the first
      fireEvent.click(screen.getAllByRole('button', { name: 'Dashboard' })[0]);
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
    });

    it('Terminal tab is disabled when no current session', () => {
      render(<App />);
      const terminalBtns = screen.getAllByRole('button', { name: 'Terminal' });
      expect(terminalBtns[0]).toBeDisabled();
    });
  });

  describe('settings', () => {
    beforeEach(() => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });

    it('Settings tab is shown in the header nav', () => {
      render(<App />);
      expect(screen.getAllByRole('button', { name: 'Settings' }).length).toBeGreaterThan(0);
    });

    it('settings panel is not shown by default', () => {
      render(<App />);
      expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();
    });

    it('shows settings panel when Settings tab is clicked', () => {
      render(<App />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
      expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    });
  });

  describe('login flow', () => {
    it('switches from Login to Chat after onLogin is called', async () => {
      vi.mocked(isAuthenticated).mockReturnValueOnce(false);
      render(<App />);
      expect(screen.getByTestId('login')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('login'));

      await waitFor(() => {
        expect(screen.getByTestId('chat')).toBeInTheDocument();
      });
    });
  });
});
