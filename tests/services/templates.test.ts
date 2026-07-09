import { describe, it, expect } from 'vitest';
import { TemplateService } from '../../src/services/templates';
import { CalendarEvent, TemplateRule, UpdocSettings } from '../../src/types';

const baseSettings = (): UpdocSettings => ({
  clientId: '', clientSecret: '', tokens: null,
  calendarId: 'primary',
  meetingFolderPattern: 'Meetings/{{year}}/{{month}}/{{day}}',
  filenamePattern: '{{HHmm}} {{title}}',
  sidebarPosition: 'right',
  filterRules: [],
  templateRules: [],
  syncEnabled: true,
  syncMeta: {},
});

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'evt1',
  title: '1:1 with Alice',
  startTime: new Date('2026-07-08T09:00:00'),
  endTime: new Date('2026-07-08T09:30:00'),
  attendees: [
    { email: 'alice@co.com', displayName: 'Alice' },
    { email: 'me@co.com', displayName: 'Me' },
  ],
  ...overrides,
});

const rule = (overrides: Partial<TemplateRule> = {}): TemplateRule => ({
  id: 'r1', name: 'One on One',
  matchType: 'title', pattern: '1:1',
  templateContent: '# One on One\n- ',
  ...overrides,
});

describe('TemplateService.matchRule', () => {
  it('returns null when no rules', () => {
    const svc = new TemplateService(baseSettings());
    expect(svc.matchRule(event())).toBeNull();
  });

  it('matches title by case-insensitive regex', () => {
    const settings = baseSettings();
    settings.templateRules = [rule({ pattern: '1:1' })];
    const svc = new TemplateService(settings);
    expect(svc.matchRule(event({ title: '1:1 with Alice' }))).not.toBeNull();
    expect(svc.matchRule(event({ title: 'Team Standup' }))).toBeNull();
  });

  it('matches email against any attendee', () => {
    const settings = baseSettings();
    settings.templateRules = [rule({ matchType: 'email', pattern: 'alice@co.com' })];
    const svc = new TemplateService(settings);
    expect(svc.matchRule(event())).not.toBeNull();
    expect(svc.matchRule(event({ attendees: [{ email: 'bob@co.com' }] }))).toBeNull();
  });

  it('matches attendee count exactly', () => {
    const settings = baseSettings();
    settings.templateRules = [rule({ matchType: 'count', pattern: '2' })];
    const svc = new TemplateService(settings);
    expect(svc.matchRule(event())).not.toBeNull();
    expect(svc.matchRule(event({ attendees: [{ email: 'a@co.com' }, { email: 'b@co.com' }, { email: 'c@co.com' }] }))).toBeNull();
  });

  it('returns first matching rule', () => {
    const settings = baseSettings();
    const r1 = rule({ id: 'r1', pattern: '1:1' });
    const r2 = rule({ id: 'r2', pattern: '1:1' });
    settings.templateRules = [r1, r2];
    const svc = new TemplateService(settings);
    expect(svc.matchRule(event())?.id).toBe('r1');
  });
});

describe('TemplateService.getTemplateContent', () => {
  it('returns matched rule template', () => {
    const settings = baseSettings();
    settings.templateRules = [rule({ templateContent: '# Custom\n- ' })];
    const svc = new TemplateService(settings);
    expect(svc.getTemplateContent(event())).toBe('# Custom\n- ');
  });

  it('returns default template when no rule matches', () => {
    const svc = new TemplateService(baseSettings());
    const content = svc.getTemplateContent(event({ title: 'Team Standup' }));
    expect(content).toContain('{{title}}');
    expect(content).toContain('{{attendees}}');
  });
});

describe('TemplateService.getCssClass', () => {
  it('returns cssClass from matched rule', () => {
    const settings = baseSettings();
    settings.templateRules = [rule({ cssClass: 'meeting-1on1' })];
    const svc = new TemplateService(settings);
    expect(svc.getCssClass(event())).toBe('meeting-1on1');
  });

  it('returns undefined when no match', () => {
    const svc = new TemplateService(baseSettings());
    expect(svc.getCssClass(event({ title: 'Unmatched' }))).toBeUndefined();
  });
});

describe('TemplateService.expandTemplate', () => {
  it('substitutes all known variables', () => {
    const svc = new TemplateService(baseSettings());
    const template = '{{title}} on {{date}} at {{time}} — {{attendees}}';
    const result = svc.expandTemplate(template, event());
    expect(result).toContain('1:1 with Alice');
    expect(result).toContain('2026-07-08');
    expect(result).toContain('9:00 AM');
    expect(result).toContain('Alice');
  });

  it('uses email as fallback when displayName absent', () => {
    const svc = new TemplateService(baseSettings());
    const e = event({ attendees: [{ email: 'x@co.com' }] });
    const result = svc.expandTemplate('{{attendees}}', e);
    expect(result).toBe('x@co.com');
  });

  it('leaves unknown variables as-is', () => {
    const svc = new TemplateService(baseSettings());
    const result = svc.expandTemplate('{{unknown}}', event());
    expect(result).toBe('{{unknown}}');
  });

  it('substitutes {{location}} and {{description}}', () => {
    const svc = new TemplateService(baseSettings());
    const e = event({ location: 'Room 1', description: 'Agenda here' });
    expect(svc.expandTemplate('{{location}}', e)).toBe('Room 1');
    expect(svc.expandTemplate('{{description}}', e)).toBe('Agenda here');
  });

  it('substitutes empty string when location/description absent', () => {
    const svc = new TemplateService(baseSettings());
    expect(svc.expandTemplate('{{location}}', event())).toBe('');
    expect(svc.expandTemplate('{{description}}', event())).toBe('');
  });
});
