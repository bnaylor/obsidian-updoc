# Foundation, Calendar & Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian plugin that shows today's Google Calendar meetings in a sidebar and creates templated meeting notes with temporal folder organization.

**Architecture:** Single Obsidian plugin in TypeScript. Pure business logic (template matching, pattern expansion, URL building) is extracted into standalone exported functions so it can be unit-tested without mocking Obsidian APIs. Vault-touching code lives in service classes that are tested manually in Obsidian.

**Tech Stack:** TypeScript 5, Obsidian Plugin API, esbuild (bundler), Vitest (unit tests), Google Calendar REST API v3, Google OAuth2.

## Global Constraints

- `"isDesktopOnly": true` in manifest.json — Node.js `http` module is used for OAuth listener
- Obsidian minimum version: `1.4.0`
- TypeScript strict null checks on (`"strictNullChecks": true`, `"noImplicitAny": true`)
- No singleton globals — every service receives its dependencies as constructor args
- Token storage: Obsidian plugin data only (`loadData`/`saveData`), never written to vault files
- esbuild output: `main.js` at repo root (Obsidian convention)
- Test files live in `tests/` mirroring `src/` structure

---

## File Map

| File | Role |
|---|---|
| `manifest.json` | Obsidian plugin metadata |
| `package.json` | Build scripts, devDependencies |
| `tsconfig.json` | TypeScript compiler config |
| `esbuild.config.mjs` | Bundle entrypoint → `main.js` |
| `vitest.config.ts` | Test runner config with obsidian mock alias |
| `__mocks__/obsidian.ts` | Stub Obsidian module for unit tests |
| `.gitignore` | Ignore `node_modules/`, `main.js`, `.obsidian/` |
| `src/types.ts` | All shared interfaces: `UpdocSettings`, `TemplateRule`, `CalendarEvent`, `Attendee`, `TokenData` |
| `src/settings.ts` | `DEFAULT_SETTINGS` constant + `UpdocSettingTab` class |
| `src/main.ts` | `UpdocPlugin` default export — wires all services, registers view/command/ribbon |
| `src/services/templates.ts` | `TemplateService` + exported pure helpers |
| `src/services/notes.ts` | `NotesService` + exported pure helpers |
| `src/services/auth.ts` | `AuthService` + exported pure helpers |
| `src/services/calendar.ts` | `CalendarService` + exported pure helpers |
| `src/views/sidebar.ts` | `MeetingsSidebar` (`ItemView`), `SIDEBAR_VIEW_TYPE` |
| `src/views/modals.ts` | `AddFilterRuleModal`, `RuleEditorModal` |
| `tests/services/templates.test.ts` | Unit tests for template matching + expansion |
| `tests/services/notes.test.ts` | Unit tests for pattern expansion + sanitization |
| `tests/services/auth.test.ts` | Unit tests for URL building + token refresh logic |
| `tests/services/calendar.test.ts` | Unit tests for event parsing + filter logic |

---

## Task 1: Plugin Scaffold & Shared Types

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `vitest.config.ts`
- Create: `__mocks__/obsidian.ts`
- Create: `.gitignore`
- Create: `src/types.ts`
- Create: `src/settings.ts`
- Create: `src/main.ts`

**Interfaces produced (used by all later tasks):**

```ts
// src/types.ts — exact names used in every subsequent task
interface TokenData { accessToken: string; refreshToken: string; expiresAt: number; email: string; }
interface UpdocSettings { clientId: string; clientSecret: string; tokens: TokenData | null; calendarId: string; meetingFolderPattern: string; filenamePattern: string; sidebarPosition: 'left' | 'right'; filterRules: string[]; templateRules: TemplateRule[]; }
interface TemplateRule { id: string; name: string; matchType: 'title' | 'email' | 'count'; pattern: string; templateContent: string; cssClass?: string; }
interface CalendarEvent { id: string; title: string; startTime: Date; endTime: Date; location?: string; description?: string; attendees: Attendee[]; }
interface Attendee { email: string; displayName?: string; }
```

- [ ] **Step 1: Create manifest.json**

```json
{
  "id": "updoc",
  "name": "updoc",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Google Calendar & Docs integration for Obsidian",
  "author": "Brian Naylor",
  "authorUrl": "",
  "isDesktopOnly": true
}
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "updoc-obs",
  "version": "0.1.0",
  "description": "Google Calendar & Docs integration for Obsidian",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc --noEmit && node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.21.0",
    "obsidian": "latest",
    "tslib": "^2.6.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES2018",
    "allowImportingTsExtensions": true,
    "moduleResolution": "bundler",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "lib": ["ES2018", "DOM"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create esbuild.config.mjs**

```js
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

- [ ] **Step 5: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      obsidian: resolve(__dirname, '__mocks__/obsidian.ts'),
    },
  },
});
```

- [ ] **Step 6: Create `__mocks__/obsidian.ts`**

```ts
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
    createEl: (_tag: string, _opts?: unknown) => ({ addEventListener: () => {}, value: '' }),
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
  setWarning() { return this; }
}
export class WorkspaceLeaf {}
```

- [ ] **Step 7: Create .gitignore**

```
node_modules/
main.js
main.js.map
.obsidian/
dist/
```

- [ ] **Step 8: Create src/types.ts**

```ts
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}

export interface TemplateRule {
  id: string;
  name: string;
  matchType: 'title' | 'email' | 'count';
  pattern: string;
  templateContent: string;
  cssClass?: string;
}

export interface Attendee {
  email: string;
  displayName?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  description?: string;
  attendees: Attendee[];
}

export interface UpdocSettings {
  clientId: string;
  clientSecret: string;
  tokens: TokenData | null;
  calendarId: string;
  meetingFolderPattern: string;
  filenamePattern: string;
  sidebarPosition: 'left' | 'right';
  filterRules: string[];
  templateRules: TemplateRule[];
}
```

- [ ] **Step 9: Create src/settings.ts (schema only — UI added in Task 6)**

```ts
import { UpdocSettings } from './types';

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
};
```

- [ ] **Step 10: Create src/main.ts (minimal skeleton — fully wired in Task 8)**

```ts
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
```

- [ ] **Step 11: Install dependencies**

```bash
cd ~/src/updoc-obs && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 12: Verify build**

```bash
cd ~/src/updoc-obs && npm run build
```

Expected: `main.js` created at repo root, TypeScript reports zero errors.

- [ ] **Step 13: Commit**

```bash
cd ~/src/updoc-obs
git add manifest.json package.json tsconfig.json esbuild.config.mjs vitest.config.ts __mocks__/obsidian.ts .gitignore src/types.ts src/settings.ts src/main.ts package-lock.json
git commit -m "feat: plugin scaffold, shared types, build + test infrastructure"
```

---

## Task 2: Template Engine

**Files:**
- Create: `src/services/templates.ts`
- Create: `tests/services/templates.test.ts`

**Interfaces consumed:** `CalendarEvent`, `Attendee`, `TemplateRule`, `UpdocSettings` from `src/types.ts`

**Interfaces produced:**
```ts
// src/services/templates.ts
export class TemplateService {
  constructor(settings: UpdocSettings)
  matchRule(event: CalendarEvent): TemplateRule | null
  getTemplateContent(event: CalendarEvent): string
  getCssClass(event: CalendarEvent): string | undefined
  expandTemplate(templateContent: string, event: CalendarEvent): string
}
```

- [ ] **Step 1: Write failing tests**

Create `tests/services/templates.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd ~/src/updoc-obs && npm test
```

Expected: multiple failures — `TemplateService` not found.

- [ ] **Step 3: Implement src/services/templates.ts**

```ts
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
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd ~/src/updoc-obs && npm test
```

Expected: all tests pass, zero failures.

- [ ] **Step 5: Commit**

```bash
cd ~/src/updoc-obs
git add src/services/templates.ts tests/services/templates.test.ts
git commit -m "feat: template engine with rule matching and variable expansion"
```

---

## Task 3: Notes Service

**Files:**
- Create: `src/services/notes.ts`
- Create: `tests/services/notes.test.ts`

**Interfaces consumed:** `CalendarEvent`, `UpdocSettings` from `src/types.ts`; `TemplateService` from `src/services/templates.ts`

**Interfaces produced:**
```ts
// Exported pure helpers (tested directly)
export function expandDateVars(pattern: string, date: Date): string
export function sanitizeFilename(name: string): string
export function resolveUniquePath(folder: string, baseName: string, existingPaths: Set<string>): string

// Service class (vault operations — manually tested)
export class NotesService {
  constructor(app: App, settings: UpdocSettings, templates: TemplateService)
  expandFolderPattern(event: CalendarEvent): string
  expandFilenamePattern(event: CalendarEvent): string
  findExistingNotes(meetingId: string): Promise<TFile[]>
  createNote(event: CalendarEvent): Promise<TFile>
}
```

- [ ] **Step 1: Write failing tests**

Create `tests/services/notes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { expandDateVars, sanitizeFilename, resolveUniquePath } from '../../src/services/notes';

describe('expandDateVars', () => {
  const date = new Date('2026-07-08T09:05:00');

  it('expands {{year}}', () => {
    expect(expandDateVars('{{year}}', date)).toBe('2026');
  });

  it('expands {{month}} with zero-padding', () => {
    expect(expandDateVars('{{month}}', date)).toBe('07');
  });

  it('expands {{day}} with zero-padding', () => {
    expect(expandDateVars('{{day}}', date)).toBe('08');
  });

  it('expands {{HHmm}} in 24-hour zero-padded format', () => {
    expect(expandDateVars('{{HHmm}}', date)).toBe('0905');
  });

  it('expands full meeting folder pattern', () => {
    expect(expandDateVars('Meetings/{{year}}/{{month}}/{{day}}', date))
      .toBe('Meetings/2026/07/08');
  });

  it('zero-pads single-digit month', () => {
    expect(expandDateVars('{{month}}', new Date('2026-03-01T00:00:00'))).toBe('03');
  });
});

describe('sanitizeFilename', () => {
  it('removes colon', () => {
    expect(sanitizeFilename('09:00 Standup')).toBe('0900 Standup');
  });

  it('removes all unsafe characters', () => {
    expect(sanitizeFilename('a/b\\c*d?e"f<g>h|i')).toBe('abcdefghi');
  });

  it('leaves safe characters intact', () => {
    expect(sanitizeFilename('Team Standup - Q3')).toBe('Team Standup - Q3');
  });
});

describe('resolveUniquePath', () => {
  it('returns base path when no conflict', () => {
    const result = resolveUniquePath('Meetings/2026/07/08', 'Standup', new Set());
    expect(result).toBe('Meetings/2026/07/08/Standup.md');
  });

  it('appends counter 2 on first conflict', () => {
    const existing = new Set(['Meetings/2026/07/08/Standup.md']);
    const result = resolveUniquePath('Meetings/2026/07/08', 'Standup', existing);
    expect(result).toBe('Meetings/2026/07/08/Standup 2.md');
  });

  it('increments counter until unique', () => {
    const existing = new Set([
      'Meetings/2026/07/08/Standup.md',
      'Meetings/2026/07/08/Standup 2.md',
    ]);
    const result = resolveUniquePath('Meetings/2026/07/08', 'Standup', existing);
    expect(result).toBe('Meetings/2026/07/08/Standup 3.md');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd ~/src/updoc-obs && npm test
```

Expected: failures — `expandDateVars`, `sanitizeFilename`, `resolveUniquePath` not found.

- [ ] **Step 3: Implement src/services/notes.ts**

```ts
import { App, TFile, normalizePath } from 'obsidian';
import { CalendarEvent, UpdocSettings } from '../types';
import { TemplateService } from './templates';

const UNSAFE_CHARS = /[:/\\*?"<>|]/g;

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
      `date: ${event.startTime.toISOString().split('T')[0]}`,
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
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd ~/src/updoc-obs && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/src/updoc-obs
git add src/services/notes.ts tests/services/notes.test.ts
git commit -m "feat: notes service with pattern expansion and folder creation"
```

---

## Task 4: Auth Service

**Files:**
- Create: `src/services/auth.ts`
- Create: `tests/services/auth.test.ts`

**Interfaces consumed:** `UpdocSettings`, `TokenData` from `src/types.ts`

**Interfaces produced:**
```ts
// Exported pure helpers (tested directly)
export function buildAuthUrl(clientId: string, redirectUri: string): string
export function buildTokenRequestBody(params: Record<string, string>): string

// Service class
export class AuthService {
  constructor(settings: UpdocSettings, saveSettings: () => Promise<void>)
  isConnected(): boolean
  getValidAccessToken(): Promise<string>
  startOAuthFlow(): Promise<void>
  disconnect(): Promise<void>
}
```

- [ ] **Step 1: Write failing tests**

Create `tests/services/auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAuthUrl, buildTokenRequestBody, AuthService } from '../../src/services/auth';
import { UpdocSettings } from '../../src/types';

const baseSettings = (): UpdocSettings => ({
  clientId: 'test-client-id',
  clientSecret: 'test-secret',
  tokens: null,
  calendarId: 'primary',
  meetingFolderPattern: 'Meetings/{{year}}/{{month}}/{{day}}',
  filenamePattern: '{{HHmm}} {{title}}',
  sidebarPosition: 'right',
  filterRules: [],
  templateRules: [],
});

describe('buildAuthUrl', () => {
  it('constructs a valid OAuth URL', () => {
    const url = new URL(buildAuthUrl('my-client-id', 'http://localhost:8080/callback'));
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('my-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:8080/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('scope')).toContain('calendar.events.readonly');
  });
});

describe('buildTokenRequestBody', () => {
  it('encodes params as application/x-www-form-urlencoded', () => {
    const body = buildTokenRequestBody({ grant_type: 'refresh_token', client_id: 'abc' });
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('client_id=abc');
  });
});

describe('AuthService.isConnected', () => {
  it('returns false when tokens is null', () => {
    const svc = new AuthService(baseSettings(), async () => {});
    expect(svc.isConnected()).toBe(false);
  });

  it('returns true when tokens present', () => {
    const settings = baseSettings();
    settings.tokens = { accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 60_000, email: 'a@b.com' };
    const svc = new AuthService(settings, async () => {});
    expect(svc.isConnected()).toBe(true);
  });
});

describe('AuthService.getValidAccessToken', () => {
  it('throws when not connected', async () => {
    const svc = new AuthService(baseSettings(), async () => {});
    await expect(svc.getValidAccessToken()).rejects.toThrow('Not authenticated');
  });

  it('returns current token when not close to expiry', async () => {
    const settings = baseSettings();
    settings.tokens = { accessToken: 'fresh-tok', refreshToken: 'ref', expiresAt: Date.now() + 600_000, email: 'a@b.com' };
    const svc = new AuthService(settings, async () => {});
    expect(await svc.getValidAccessToken()).toBe('fresh-tok');
  });

  it('refreshes token when within 60s of expiry', async () => {
    const settings = baseSettings();
    settings.tokens = { accessToken: 'old-tok', refreshToken: 'ref-tok', expiresAt: Date.now() + 30_000, email: 'a@b.com' };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-tok', expires_in: 3600 }),
    });

    const svc = new AuthService(settings, async () => {}, mockFetch as unknown as typeof fetch);
    const token = await svc.getValidAccessToken();

    expect(token).toBe('new-tok');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(settings.tokens?.accessToken).toBe('new-tok');
  });

  it('clears tokens and throws when refresh fails', async () => {
    const settings = baseSettings();
    settings.tokens = { accessToken: 'old', refreshToken: 'ref', expiresAt: Date.now() + 30_000, email: 'a@b.com' };

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const svc = new AuthService(settings, async () => {}, mockFetch as unknown as typeof fetch);

    await expect(svc.getValidAccessToken()).rejects.toThrow();
    expect(settings.tokens).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd ~/src/updoc-obs && npm test
```

Expected: failures — `AuthService`, `buildAuthUrl`, `buildTokenRequestBody` not found.

- [ ] **Step 3: Implement src/services/auth.ts**

```ts
import * as http from 'http';
import { UpdocSettings, TokenData } from '../types';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events.readonly'];

export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export function buildTokenRequestBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export class AuthService {
  constructor(
    private settings: UpdocSettings,
    private saveSettings: () => Promise<void>,
    private fetchFn: typeof fetch = fetch,
  ) {}

  isConnected(): boolean {
    return this.settings.tokens !== null;
  }

  async getValidAccessToken(): Promise<string> {
    if (!this.settings.tokens) throw new Error('Not authenticated');

    const { accessToken, refreshToken, expiresAt } = this.settings.tokens;
    if (Date.now() < expiresAt - 60_000) return accessToken;

    return this.refreshToken(refreshToken);
  }

  private async refreshToken(refreshToken: string): Promise<string> {
    const response = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: buildTokenRequestBody({
        client_id: this.settings.clientId,
        client_secret: this.settings.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      this.settings.tokens = null;
      await this.saveSettings();
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.settings.tokens = {
      ...this.settings.tokens!,
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    await this.saveSettings();
    return this.settings.tokens.accessToken;
  }

  async startOAuthFlow(): Promise<void> {
    if (!this.settings.clientId || !this.settings.clientSecret) {
      throw new Error('Client ID and Client Secret must be set before connecting.');
    }

    const port = await this.findFreePort();
    const redirectUri = `http://localhost:${port}/callback`;
    const authUrl = buildAuthUrl(this.settings.clientId, redirectUri);

    const codePromise = this.listenForCode(port);
    window.open(authUrl);

    const code = await codePromise;
    await this.exchangeCode(code, redirectUri);
  }

  async disconnect(): Promise<void> {
    this.settings.tokens = null;
    await this.saveSettings();
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        server.close(() => resolve(addr.port));
      });
      server.on('error', reject);
    });
  }

  private listenForCode(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${port}`);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Connected! You can close this tab.</h1></body></html>');
        server.close();

        if (error) reject(new Error(`OAuth error: ${error}`));
        else if (code) resolve(code);
        else reject(new Error('No authorization code received'));
      });

      server.listen(port);

      setTimeout(() => {
        server.close();
        reject(new Error('OAuth flow timed out after 2 minutes'));
      }, 120_000);
    });
  }

  private async exchangeCode(code: string, redirectUri: string): Promise<void> {
    const response = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: buildTokenRequestBody({
        client_id: this.settings.clientId,
        client_secret: this.settings.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) throw new Error('Authorization code exchange failed');

    const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number };

    const userInfoResponse = await this.fetchFn(USERINFO_URL, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const userInfo = await userInfoResponse.json() as { email: string };

    this.settings.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      email: userInfo.email,
    };
    await this.saveSettings();
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd ~/src/updoc-obs && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/src/updoc-obs
git add src/services/auth.ts tests/services/auth.test.ts
git commit -m "feat: auth service with OAuth flow and token refresh"
```

---

## Task 5: Calendar Service

**Files:**
- Create: `src/services/calendar.ts`
- Create: `tests/services/calendar.test.ts`

**Interfaces consumed:** `CalendarEvent`, `Attendee`, `UpdocSettings` from `src/types.ts`; `AuthService` from `src/services/auth.ts`

**Interfaces produced:**
```ts
// Exported pure helpers
export function parseCalendarEvent(item: unknown): CalendarEvent | null
export function buildCalendarUrl(calendarId: string, timeMin: string, timeMax: string): string

// Service class
export class CalendarService {
  constructor(settings: UpdocSettings, auth: AuthService)
  fetchTodayEvents(): Promise<CalendarEvent[]>
  isHidden(event: CalendarEvent): boolean
}
```

- [ ] **Step 1: Write failing tests**

Create `tests/services/calendar.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { parseCalendarEvent, buildCalendarUrl, CalendarService } from '../../src/services/calendar';
import { UpdocSettings } from '../../src/types';
import { AuthService } from '../../src/services/auth';

const baseSettings = (): UpdocSettings => ({
  clientId: '', clientSecret: '', tokens: null,
  calendarId: 'primary',
  meetingFolderPattern: '', filenamePattern: '',
  sidebarPosition: 'right',
  filterRules: [],
  templateRules: [],
});

const googleItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt1',
  summary: 'Team Standup',
  start: { dateTime: '2026-07-08T09:00:00-07:00' },
  end: { dateTime: '2026-07-08T09:30:00-07:00' },
  attendees: [{ email: 'a@co.com', displayName: 'Alice' }],
  ...overrides,
});

describe('parseCalendarEvent', () => {
  it('parses a standard event', () => {
    const result = parseCalendarEvent(googleItem());
    expect(result).not.toBeNull();
    expect(result!.id).toBe('evt1');
    expect(result!.title).toBe('Team Standup');
    expect(result!.attendees[0].email).toBe('a@co.com');
    expect(result!.attendees[0].displayName).toBe('Alice');
  });

  it('returns null for all-day events (no dateTime)', () => {
    const item = googleItem({ start: { date: '2026-07-08' }, end: { date: '2026-07-09' } });
    expect(parseCalendarEvent(item)).toBeNull();
  });

  it('uses "(No title)" when summary absent', () => {
    const item = googleItem({ summary: undefined });
    expect(parseCalendarEvent(item)!.title).toBe('(No title)');
  });

  it('handles missing attendees gracefully', () => {
    const item = googleItem({ attendees: undefined });
    expect(parseCalendarEvent(item)!.attendees).toEqual([]);
  });
});

describe('buildCalendarUrl', () => {
  it('constructs Google Calendar events URL', () => {
    const url = new URL(buildCalendarUrl('primary', '2026-07-08T00:00:00Z', '2026-07-09T00:00:00Z'));
    expect(url.hostname).toBe('www.googleapis.com');
    expect(url.pathname).toContain('primary');
    expect(url.pathname).toContain('events');
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('orderBy')).toBe('startTime');
    expect(url.searchParams.get('timeMin')).toBe('2026-07-08T00:00:00Z');
    expect(url.searchParams.get('timeMax')).toBe('2026-07-09T00:00:00Z');
  });
});

describe('CalendarService.isHidden', () => {
  it('returns true when title contains filter rule (case-insensitive)', () => {
    const settings = baseSettings();
    settings.filterRules = ['lunch', 'focus time'];
    const auth = new AuthService(settings, async () => {});
    const svc = new CalendarService(settings, auth);
    const event = parseCalendarEvent(googleItem({ summary: 'Lunch Break' }))!;
    expect(svc.isHidden(event)).toBe(true);
  });

  it('returns false when no rules match', () => {
    const settings = baseSettings();
    settings.filterRules = ['lunch'];
    const auth = new AuthService(settings, async () => {});
    const svc = new CalendarService(settings, auth);
    const event = parseCalendarEvent(googleItem({ summary: 'Team Standup' }))!;
    expect(svc.isHidden(event)).toBe(false);
  });

  it('returns false when filterRules is empty', () => {
    const svc = new CalendarService(baseSettings(), new AuthService(baseSettings(), async () => {}));
    const event = parseCalendarEvent(googleItem())!;
    expect(svc.isHidden(event)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd ~/src/updoc-obs && npm test
```

Expected: failures — `CalendarService` etc. not found.

- [ ] **Step 3: Implement src/services/calendar.ts**

```ts
import { CalendarEvent, Attendee, UpdocSettings } from '../types';
import { AuthService } from './auth';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export function buildCalendarUrl(calendarId: string, timeMin: string, timeMax: string): string {
  const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  return url.toString();
}

export function parseCalendarEvent(item: unknown): CalendarEvent | null {
  const i = item as Record<string, unknown>;
  const start = i['start'] as Record<string, string> | undefined;
  const end = i['end'] as Record<string, string> | undefined;

  if (!start?.['dateTime']) return null;

  const rawAttendees = (i['attendees'] as Array<Record<string, string>> | undefined) ?? [];
  const attendees: Attendee[] = rawAttendees.map(a => ({
    email: a['email'],
    displayName: a['displayName'],
  }));

  return {
    id: i['id'] as string,
    title: (i['summary'] as string | undefined) ?? '(No title)',
    startTime: new Date(start['dateTime']),
    endTime: new Date(end!['dateTime']),
    location: i['location'] as string | undefined,
    description: i['description'] as string | undefined,
    attendees,
  };
}

export class CalendarService {
  constructor(private settings: UpdocSettings, private auth: AuthService) {}

  async fetchTodayEvents(): Promise<CalendarEvent[]> {
    const token = await this.auth.getValidAccessToken();

    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const response = await fetch(buildCalendarUrl(this.settings.calendarId, timeMin, timeMax), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);

    const data = await response.json() as { items?: unknown[] };
    return (data.items ?? []).map(parseCalendarEvent).filter((e): e is CalendarEvent => e !== null);
  }

  isHidden(event: CalendarEvent): boolean {
    const title = event.title.toLowerCase();
    return this.settings.filterRules.some(rule => title.includes(rule.toLowerCase()));
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd ~/src/updoc-obs && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/src/updoc-obs
git add src/services/calendar.ts tests/services/calendar.test.ts
git commit -m "feat: calendar service with event fetching and filter rules"
```

---

## Task 6: Settings Tab & Modals

**Files:**
- Modify: `src/settings.ts` (add `UpdocSettingTab` class)
- Create: `src/views/modals.ts`

**Interfaces consumed:** `UpdocSettings`, `TemplateRule` from `src/types.ts`; `AuthService` from `src/services/auth.ts`; `DEFAULT_SETTINGS` from `src/settings.ts`

**Interfaces produced:**
```ts
// src/settings.ts additions
export class UpdocSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: UpdocPlugin, auth: AuthService)
  display(): void
}

// src/views/modals.ts
export class AddFilterRuleModal extends Modal {
  constructor(app: App, onSubmit: (value: string) => Promise<void>)
}
export class RuleEditorModal extends Modal {
  constructor(app: App, rule: TemplateRule, onSubmit: (rule: TemplateRule) => Promise<void>)
}
```

- [ ] **Step 1: Replace src/settings.ts with the full file below**

```ts
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
```

- [ ] **Step 2: Create src/views/modals.ts**

```ts
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
```

- [ ] **Step 3: Verify build still passes**

```bash
cd ~/src/updoc-obs && npm run build
```

Expected: zero TypeScript errors, `main.js` updated.

- [ ] **Step 4: Manual test — install plugin in an Obsidian vault**

a. Copy `manifest.json` and `main.js` to a test vault's `.obsidian/plugins/updoc/` folder.
b. Enable the plugin in Obsidian → Settings → Community plugins.
c. Open Settings → updoc. Verify three sections render: Google Account, Note Organization, Rules.
d. Enter test text in Client ID field, verify it persists after closing and reopening settings.
e. Click "+ Add filter rule", enter "Lunch", click Add. Verify it appears in the list.
f. Click "+ Add template rule", fill in name "1:1" / match type "Title (regex)" / pattern "1:1" / some template content, click Save. Verify it appears in the list.
g. Click Edit on the new rule, change the name, click Save. Verify the update persists.

- [ ] **Step 5: Commit**

```bash
cd ~/src/updoc-obs
git add src/settings.ts src/views/modals.ts
git commit -m "feat: settings tab with Google account, note organization, and rules UI"
```

---

## Task 7: Calendar Sidebar

**Files:**
- Create: `src/views/sidebar.ts`

**Interfaces consumed:** `CalendarEvent`, `UpdocSettings` from `src/types.ts`; `CalendarService` from `src/services/calendar.ts`; `NotesService` from `src/services/notes.ts`

**Interfaces produced:**
```ts
export const SIDEBAR_VIEW_TYPE = 'updoc-meetings';

export class MeetingsSidebar extends ItemView {
  constructor(leaf: WorkspaceLeaf, settings: UpdocSettings, calendar: CalendarService, notes: NotesService)
  getViewType(): string        // returns SIDEBAR_VIEW_TYPE
  getDisplayText(): string     // returns 'Meetings'
  getIcon(): string            // returns 'calendar'
  onOpen(): Promise<void>
  onClose(): Promise<void>
  refresh(): Promise<void>     // public — called by main.ts after settings change
}
```

- [ ] **Step 1: Create src/views/sidebar.ts**

```ts
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { CalendarEvent, UpdocSettings } from '../types';
import { CalendarService } from '../services/calendar';
import { NotesService } from '../services/notes';

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
```

- [ ] **Step 2: Verify build**

```bash
cd ~/src/updoc-obs && npm run build
```

Expected: zero TypeScript errors.

- [ ] **Step 3: Manual test (sidebar renders)**

The sidebar cannot be fully tested until main.ts registers the view in Task 8. Skip manual test here; defer to Task 8.

- [ ] **Step 4: Commit**

```bash
cd ~/src/updoc-obs
git add src/views/sidebar.ts
git commit -m "feat: meetings sidebar ItemView with event cards and Create Note flow"
```

---

## Task 8: Main Plugin Integration

**Files:**
- Modify: `src/main.ts` (fully wired plugin replacing the Task 1 skeleton)

**Interfaces consumed:** All services and views from previous tasks.

- [ ] **Step 1: Replace src/main.ts with full implementation**

```ts
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
```

- [ ] **Step 2: Run full test suite**

```bash
cd ~/src/updoc-obs && npm test
```

Expected: all unit tests pass.

- [ ] **Step 3: Build**

```bash
cd ~/src/updoc-obs && npm run build
```

Expected: zero TypeScript errors, `main.js` updated.

- [ ] **Step 4: End-to-end manual test in Obsidian**

Install updated `main.js` + `manifest.json` into test vault's `.obsidian/plugins/updoc/` and reload the plugin.

**Auth flow:**
a. Open Settings → updoc. Enter your Google Cloud OAuth client ID and secret. Click Connect.
b. Browser opens Google OAuth consent screen. Authorize the app.
c. Settings shows "Connected as {your email}" with a Disconnect button.

**Sidebar — no events:**
d. Click the calendar ribbon icon. Sidebar opens. If today has no meetings, "No meetings today." renders. Toggle the ribbon icon again — sidebar closes.

**Sidebar — with events:**
e. Using a calendar with events today: open the sidebar. Events appear sorted by time with time range, title, and attendee count.
f. Add a filter rule in settings (e.g. "Standup"). Refresh the sidebar — standup events disappear. The "N hidden" label appears at the bottom. Click it — hidden events reappear.

**Note creation:**
g. Click "Create Note" on any event. A new note opens in a tab with the correct path (`Meetings/YYYY/MM/DD/HHmm Title.md`), correct frontmatter (`meetingId`, `date`, `attendees`), and default template content.
h. Click "Create Note" on the same event again. A second note is created with a counter suffix (e.g. `HHmm Title 2.md`). The sidebar now shows both an "Open" button (opening the first note) and "Create Note".

**Template rules:**
i. Add a template rule in settings matching the event's title. Click "Create Note" again (it will be note 3). Verify the new note uses the custom template content and the `cssclasses` frontmatter field if you set a CSS class.

**Hotkey:**
j. Open Obsidian Settings → Hotkeys. Search "updoc". Assign a hotkey to "Toggle meetings sidebar". Verify it opens and closes the sidebar.

- [ ] **Step 5: Commit**

```bash
cd ~/src/updoc-obs
git add src/main.ts
git commit -m "feat: wire plugin — register view, command, ribbon, and settings tab"
```
