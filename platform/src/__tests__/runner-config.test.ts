import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getDb } from '../db/store.js';

describe('Runner config helpers', () => {
  beforeAll(() => {
    getDb();
  });

  beforeEach(() => {
    const db = getDb();
    db.prepare("DELETE FROM config WHERE key IN ('agentMode', 'system_prompt', 'llm')").run();
  });

  describe('getAgentMode', () => {
    it('returns "auto" by default when key is unset', async () => {
      const { getAgentMode } = await import('../agent/runner.js');
      expect(getAgentMode()).toBe('auto');
    });

    it('returns "confirm" when DB key is set to confirm', async () => {
      getDb()
        .prepare("INSERT INTO config (key, value) VALUES ('agentMode', ?)")
        .run(JSON.stringify('confirm'));
      const { getAgentMode } = await import('../agent/runner.js');
      expect(getAgentMode()).toBe('confirm');
    });

    it('returns "auto" for any unrecognised value', async () => {
      getDb()
        .prepare("INSERT INTO config (key, value) VALUES ('agentMode', ?)")
        .run(JSON.stringify('unknown-mode'));
      const { getAgentMode } = await import('../agent/runner.js');
      expect(getAgentMode()).toBe('auto');
    });

    it('returns "auto" when stored value is malformed JSON', async () => {
      getDb()
        .prepare("INSERT INTO config (key, value) VALUES ('agentMode', ?)")
        .run('not-json{{{');
      const { getAgentMode } = await import('../agent/runner.js');
      expect(getAgentMode()).toBe('auto');
    });
  });

  describe('getSystemPrompt', () => {
    it('returns DEFAULT_SYSTEM_PROMPT when no custom prompt set', async () => {
      const { getSystemPrompt, DEFAULT_SYSTEM_PROMPT } = await import('../agent/runner.js');
      expect(getSystemPrompt()).toBe(DEFAULT_SYSTEM_PROMPT);
    });

    it('returns custom system prompt when set in DB', async () => {
      const custom = 'You are a custom assistant.';
      getDb()
        .prepare("INSERT INTO config (key, value) VALUES ('system_prompt', ?)")
        .run(JSON.stringify(custom));
      const { getSystemPrompt } = await import('../agent/runner.js');
      expect(getSystemPrompt()).toBe(custom);
    });
  });

  describe('getAgentSdk', () => {
    it('returns "claude-code" by default', async () => {
      const { getAgentSdk } = await import('../agent/runner.js');
      expect(getAgentSdk()).toBe('claude-code');
    });

    it('returns "opencode" when DB key is set', async () => {
      getDb()
        .prepare("INSERT INTO config (key, value) VALUES ('agentSdk', ?)")
        .run(JSON.stringify('opencode'));
      const { getAgentSdk } = await import('../agent/runner.js');
      expect(getAgentSdk()).toBe('opencode');
    });
  });

  describe('getApiKey', () => {
    it('returns empty string when no llm config', async () => {
      const { getApiKey } = await import('../agent/runner.js');
      expect(getApiKey()).toBe('');
    });

    it('returns apiKey from llm config', async () => {
      getDb()
        .prepare("INSERT INTO config (key, value) VALUES ('llm', ?)")
        .run(JSON.stringify({ provider: 'anthropic', apiKey: 'sk-test-123', model: 'claude-sonnet-4-6' }));
      const { getApiKey } = await import('../agent/runner.js');
      expect(getApiKey()).toBe('sk-test-123');
    });
  });

  describe('DEFAULT_SYSTEM_PROMPT', () => {
    it('contains expected security and workspace instructions', async () => {
      const { DEFAULT_SYSTEM_PROMPT } = await import('../agent/runner.js');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('Srijan');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('workspace');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('NEVER');
    });
  });

  describe('confirm mode system prompt injection', () => {
    it('confirm mode adds [AWAITING_APPROVAL] sentinel to system prompt', async () => {
      const { mkdirSync } = await import('fs');
      const { AgentRunner } = await import('../agent/runner.js');
      const sid = 'confirm-test-' + Date.now();
      const ws = `/tmp/srijan-runner-confirm-${sid}`;
      mkdirSync(ws, { recursive: true });
      const runner = new AgentRunner({ sessionId: sid, workspacePath: ws, apiKey: 'sk', model: 'm' });
      const prompt = (runner as any).getSystemPromptAddition('confirm');
      expect(prompt).toContain('[AWAITING_APPROVAL]');
    });

    it('auto mode does NOT add [AWAITING_APPROVAL] sentinel', async () => {
      const { mkdirSync } = await import('fs');
      const { AgentRunner } = await import('../agent/runner.js');
      const sid = 'auto-test-' + Date.now();
      const ws = `/tmp/srijan-runner-auto-${sid}`;
      mkdirSync(ws, { recursive: true });
      const runner = new AgentRunner({ sessionId: sid, workspacePath: ws, apiKey: 'sk', model: 'm' });
      const prompt = (runner as any).getSystemPromptAddition('auto');
      expect(prompt).not.toContain('[AWAITING_APPROVAL]');
    });
  });
});
