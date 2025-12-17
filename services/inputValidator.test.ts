import { describe, expect, it } from 'vitest';
import { inputValidator } from './inputValidator';

describe('inputValidator', () => {
  it('validateUsername trims whitespace but rejects embedded newlines', () => {
    expect(inputValidator.validateUsername('  alice  ')).toBe('alice');
    expect(inputValidator.validateUsername('ali\nce')).toBeNull();
  });

  it('validateTag lowercases and enforces charset', () => {
    expect(inputValidator.validateTag('Tech')).toBe('tech');
    expect(inputValidator.validateTag('good_tag-1')).toBe('good_tag-1');
    expect(inputValidator.validateTag('bad tag')).toBeNull();
    expect(inputValidator.validateTag('#nope')).toBeNull();
  });

  it('validateUrl only allows http/https', () => {
    expect(inputValidator.validateUrl('https://example.com')).toBe('https://example.com');
    expect(inputValidator.validateUrl('http://example.com')).toBe('http://example.com');
    expect(inputValidator.validateUrl('ftp://example.com')).toBeNull();
  });

  it('validatePubkeyHex enforces 64 hex', () => {
    expect(inputValidator.validatePubkeyHex('a'.repeat(64))).toBe('a'.repeat(64));
    expect(inputValidator.validatePubkeyHex('a'.repeat(63))).toBeNull();
    expect(inputValidator.validatePubkeyHex('g'.repeat(64))).toBeNull();
  });
});











