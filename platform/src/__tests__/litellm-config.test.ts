import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getDb } from '../db/store.js';

describe('LiteLLM Config', () => {
  beforeAll(() => {
    getDb();
  });

  beforeEach(() => {
    // Reset llm config
    getDb().prepare("DELETE FROM config WHERE key = 'llm'").run();
  });

  it('getLiteLLMConfig returns useLiteLLM=false for anthropic provider', async () => {
    getDb().prepare("INSERT INTO config (key, value) VALUES ('llm', ?)").run(
      JSON.stringify({ provider: 'anthropic', apiKey: 'sk-test', model: 'claude-sonnet-4-6' })
    );
    const { getLiteLLMConfig } = await import('../agent/runner.js');
    const cfg = getLiteLLMConfig();
    expect(cfg.useLiteLLM).toBe(false);
  });

  it('getLiteLLMConfig returns correct fields for litellm provider', async () => {
    getDb().prepare("INSERT INTO config (key, value) VALUES ('llm', ?)").run(
      JSON.stringify({
        provider: 'litellm',
        litellmBaseUrl: 'http://localhost:4000',
        litellmApiKey: 'proxy-key',
        litellmModel: 'gpt-4o',
      })
    );
    const { getLiteLLMConfig } = await import('../agent/runner.js');
    const cfg = getLiteLLMConfig();
    expect(cfg.useLiteLLM).toBe(true);
    expect(cfg.baseUrl).toBe('http://localhost:4000');
    expect(cfg.apiKey).toBe('proxy-key');
    expect(cfg.model).toBe('gpt-4o');
  });

  it('getModel returns litellmModel when provider is litellm', async () => {
    getDb().prepare("INSERT INTO config (key, value) VALUES ('llm', ?)").run(
      JSON.stringify({
        provider: 'litellm',
        litellmModel: 'ollama/llama3',
      })
    );
    const { getModel } = await import('../agent/runner.js');
    expect(getModel()).toBe('ollama/llama3');
  });

  it('getModel returns model for anthropic provider', async () => {
    getDb().prepare("INSERT INTO config (key, value) VALUES ('llm', ?)").run(
      JSON.stringify({ provider: 'anthropic', model: 'claude-opus-4-6' })
    );
    const { getModel } = await import('../agent/runner.js');
    expect(getModel()).toBe('claude-opus-4-6');
  });

  it('getLiteLLMConfig falls back to empty values when fields missing', async () => {
    getDb().prepare("INSERT INTO config (key, value) VALUES ('llm', ?)").run(
      JSON.stringify({ provider: 'litellm' })
    );
    const { getLiteLLMConfig } = await import('../agent/runner.js');
    const cfg = getLiteLLMConfig();
    expect(cfg.useLiteLLM).toBe(true);
    expect(cfg.baseUrl).toBe('');
    expect(cfg.apiKey).toBe('');
    expect(cfg.model).toBe('');
  });
});
