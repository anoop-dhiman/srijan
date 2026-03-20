import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { getDb } from '../db/store.js';
import { mkdirSync } from 'fs';
import { join } from 'path';

const TEST_WS = '/tmp/srijan-test-runner-interface-' + Date.now();
mkdirSync(TEST_WS, { recursive: true });

vi.mock('../git/manager.js', () => ({
  getWorkspaceRoot: vi.fn(() => TEST_WS),
  cloneRepo: vi.fn(),
  initRepo: vi.fn(),
  getGit: vi.fn(),
}));

describe('Runner factory + IAgentRunner interface', () => {
  beforeAll(() => {
    getDb();
  });

  beforeEach(() => {
    getDb().prepare("DELETE FROM config WHERE key = 'agentSdk'").run();
  });

  it('getOrCreateRunner creates ClaudeCodeRunner by default (agentSdk unset)', async () => {
    const { getOrCreateRunner, removeRunner } = await import('../agent/runner.js');
    const sid = 'test-cc-' + Date.now();
    const runner = getOrCreateRunner({
      sessionId: sid,
      workspacePath: join(TEST_WS, sid),
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
    });
    expect(runner).toBeDefined();
    expect(typeof runner.sendMessage).toBe('function');
    expect(typeof runner.abort).toBe('function');
    expect(runner.sessionId).toBe(sid);
    removeRunner(sid);
  });

  it('getOrCreateRunner creates OpenCodeRunner when agentSdk=opencode', async () => {
    getDb().prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('agentSdk', ?)").run(
      JSON.stringify('opencode')
    );
    const { getOrCreateRunner, removeRunner } = await import('../agent/runner.js');
    const sid = 'test-oc-' + Date.now();
    const runner = getOrCreateRunner({
      sessionId: sid,
      workspacePath: join(TEST_WS, sid),
      apiKey: '',
      model: '',
    });
    expect(runner).toBeDefined();
    expect(typeof runner.sendMessage).toBe('function');
    expect(typeof runner.abort).toBe('function');
    expect(runner.sessionId).toBe(sid);

    // OpenCodeRunner emits error events (it doesn't save to DB)
    // Verify it emits an event by listening (won't save due to no session in DB)
    const { OpenCodeRunner } = await import('../agent/OpenCodeRunner.js');
    expect(runner).toBeInstanceOf(OpenCodeRunner);
    removeRunner(sid);
  });

  it('getOrCreateRunner reuses runner for same sessionId', async () => {
    getDb().prepare("DELETE FROM config WHERE key = 'agentSdk'").run();
    const { getOrCreateRunner, removeRunner } = await import('../agent/runner.js');
    const sid = 'test-reuse-' + Date.now();
    const r1 = getOrCreateRunner({
      sessionId: sid,
      workspacePath: join(TEST_WS, sid),
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
    });
    const r2 = getOrCreateRunner({
      sessionId: sid,
      workspacePath: join(TEST_WS, sid),
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
    });
    expect(r1).toBe(r2);
    removeRunner(sid);
  });

  it('both runner types implement IAgentRunner (sendMessage, abort, sessionId)', async () => {
    const { OpenCodeRunner } = await import('../agent/OpenCodeRunner.js');
    const { AgentRunner } = await import('../agent/runner.js');

    const sid = 'iface-check-' + Date.now();
    const oc = new OpenCodeRunner(sid);
    expect(typeof oc.sendMessage).toBe('function');
    expect(typeof oc.abort).toBe('function');
    expect(oc.sessionId).toBe(sid);

    // OpenCodeRunner emits an event when message sent (saveEvent may throw in test, that's OK)
    const events: any[] = [];
    oc.on('event', (e) => events.push(e));
    await oc.sendMessage('test');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('error');

    const ws = join(TEST_WS, sid);
    mkdirSync(ws, { recursive: true });
    const cc = new AgentRunner({ sessionId: sid, workspacePath: ws, apiKey: 'sk', model: 'm' });
    expect(typeof cc.sendMessage).toBe('function');
    expect(typeof cc.abort).toBe('function');
    expect(cc.sessionId).toBe(sid);
  });

  it('OpenCodeRunner error message mentions Settings and Claude Code', async () => {
    const { OpenCodeRunner } = await import('../agent/OpenCodeRunner.js');
    const sid = 'oc-msg-' + Date.now();
    const oc = new OpenCodeRunner(sid);
    const events: any[] = [];
    oc.on('event', (e) => events.push(e));
    await oc.sendMessage('hello');
    expect(events.length).toBeGreaterThan(0);
    const msg: string = events[0].data?.message ?? '';
    expect(msg).toContain('Settings');
    expect(msg).toContain('Claude Code');
  });
});
