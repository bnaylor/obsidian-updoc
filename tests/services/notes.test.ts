import { describe, it, expect } from 'vitest';
import { expandDateVars, sanitizeFilename, resolveUniquePath } from '../../src/services/notes';

describe('expandDateVars', () => {
  const date = new Date('2026-07-08T09:05:00');

  it('expands {{year}}', () => {
    expect(expandDateVars('{{year}}', date)).toBe('2026');
  });

  it('expands {{month}} with zero-padding', () => {
    expect(expandDateVars('{{month}}', date)).toBe('07');
  });

  it('expands {{day}} with zero-padding', () => {
    expect(expandDateVars('{{day}}', date)).toBe('08');
  });

  it('expands {{HHmm}} in 24-hour zero-padded format', () => {
    expect(expandDateVars('{{HHmm}}', date)).toBe('0905');
  });

  it('expands full meeting folder pattern', () => {
    expect(expandDateVars('Meetings/{{year}}/{{month}}/{{day}}', date))
      .toBe('Meetings/2026/07/08');
  });

  it('zero-pads single-digit month', () => {
    expect(expandDateVars('{{month}}', new Date('2026-03-01T00:00:00'))).toBe('03');
  });
});

describe('sanitizeFilename', () => {
  it('removes colon', () => {
    expect(sanitizeFilename('09:00 Standup')).toBe('0900 Standup');
  });

  it('removes all unsafe characters', () => {
    expect(sanitizeFilename('a/b\\c*d?e"f<g>h|i')).toBe('abcdefghi');
  });

  it('leaves safe characters intact', () => {
    expect(sanitizeFilename('Team Standup - Q3')).toBe('Team Standup - Q3');
  });
});

describe('resolveUniquePath', () => {
  it('returns base path when no conflict', () => {
    const result = resolveUniquePath('Meetings/2026/07/08', 'Standup', new Set());
    expect(result).toBe('Meetings/2026/07/08/Standup.md');
  });

  it('appends counter 2 on first conflict', () => {
    const existing = new Set(['Meetings/2026/07/08/Standup.md']);
    const result = resolveUniquePath('Meetings/2026/07/08', 'Standup', existing);
    expect(result).toBe('Meetings/2026/07/08/Standup 2.md');
  });

  it('increments counter until unique', () => {
    const existing = new Set([
      'Meetings/2026/07/08/Standup.md',
      'Meetings/2026/07/08/Standup 2.md',
    ]);
    const result = resolveUniquePath('Meetings/2026/07/08', 'Standup', existing);
    expect(result).toBe('Meetings/2026/07/08/Standup 3.md');
  });
});
