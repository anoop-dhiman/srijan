import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chat } from '../components/Chat';
import type { ChatMessage, Session, WorkspaceInfo, SessionActivity } from '../hooks/useChat';

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}));

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const mockWorkspace: WorkspaceInfo = {
  name: 'my-workspace',
  sessionCount: 0,
  runningContainerCount: 0,
  totalCostUsd: null,
  lastActivityAt: null,
};

const defaultProps = {
  messages: [] as ChatMessage[],
  sessions: [] as Session[],
  currentSession: null,
  isLoading: false,
  agentStatus: '',
  sessionActivity: {} as Record<string, SessionActivity>,
  sessionCosts: {} as Record<string, number>,
  currentWorkspace: 'my-workspace',
  workspaces: [mockWorkspace],
  onSendMessage: vi.fn(),
  onNewSession: vi.fn(),
  onJoinSession: vi.fn(),
  onDeleteSession: vi.fn(),
  onWorkspaceChange: vi.fn(),
  onReplaySession: vi.fn(),
  onGoToDashboard: vi.fn(),
};

const mockSession: Session = {
  id: 'session-1',
  title: 'Test Session',
  status: 'active',
  workspaceName: 'my-workspace',
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

    it('calls onNewSession when New Chat is clicked', async () => {
      render(<Chat {...defaultProps} />);
      await userEvent.click(screen.getByText('New Chat'));
      expect(defaultProps.onNewSession).toHaveBeenCalledOnce();
    });

    it('New Chat is disabled when currentWorkspace is null', () => {
      render(<Chat {...defaultProps} currentWorkspace={null} />);
      const btn = screen.getByText('New Chat').closest('button') as HTMLButtonElement;
      expect(btn).toBeDisabled();
    });

    it('renders session list items for current workspace', () => {
      render(<Chat {...defaultProps} sessions={[mockSession]} />);
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });

    it('hides sessions from other workspaces', () => {
      const otherSession: Session = { ...mockSession, id: 'session-2', title: 'Other WS Session', workspaceName: 'other-ws' };
      render(<Chat {...defaultProps} sessions={[mockSession, otherSession]} />);
      expect(screen.getByText('Test Session')).toBeInTheDocument();
      expect(screen.queryByText('Other WS Session')).not.toBeInTheDocument();
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
      const otherSession: Session = { ...mockSession, id: 'session-2', title: 'Other Session', workspaceName: 'my-workspace' };
      render(
        <Chat {...defaultProps} sessions={[mockSession, otherSession]} currentSession={otherSession} />
      );
      const inactiveBtn = screen.getByText('Test Session').closest('button');
      expect(inactiveBtn?.className).toContain('text-muted-foreground');
    });

    it('shows spinner for loading sessions', () => {
      const activity: Record<string, SessionActivity> = {
        'session-1': { isLoading: true, agentStatus: 'Thinking…', hasUnread: false },
      };
      render(<Chat {...defaultProps} sessions={[mockSession]} sessionActivity={activity} />);
      // Loader2 icon renders as svg sibling to the session button, inside the row div
      const row = screen.getByText('Test Session').closest('button')?.closest('div');
      expect(row?.querySelector('svg.animate-spin')).toBeInTheDocument();
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

  describe('tool messages', () => {
    const toolMsg: ChatMessage = {
      id: 'tool-1',
      role: 'tool',
      content: 'Running: ls -la',
      toolName: 'Bash',
      toolInput: { command: 'ls -la' },
      toolStatus: 'running',
      timestamp: Date.now(),
    };

    it('renders tool message as a pill', () => {
      render(<Chat {...defaultProps} messages={[toolMsg]} currentSession={mockSession} />);
      expect(screen.getByText('Running: ls -la')).toBeInTheDocument();
    });

    it('tool pill expands to show toolInput JSON on click', async () => {
      const msg: ChatMessage = { ...toolMsg, toolInput: { command: 'ls -la' } };
      render(<Chat {...defaultProps} messages={[msg]} currentSession={mockSession} />);

      await userEvent.click(screen.getByText('Running: ls -la'));
      await waitFor(() => {
        // After expand, JSON input block appears with "command" key
        expect(screen.getByText(/"command"/)).toBeInTheDocument();
      });
    });

    it('renders tool message with done status', () => {
      const doneMsg: ChatMessage = { ...toolMsg, toolStatus: 'done', toolResult: 'file.txt\ndir/' };
      render(<Chat {...defaultProps} messages={[doneMsg]} currentSession={mockSession} />);
      expect(screen.getByText('Running: ls -la')).toBeInTheDocument();
    });
  });

  describe('thinking indicator', () => {
    it('shows agentStatus text when isLoading=true and no streaming message', () => {
      render(
        <Chat
          {...defaultProps}
          isLoading={true}
          agentStatus="Thinking…"
          currentSession={mockSession}
        />
      );
      expect(screen.getByText('Thinking…')).toBeInTheDocument();
    });

    it('does not show thinking indicator when not loading', () => {
      render(<Chat {...defaultProps} isLoading={false} agentStatus="" currentSession={mockSession} />);
      expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
    });
  });

  describe('session cost badge', () => {
    it('shows cost badge in sidebar when session has cost > 0', () => {
      const session: Session = { ...mockSession };
      const costs: Record<string, number> = { [mockSession.id]: 0.0123 };
      render(
        <Chat
          {...defaultProps}
          sessions={[session]}
          currentSession={mockSession}
          sessionCosts={costs}
        />
      );
      expect(screen.getByText('$0.0123')).toBeInTheDocument();
    });

    it('does not show cost badge when cost is 0', () => {
      const costs: Record<string, number> = { [mockSession.id]: 0 };
      render(
        <Chat
          {...defaultProps}
          sessions={[mockSession]}
          currentSession={mockSession}
          sessionCosts={costs}
        />
      );
      expect(screen.queryByText(/\$0\.0000/)).not.toBeInTheDocument();
    });
  });

  describe('replay button', () => {
    it('shows replay button in each session row', () => {
      render(
        <Chat {...defaultProps} sessions={[mockSession]} currentSession={mockSession} />
      );
      // Replay button renders as an icon button — look for it by title or find all buttons in row
      const replayBtns = document.querySelectorAll('[title="Replay session"]');
      expect(replayBtns.length).toBeGreaterThan(0);
    });

    it('calls onReplaySession with session id when replay clicked', async () => {
      const onReplaySession = vi.fn();
      render(
        <Chat
          {...defaultProps}
          sessions={[mockSession]}
          currentSession={mockSession}
          onReplaySession={onReplaySession}
        />
      );
      const replayBtn = document.querySelector('[title="Replay session"]') as HTMLElement;
      await userEvent.click(replayBtn);
      expect(onReplaySession).toHaveBeenCalledWith(mockSession.id);
    });
  });

  describe('approval bar (pendingApproval)', () => {
    const pendingActivity: Record<string, SessionActivity> = {
      'session-1': { isLoading: false, agentStatus: '', hasUnread: false, pendingApproval: true },
    };

    it('renders approval bar when pendingApproval is true', () => {
      render(
        <Chat
          {...defaultProps}
          currentSession={mockSession}
          sessionActivity={pendingActivity}
        />
      );
      expect(screen.getByText('Agent is requesting permission to proceed')).toBeInTheDocument();
    });

    it('Approve button calls onSendMessage with "Approved"', async () => {
      const onSendMessage = vi.fn();
      render(
        <Chat
          {...defaultProps}
          currentSession={mockSession}
          sessionActivity={pendingActivity}
          onSendMessage={onSendMessage}
        />
      );
      await userEvent.click(screen.getByText('Approve'));
      expect(onSendMessage).toHaveBeenCalledWith('Approved');
    });

    it('Deny button calls onSendMessage with denial message', async () => {
      const onSendMessage = vi.fn();
      render(
        <Chat
          {...defaultProps}
          currentSession={mockSession}
          sessionActivity={pendingActivity}
          onSendMessage={onSendMessage}
        />
      );
      await userEvent.click(screen.getByText('Deny'));
      expect(onSendMessage).toHaveBeenCalledWith(
        'Denied, please stop and propose an alternative.'
      );
    });

    it('textarea is disabled when pendingApproval is true', () => {
      render(
        <Chat
          {...defaultProps}
          currentSession={mockSession}
          sessionActivity={pendingActivity}
        />
      );
      const textarea = screen.getByPlaceholderText('Approve or deny above before continuing…') as HTMLTextAreaElement;
      expect(textarea).toBeDisabled();
    });
  });
});
