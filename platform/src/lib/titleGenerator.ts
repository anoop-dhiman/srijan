import { createLogger } from './logger.js';

const log = createLogger('titleGenerator');

/**
 * Calls the Anthropic Messages API directly (no SDK) to generate a short session title.
 * Falls back to a truncated version of the first message on any error.
 */
export async function generateTitle(firstMessage: string, apiKey: string): Promise<string> {
  const fallback = firstMessage.trim().slice(0, 60);

  if (!apiKey) return fallback;

  const prompt = `Generate a concise 4-6 word title for a chat session that begins with this user message. Reply with only the title — no quotes, no punctuation at the end:\n\n"${firstMessage.slice(0, 200)}"`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      log.warn({ status: res.status }, 'Title generation API call failed');
      return fallback;
    }

    const data = await res.json() as any;
    const title = (data.content?.[0]?.text || '').trim();
    return title || fallback;
  } catch (err: any) {
    log.warn({ err: err.message }, 'Title generation failed');
    return fallback;
  }
}
