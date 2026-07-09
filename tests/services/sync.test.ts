import { describe, it, expect } from 'vitest';
import { determineSyncAction, extractBody, replaceBody } from '../../src/services/sync';

describe('determineSyncAction', () => {
  it('returns no-op when nothing changed', () => {
    expect(determineSyncAction('body', 'body', 'rev1', 'rev1')).toBe('no-op');
  });

  it('returns pull when only remote changed', () => {
    expect(determineSyncAction('body', 'body', 'rev2', 'rev1')).toBe('pull');
  });

  it('returns push when only local changed', () => {
    expect(determineSyncAction('new body', 'old body', 'rev1', 'rev1')).toBe('push');
  });

  it('returns conflict when both changed', () => {
    expect(determineSyncAction('new body', 'old body', 'rev2', 'rev1')).toBe('conflict');
  });
});

describe('extractBody', () => {
  it('returns content after frontmatter block', () => {
    const content = '---\nmeetingId: 1\n---\n# Title\n\nNotes';
    expect(extractBody(content)).toBe('# Title\n\nNotes');
  });

  it('returns full content when no frontmatter', () => {
    expect(extractBody('# Title\nBody')).toBe('# Title\nBody');
  });

  it('handles frontmatter with googleDocId', () => {
    const content = '---\ngoogleDocId: abc\ndate: 2026-07-08\n---\nBody text';
    expect(extractBody(content)).toBe('Body text');
  });
});

describe('replaceBody', () => {
  it('replaces body while preserving frontmatter', () => {
    const original = '---\ngoogleDocId: abc\n---\nOld body';
    const result = replaceBody(original, 'New body');
    expect(result).toBe('---\ngoogleDocId: abc\n---\nNew body');
  });

  it('returns new body when no frontmatter present', () => {
    expect(replaceBody('Old', 'New')).toBe('New');
  });
});
