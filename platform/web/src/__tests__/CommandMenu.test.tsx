import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandMenu } from '../components/CommandMenu';
import type { SlashCommand } from '../hooks/useSlashCommands';

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const mockCommands: SlashCommand[] = [
  { name: 'clear', description: 'Clear all messages', type: 'builtin', action: vi.fn() },
  { name: 'compact', description: 'Compact the conversation', type: 'builtin', action: vi.fn() },
  { name: 'new', description: 'Start a new session', type: 'builtin', action: vi.fn() },
  { name: 'help', description: 'Show available commands', type: 'builtin', action: vi.fn() },
];

describe('CommandMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all provided commands', () => {
    render(
      <CommandMenu
        commands={mockCommands}
        selectedIndex={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('/clear')).toBeInTheDocument();
    expect(screen.getByText('/compact')).toBeInTheDocument();
    expect(screen.getByText('/new')).toBeInTheDocument();
    expect(screen.getByText('/help')).toBeInTheDocument();
  });

  it('shows command descriptions', () => {
    render(
      <CommandMenu
        commands={mockCommands}
        selectedIndex={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Clear all messages')).toBeInTheDocument();
  });

  it('highlights the selected command', () => {
    render(
      <CommandMenu
        commands={mockCommands}
        selectedIndex={1}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const items = screen.getAllByRole('option');
    expect(items[1].getAttribute('aria-selected')).toBe('true');
    expect(items[0].getAttribute('aria-selected')).toBe('false');
  });

  it('calls onSelect with the clicked command', () => {
    const onSelect = vi.fn();
    render(
      <CommandMenu
        commands={mockCommands}
        selectedIndex={0}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getAllByRole('option')[2]); // /new
    expect(onSelect).toHaveBeenCalledWith(mockCommands[2]);
  });

  it('renders nothing when commands list is empty', () => {
    const { container } = render(
      <CommandMenu commands={[]} selectedIndex={0} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a listbox with accessible label', () => {
    render(
      <CommandMenu
        commands={mockCommands}
        selectedIndex={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('listbox', { name: 'Slash commands' })).toBeInTheDocument();
  });
});
