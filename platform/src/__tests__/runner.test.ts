import { describe, it, expect, beforeAll, vi } from 'vitest';
import { getDb } from '../db/store.js';
import { mkdirSync } from 'fs';
import { EventEmitter } from 'events';

// Mock saveEvent and updateSessionAgentClaudeId so we don't need real session rows in DB
vi.mock('../agent/session.js', () => ({
  saveEvent: vi.fn(),
  updateSessionAgentClaudeId: vi.fn(),
  getSessionEvents: vi.fn(() => []),
}));

// Mock startSecretProxy so we don't need a real HTTP proxy
vi.mock('../agent/secretProxy.js', () => ({
  startSecretProxy: vi.fn(async () => ({ port: 9999, close: async () => {} })),
}));

// --- Minimal spawn mock ---
// We capture the args passed to spawn so we can assert on them.
const spawnCalls: { args: string[] }[] = [];

function makeStubProcess() {
  const stdin = new EventEmitter() as any;
  stdin.end = vi.fn();
  const stdout = new EventEmitter() as any;
  const stderr = new EventEmitter() as any;
  const proc = new EventEmitter() as any;
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.kill = vi.fn();
  // Immediately close with code 0 asynchronously so sendMessage resolves
  setImmediate(() => proc.emit('close', 0));
  return proc;
}

vi.mock('child_process', () => ({
  spawn: vi.fn((_cmd: string, args: string[]) => {
    spawnCalls.push({ args: [...args] });
    return makeStubProcess();
  }),
}));

const TEST_WS = '/tmp/srijan-runner-test-' + Date.now();
mkdirSync(TEST_WS, { recursive: true });

describe('AgentRunner — thinkingBudget flag', () => {
  beforeAll(() => {
    getDb();
  });

  it('includes --max-thinking-tokens when thinkingBudget > 0', async () => {
    spawnCalls.length = 0;

    const { AgentRunner } = await import('../agent/runner.js');
    const sid = 'tb-set-' + Date.now();
    const ws = TEST_WS + '/' + sid;
    mkdirSync(ws, { recursive: true });

    const runner = new AgentRunner({
      sessionId: sid,
      workspacePath: ws,
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
      thinkingBudget: 16000,
    });

    await runner.sendMessage('hello');

    expect(spawnCalls.length).toBeGreaterThan(0);
    const args = spawnCalls[spawnCalls.length - 1].args;
    const idx = args.indexOf('--max-thinking-tokens');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('16000');
  });

  it('does NOT include --max-thinking-tokens when thinkingBudget is undefined', async () => {
    spawnCalls.length = 0;

    const { AgentRunner } = await import('../agent/runner.js');
    const sid = 'tb-unset-' + Date.now();
    const ws = TEST_WS + '/' + sid;
    mkdirSync(ws, { recursive: true });

    const runner = new AgentRunner({
      sessionId: sid,
      workspacePath: ws,
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
      // thinkingBudget intentionally omitted
    });

    await runner.sendMessage('hello');

    expect(spawnCalls.length).toBeGreaterThan(0);
    const args = spawnCalls[spawnCalls.length - 1].args;
    expect(args.includes('--max-thinking-tokens')).toBe(false);
  });

  it('does NOT include --max-thinking-tokens when thinkingBudget is 0', async () => {
    spawnCalls.length = 0;

    const { AgentRunner } = await import('../agent/runner.js');
    const sid = 'tb-zero-' + Date.now();
    const ws = TEST_WS + '/' + sid;
    mkdirSync(ws, { recursive: true });

    const runner = new AgentRunner({
      sessionId: sid,
      workspacePath: ws,
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
      thinkingBudget: 0,
    });

    await runner.sendMessage('hello');

    expect(spawnCalls.length).toBeGreaterThan(0);
    const args = spawnCalls[spawnCalls.length - 1].args;
    expect(args.includes('--max-thinking-tokens')).toBe(false);
  });
});

describe('AgentRunner — usage_update event', () => {
  beforeAll(() => {
    getDb();
  });

  it('emits usage_update event with correct fields when result message has usage', async () => {
    const { AgentRunner } = await import('../agent/runner.js');
    const sid = 'usage-evt-' + Date.now();
    const ws = TEST_WS + '/' + sid;
    mkdirSync(ws, { recursive: true });

    const runner = new AgentRunner({
      sessionId: sid,
      workspacePath: ws,
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
    });

    const events: any[] = [];
    runner.on('event', (e) => events.push(e));

    // Call the private handleSdkMessage directly with a result message
    (runner as any).handleSdkMessage({
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost_usd: 0.0025,
      is_error: false,
    });

    const usageEvents = events.filter((e) => e.type === 'usage_update');
    expect(usageEvents.length).toBe(1);
    expect(usageEvents[0].data.inputTokens).toBe(100);
    expect(usageEvents[0].data.outputTokens).toBe(50);
    expect(usageEvents[0].data.costUsd).toBe(0.0025);
    expect(usageEvents[0].data.model).toBe('claude-sonnet-4-6');
  });

  it('emits usage_update event even when is_error is true', async () => {
    const { AgentRunner } = await import('../agent/runner.js');
    const sid = 'usage-err-' + Date.now();
    const ws = TEST_WS + '/' + sid;
    mkdirSync(ws, { recursive: true });

    const runner = new AgentRunner({
      sessionId: sid,
      workspacePath: ws,
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
    });

    const events: any[] = [];
    runner.on('event', (e) => events.push(e));

    (runner as any).handleSdkMessage({
      type: 'result',
      usage: { input_tokens: 10, output_tokens: 5 },
      cost_usd: null,
      is_error: true,
      result: 'something went wrong',
    });

    const usageEvents = events.filter((e) => e.type === 'usage_update');
    expect(usageEvents.length).toBe(1);
    expect(usageEvents[0].data.inputTokens).toBe(10);
    expect(usageEvents[0].data.outputTokens).toBe(5);
    expect(usageEvents[0].data.costUsd).toBeNull();

    // error event should also be emitted after usage_update
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);

    // usage_update should appear before error in emission order
    const usageIdx = events.findIndex((e) => e.type === 'usage_update');
    const errorIdx = events.findIndex((e) => e.type === 'error');
    expect(usageIdx).toBeLessThan(errorIdx);
  });

  it('emits usage_update with zeros when usage object is absent but cost_usd present', async () => {
    const { AgentRunner } = await import('../agent/runner.js');
    const sid = 'usage-no-usage-' + Date.now();
    const ws = TEST_WS + '/' + sid;
    mkdirSync(ws, { recursive: true });

    const runner = new AgentRunner({
      sessionId: sid,
      workspacePath: ws,
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
    });

    const events: any[] = [];
    runner.on('event', (e) => events.push(e));

    (runner as any).handleSdkMessage({
      type: 'result',
      // no usage field
      cost_usd: 0.001,
      is_error: false,
    });

    const usageEvents = events.filter((e) => e.type === 'usage_update');
    expect(usageEvents.length).toBe(1);
    expect(usageEvents[0].data.inputTokens).toBe(0);
    expect(usageEvents[0].data.outputTokens).toBe(0);
    expect(usageEvents[0].data.costUsd).toBe(0.001);
  });
});
