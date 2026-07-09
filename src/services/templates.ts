import { CalendarEvent, TemplateRule, UpdocSettings } from '../types';

const DEFAULT_TEMPLATE = `# {{title}}

Date: {{date}}
Attendees: {{attendees}}

## Notes

- `;

export class TemplateService {
  constructor(private settings: UpdocSettings) {}

  matchRule(event: CalendarEvent): TemplateRule | null {
    for (const rule of this.settings.templateRules) {
      if (this.ruleMatches(rule, event)) return rule;
    }
    return null;
  }

  private ruleMatches(rule: TemplateRule, event: CalendarEvent): boolean {
    switch (rule.matchType) {
      case 'title':
        return new RegExp(rule.pattern, 'i').test(event.title);
      case 'email':
        return event.attendees.some(a => a.email === rule.pattern);
      case 'count':
        return event.attendees.length === parseInt(rule.pattern, 10);
    }
  }

  getTemplateContent(event: CalendarEvent): string {
    return this.matchRule(event)?.templateContent ?? DEFAULT_TEMPLATE;
  }

  getCssClass(event: CalendarEvent): string | undefined {
    return this.matchRule(event)?.cssClass;
  }

  expandTemplate(templateContent: string, event: CalendarEvent): string {
    const attendeeNames = event.attendees
      .map(a => a.displayName ?? a.email)
      .join(', ');

    const vars: Record<string, string> = {
      title: event.title,
      date: event.startTime.toISOString().split('T')[0],
      time: event.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      location: event.location ?? '',
      description: event.description ?? '',
      attendees: attendeeNames,
    };

    return templateContent.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
      key in vars ? vars[key] : match,
    );
  }
}
