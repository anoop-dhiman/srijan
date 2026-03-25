import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSlashCommands } from '../hooks/useSlashCommands';
import type { SlashCommandContext } from '../hooks/useSlashCommands';

function makeContext(overrides: Partial<SlashCommandContext> = {}): SlashCommandContext {
  return {
    clearMessages: vi.fn(),
    sendMessage: vi.fn(),
    newSession: vi.fn(),
    setInput: vi.fn(),
    ...overrides,
  };
}

describe('useSlashCommands', () => {
  let context: SlashCommandContext;

  beforeEach(() => {
    context = makeContext();
  });

  it('menu is closed by default', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    expect(result.current.menuOpen).toBe(false);
  });

  it('opens menu when handleInputChange receives "/" prefix', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => {
      result.current.handleInputChange('/');
    });
    expect(result.current.menuOpen).toBe(true);
  });

  it('closes menu when handleInputChange receives non-slash input', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => {
      result.current.handleInputChange('/');
    });
    expect(result.current.menuOpen).toBe(true);
    act(() => {
      result.current.handleInputChange('hello');
    });
    expect(result.current.menuOpen).toBe(false);
  });

  it('filters commands by query', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => {
      result.current.handleInputChange('/cl');
    });
    expect(result.current.filteredCommands.length).toBe(1);
    expect(result.current.filteredCommands[0].name).toBe('clear');
  });

  it('shows all commands for empty query "/"', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => {
      result.current.handleInputChange('/');
    });
    expect(result.current.filteredCommands.length).toBe(4);
  });

  it('returns empty filteredCommands for non-matching query', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => {
      result.current.handleInputChange('/zzz');
    });
    expect(result.current.filteredCommands.length).toBe(0);
  });

  it('/clear command selection completes to /clear in input', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => { result.current.handleInputChange('/'); });
    const clearCmd = result.current.filteredCommands.find((c) => c.name === 'clear');
    act(() => { result.current.selectCommand(clearCmd!); });
    expect(context.setInput).toHaveBeenCalledWith('/clear ');
    expect(context.clearMessages).not.toHaveBeenCalled();
  });

  it('/compact command selection completes to /compact in input', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => { result.current.handleInputChange('/'); });
    const compactCmd = result.current.filteredCommands.find((c) => c.name === 'compact');
    act(() => { result.current.selectCommand(compactCmd!); });
    expect(context.setInput).toHaveBeenCalledWith('/compact ');
    expect(context.sendMessage).not.toHaveBeenCalled();
  });

  it('/new command selection completes to /new in input', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => { result.current.handleInputChange('/'); });
    const newCmd = result.current.filteredCommands.find((c) => c.name === 'new');
    act(() => { result.current.selectCommand(newCmd!); });
    expect(context.setInput).toHaveBeenCalledWith('/new ');
    expect(context.newSession).not.toHaveBeenCalled();
  });

  it('/help command selection completes to /help in input', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => { result.current.handleInputChange('/'); });
    const helpCmd = result.current.filteredCommands.find((c) => c.name === 'help');
    act(() => { result.current.selectCommand(helpCmd!); });
    expect(context.setInput).toHaveBeenCalledWith('/help ');
    expect(context.sendMessage).not.toHaveBeenCalled();
  });

  it('selectCommand closes the menu', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => {
      result.current.handleInputChange('/');
    });
    expect(result.current.menuOpen).toBe(true);
    const clearCmd = result.current.filteredCommands.find((c) => c.name === 'clear')!;
    act(() => {
      result.current.selectCommand(clearCmd);
    });
    expect(result.current.menuOpen).toBe(false);
  });

  it('closeMenu closes the menu', () => {
    const { result } = renderHook(() => useSlashCommands(context, null));
    act(() => {
      result.current.handleInputChange('/');
    });
    expect(result.current.menuOpen).toBe(true);
    act(() => {
      result.current.closeMenu();
    });
    expect(result.current.menuOpen).toBe(false);
  });

  describe('keyboard navigation', () => {
    function makeKeyEvent(key: string): React.KeyboardEvent {
      return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
    }

    it('Escape closes the menu and returns true', () => {
      const { result } = renderHook(() => useSlashCommands(context, null));
      act(() => {
        result.current.handleInputChange('/');
      });
      let handled = false;
      act(() => {
        handled = result.current.handleKeyDown(makeKeyEvent('Escape'));
      });
      expect(handled).toBe(true);
      expect(result.current.menuOpen).toBe(false);
    });

    it('ArrowDown increments selectedIndex', () => {
      const { result } = renderHook(() => useSlashCommands(context, null));
      act(() => {
        result.current.handleInputChange('/');
      });
      expect(result.current.selectedIndex).toBe(0);
      act(() => {
        result.current.handleKeyDown(makeKeyEvent('ArrowDown'));
      });
      expect(result.current.selectedIndex).toBe(1);
    });

    it('ArrowUp wraps selectedIndex', () => {
      const { result } = renderHook(() => useSlashCommands(context, null));
      act(() => {
        result.current.handleInputChange('/');
      });
      act(() => {
        result.current.handleKeyDown(makeKeyEvent('ArrowUp'));
      });
      // 0 - 1 + 4 = 3 (wraps around)
      expect(result.current.selectedIndex).toBe(3);
    });

    it('Enter selects the current command', () => {
      const { result } = renderHook(() => useSlashCommands(context, null));
      act(() => {
        result.current.handleInputChange('/');
      });
      let handled = false;
      act(() => {
        handled = result.current.handleKeyDown(makeKeyEvent('Enter'));
      });
      expect(handled).toBe(true);
      // First command is 'clear' — selection completes to /clear in input
      expect(context.setInput).toHaveBeenCalledWith('/clear ');
    });

    it('returns false when menu is not open', () => {
      const { result } = renderHook(() => useSlashCommands(context, null));
      let handled = true;
      act(() => {
        handled = result.current.handleKeyDown(makeKeyEvent('Escape'));
      });
      expect(handled).toBe(false);
    });
  });
});
