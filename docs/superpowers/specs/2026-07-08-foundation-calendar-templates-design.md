# updoc-obs: Foundation, Calendar & Templates — Design Spec

**Date:** 2026-07-08
**Scope:** Spec 1 of 2. Covers plugin scaffold, Google auth, calendar sidebar, meeting note creation, temporal organization, and template engine. Google Docs sync is deferred to Spec 2.

---

## Background

updoc is a native macOS note-taking app built around Google Calendar and Google Docs integration. The editor layer proved too costly to maintain. This project ports the core IP — calendar integration, template engine, and (in spec 2) bidirectional Google Docs sync — into an Obsidian plugin, getting a maintained editor for free.

The existing implementation (Swift, `~/src/updoc`) is the reference for business logic. This spec does not port the editor, theming engine, image sync, weekly log, or address book.

---

## Architecture

Single Obsidian plugin (`updoc-obs`), TypeScript. Organized into focused services with clean interfaces so the sync layer (spec 2) can inject without restructuring.

```
src/
  main.ts              # Plugin entry point, wires services together
  settings.ts          # Settings schema + SettingTab UI
  types.ts             # Shared types (CalendarEvent, TemplateRule, etc.)
  services/
    auth.ts            # OAuth2 token management + refresh
    calendar.ts        # Google Calendar API calls
    templates.ts       # Rule matching + note content generation
    notes.ts           # Note creation, folder/filename resolution
  views/
    sidebar.ts         # Obsidian ItemView — meetings panel
    modals.ts          # Rule editor modal, any confirmation modals
```

Each service receives only what it needs (settings, vault, app) as constructor arguments. No singleton globals. The sidebar is the only consumer of calendar, notes, and templates — it orchestrates the user-facing flow.

---

## Foundation — Auth & Settings

### OAuth Flow

User provides their own Google OAuth client ID and secret (they create a Google Cloud project). This keeps the plugin shareable with coworkers with no hosted infrastructure required.

Flow:
1. User pastes client ID + secret into settings and clicks "Connect Google Account."
2. Plugin constructs OAuth URL (scope: `calendar.events.readonly` for spec 1; `docs` and `drive` added in spec 2) and calls `window.open()` to launch the system browser.
3. A temporary HTTP listener on `localhost:{ephemeral-port}` catches the redirect and extracts the auth code.
4. Plugin exchanges the code for access + refresh tokens and stores them in Obsidian plugin data (`loadData`/`saveData`).
5. Settings UI updates to show "Connected as {email}" with a Disconnect button.

Tokens are stored in plugin data, not the vault, so they don't propagate via Obsidian Sync.

Token refresh is handled transparently in `auth.ts` before any API call: if `expiresAt` is within 60 seconds, refresh first.

### Settings Schema

```ts
interface UpdocSettings {
  clientId: string
  clientSecret: string
  tokens: {
    accessToken: string
    refreshToken: string
    expiresAt: number   // unix ms
    email: string
  } | null

  calendarId: string          // defaults to "primary"
  meetingFolderPattern: string  // e.g. "Meetings/{{year}}/{{month}}/{{day}}"
  filenamePattern: string       // e.g. "{{time}} {{title}}"

  sidebarPosition: 'left' | 'right'  // defaults to 'right'
  filterRules: string[]              // case-insensitive substrings; events whose title contains any are hidden
  templateRules: TemplateRule[]
}
```

**Default patterns:**
- Folder: `Meetings/{{year}}/{{month}}/{{day}}`
- Filename: `{{HHmm}} {{title}}`

### Settings Tab

Three sections:

1. **Google Account** — client ID field, client secret field, Connect/Disconnect button, connection status.
2. **Note Organization** — folder pattern field, filename pattern field, calendar ID field, each with a brief example rendering below it.
3. **Rules** — two subsections:
   - *Calendar filter rules*: list of patterns to hide from the sidebar (e.g. "Lunch", "Focus Time"). Add/delete.
   - *Template rules*: ordered list with drag-to-reorder, add/edit/delete. Edit opens the rule editor modal.

---

## Calendar Sidebar

An Obsidian `ItemView` registered in its own leaf type (`updoc-meetings`). A registered hotkey toggles visibility via `app.workspace.getRightLeaf()` + `revealLeaf()`. Leaf position (left/right) is user-configurable in settings.

### Display

- Today's calendar events, sorted by start time.
- Each event card shows: time range, title, attendee count.
- Events whose title contains any filter rule substring (case-insensitive) are hidden. A faint "N hidden" label at the bottom of the panel lets the user reveal them on demand.
- If a note with a matching `meetingId` frontmatter field already exists in the vault, the card shows both an **Open** button and a **Create Note** button (user may always create additional notes for a meeting).
- If no matching note exists, the card shows only **Create Note**.

### Fetching

Single `calendar.events.list` call on panel open and every 5 minutes thereafter:
- `calendarId` from settings (default: `primary`)
- `timeMin`: midnight today (local time), `timeMax`: midnight tomorrow
- `singleEvents: true`, `orderBy: startTime`

Token refresh is handled by `auth.ts` before the call. Error states:
- **Not connected:** shows "Connect Google Account →" link to open settings.
- **Refresh failed:** shows "Session expired — reconnect in settings."
- **No events:** friendly empty state ("No meetings today").

---

## Note Creation & Temporal Organization

Triggered when the user clicks "Create Note" on an event card.

### Steps

1. **Resolve folder path** — expand folder pattern with date variables from the event. Create any missing intermediate folders in the vault.
2. **Resolve filename** — expand filename pattern with event variables. Strip filesystem-unsafe characters (`:`, `/`, `\`, `*`, `?`, `"`, `<`, `>`, `|`).
3. **Handle duplicates** — if a file already exists at the resolved path, append a counter suffix: `09:00 Standup 2.md`, `09:00 Standup 3.md`, etc.
4. **Match template rule** — evaluate `templateRules` in order; first match wins. No match → use default template.
5. **Build note content** — frontmatter block + expanded template body.
6. **Create and open** — `vault.create(path, content)`, then `workspace.getLeaf('tab').openFile(file)`.

### Frontmatter

```yaml
---
meetingId: <google-calendar-event-id>
date: 2026-07-08
attendees: alice@co.com, bob@co.com
cssclasses: <rule's cssClass, omitted if none>
---
```

### Pattern Variables

Available in both folder pattern and filename pattern:

| Variable | Value |
|---|---|
| `{{year}}` | `2026` |
| `{{month}}` | `07` |
| `{{day}}` | `08` |
| `{{HHmm}}` | `0900` (24-hour, zero-padded) |
| `{{title}}` | Sanitized event title |

Available in template body only:

| Variable | Value |
|---|---|
| `{{title}}` | Event title (unsanitized) |
| `{{date}}` | `2026-07-08` |
| `{{time}}` | `9:00 AM` |
| `{{location}}` | Event location or empty |
| `{{description}}` | Event description or empty |
| `{{attendees}}` | Comma-separated attendee display names |

Unknown variables are left as-is.

---

## Template Engine

### Rule Structure

```ts
interface TemplateRule {
  id: string
  name: string                              // display label in settings
  matchType: 'title' | 'email' | 'count'
  pattern: string                           // regex string | email | integer string
  templateContent: string                   // body with {{variables}}
  cssClass?: string                         // written to frontmatter cssclasses
}
```

### Matching

Rules evaluated in order; first match wins.

| matchType | Match logic |
|---|---|
| `title` | `new RegExp(pattern, 'i').test(event.title)` |
| `email` | `event.attendees.some(a => a.email === pattern)` |
| `count` | `event.attendees.length === parseInt(pattern)` |

### Default Template

Used when no rule matches:

```
# {{title}}

Date: {{date}}
Attendees: {{attendees}}

## Notes

- 
```

### Theming via CSS Classes

Each rule has an optional `cssClass` field. When set, the plugin writes it to the note's frontmatter as `cssclasses`. Obsidian applies this class to the note's root element; users style it with a CSS snippet in `.obsidian/snippets/`. No custom theming code in the plugin.

### Rule Editor Modal

Fields: Name, Match Type (dropdown), Pattern (text), CSS Class (text, optional), Template Content (multiline textarea with variable reference below it). Save validates that pattern is non-empty and, for `title` type, that it compiles as a valid regex.

---

## Out of Scope (Spec 1)

- Google Docs sync (bidirectional, conflict resolution) — Spec 2
- Address book / @mentions
- @date / @today shortcuts
- Image sync
- Weekly log
- Task sidebar
