import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionRecording } from '../components/SessionRecording';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../lib/api';

const mockSession = {
  id: 'sess-1',
  title: 'Test Session',
  status: 'completed',
  workspaceName: 'my-app',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T01:00:00.000Z',
};

const mockEvents = [
  {
    id: 1,
    session_id: 'sess-1',
    type: 'user_message',
    data: { content: 'Hello agent!' },
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    session_id: 'sess-1',
    type: 'agent_response',
    data: { content: 'Hello user!', done: true },
    created_at: '2024-01-01T00:00:10.000Z',
  },
  {
    id: 3,
    session_id: 'sess-1',
    type: 'tool_use',
    data: { name: 'Bash', input: { command: 'ls -la' } },
    created_at: '2024-01-01T00:00:05.000Z',
  },
];

describe('SessionRecording', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    render(<SessionRecording sessionId="sess-1" onClose={mockOnClose} />);
    expect(screen.getByText(/Loading recording/i)).toBeInTheDocument();
  });

  it('renders session title in header after load', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      session: mockSession,
      events: mockEvents,
      totalCostUsd: 0.01,
    });

    render(<SessionRecording sessionId="sess-1" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });
  });

  it('renders user messages', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      session: mockSession,
      events: mockEvents,
      totalCostUsd: 0,
    });

    render(<SessionRecording sessionId="sess-1" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Hello agent!')).toBeInTheDocument();
    });
  });

  it('renders agent messages', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      session: mockSession,
      events: mockEvents,
      totalCostUsd: 0,
    });

    render(<SessionRecording sessionId="sess-1" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Hello user!')).toBeInTheDocument();
    });
  });

  it('renders tool use events as pills', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      session: mockSession,
      events: mockEvents,
      totalCostUsd: 0,
    });

    render(<SessionRecording sessionId="sess-1" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Bash/i)).toBeInTheDocument();
    });
  });

  it('shows cost badge when cost > 0', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      session: mockSession,
      events: mockEvents,
      totalCostUsd: 0.0123,
    });

    render(<SessionRecording sessionId="sess-1" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('$0.0123')).toBeInTheDocument();
    });
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Not found'));

    render(<SessionRecording sessionId="sess-1" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load recording/i)).toBeInTheDocument();
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      session: mockSession,
      events: [],
      totalCostUsd: 0,
    });

    render(<SessionRecording sessionId="sess-1" onClose={mockOnClose} />);
    await waitFor(() => screen.getByText('Test Session'));

    await userEvent.click(screen.getByTitle('Close replay'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows read-only replay badge', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      session: mockSession,
      events: [],
      totalCostUsd: 0,
    });

    render(<SessionRecording sessionId="sess-1" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Read-only replay')).toBeInTheDocument();
    });
  });
});
