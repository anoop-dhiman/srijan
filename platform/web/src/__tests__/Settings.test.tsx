import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from '../components/Settings';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qrcode" data-value={value} />,
}));

import { apiFetch } from '../lib/api';

describe('Settings', () => {
  const mockOnClose = vi.fn();

  const clickNav = (label: string) =>
    userEvent.click(screen.getByRole('button', { name: label }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      return Promise.resolve([]);
    });
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
      expect(screen.getByRole('button', { name: 'AI Provider' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Secrets' })).toBeInTheDocument();
    });
  });

  it('has no close button in the header', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    const heading = screen.getByRole('heading', { name: 'Settings' });
    const closeBtn = heading.parentElement!.querySelector('button');
    expect(closeBtn).toBeNull();
  });

  it('toggles API key visibility', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    const apiKeyInput = screen.getByPlaceholderText('sk-ant-...') as HTMLInputElement;
    expect(apiKeyInput.type).toBe('password');

    const toggleBtn = apiKeyInput.parentElement!.querySelector('button')!;
    await userEvent.click(toggleBtn);
    expect(apiKeyInput.type).toBe('text');

    await userEvent.click(toggleBtn);
    expect(apiKeyInput.type).toBe('password');
  });

  it('calls apiFetch to load config on open', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/config') return Promise.resolve({ llm: { apiKey: 'sk-test', model: 'claude-sonnet-4-6' } });
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
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
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
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
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    await userEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/config/llm', expect.objectContaining({ method: 'PUT' }));
    });
  });

  it('shows success message after saving', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      return Promise.resolve([]);
    });

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
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      return Promise.resolve({});
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await clickNav('Secrets');

    await waitFor(() => {
      expect(screen.getByText('MY_SECRET')).toBeInTheDocument();
    });
  });

  it('adds a secret when Name + Value filled and Add Secret clicked', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await clickNav('Secrets');

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
    await clickNav('Secrets');

    const addBtn = screen.getByText('Add Secret').closest('button')!;
    expect(addBtn).toBeDisabled();
  });

  it('secrets add form renders Name and Value inputs in a labeled grid', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await clickNav('Secrets');

    const nameInput = screen.getByPlaceholderText('Name');
    const valueInput = screen.getByPlaceholderText('Value');
    expect(nameInput).toBeInTheDocument();
    expect(valueInput).toBeInTheDocument();
    const grid = nameInput.closest('.grid')!;
    expect(grid).not.toBeNull();
  });

  it('deletes a secret when trash button clicked', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string, opts?: any) => {
      if (path === '/secrets' && !opts) return Promise.resolve([{ id: 'sec-1', name: 'MY_SECRET', created_at: '2024-01-01' }]);
      if (path === '/secrets/sec-1') return Promise.resolve({});
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await clickNav('Secrets');
    await waitFor(() => screen.getByText('MY_SECRET'));

    const trashBtn = screen.getByText('MY_SECRET').closest('div')!.querySelector('button')!;
    await userEvent.click(trashBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/secrets/sec-1', { method: 'DELETE' });
    });
  });

  // 2FA section tests
  it('renders Two-Factor Authentication section', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await clickNav('Security');
    await waitFor(() => {
      expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
    });
  });

  it('shows Enable 2FA button when TOTP is disabled', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await clickNav('Security');
    await waitFor(() => {
      expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
    });
  });

  it('shows 2FA active status when TOTP is enabled', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: true });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await clickNav('Security');
    await waitFor(() => {
      expect(screen.getByText('2FA is active')).toBeInTheDocument();
      expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
    });
  });

  it('clicking Enable 2FA calls setup endpoint and shows secret', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string, opts?: any) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      if (path === '/auth/totp/setup') return Promise.resolve({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://...' });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await clickNav('Security');
    await waitFor(() => screen.getByText('Enable 2FA'));
    await userEvent.click(screen.getByText('Enable 2FA'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/auth/totp/setup', { method: 'POST' });
      expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
      expect(screen.getByText('Activate')).toBeInTheDocument();
    });
  });

  // LiteLLM section tests
  it('renders LiteLLM Proxy button in provider toggle', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    expect(screen.getByText('LiteLLM Proxy')).toBeInTheDocument();
  });

  it('switching to LiteLLM shows base URL and model fields', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    await userEvent.click(screen.getByText('LiteLLM Proxy'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('http://localhost:4000')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/gpt-4o/)).toBeInTheDocument();
    });
  });

  it('save sends litellm fields when provider is LiteLLM', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    await userEvent.click(screen.getByText('LiteLLM Proxy'));

    await waitFor(() => screen.getByPlaceholderText('http://localhost:4000'));
    await userEvent.type(screen.getByPlaceholderText('http://localhost:4000'), 'http://localhost:4000');
    await userEvent.type(screen.getByPlaceholderText(/gpt-4o/), 'gpt-4o');

    await userEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/config/llm', expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('litellm'),
      }));
    });
  });

  // SDK section tests
  it('renders Agent SDK section in Agent tab', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));

    await userEvent.click(screen.getByRole('button', { name: 'Agent' }));

    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeInTheDocument();
    });
  });

  it('switching to OpenCode and saving calls agentSdk endpoint', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agent' }));

    await waitFor(() => screen.getByText('Claude Code'));

    // OpenCode button — use role query to find the button containing "OpenCode"
    const sdkButtons = screen.getAllByRole('button').filter((btn) =>
      btn.textContent?.includes('OpenCode') && !btn.textContent?.includes('Save')
    );
    expect(sdkButtons.length).toBeGreaterThan(0);
    await userEvent.click(sdkButtons[0]);

    // Click Save SDK button
    await userEvent.click(screen.getByText('Save SDK'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/config/agentSdk', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: 'opencode' }),
      }));
    });
  });

  // Users section tests
  it('does not render Users section when not admin', async () => {
    render(<Settings open={true} onClose={mockOnClose} isAdmin={false} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });

  it('renders Users section when isAdmin=true', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      if (path === '/users') return Promise.resolve([
        { id: 'u1', username: 'admin', role: 'admin', createdAt: '2024-01-01' },
      ]);
      if (path === '/auth/me') return Promise.resolve({ user: { userId: 'u1' } });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} isAdmin={true} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await clickNav('Users');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Users' })).toBeInTheDocument();
      expect(screen.getAllByText('admin').length).toBeGreaterThan(0);
    });
  });

  // Agent mode and system prompt tests
  it('shows Auto and Confirm buttons in Agent tab', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agent' }));

    await waitFor(() => {
      expect(screen.getByText(/Auto \(bypass all\)/)).toBeInTheDocument();
      expect(screen.getByText(/Confirm \(approve each\)/)).toBeInTheDocument();
    });
  });

  it('saving Agent tab sends agentMode to config endpoint', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      if (path === '/config') return Promise.resolve({ agentMode: 'auto' });
      return Promise.resolve([]);
    });

    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agent' }));

    await waitFor(() => screen.getByText(/Confirm \(approve each\)/));
    // Switch to confirm mode
    await userEvent.click(screen.getByText(/Confirm \(approve each\)/));

    // Save Agent settings
    const saveBtn = screen.getByText('Save Agent Settings');
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/config/agentMode', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: 'confirm' }),
      }));
    });
  });

  it('shows system prompt textarea in Agent tab', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agent' }));

    await waitFor(() => {
      // The system prompt and blocklist are both textareas in the Agent section
      const textareas = screen.getAllByRole('textbox');
      expect(textareas.length).toBeGreaterThan(0);
    });
  });

  it('shows blocklist textarea in Agent tab', async () => {
    render(<Settings open={true} onClose={mockOnClose} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agent' }));

    await waitFor(() => {
      // Blocklist is a textarea for comma/newline-separated commands
      const textareas = screen.getAllByRole('textbox');
      expect(textareas.length).toBeGreaterThan(0);
    });
  });

  it('Add User button creates user', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string, opts?: any) => {
      if (path === '/auth/totp/status') return Promise.resolve({ enabled: false });
      if (path === '/users' && !opts) return Promise.resolve([]);
      if (path === '/auth/me') return Promise.resolve({ user: { userId: 'u1' } });
      if (path === '/secrets') return Promise.resolve([]);
      if (path === '/config') return Promise.resolve({});
      return Promise.resolve({ id: 'new-id' });
    });

    render(<Settings open={true} onClose={mockOnClose} isAdmin={true} />);
    await waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
    await clickNav('Users');

    // Find username input in users section (labeled "Username")
    await userEvent.type(screen.getByPlaceholderText('Username'), 'alice');
    // Find password input in users section (labeled "Password")
    const pwdInputs = screen.getAllByPlaceholderText('Password');
    await userEvent.type(pwdInputs[pwdInputs.length - 1], 'secret123');
    await userEvent.click(screen.getByText('Add User'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/users', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'alice', password: 'secret123', role: 'user' }),
      }));
    });
  });
});
