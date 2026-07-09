export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}

export interface TemplateRule {
  id: string;
  name: string;
  matchType: 'title' | 'email' | 'count';
  pattern: string;
  templateContent: string;
  cssClass?: string;
}

export interface Attendee {
  email: string;
  displayName?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  description?: string;
  attendees: Attendee[];
}

export interface UpdocSettings {
  clientId: string;
  clientSecret: string;
  tokens: TokenData | null;
  calendarId: string;
  meetingFolderPattern: string;
  filenamePattern: string;
  sidebarPosition: 'left' | 'right';
  filterRules: string[];
  templateRules: TemplateRule[];
}
