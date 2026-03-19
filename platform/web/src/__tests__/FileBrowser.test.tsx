import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileBrowser } from '../components/FileBrowser';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, options }: any) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      readOnly={options?.readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

import { apiFetch } from '../lib/api';

const mockWorkspaces = [
  { name: 'my-app', sessionCount: 1, runningContainerCount: 0, totalCostUsd: null, lastActivityAt: null },
  { name: 'other-app', sessionCount: 0, runningContainerCount: 0, totalCostUsd: null, lastActivityAt: null },
];

const mockEntries = [
  { name: 'src', type: 'dir', modified: '2024-01-01T00:00:00.000Z' },
  { name: 'README.md', type: 'file', size: 100, modified: '2024-01-01T00:00:00.000Z' },
];

describe('FileBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no workspace selected', () => {
    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace={null} />);
    expect(screen.getByText('Select a workspace to browse files.')).toBeInTheDocument();
  });

  it('shows workspace selector with workspace names', () => {
    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace={null} />);
    expect(screen.getByText('my-app')).toBeInTheDocument();
    expect(screen.getByText('other-app')).toBeInTheDocument();
  });

  it('calls API when workspace is selected', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ entries: mockEntries });
    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace={null} />);

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'my-app');

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/workspaces/my-app/files'));
    });
  });

  it('displays directory and file entries after loading', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ entries: mockEntries });
    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace="my-app" />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
  });

  it('loads file content when a file is clicked', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ entries: mockEntries })
      .mockResolvedValueOnce({ content: '# Hello World' });

    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace="my-app" />);

    await waitFor(() => screen.getByText('README.md'));
    await userEvent.click(screen.getByText('README.md'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/workspaces/my-app/file'));
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });
  });

  it('expands folder when clicked', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ entries: mockEntries })
      .mockResolvedValueOnce({ entries: [{ name: 'index.ts', type: 'file', size: 50, modified: '2024-01-01T00:00:00.000Z' }] });

    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace="my-app" />);

    await waitFor(() => screen.getByText('src'));
    await userEvent.click(screen.getByText('src'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('path=src'));
      expect(screen.getByText('index.ts')).toBeInTheDocument();
    });
  });

  it('shows breadcrumb with workspace and file path when file selected', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ entries: mockEntries })
      .mockResolvedValueOnce({ content: '# Hello' });

    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace="my-app" />);

    await waitFor(() => screen.getByText('README.md'));
    await userEvent.click(screen.getByText('README.md'));

    await waitFor(() => {
      expect(screen.getByText(/my-app.*README\.md/)).toBeInTheDocument();
    });
  });

  it('shows "Select a file" prompt when workspace loaded but no file selected', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ entries: mockEntries });
    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace="my-app" />);

    await waitFor(() => screen.getByText('README.md'));
    expect(screen.getByText(/Select a file/i)).toBeInTheDocument();
  });

  it('shows Edit button after file is loaded', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ entries: mockEntries })
      .mockResolvedValueOnce({ content: 'some content' });

    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace="my-app" />);
    await waitFor(() => screen.getByText('README.md'));
    await userEvent.click(screen.getByText('README.md'));

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
  });

  it('shows Save and Cancel buttons after Edit is clicked', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ entries: mockEntries })
      .mockResolvedValueOnce({ content: 'some content' });

    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace="my-app" />);
    await waitFor(() => screen.getByText('README.md'));
    await userEvent.click(screen.getByText('README.md'));

    await waitFor(() => screen.getByText('Edit'));
    await userEvent.click(screen.getByText('Edit'));

    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls PUT endpoint when Save is clicked', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ entries: mockEntries })
      .mockResolvedValueOnce({ content: 'original' })
      .mockResolvedValueOnce({ ok: true });

    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace="my-app" />);
    await waitFor(() => screen.getByText('README.md'));
    await userEvent.click(screen.getByText('README.md'));

    await waitFor(() => screen.getByText('Edit'));
    await userEvent.click(screen.getByText('Edit'));

    // Edit content in the textarea
    const editor = screen.getByTestId('monaco-editor') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'new content' } });

    await userEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/workspaces/my-app/file'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ content: 'new content' }),
        })
      );
    });
  });

  it('Cancel in edit mode (clean) reverts without confirm', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ entries: mockEntries })
      .mockResolvedValueOnce({ content: 'original' });

    render(<FileBrowser workspaces={mockWorkspaces} currentWorkspace="my-app" />);
    await waitFor(() => screen.getByText('README.md'));
    await userEvent.click(screen.getByText('README.md'));

    await waitFor(() => screen.getByText('Edit'));
    await userEvent.click(screen.getByText('Edit'));
    await userEvent.click(screen.getByText('Cancel'));

    // Should be back to view mode
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });
});
