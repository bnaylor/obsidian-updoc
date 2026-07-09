import { Plugin } from 'obsidian';
import { UpdocSettings } from './types';
import { DEFAULT_SETTINGS } from './settings';

export default class UpdocPlugin extends Plugin {
  settings!: UpdocSettings;

  async onload() {
    await this.loadSettings();
  }

  async onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
