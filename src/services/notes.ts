import { App, TFile, normalizePath } from 'obsidian';
import { CalendarEvent, UpdocSettings } from '../types';
import { TemplateService } from './templates';

const UNSAFE_CHARS = /[:/\\*?"<>|]/g;

function localDateStr(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function expandDateVars(pattern: string, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return pattern
    .replace('{{year}}', String(date.getFullYear()))
    .replace('{{month}}', pad(date.getMonth() + 1))
    .replace('{{day}}', pad(date.getDate()))
    .replace('{{HHmm}}', pad(date.getHours()) + pad(date.getMinutes()));
}

export function sanitizeFilename(name: string): string {
  return name.replace(UNSAFE_CHARS, '');
}

export function resolveUniquePath(folder: string, baseName: string, existingPaths: Set<string>): string {
  let path = `${folder}/${baseName}.md`;
  let counter = 2;
  while (existingPaths.has(path)) {
    path = `${folder}/${baseName} ${counter}.md`;
    counter++;
  }
  return path;
}

export class NotesService {
  constructor(
    private app: App,
    private settings: UpdocSettings,
    private templates: TemplateService,
  ) {}

  expandFolderPattern(event: CalendarEvent): string {
    return expandDateVars(this.settings.meetingFolderPattern, event.startTime);
  }

  expandFilenamePattern(event: CalendarEvent): string {
    const raw = expandDateVars(this.settings.filenamePattern, event.startTime)
      .replace('{{title}}', event.title);
    return sanitizeFilename(raw);
  }

  async findExistingNotes(meetingId: string): Promise<TFile[]> {
    return this.app.vault.getMarkdownFiles().filter(file => {
      const cache = this.app.metadataCache.getFileCache(file);
      return cache?.frontmatter?.['meetingId'] === meetingId;
    });
  }

  async createNote(event: CalendarEvent): Promise<TFile> {
    const folder = this.expandFolderPattern(event);
    const baseName = this.expandFilenamePattern(event);

    await this.ensureFolder(folder);

    const existing = new Set(
      this.app.vault.getMarkdownFiles().map(f => normalizePath(f.path)),
    );
    const path = resolveUniquePath(normalizePath(folder), baseName, existing);
    const content = this.buildNoteContent(event);

    return this.app.vault.create(path, content);
  }

  private buildNoteContent(event: CalendarEvent): string {
    const templateContent = this.templates.getTemplateContent(event);
    const body = this.templates.expandTemplate(templateContent, event);
    const cssClass = this.templates.getCssClass(event);

    const lines = [
      '---',
      `meetingId: ${event.id}`,
      `date: ${localDateStr(event.startTime)}`,
      `attendees: ${event.attendees.map(a => a.email).join(', ')}`,
    ];
    if (cssClass) lines.push(`cssclasses: ${cssClass}`);
    lines.push('---', '');

    return lines.join('\n') + body;
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath);
    const parts = normalized.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}
