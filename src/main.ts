import { Plugin, WorkspaceLeaf, MarkdownView } from 'obsidian';
import { UpdocSettings } from './types';
import { DEFAULT_SETTINGS, UpdocSettingTab } from './settings';
import { AuthService } from './services/auth';
import { CalendarService } from './services/calendar';
import { TemplateService } from './services/templates';
import { NotesService } from './services/notes';
import { GDriveService } from './services/gdrive';
import { GDocsService } from './services/gdocs';
import { SyncService } from './services/sync';
import { ConflictModal } from './views/modals';
import { MeetingsSidebar, SIDEBAR_VIEW_TYPE } from './views/sidebar';

export default class UpdocPlugin extends Plugin {
  settings!: UpdocSettings;
  private auth!: AuthService;
  private calendar!: CalendarService;
  private templates!: TemplateService;
  private notes!: NotesService;
  private gdrive!: GDriveService;
  private gdocs!: GDocsService;
  private sync!: SyncService;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.auth = new AuthService(this.settings, () => this.saveSettings());
    this.calendar = new CalendarService(this.settings, this.auth);
    this.templates = new TemplateService(this.settings);
    this.notes = new NotesService(this.app, this.settings, this.templates);
    this.gdrive = new GDriveService();
    this.gdocs = new GDocsService();
    this.sync = new SyncService(
      this.app,
      this.auth,
      this.gdrive,
      this.gdocs,
      this.settings,
      () => this.saveSettings(),
      (local, remote, onMine, onTheirs) =>
        new ConflictModal(this.app, local, remote, onMine, onTheirs).open(),
    );

    this.registerView(SIDEBAR_VIEW_TYPE, leaf =>
      new MeetingsSidebar(leaf, this.settings, this.calendar, this.notes, this.sync),
    );

    this.addSettingTab(new UpdocSettingTab(this.app, this, this.auth));

    this.addCommand({
      id: 'toggle-meetings-sidebar',
      name: 'Toggle meetings sidebar',
      callback: () => this.toggleSidebar(),
    });

    this.addRibbonIcon('calendar', 'Toggle meetings sidebar', () => this.toggleSidebar());

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (!leaf) { this.sync.stop(); return; }
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file) {
          const docId = this.app.metadataCache.getFileCache(view.file)?.frontmatter?.['googleDocId'];
          if (docId && this.settings.syncEnabled) {
            this.sync.startFor(view.file);
          } else {
            this.sync.stop();
          }
        } else {
          this.sync.stop();
        }
      }),
    );
  }

  async onunload(): Promise<void> {
    this.sync.stop();
    this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async toggleSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    if (existing.length > 0) {
      existing[0].detach();
      return;
    }

    const leaf: WorkspaceLeaf | null = this.settings.sidebarPosition === 'left'
      ? this.app.workspace.getLeftLeaf(false)
      : this.app.workspace.getRightLeaf(false);

    if (leaf) {
      await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }
}
