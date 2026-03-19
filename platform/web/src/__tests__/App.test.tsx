import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock dependencies before importing App
vi.mock('../lib/api', () => ({
  isAuthenticated: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../hooks/useChat', () => ({
  useChat: vi.fn(),
}));

vi.mock('../components/Chat', () => ({
  Chat: () => <div data-testid="chat" />,
}));

vi.mock('../components/Settings', () => ({
  Settings: ({ open }: { open: boolean }) =>
    open ? <div data-testid="settings-modal" /> : null,
}));

vi.mock('../components/Login', () => ({
  Login: ({ onLogin }: { onLogin: () => void }) => (
    <button data-testid="login" onClick={onLogin}>Login</button>
  ),
}));

import { isAuthenticated, logout } from '../lib/api';
import { useChat } from '../hooks/useChat';
import App from '../App';

const mockChat = {
  messages: [],
  sessions: [],
  currentSession: null,
  isConnected: true,
  isLoading: false,
  agentStatus: '',
  sessionCosts: {},
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

    it('renders the Chat component', () => {
      render(<App />);
      expect(screen.getByTestId('chat')).toBeInTheDocument();
    });

    it('connects WebSocket on mount', () => {
      render(<App />);
      expect(mockChat.connect).toHaveBeenCalled();
    });
  });

  describe('settings modal', () => {
    beforeEach(() => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });

    it('settings modal is not shown by default', () => {
      render(<App />);
      expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
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
