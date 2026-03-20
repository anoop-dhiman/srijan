import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { applyTemplate, VALID_TEMPLATES } from '../lib/workspaceTemplates.js';

const BASE = '/tmp/srijan-tpl-test-' + Date.now();
mkdirSync(BASE, { recursive: true });

afterAll(() => {
  try { rmSync(BASE, { recursive: true }); } catch {}
});

function makeDir(name: string): string {
  const p = join(BASE, name);
  mkdirSync(p, { recursive: true });
  return p;
}

describe('workspace templates', () => {
  it('VALID_TEMPLATES includes expected entries', () => {
    expect(VALID_TEMPLATES).toContain('none');
    expect(VALID_TEMPLATES).toContain('node');
    expect(VALID_TEMPLATES).toContain('python');
    expect(VALID_TEMPLATES).toContain('go');
    expect(VALID_TEMPLATES).toContain('rust');
  });

  it('"none" template is a no-op', async () => {
    const dir = makeDir('none');
    await applyTemplate(dir, 'none');
    // Directory should still be empty-ish (no files created)
    const { readdirSync } = await import('fs');
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('"node" template creates package.json and .gitignore', async () => {
    const dir = makeDir('node');
    await applyTemplate(dir, 'node');
    expect(existsSync(join(dir, 'package.json'))).toBe(true);
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
  });

  it('"python" template creates requirements.txt, .gitignore, and main.py', async () => {
    const dir = makeDir('python');
    await applyTemplate(dir, 'python');
    expect(existsSync(join(dir, 'requirements.txt'))).toBe(true);
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
    expect(existsSync(join(dir, 'main.py'))).toBe(true);
  });

  it('"go" template creates go.mod and main.go', async () => {
    const dir = makeDir('go');
    await applyTemplate(dir, 'go');
    expect(existsSync(join(dir, 'go.mod'))).toBe(true);
    expect(existsSync(join(dir, 'main.go'))).toBe(true);
  });

  it('"rust" template creates Cargo.toml and src/main.rs', async () => {
    const dir = makeDir('rust');
    await applyTemplate(dir, 'rust');
    expect(existsSync(join(dir, 'Cargo.toml'))).toBe(true);
    expect(existsSync(join(dir, 'src', 'main.rs'))).toBe(true);
  });
});
