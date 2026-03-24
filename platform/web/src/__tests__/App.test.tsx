import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock dependencies before importing App
vi.mock('../lib/api', () => ({
  isAuthenticated: vi.fn(),
  logout: vi.fn(),
  apiFetch: vi.fn().mockResolvedValue({ name: 'test', path: '/tmp/test' }),
  getCurrentUser: vi.fn().mockReturnValue({ userId: 'u1', username: 'admin', role: 'admin' }),
}));

vi.mock('../hooks/useChat', () => ({
  useChat: vi.fn(),
}));

vi.mock('../components/Chat', () => ({
  Chat: ({ onReplaySession }: { onReplaySession?: (id: string) => void }) => (
    <div data-testid="chat">
      <button onClick={() => onReplaySession?.('sess-1')}>Replay</button>
    </div>
  ),
  __esModule: true,
}));

vi.mock('../components/Settings', () => ({
  Settings: ({ open, isAdmin }: { open: boolean; isAdmin?: boolean }) =>
    open ? <div data-testid="settings-panel" data-is-admin={isAdmin} /> : null,
}));

vi.mock('../components/Login', () => ({
  Login: ({ onLogin }: { onLogin: () => void }) => (
    <button data-testid="login" onClick={onLogin}>Login</button>
  ),
}));

vi.mock('../components/Dashboard', () => ({
  Dashboard: ({ onCreateWorkspace }: { onCreateWorkspace?: (name: string) => Promise<void> }) => (
    <div data-testid="dashboard">
      <button onClick={() => onCreateWorkspace?.('new-ws')}>Create</button>
    </div>
  ),
}));

vi.mock('../components/FileBrowser', () => ({
  FileBrowser: () => <div data-testid="file-browser" />,
}));

vi.mock('../components/SessionRecording', () => ({
  SessionRecording: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="session-recording">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('../components/MobileNav', () => ({
  MobileNav: ({ activeView, onViewChange }: { activeView: string; onViewChange: (v: string) => void }) => (
    <nav role="navigation" aria-label="Mobile navigation" data-testid="mobile-nav" data-active-view={activeView}>
      <button onClick={() => onViewChange('dashboard')}>Dashboard</button>
      <button onClick={() => onViewChange('chat')}>Chat</button>
      <button onClick={() => onViewChange('files')}>Files</button>
      <button onClick={() => onViewChange('terminal')}>Terminal</button>
      <button onClick={() => onViewChange('settings')}>Settings</button>
    </nav>
  ),
}));

import { isAuthenticated, logout, getCurrentUser } from '../lib/api';
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
  abortSession: vi.fn(),
  updatePlanStep: vi.fn(),
  activeRole: null,
  agents: [],
  createAgent: vi.fn(),
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

    it('renders the Dashboard component by default', () => {
      render(<App />);
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
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

  describe('dashboard as primary page', () => {
    beforeEach(() => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });

    it('shows Dashboard when no workspaces exist', () => {
      vi.mocked(useChat).mockReturnValue({ ...mockChat, workspaces: [] });
      render(<App />);
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
    });

    it('shows Dashboard by default when workspaces exist', () => {
      render(<App />);
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
    });

    it('shows Chat when Chat tab is clicked', () => {
      render(<App />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Chat' })[0]);
      expect(screen.getByTestId('chat')).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
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
    it('switches from Login to Dashboard after onLogin is called', async () => {
      vi.mocked(isAuthenticated).mockReturnValueOnce(false);
      render(<App />);
      expect(screen.getByTestId('login')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('login'));

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      });
    });
  });

  describe('username from token', () => {
    beforeEach(() => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });

    it('shows username from getCurrentUser', () => {
      vi.mocked(getCurrentUser).mockReturnValue({ userId: 'u1', username: 'alice', role: 'user' });
      render(<App />);
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    it('passes isAdmin=true to Settings when role is admin', () => {
      vi.mocked(getCurrentUser).mockReturnValue({ userId: 'u1', username: 'admin', role: 'admin' });
      render(<App />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
      const settingsPanel = screen.getByTestId('settings-panel');
      expect(settingsPanel.getAttribute('data-is-admin')).toBe('true');
    });
  });

  describe('Files tab', () => {
    beforeEach(() => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });

    it('Files tab is in the nav', () => {
      render(<App />);
      expect(screen.getAllByRole('button', { name: 'Files' }).length).toBeGreaterThan(0);
    });

    it('switches to FileBrowser when Files tab is clicked', () => {
      render(<App />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Files' })[0]);
      expect(screen.getByTestId('file-browser')).toBeInTheDocument();
    });
  });

  describe('MobileNav', () => {
    beforeEach(() => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });

    it('renders MobileNav in the DOM', () => {
      render(<App />);
      expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
    });

    it('MobileNav has role="navigation"', () => {
      render(<App />);
      const mobileNav = screen.getByTestId('mobile-nav');
      expect(mobileNav).toHaveAttribute('role', 'navigation');
    });

    it('MobileNav reflects the active view', () => {
      render(<App />);
      const mobileNav = screen.getByTestId('mobile-nav');
      expect(mobileNav).toHaveAttribute('data-active-view', 'dashboard');
    });
  });

  describe('session recording', () => {
    beforeEach(() => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });

    it('shows SessionRecording when replay is triggered from Chat', () => {
      render(<App />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Chat' })[0]);
      const replayBtn = screen.getByText('Replay');
      fireEvent.click(replayBtn);
      expect(screen.getByTestId('session-recording')).toBeInTheDocument();
    });

    it('returns to chat view when SessionRecording is closed', () => {
      render(<App />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Chat' })[0]);
      fireEvent.click(screen.getByText('Replay'));
      expect(screen.getByTestId('session-recording')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Close'));
      expect(screen.getByTestId('chat')).toBeInTheDocument();
    });
  });
});
