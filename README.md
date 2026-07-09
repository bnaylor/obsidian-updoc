# updoc for Obsidian

**Google Calendar & Google Docs seamless integration for Obsidian.**

Why reinvent the text editor when Obsidian already perfected it? `updoc` brings the best parts of standalone document-sync and calendar workflows directly into your Obsidian vault—giving you automated meeting notes, smart templating, and real-time two-way Google Docs synchronization without leaving your local Markdown ecosystem.

---

## ⚡ Features

### 📅 Google Calendar & One-Click Meeting Notes
- **Dedicated Meetings Sidebar**: An integrated sidebar (docked left or right) displaying your daily schedule at a glance.
- **One-Click Note Generation**: Instantly generate structured meeting notes from scheduled Google Calendar events.
- **Automated Hierarchy & Naming**: Automatically routes notes into temporal folder hierarchies (`meetingFolderPattern`) with customizable file naming conventions (`filenamePattern`).

### 🔄 Two-Way Google Docs Sync
- **Live Markdown ↔ GDocs Translation**: Syncs local Markdown notes directly to Google Docs via the Google Docs API—converting headers, lists, formatting (bold, italic, strikethrough), and links on the fly.
- **Frontmatter Mapping**: Simply tag any note with a `googleDocId` in its YAML frontmatter to link it to a remote Google Doc.
- **Intelligent Conflict Resolution**: When concurrent edits happen locally and remotely, an interactive modal prompts you to cleanly resolve conflicts (keep local, take remote, or merge).

### 🛠️ Smart Templating & Theming
- **Context-Aware Rules**: Dynamically apply markdown templates based on meeting metadata (matching against meeting titles, specific attendee emails, or total attendee count).
- **Custom CSS Classes**: Automatically attach CSS classes to generated notes for tailored visual presentation.

### 🔐 Native OAuth 2.0
- Built-in Google OAuth flow supporting Client ID and Client Secret configuration.
- Securely manages access and refresh tokens for Google Calendar, Google Drive, and Google Docs scopes.

---

## 🏗️ Architecture & Core Components

- `src/main.ts`: Plugin lifecycle, workspace leaf monitoring, and frontmatter-triggered sync initialization.
- `src/views/sidebar.ts`: The interactive meeting sidebar UI.
- `src/views/modals.ts`: Conflict resolution UI for divergent local/remote document states.
- `src/services/sync.ts`: Orchestrator for two-way synchronization and state tracking.
- `src/services/markdown.ts` & `gdocs.ts`: Bidirectional AST parsing between Markdown and Google Docs structural elements.
- `src/services/calendar.ts` & `templates.ts`: Event fetching and rule-based note templating engine.

---

## 🚀 Getting Started

### 1. Build the Plugin

This project uses TypeScript and esbuild to produce a single CommonJS bundle for Obsidian.

```bash
# Install dependencies (use public registry if behind an internal proxy)
npm install --registry=https://registry.npmjs.org/

# Type-check with tsc and build production bundle (main.js)
npm run build
```

During development, you can run watch mode to rebuild automatically on save:
```bash
npm run dev
```

### 2. Deploy to Your Obsidian Vault

To install the built plugin into an existing Obsidian vault:

1. Create a dedicated plugin folder inside your vault's hidden `.obsidian` directory:
   ```bash
   mkdir -p /path/to/your-vault/.obsidian/plugins/updoc
   ```
2. Copy the required release artifacts into the new folder:
   ```bash
   cp main.js manifest.json /path/to/your-vault/.obsidian/plugins/updoc/
   ```
3. In Obsidian, navigate to **Settings > Community Plugins**, hit **Reload plugins**, and enable **updoc**.

---

## ⚙️ Configuration

Once enabled, open the **updoc** settings tab in Obsidian:
1. **Google OAuth Credentials**: Input your Google Cloud Console `Client ID` and `Client Secret` (requires OAuth consent screen configured with Calendar, Drive, and Docs scopes).
2. **Authenticate**: Click to complete the OAuth flow and authorize your account.
3. **Folder & Naming Patterns**: Set up your preferred output directories and file format tokens (e.g., `YYYY/MM/DD` or meeting title slugs).
4. **Template Rules**: Add regex or string-match rules to map specific recurring meetings to custom Markdown templates.

---

## 🧪 Testing

We use Vitest for unit and integration testing.

```bash
# Run test suite once
npm test

# Run tests in watch mode
npm run test:watch
```
