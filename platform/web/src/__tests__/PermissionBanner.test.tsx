import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionBanner } from '../components/PermissionBanner';

describe('PermissionBanner', () => {
  it('renders nothing when sessionId is null', () => {
    const { container } = render(
      <PermissionBanner sessionId={null} onSendApproval={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner when sessionId is provided', () => {
    render(<PermissionBanner sessionId="session-1" onSendApproval={vi.fn()} />);
    expect(screen.getByText('Agent awaiting your approval')).toBeInTheDocument();
    expect(screen.getByText(/Review the agent/)).toBeInTheDocument();
  });

  it('renders Approve and Deny buttons', () => {
    render(<PermissionBanner sessionId="session-1" onSendApproval={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
  });

  it('calls onSendApproval with "Approved" when Approve is clicked', () => {
    const onSendApproval = vi.fn();
    render(<PermissionBanner sessionId="session-1" onSendApproval={onSendApproval} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onSendApproval).toHaveBeenCalledWith('Approved');
  });

  it('calls onSendApproval with "Denied" when Deny is clicked', () => {
    const onSendApproval = vi.fn();
    render(<PermissionBanner sessionId="session-1" onSendApproval={onSendApproval} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onSendApproval).toHaveBeenCalledWith('Denied');
  });

  it('applies amber styling to the banner', () => {
    const { container } = render(
      <PermissionBanner sessionId="session-1" onSendApproval={vi.fn()} />
    );
    const banner = container.firstChild as HTMLElement;
    expect(banner.className).toContain('amber');
  });
});
