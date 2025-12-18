import { describe, expect, it } from 'vitest';
import { mentionService } from './mentionService';

describe('mentionService', () => {
  it('parseMentions finds usernames and positions', () => {
    const content = 'hello @alice and @u/bob.test!';
    const matches = mentionService.parseMentions(content);
    expect(matches.map((m) => m.username)).toEqual(['alice', 'u/bob.test']);
    expect(matches[0].startIndex).toBe(content.indexOf('@alice'));
    expect(matches[1].startIndex).toBe(content.indexOf('@u/bob.test'));
  });

  it('detectMentionInProgress detects partial mention near cursor', () => {
    const text = 'hey @ali';
    const cursor = text.length;
    const r = mentionService.detectMentionInProgress(text, cursor);
    expect(r).not.toBeNull();
    expect(r!.query).toBe('ali');
  });

  it('detectMentionInProgress returns null when not in mention', () => {
    const text = 'hey ali';
    const r = mentionService.detectMentionInProgress(text, text.length);
    expect(r).toBeNull();
  });
});















