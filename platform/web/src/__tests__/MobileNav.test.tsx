import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileNav } from '../components/MobileNav';

describe('MobileNav', () => {
  it('renders a navigation element', () => {
    render(<MobileNav activeView="dashboard" onViewChange={vi.fn()} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('renders all 5 nav items', () => {
    render(<MobileNav activeView="dashboard" onViewChange={vi.fn()} />);
    expect(screen.getByLabelText('Dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Chat')).toBeInTheDocument();
    expect(screen.getByLabelText('Files')).toBeInTheDocument();
    expect(screen.getByLabelText('Terminal')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });

  it('calls onViewChange with "chat" when Chat is clicked', () => {
    const onViewChange = vi.fn();
    render(<MobileNav activeView="dashboard" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByLabelText('Chat'));
    expect(onViewChange).toHaveBeenCalledWith('chat');
  });

  it('calls onViewChange with "dashboard" when Dashboard is clicked', () => {
    const onViewChange = vi.fn();
    render(<MobileNav activeView="chat" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByLabelText('Dashboard'));
    expect(onViewChange).toHaveBeenCalledWith('dashboard');
  });

  it('calls onViewChange with "files" when Files is clicked', () => {
    const onViewChange = vi.fn();
    render(<MobileNav activeView="dashboard" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByLabelText('Files'));
    expect(onViewChange).toHaveBeenCalledWith('files');
  });

  it('calls onViewChange with "terminal" when Terminal is clicked', () => {
    const onViewChange = vi.fn();
    render(<MobileNav activeView="dashboard" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByLabelText('Terminal'));
    expect(onViewChange).toHaveBeenCalledWith('terminal');
  });

  it('calls onViewChange with "settings" when Settings is clicked', () => {
    const onViewChange = vi.fn();
    render(<MobileNav activeView="dashboard" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByLabelText('Settings'));
    expect(onViewChange).toHaveBeenCalledWith('settings');
  });

  it('active item has aria-current="page"', () => {
    render(<MobileNav activeView="chat" onViewChange={vi.fn()} />);
    expect(screen.getByLabelText('Chat')).toHaveAttribute('aria-current', 'page');
  });

  it('inactive items do not have aria-current', () => {
    render(<MobileNav activeView="chat" onViewChange={vi.fn()} />);
    expect(screen.getByLabelText('Dashboard')).not.toHaveAttribute('aria-current');
    expect(screen.getByLabelText('Files')).not.toHaveAttribute('aria-current');
  });

  it('active item has primary color class', () => {
    render(<MobileNav activeView="dashboard" onViewChange={vi.fn()} />);
    const dashBtn = screen.getByLabelText('Dashboard');
    expect(dashBtn.className).toContain('text-primary');
  });

  it('inactive item has muted color class', () => {
    render(<MobileNav activeView="dashboard" onViewChange={vi.fn()} />);
    const chatBtn = screen.getByLabelText('Chat');
    expect(chatBtn.className).toContain('text-muted-foreground');
  });
});
