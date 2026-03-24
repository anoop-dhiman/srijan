import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TokenPie } from '../components/TokenPie';

describe('TokenPie', () => {
  it('returns null when total tokens are 0', () => {
    const { container } = render(
      <TokenPie inputTokens={0} outputTokens={0} model="claude-3-5-sonnet" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders an SVG when tokens > 0', () => {
    render(<TokenPie inputTokens={1000} outputTokens={500} model="claude-3-5-sonnet" />);
    const svg = document.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('shows title with correct token count and percentage', () => {
    render(<TokenPie inputTokens={100000} outputTokens={0} model="claude-3-5-sonnet" />);
    const title = document.querySelector('svg title');
    // 100000 / 200000 = 50%
    expect(title?.textContent).toContain('100,000 tokens used (50%)');
  });

  it('uses blue color when usage < 50%', () => {
    render(<TokenPie inputTokens={10000} outputTokens={0} model="claude-3-5-sonnet" />);
    const circles = document.querySelectorAll('circle');
    // Second circle is the filled portion
    const filledCircle = circles[1];
    expect(filledCircle?.getAttribute('stroke')).toBe('#3b82f6');
  });

  it('uses amber color when usage is between 50% and 75%', () => {
    render(<TokenPie inputTokens={120000} outputTokens={0} model="claude-3-5-sonnet" />);
    // 120000 / 200000 = 60% → amber
    const circles = document.querySelectorAll('circle');
    const filledCircle = circles[1];
    expect(filledCircle?.getAttribute('stroke')).toBe('#f59e0b');
  });

  it('uses red color when usage >= 75%', () => {
    render(<TokenPie inputTokens={160000} outputTokens={0} model="claude-3-5-sonnet" />);
    // 160000 / 200000 = 80% → red
    const circles = document.querySelectorAll('circle');
    const filledCircle = circles[1];
    expect(filledCircle?.getAttribute('stroke')).toBe('#ef4444');
  });

  it('clamps ratio to 1 when tokens exceed limit', () => {
    render(<TokenPie inputTokens={300000} outputTokens={0} model="claude-3-5-sonnet" />);
    const title = document.querySelector('svg title');
    expect(title?.textContent).toContain('100%');
  });

  it('works with claude-sonnet-4 model', () => {
    render(<TokenPie inputTokens={50000} outputTokens={50000} model="claude-sonnet-4-5" />);
    const svg = document.querySelector('svg');
    // 100000 / 200000 = 50% → amber
    expect(svg).not.toBeNull();
    expect(document.querySelector('svg title')?.textContent).toContain('100,000 tokens used (50%)');
  });
});
