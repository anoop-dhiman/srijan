import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../lib/api';
import { Dashboard } from '../components/Dashboard';

const mockContainers = [
  {
    Id: 'abc123def456',
    Names: ['/my-app'],
    Image: 'my-app:latest',
    State: 'running',
    Status: 'Up 5 minutes',
    Ports: [{ PublicPort: 8080, PrivatePort: 3000, Type: 'tcp' }],
  },
  {
    Id: 'def789ghi012',
    Names: ['/stopped-app'],
    Image: 'stopped:latest',
    State: 'exited',
    Status: 'Exited (0) 2 hours ago',
    Ports: [],
  },
];

const mockApps = [
  { id: 'app-1', name: 'my-app', path: '/myapp', port: 8080, container_id: 'abc123def456', status: 'running' },
];

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    render(<Dashboard />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders containers after loading', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(mockContainers)
      .mockResolvedValueOnce(mockApps);

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('my-app')).toBeInTheDocument();
    });
    expect(screen.getByText('stopped-app')).toBeInTheDocument();
  });

  it('shows app URL for matched containers', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(mockContainers)
      .mockResolvedValueOnce(mockApps);

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('/myapp')).toBeInTheDocument();
    });
  });

  it('shows empty message when no containers', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('No containers found.')).toBeInTheDocument();
    });
  });

  it('shows error message when API fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Docker unavailable'));

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Docker unavailable')).toBeInTheDocument();
    });
  });

  it('renders App Dashboard heading', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    render(<Dashboard />);
    expect(screen.getByText('App Dashboard')).toBeInTheDocument();
  });
});
