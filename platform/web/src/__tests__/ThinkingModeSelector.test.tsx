import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThinkingModeSelector } from '../components/ThinkingModeSelector';
import { THINKING_BUDGETS } from '../components/thinkingModes';

describe('ThinkingModeSelector', () => {
  it('renders all 4 mode options', () => {
    render(<ThinkingModeSelector value="none" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /none/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /low/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /medium/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /extended/i })).toBeInTheDocument();
  });

  it('marks the active mode button as pressed', () => {
    render(<ThinkingModeSelector value="medium" onChange={vi.fn()} />);
    const mediumBtn = screen.getByRole('button', { name: /medium/i });
    expect(mediumBtn.getAttribute('aria-pressed')).toBe('true');
    const noneBtn = screen.getByRole('button', { name: /none/i });
    expect(noneBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onChange with "low" when Low is clicked', () => {
    const onChange = vi.fn();
    render(<ThinkingModeSelector value="none" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /low/i }));
    expect(onChange).toHaveBeenCalledWith('low');
  });

  it('calls onChange with "extended" when Extended is clicked', () => {
    const onChange = vi.fn();
    render(<ThinkingModeSelector value="none" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /extended/i }));
    expect(onChange).toHaveBeenCalledWith('extended');
  });

  it('calls onChange with "none" when None is clicked', () => {
    const onChange = vi.fn();
    render(<ThinkingModeSelector value="medium" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /none/i }));
    expect(onChange).toHaveBeenCalledWith('none');
  });

  it('calls onChange with "medium" when Medium is clicked', () => {
    const onChange = vi.fn();
    render(<ThinkingModeSelector value="none" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /medium/i }));
    expect(onChange).toHaveBeenCalledWith('medium');
  });

  describe('THINKING_BUDGETS', () => {
    it('exports correct token budgets', () => {
      expect(THINKING_BUDGETS.none).toBeUndefined();
      expect(THINKING_BUDGETS.low).toBe(4000);
      expect(THINKING_BUDGETS.medium).toBe(16000);
      expect(THINKING_BUDGETS.extended).toBe(64000);
    });
  });
});
