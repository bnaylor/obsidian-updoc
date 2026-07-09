import { Plugin, WorkspaceLeaf } from 'obsidian';
import { UpdocSettings } from './types';
import { DEFAULT_SETTINGS, UpdocSettingTab } from './settings';
import { AuthService } from './services/auth';
import { CalendarService } from './services/calendar';
import { TemplateService } from './services/templates';
import { NotesService } from './services/notes';
import { MeetingsSidebar, SIDEBAR_VIEW_TYPE } from './views/sidebar';

export default class UpdocPlugin extends Plugin {
  settings!: UpdocSettings;
  private auth!: AuthService;
  private calendar!: CalendarService;
  private templates!: TemplateService;
  private notes!: NotesService;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.auth = new AuthService(this.settings, () => this.saveSettings());
    this.calendar = new CalendarService(this.settings, this.auth);
    this.templates = new TemplateService(this.settings);
    this.notes = new NotesService(this.app, this.settings, this.templates);

    this.registerView(SIDEBAR_VIEW_TYPE, leaf =>
      new MeetingsSidebar(leaf, this.settings, this.calendar, this.notes),
    );

    this.addSettingTab(new UpdocSettingTab(this.app, this, this.auth));

    this.addCommand({
      id: 'toggle-meetings-sidebar',
      name: 'Toggle meetings sidebar',
      callback: () => this.toggleSidebar(),
    });

    this.addRibbonIcon('calendar', 'Toggle meetings sidebar', () => this.toggleSidebar());
  }

  async onunload(): Promise<void> {
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
