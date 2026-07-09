export const normalizePath = (p: string): string =>
  p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');

export class Plugin {}
export class PluginSettingTab { constructor(public app: unknown, public plugin: unknown) {} }
export class ItemView {
  containerEl = {
    children: [null, {
      empty: () => {},
      addClass: () => {},
      createEl: (_tag: string, _opts?: unknown) => ({ addEventListener: () => {}, createDiv: () => ({}) }),
      createDiv: (_opts?: unknown) => ({
        createEl: () => ({ addEventListener: () => {} }),
        createDiv: () => ({}),
      }),
    }] as unknown[],
  };
  app: unknown = {};
  constructor(public leaf: unknown) {}
}
export class Modal {
  contentEl = {
    empty: () => {},
    createEl: (_tag: string, _opts?: unknown) => ({
      addEventListener: () => {},
      value: '',
      style: {},
      createDiv: (_opts?: unknown) => ({ style: {}, createEl: () => ({ addEventListener: () => {} }) }),
    }),
    createDiv: (_opts?: unknown) => ({
      style: {},
      createEl: (_tag: string, _opts?: unknown) => ({ addEventListener: () => {}, style: {} }),
      createDiv: (_opts?: unknown) => ({ style: {}, createEl: () => ({ addEventListener: () => {} }) }),
    }),
  };
  constructor(public app: unknown) {}
  open() {}
  close() {}
}
export class Setting {
  constructor(_containerEl: unknown) {}
  setName(_name: string) { return this; }
  setDesc(_desc: string) { return this; }
  addText(_cb: unknown) { return this; }
  addButton(_cb: unknown) { return this; }
  addDropdown(_cb: unknown) { return this; }
  setCta() { return this; }
  setWarning() { return this; }
}
export class WorkspaceLeaf {}
