import { describe, expect, it } from 'vitest';
import { buildModelMessages, buildSystemPrompt, createConversationTitle } from '../src/services/chatPrompt';

describe('Guftugo chat prompt', () => {
  it('instructs the assistant to answer Roman Urdu in Roman Urdu when auto language is selected', () => {
    expect(buildSystemPrompt('auto')).toContain('respond naturally in Roman Urdu');
  });

  it('does not force Urdu when the English preference is selected', () => {
    const prompt = buildSystemPrompt('english');
    expect(prompt).toContain('Reply in English');
    expect(prompt).not.toContain('Reply naturally in Roman Urdu by default');
  });

  it('builds chat messages with system prompt, history, then current input', () => {
    const messages = buildModelMessages([{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }], 'Explain APIs', 'auto');
    expect(messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(messages.at(-1)?.content).toBe('Explain APIs');
  });

  it('creates compact conversation titles', () => {
    expect(createConversationTitle('  hello\n  world  ')).toBe('hello world');
    expect(createConversationTitle('a'.repeat(100))).toBe(`${'a'.repeat(61)}...`);
  });
});
