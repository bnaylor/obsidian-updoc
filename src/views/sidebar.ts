import { ItemView, WorkspaceLeaf } from 'obsidian';
import { CalendarEvent, UpdocSettings } from '../types';
import { CalendarService } from '../services/calendar';
import { NotesService } from '../services/notes';
import { SyncService } from '../services/sync';

export const SIDEBAR_VIEW_TYPE = 'updoc-meetings';

export class MeetingsSidebar extends ItemView {
  private events: CalendarEvent[] = [];
  private showHidden = false;
  private refreshTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private settings: UpdocSettings,
    private calendar: CalendarService,
    private notes: NotesService,
    private sync: SyncService | null = null,
  ) {
    super(leaf);
  }

  getViewType(): string { return SIDEBAR_VIEW_TYPE; }
  getDisplayText(): string { return 'Meetings'; }
  getIcon(): string { return 'calendar'; }

  async onOpen(): Promise<void> {
    await this.refresh();
    this.refreshTimer = window.setInterval(() => this.refresh(), 5 * 60 * 1000);
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async refresh(): Promise<void> {
    try {
      this.events = await this.calendar.fetchTodayEvents();
    } catch (e) {
      this.renderError(e);
      return;
    }
    await this.render();
  }

  private async render(): Promise<void> {
    const content = this.containerEl.children[1] as HTMLElement;
    content.empty();
    content.addClass('updoc-sidebar');

    if (this.events.length === 0) {
      content.createEl('p', { text: 'No meetings today.', cls: 'updoc-empty' });
      return;
    }

    const visible = this.events.filter(e => !this.calendar.isHidden(e));
    const hidden = this.events.filter(e => this.calendar.isHidden(e));
    const toShow = this.showHidden ? this.events : visible;

    for (const event of toShow) {
      await this.renderEventCard(content, event);
    }

    if (hidden.length > 0) {
      const label = this.showHidden ? 'Hide filtered events' : `${hidden.length} hidden`;
      const toggle = content.createEl('p', { text: label, cls: 'updoc-hidden-toggle' });
      toggle.addEventListener('click', () => {
        this.showHidden = !this.showHidden;
        this.render();
      });
    }
  }

  private async renderEventCard(container: HTMLElement, event: CalendarEvent): Promise<void> {
    const card = container.createDiv({ cls: 'updoc-event-card' });

    card.createEl('div', { text: formatTimeRange(event.startTime, event.endTime), cls: 'updoc-event-time' });
    card.createEl('div', { text: event.title, cls: 'updoc-event-title' });
    card.createEl('div', {
      text: `${event.attendees.length} attendee${event.attendees.length !== 1 ? 's' : ''}`,
      cls: 'updoc-event-attendees',
    });

    const existing = await this.notes.findExistingNotes(event.id);
    const actions = card.createDiv({ cls: 'updoc-event-actions' });

    if (existing.length > 0) {
      const openBtn = actions.createEl('button', { text: 'Open', cls: 'updoc-btn' });
      openBtn.addEventListener('click', () => {
        this.app.workspace.getLeaf('tab').openFile(existing[0]);
      });

      // Check if the first note is linked to a Google Doc
      const file = existing[0];
      const docId: string | undefined = (this.app.metadataCache.getFileCache(file) as { frontmatter?: Record<string, unknown> })?.frontmatter?.['googleDocId'] as string | undefined;

      if (docId) {
        const meta = this.settings.syncMeta[docId];
        const statusText = meta ? `Synced` : 'Linked';
        actions.createEl('span', { text: statusText, cls: 'updoc-sync-status' });
      } else {
        const publishBtn = actions.createEl('button', { text: 'Publish to Google Docs', cls: 'updoc-btn' });
        publishBtn.addEventListener('click', async () => {
          publishBtn.disabled = true;
          publishBtn.textContent = 'Publishing…';
          try {
            await this.sync?.publishNote(file, event.title);
            await this.render();
          } catch (e) {
            publishBtn.disabled = false;
            publishBtn.textContent = 'Publish to Google Docs';
            console.error('[updoc] publish failed:', e);
          }
        });
      }
    }

    const createBtn = actions.createEl('button', { text: 'Create Note', cls: 'updoc-btn updoc-btn-primary' });
    createBtn.addEventListener('click', async () => {
      const file = await this.notes.createNote(event);
      await this.app.workspace.getLeaf('tab').openFile(file);
      await this.render();
    });
  }

  private renderError(e: unknown): void {
    const content = this.containerEl.children[1] as HTMLElement;
    content.empty();

    const isAuthError = e instanceof Error && e.message.includes('Not authenticated');
    const msg = isAuthError
      ? 'Connect your Google Account in settings to see meetings.'
      : `Error: ${e instanceof Error ? e.message : String(e)}`;

    content.createEl('p', { text: msg, cls: 'updoc-error' });
  }
}

function formatTimeRange(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}
