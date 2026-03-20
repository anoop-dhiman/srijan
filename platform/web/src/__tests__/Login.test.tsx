import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from '../components/Login';

// Mock the api module
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  setToken: vi.fn(),
}));

import { apiFetch, setToken } from '../lib/api';

describe('Login', () => {
  const mockOnLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render login form', () => {
    render(<Login onLogin={mockOnLogin} />);
    expect(screen.getByText('Srijan')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('should disable button when fields are empty', () => {
    render(<Login onLogin={mockOnLogin} />);
    const button = screen.getByText('Sign In');
    expect(button).toBeDisabled();
  });

  it('should enable button when both username and password are entered', async () => {
    render(<Login onLogin={mockOnLogin} />);
    await userEvent.type(screen.getByPlaceholderText('Username'), 'admin');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'secret');
    const button = screen.getByText('Sign In');
    expect(button).not.toBeDisabled();
  });

  it('should call onLogin on successful login (no TOTP)', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ token: 'test-jwt-token' });

    render(<Login onLogin={mockOnLogin} />);
    await userEvent.type(screen.getByPlaceholderText('Username'), 'admin');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'admin');
    await userEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'admin' }),
      });
      expect(setToken).toHaveBeenCalledWith('test-jwt-token');
      expect(mockOnLogin).toHaveBeenCalled();
    });
  });

  it('should show TOTP step when requires_totp returned', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      requires_totp: true,
      challenge_token: 'challenge-abc',
    });

    render(<Login onLogin={mockOnLogin} />);
    await userEvent.type(screen.getByPlaceholderText('Username'), 'admin');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'admin');
    await userEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
      expect(screen.getByText('Verify')).toBeInTheDocument();
    });

    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('should call totp/verify with challenge token and code', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ requires_totp: true, challenge_token: 'challenge-abc' })
      .mockResolvedValueOnce({ token: 'full-jwt-token' });

    render(<Login onLogin={mockOnLogin} />);
    await userEvent.type(screen.getByPlaceholderText('Username'), 'admin');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'admin');
    await userEvent.click(screen.getByText('Sign In'));

    await waitFor(() => screen.getByPlaceholderText('000000'));
    await userEvent.type(screen.getByPlaceholderText('000000'), '123456');
    await userEvent.click(screen.getByText('Verify'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/auth/totp/verify', {
        method: 'POST',
        body: JSON.stringify({ challenge_token: 'challenge-abc', code: '123456' }),
      });
      expect(setToken).toHaveBeenCalledWith('full-jwt-token');
      expect(mockOnLogin).toHaveBeenCalled();
    });
  });

  it('should show error on failed TOTP verification', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ requires_totp: true, challenge_token: 'challenge-abc' })
      .mockRejectedValueOnce(new Error('Invalid TOTP code'));

    render(<Login onLogin={mockOnLogin} />);
    await userEvent.type(screen.getByPlaceholderText('Username'), 'admin');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'admin');
    await userEvent.click(screen.getByText('Sign In'));

    await waitFor(() => screen.getByPlaceholderText('000000'));
    await userEvent.type(screen.getByPlaceholderText('000000'), '000000');
    await userEvent.click(screen.getByText('Verify'));

    await waitFor(() => {
      expect(screen.getByText('Invalid TOTP code')).toBeInTheDocument();
    });
  });

  it('back button returns to password step', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      requires_totp: true,
      challenge_token: 'challenge-abc',
    });

    render(<Login onLogin={mockOnLogin} />);
    await userEvent.type(screen.getByPlaceholderText('Username'), 'admin');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'admin');
    await userEvent.click(screen.getByText('Sign In'));

    await waitFor(() => screen.getByText('Back to password'));
    await userEvent.click(screen.getByText('Back to password'));

    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument();
  });

  it('should show error on failed login', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Invalid credentials'));

    render(<Login onLogin={mockOnLogin} />);
    await userEvent.type(screen.getByPlaceholderText('Username'), 'admin');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong');
    await userEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('should show rate limit message on 429 error', async () => {
    const err = Object.assign(new Error('Too many attempts'), { status: 429 });
    vi.mocked(apiFetch).mockRejectedValueOnce(err);

    render(<Login onLogin={mockOnLogin} />);
    await userEvent.type(screen.getByPlaceholderText('Username'), 'admin');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong');
    await userEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText(/too many login attempts/i)).toBeInTheDocument();
    });
  });
});
