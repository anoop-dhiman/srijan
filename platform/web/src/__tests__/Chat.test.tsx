import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chat } from '../components/Chat';
import type { ChatMessage, Session } from '../hooks/useChat';

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}));

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const defaultProps = {
  messages: [] as ChatMessage[],
  sessions: [] as Session[],
  currentSession: null,
  isLoading: false,
  agentStatus: '',
  settingsOpen: false,
  sessionCosts: {} as Record<string, number>,
  onSendMessage: vi.fn(),
  onNewSession: vi.fn(),
  onJoinSession: vi.fn(),
  onDeleteSession: vi.fn(),
  onOpenSettings: vi.fn(),
  onCloseSettings: vi.fn(),
};

const mockSession: Session = {
  id: 'session-1',
  title: 'Test Session',
  status: 'active',
  workspaceName: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('Chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sidebar', () => {
    it('renders New Chat button at the top of the sidebar', () => {
      render(<Chat {...defaultProps} />);
      expect(screen.getByText('New Chat')).toBeInTheDocument();
    });

    it('renders Settings button at the bottom of the sidebar', () => {
      render(<Chat {...defaultProps} />);
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('calls onNewSession when New Chat is clicked', async () => {
      render(<Chat {...defaultProps} />);
      await userEvent.click(screen.getByText('New Chat'));
      expect(defaultProps.onNewSession).toHaveBeenCalledOnce();
    });

    it('calls onOpenSettings when Settings button is clicked', async () => {
      render(<Chat {...defaultProps} />);
      await userEvent.click(screen.getByText('Settings'));
      expect(defaultProps.onOpenSettings).toHaveBeenCalledOnce();
    });

    it('renders session list items', () => {
      render(<Chat {...defaultProps} sessions={[mockSession]} />);
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });

    it('calls onJoinSession when a session is clicked', async () => {
      render(<Chat {...defaultProps} sessions={[mockSession]} />);
      await userEvent.click(screen.getByText('Test Session'));
      expect(defaultProps.onJoinSession).toHaveBeenCalledWith('session-1');
    });

    it('applies active styling to the current session', () => {
      render(
        <Chat {...defaultProps} sessions={[mockSession]} currentSession={mockSession} />
      );
      const sessionBtn = screen.getByText('Test Session').closest('button');
      const sessionRow = sessionBtn?.closest('div');
      expect(sessionRow?.className).toContain('bg-background');
      expect(sessionBtn?.className).toContain('text-foreground');
    });

    it('applies muted styling to inactive sessions', () => {
      const otherSession: Session = { ...mockSession, id: 'session-2', title: 'Other Session', workspaceName: null };
      render(
        <Chat {...defaultProps} sessions={[mockSession, otherSession]} currentSession={otherSession} />
      );
      const inactiveBtn = screen.getByText('Test Session').closest('button');
      expect(inactiveBtn?.className).toContain('text-muted-foreground');
    });
  });

  describe('empty state', () => {
    it('shows Srijan heading and description when no messages', () => {
      render(<Chat {...defaultProps} />);
      expect(screen.getByRole('heading', { name: 'Srijan' })).toBeInTheDocument();
      expect(screen.getByText(/tell me what to build/i)).toBeInTheDocument();
    });

    it('hides empty state when messages exist', () => {
      const messages: ChatMessage[] = [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: Date.now() },
      ];
      render(<Chat {...defaultProps} messages={messages} />);
      expect(screen.queryByRole('heading', { name: 'Srijan' })).not.toBeInTheDocument();
    });
  });

  describe('messages', () => {
    it('renders user messages', () => {
      const messages: ChatMessage[] = [
        { id: 'msg-1', role: 'user', content: 'Hello there', timestamp: Date.now() },
      ];
      render(<Chat {...defaultProps} messages={messages} />);
      expect(screen.getByText('Hello there')).toBeInTheDocument();
    });

    it('renders assistant messages with markdown', () => {
      const messages: ChatMessage[] = [
        { id: 'msg-1', role: 'assistant', content: '**Bold response**', timestamp: Date.now() },
      ];
      render(<Chat {...defaultProps} messages={messages} />);
      expect(screen.getByText('**Bold response**')).toBeInTheDocument();
    });

    it('renders system/error messages', () => {
      const messages: ChatMessage[] = [
        { id: 'msg-1', role: 'system', content: 'Something went wrong', timestamp: Date.now() },
      ];
      render(<Chat {...defaultProps} messages={messages} />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  describe('input', () => {
    it('renders the message input placeholder', () => {
      render(<Chat {...defaultProps} />);
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });

    it('send button is disabled when input is empty', () => {
      render(<Chat {...defaultProps} />);
      const submitBtn = document.querySelector('form button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn).toBeDisabled();
    });

    it('send button is enabled when input has text', async () => {
      render(<Chat {...defaultProps} />);
      const textarea = screen.getByPlaceholderText('Type a message...');
      await userEvent.type(textarea, 'hello');
      const submitBtn = document.querySelector('form button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn).not.toBeDisabled();
    });

    it('send button is disabled when isLoading is true', async () => {
      render(<Chat {...defaultProps} isLoading={true} />);
      const textarea = screen.getByPlaceholderText('Type a message...');
      await userEvent.type(textarea, 'hello');
      const submitBtn = document.querySelector('form button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn).toBeDisabled();
    });

    it('calls onSendMessage with trimmed content on submit', async () => {
      render(<Chat {...defaultProps} />);
      const textarea = screen.getByPlaceholderText('Type a message...');
      await userEvent.type(textarea, 'hello world');
      fireEvent.submit(document.querySelector('form')!);
      expect(defaultProps.onSendMessage).toHaveBeenCalledWith('hello world');
    });

    it('Enter key submits the form', async () => {
      render(<Chat {...defaultProps} />);
      const textarea = screen.getByPlaceholderText('Type a message...');
      await userEvent.type(textarea, 'hello');
      await userEvent.keyboard('{Enter}');
      expect(defaultProps.onSendMessage).toHaveBeenCalledWith('hello');
    });

    it('Shift+Enter does not submit the form', async () => {
      render(<Chat {...defaultProps} />);
      const textarea = screen.getByPlaceholderText('Type a message...');
      await userEvent.type(textarea, 'hello');
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
      expect(defaultProps.onSendMessage).not.toHaveBeenCalled();
    });

    it('clears input after submission', async () => {
      render(<Chat {...defaultProps} />);
      const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
      await userEvent.type(textarea, 'hello');
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => {
        expect(textarea.value).toBe('');
      });
    });
  });
});
