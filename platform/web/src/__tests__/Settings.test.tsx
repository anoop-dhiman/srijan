import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from '../components/Settings';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../lib/api';

describe('Settings', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue([]);
  });

  it('does not render when open=false', () => {
    render(<Settings open={false} onClose={mockOnClose} />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('renders when open=true', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    });
  });

  it('renders LLM Provider and Secrets sections', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => {
      expect(screen.getByText('LLM Provider')).toBeInTheDocument();
      expect(screen.getByText('Secrets')).toBeInTheDocument();
    });
  });

  it('closes when X button is clicked', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    // The close button is the only button in the header row (next to the heading)
    const heading = screen.getByRole('heading', { name: 'Settings' });
    const closeBtn = heading.parentElement!.querySelector('button')!;
    await userEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes when backdrop is clicked', async () => {
    const { container } = render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('does not close when modal body is clicked', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    const modal = document.querySelector('.bg-background') as HTMLElement;
    fireEvent.click(modal);
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('toggles API key visibility', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    const apiKeyInput = screen.getByPlaceholderText('sk-ant-...') as HTMLInputElement;
    expect(apiKeyInput.type).toBe('password');

    // Click the eye toggle button (sibling of the input)
    const toggleBtn = apiKeyInput.parentElement!.querySelector('button')!;
    await userEvent.click(toggleBtn);
    expect(apiKeyInput.type).toBe('text');

    await userEvent.click(toggleBtn);
    expect(apiKeyInput.type).toBe('password');
  });

  it('calls apiFetch to load config on open', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/config') return Promise.resolve({ llm: { apiKey: 'sk-test', model: 'claude-sonnet-4-6' } });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/config');
      expect(apiFetch).toHaveBeenCalledWith('/secrets');
    });
  });

  it('populates API key and model from loaded config', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/config') return Promise.resolve({ llm: { apiKey: 'sk-ant-loaded', model: 'claude-opus-4-6' } });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText('sk-ant-...') as HTMLInputElement;
      expect(input.value).toBe('sk-ant-loaded');
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('claude-opus-4-6');
    });
  });

  it('saves config when Save is clicked', async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    await userEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/config/llm', expect.objectContaining({ method: 'PUT' }));
    });
  });

  it('shows success message after saving', async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    await userEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved')).toBeInTheDocument();
    });
  });

  it('renders existing secrets', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/secrets') return Promise.resolve([
        { id: 'sec-1', name: 'MY_SECRET', created_at: '2024-01-01' },
      ]);
      return Promise.resolve({});
    });

    render(<Settings open={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('MY_SECRET')).toBeInTheDocument();
    });
  });

  it('adds a secret when Name + Value filled and Add Secret clicked', async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    await userEvent.type(screen.getByPlaceholderText('Name'), 'API_TOKEN');
    await userEvent.type(screen.getByPlaceholderText('Value'), 'secret-value');
    await userEvent.click(screen.getByText('Add Secret'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/secrets', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'API_TOKEN', value: 'secret-value' }),
      }));
    });
  });

  it('Add Secret button is disabled when fields are empty', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    const addBtn = screen.getByText('Add Secret').closest('button')!;
    expect(addBtn).toBeDisabled();
  });

  it('secrets add row uses flex-col on mobile (stacks vertically)', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    const nameInput = screen.getByPlaceholderText('Name');
    const row = nameInput.closest('div')!;
    expect(row.className).toContain('flex-col');
  });

  it('deletes a secret when trash button clicked', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string, opts?: any) => {
      if (path === '/secrets' && !opts) return Promise.resolve([{ id: 'sec-1', name: 'MY_SECRET', created_at: '2024-01-01' }]);
      if (path === '/secrets/sec-1') return Promise.resolve({});
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByText('MY_SECRET'));

    const trashBtn = screen.getByText('MY_SECRET').closest('div')!.querySelector('button')!;
    await userEvent.click(trashBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/secrets/sec-1', { method: 'DELETE' });
    });
  });
});
