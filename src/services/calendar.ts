import { CalendarEvent, Attendee, UpdocSettings } from '../types';
import { AuthService } from './auth';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export function buildCalendarUrl(calendarId: string, timeMin: string, timeMax: string): string {
  const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  return url.toString();
}

export function parseCalendarEvent(item: unknown): CalendarEvent | null {
  const i = item as Record<string, unknown>;
  const start = i['start'] as Record<string, string> | undefined;
  const end = i['end'] as Record<string, string> | undefined;

  if (!start?.['dateTime']) return null;

  const rawAttendees = (i['attendees'] as Array<Record<string, string>> | undefined) ?? [];
  const attendees: Attendee[] = rawAttendees.map(a => ({
    email: a['email'],
    displayName: a['displayName'],
  }));

  return {
    id: i['id'] as string,
    title: (i['summary'] as string | undefined) ?? '(No title)',
    startTime: new Date(start['dateTime']),
    endTime: new Date(end!['dateTime']),
    location: i['location'] as string | undefined,
    description: i['description'] as string | undefined,
    attendees,
  };
}

export class CalendarService {
  constructor(private settings: UpdocSettings, private auth: AuthService) {}

  async fetchTodayEvents(): Promise<CalendarEvent[]> {
    const token = await this.auth.getValidAccessToken();

    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const response = await fetch(buildCalendarUrl(this.settings.calendarId, timeMin, timeMax), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);

    const data = await response.json() as { items?: unknown[] };
    return (data.items ?? []).map(parseCalendarEvent).filter((e): e is CalendarEvent => e !== null);
  }

  isHidden(event: CalendarEvent): boolean {
    const title = event.title.toLowerCase();
    return this.settings.filterRules.some(rule => title.includes(rule.toLowerCase()));
  }
}
