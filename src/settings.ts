import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { UpdocSettings, TemplateRule } from './types';
import { AuthService } from './services/auth';
import { AddFilterRuleModal, RuleEditorModal } from './views/modals';

export const DEFAULT_SETTINGS: UpdocSettings = {
  clientId: '',
  clientSecret: '',
  tokens: null,
  calendarId: 'primary',
  meetingFolderPattern: 'Meetings/{{year}}/{{month}}/{{day}}',
  filenamePattern: '{{HHmm}} {{title}}',
  sidebarPosition: 'right',
  filterRules: [],
  templateRules: [],
  syncEnabled: true,
  syncMeta: {},
};

// Interface avoids circular import with main.ts
interface PluginHost {
  settings: UpdocSettings;
  saveSettings(): Promise<void>;
}

export class UpdocSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: PluginHost, private auth: AuthService) {
    super(app, plugin as unknown as Plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.renderAccountSection(containerEl);
    this.renderOrganizationSection(containerEl);
    this.renderRulesSection(containerEl);
  }

  private renderAccountSection(el: HTMLElement): void {
    el.createEl('h2', { text: 'Google Account' });

    new Setting(el).setName('Client ID')
      .addText(t => t.setValue(this.plugin.settings.clientId)
        .onChange(async v => { this.plugin.settings.clientId = v; await this.plugin.saveSettings(); }));

    new Setting(el).setName('Client Secret')
      .addText(t => t.setValue(this.plugin.settings.clientSecret).setPlaceholder('••••••••')
        .onChange(async v => { this.plugin.settings.clientSecret = v; await this.plugin.saveSettings(); }));

    if (this.plugin.settings.tokens) {
      new Setting(el)
        .setName(`Connected as ${this.plugin.settings.tokens.email}`)
        .addButton(b => b.setButtonText('Disconnect').setWarning().onClick(async () => {
          await this.auth.disconnect();
          this.display();
        }));
    } else {
      new Setting(el).setName('Connect Google Account')
        .addButton(b => b.setButtonText('Connect').setCta().onClick(async () => {
          try {
            await this.auth.startOAuthFlow();
            this.display();
          } catch (e) {
            console.error('OAuth failed:', e);
          }
        }));
    }
  }

  private renderOrganizationSection(el: HTMLElement): void {
    el.createEl('h2', { text: 'Note Organization' });

    new Setting(el).setName('Meeting folder pattern')
      .setDesc('Variables: {{year}}, {{month}}, {{day}}')
      .addText(t => t.setValue(this.plugin.settings.meetingFolderPattern)
        .onChange(async v => { this.plugin.settings.meetingFolderPattern = v; await this.plugin.saveSettings(); }));

    new Setting(el).setName('Filename pattern')
      .setDesc('Variables: {{HHmm}}, {{title}}')
      .addText(t => t.setValue(this.plugin.settings.filenamePattern)
        .onChange(async v => { this.plugin.settings.filenamePattern = v; await this.plugin.saveSettings(); }));

    new Setting(el).setName('Calendar ID')
      .setDesc('Use "primary" for your main calendar')
      .addText(t => t.setValue(this.plugin.settings.calendarId)
        .onChange(async v => { this.plugin.settings.calendarId = v; await this.plugin.saveSettings(); }));

    new Setting(el).setName('Sidebar position')
      .addDropdown(d => d
        .addOption('left', 'Left').addOption('right', 'Right')
        .setValue(this.plugin.settings.sidebarPosition)
        .onChange(async v => {
          this.plugin.settings.sidebarPosition = v as 'left' | 'right';
          await this.plugin.saveSettings();
        }));
  }

  private renderRulesSection(el: HTMLElement): void {
    el.createEl('h2', { text: 'Rules' });

    el.createEl('h3', { text: 'Calendar filter rules' });
    el.createEl('p', { text: 'Events whose title contains any of these (case-insensitive) will be hidden.', cls: 'setting-item-description' });

    this.plugin.settings.filterRules.forEach((rule, i) => {
      new Setting(el).setName(rule)
        .addButton(b => b.setButtonText('Delete').setWarning().onClick(async () => {
          this.plugin.settings.filterRules.splice(i, 1);
          await this.plugin.saveSettings();
          this.display();
        }));
    });

    new Setting(el).addButton(b => b.setButtonText('+ Add filter rule').onClick(() => {
      new AddFilterRuleModal(this.app, async value => {
        this.plugin.settings.filterRules.push(value);
        await this.plugin.saveSettings();
        this.display();
      }).open();
    }));

    el.createEl('h3', { text: 'Template rules' });
    el.createEl('p', { text: 'Evaluated in order — first match wins.', cls: 'setting-item-description' });

    this.plugin.settings.templateRules.forEach((rule, i) => {
      new Setting(el).setName(rule.name).setDesc(`${rule.matchType}: ${rule.pattern}`)
        .addButton(b => b.setButtonText('Edit').onClick(() => {
          new RuleEditorModal(this.app, rule, async updated => {
            this.plugin.settings.templateRules[i] = updated;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        }))
        .addButton(b => b.setButtonText('Delete').setWarning().onClick(async () => {
          this.plugin.settings.templateRules.splice(i, 1);
          await this.plugin.saveSettings();
          this.display();
        }));
    });

    new Setting(el).addButton(b => b.setButtonText('+ Add template rule').onClick(() => {
      const blank: TemplateRule = {
        id: crypto.randomUUID(),
        name: '',
        matchType: 'title',
        pattern: '',
        templateContent: '# {{title}}\n\nDate: {{date}}\nAttendees: {{attendees}}\n\n## Notes\n\n- ',
      };
      new RuleEditorModal(this.app, blank, async created => {
        this.plugin.settings.templateRules.push(created);
        await this.plugin.saveSettings();
        this.display();
      }).open();
    }));
  }
}
