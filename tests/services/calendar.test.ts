import { describe, it, expect, vi } from 'vitest';
import { parseCalendarEvent, buildCalendarUrl, CalendarService } from '../../src/services/calendar';
import { UpdocSettings } from '../../src/types';
import { AuthService } from '../../src/services/auth';

const baseSettings = (): UpdocSettings => ({
  clientId: '', clientSecret: '', tokens: null,
  calendarId: 'primary',
  meetingFolderPattern: '', filenamePattern: '',
  sidebarPosition: 'right',
  filterRules: [],
  templateRules: [],
});

const googleItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt1',
  summary: 'Team Standup',
  start: { dateTime: '2026-07-08T09:00:00-07:00' },
  end: { dateTime: '2026-07-08T09:30:00-07:00' },
  attendees: [{ email: 'a@co.com', displayName: 'Alice' }],
  ...overrides,
});

describe('parseCalendarEvent', () => {
  it('parses a standard event', () => {
    const result = parseCalendarEvent(googleItem());
    expect(result).not.toBeNull();
    expect(result!.id).toBe('evt1');
    expect(result!.title).toBe('Team Standup');
    expect(result!.attendees[0].email).toBe('a@co.com');
    expect(result!.attendees[0].displayName).toBe('Alice');
  });

  it('returns null for all-day events (no dateTime)', () => {
    const item = googleItem({ start: { date: '2026-07-08' }, end: { date: '2026-07-09' } });
    expect(parseCalendarEvent(item)).toBeNull();
  });

  it('uses "(No title)" when summary absent', () => {
    const item = googleItem({ summary: undefined });
    expect(parseCalendarEvent(item)!.title).toBe('(No title)');
  });

  it('handles missing attendees gracefully', () => {
    const item = googleItem({ attendees: undefined });
    expect(parseCalendarEvent(item)!.attendees).toEqual([]);
  });
});

describe('buildCalendarUrl', () => {
  it('constructs Google Calendar events URL', () => {
    const url = new URL(buildCalendarUrl('primary', '2026-07-08T00:00:00Z', '2026-07-09T00:00:00Z'));
    expect(url.hostname).toBe('www.googleapis.com');
    expect(url.pathname).toContain('primary');
    expect(url.pathname).toContain('events');
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('orderBy')).toBe('startTime');
    expect(url.searchParams.get('timeMin')).toBe('2026-07-08T00:00:00Z');
    expect(url.searchParams.get('timeMax')).toBe('2026-07-09T00:00:00Z');
  });
});

describe('CalendarService.isHidden', () => {
  it('returns true when title contains filter rule (case-insensitive)', () => {
    const settings = baseSettings();
    settings.filterRules = ['lunch', 'focus time'];
    const auth = new AuthService(settings, async () => {});
    const svc = new CalendarService(settings, auth);
    const event = parseCalendarEvent(googleItem({ summary: 'Lunch Break' }))!;
    expect(svc.isHidden(event)).toBe(true);
  });

  it('returns false when no rules match', () => {
    const settings = baseSettings();
    settings.filterRules = ['lunch'];
    const auth = new AuthService(settings, async () => {});
    const svc = new CalendarService(settings, auth);
    const event = parseCalendarEvent(googleItem({ summary: 'Team Standup' }))!;
    expect(svc.isHidden(event)).toBe(false);
  });

  it('returns false when filterRules is empty', () => {
    const svc = new CalendarService(baseSettings(), new AuthService(baseSettings(), async () => {}));
    const event = parseCalendarEvent(googleItem())!;
    expect(svc.isHidden(event)).toBe(false);
  });
});
