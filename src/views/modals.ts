import { App, Modal, Setting } from 'obsidian';
import { TemplateRule } from '../types';

export class AddFilterRuleModal extends Modal {
  private value = '';

  constructor(app: App, private onSubmit: (value: string) => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Add filter rule' });

    new Setting(contentEl).setName('Title substring (case-insensitive)')
      .addText(t => t.setPlaceholder('e.g. Lunch')
        .onChange(v => { this.value = v; }));

    new Setting(contentEl)
      .addButton(b => b.setButtonText('Add').setCta().onClick(async () => {
        const trimmed = this.value.trim();
        if (trimmed) { await this.onSubmit(trimmed); this.close(); }
      }));
  }

  onClose(): void { this.contentEl.empty(); }
}

export class RuleEditorModal extends Modal {
  private draft: TemplateRule;

  constructor(app: App, rule: TemplateRule, private onSubmit: (rule: TemplateRule) => Promise<void>) {
    super(app);
    this.draft = { ...rule };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Template rule' });

    new Setting(contentEl).setName('Name')
      .addText(t => t.setValue(this.draft.name).onChange(v => { this.draft.name = v; }));

    new Setting(contentEl).setName('Match type')
      .addDropdown(d => d
        .addOption('title', 'Title (regex)')
        .addOption('email', 'Attendee email')
        .addOption('count', 'Attendee count')
        .setValue(this.draft.matchType)
        .onChange(v => { this.draft.matchType = v as TemplateRule['matchType']; }));

    new Setting(contentEl).setName('Pattern')
      .addText(t => t.setValue(this.draft.pattern).onChange(v => { this.draft.pattern = v; }));

    new Setting(contentEl).setName('CSS class (optional)')
      .setDesc('Written to cssclasses frontmatter — style with an Obsidian CSS snippet')
      .addText(t => t.setValue(this.draft.cssClass ?? '')
        .onChange(v => { this.draft.cssClass = v || undefined; }));

    new Setting(contentEl).setName('Template content')
      .setDesc('Variables: {{title}}, {{date}}, {{time}}, {{location}}, {{description}}, {{attendees}}');

    const textarea = contentEl.createEl('textarea', { cls: 'updoc-template-textarea' });
    textarea.value = this.draft.templateContent;
    textarea.rows = 10;
    textarea.style.width = '100%';
    textarea.addEventListener('input', () => { this.draft.templateContent = textarea.value; });

    new Setting(contentEl)
      .addButton(b => b.setButtonText('Save').setCta().onClick(async () => {
        if (!this.draft.name.trim() || !this.draft.pattern.trim()) return;
        if (this.draft.matchType === 'title') {
          try { new RegExp(this.draft.pattern); } catch { return; }
        }
        await this.onSubmit({ ...this.draft });
        this.close();
      }))
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()));
  }

  onClose(): void { this.contentEl.empty(); }
}
