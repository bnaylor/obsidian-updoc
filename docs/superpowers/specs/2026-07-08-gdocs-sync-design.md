# updoc-obs: Google Docs Bidirectional Sync — Design Spec

**Date:** 2026-07-08
**Scope:** Spec 2 of 2. Covers bidirectional sync between Obsidian meeting notes and Google Docs: manual publish, background polling, 3-way merge, conflict resolution modal, and the Markdown↔GDocs formatter. Image sync is out of scope.

---

## Background

Spec 1 built the plugin scaffold, Google auth, calendar sidebar, note creation, and template engine. Spec 2 adds the core remaining IP from the original updoc macOS app: the ability to publish a meeting note to Google Docs and keep it in sync bidirectionally, so coworkers can read and edit the note in Google Docs while the owner edits in Obsidian.

The existing Swift implementation (`~/src/updoc/src/updoc/SyncCoordinator.swift`, `GDocsService.swift`, `GDriveService.swift`, `LiveSyncManager.swift`) is the reference for business logic. The TypeScript port is an opportunity to fix known bugs in the Swift original — do not translate line-by-line without reading each function critically.

---

## Architecture

Four new service/utility files, plus targeted changes to existing files:

```
src/
  services/
    auth.ts       ← add Drive + Docs OAuth scopes; reconnect banner logic
    gdrive.ts     ← NEW: Drive API (create doc, get/create folder, get revision)
    gdocs.ts      ← NEW: Docs API (fetch doc, batchUpdate)
    sync.ts       ← NEW: SyncCoordinator — poll loop, 3-way merge, push/pull
    markdown.ts   ← NEW: pure formatter: markdownToRequests() + requestsToMarkdown()
  views/
    sidebar.ts    ← add "Publish" button; sync status indicator per card
    modals.ts     ← add ConflictModal
  types.ts        ← add SyncMeta, GDocsDocument, GDocsRequest, and related types
  main.ts         ← wire SyncService; start/stop polling on active leaf change
  settings.ts     ← add syncEnabled toggle; add reconnect banner when scopes missing
```

**Sync metadata storage:**
- `googleDocId` lives in the note's YAML frontmatter. It travels with the file through renames and moves.
- `lastSyncedRevision` and `lastSyncedLocalContent` live in plugin data under `syncMeta: Record<googleDocId, SyncMeta>`. They are volatile sync state and `lastSyncedLocalContent` is too large for frontmatter.

```ts
interface SyncMeta {
  lastSyncedRevision: string;
  lastSyncedLocalContent: string;  // note body only, no frontmatter
}
```

`UpdocSettings` gains one new field:

```ts
interface UpdocSettings {
  // ... existing fields ...
  syncEnabled: boolean;  // global kill-switch; defaults to true
}
```

---

## OAuth Scopes

Two new scopes are added to `AUTH_SCOPES` in `auth.ts`:

- `https://www.googleapis.com/auth/drive.file` — create and manage files the plugin created (least-privilege; cannot see the user's full Drive)
- `https://www.googleapis.com/auth/documents` — read and write Google Docs content

Scopes are baked into the OAuth token. Existing users who connected under Spec 1 lack these scopes. The settings tab detects this by checking whether `settings.tokens` exists but the stored scope list does not include the new scopes. When detected, it shows a one-time notice: **"Sync requires additional permissions — please disconnect and reconnect your Google Account."**

Store the granted scopes in `TokenData` so the check is reliable:

```ts
interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  scopes: string[];  // NEW: space-separated scopes returned by token endpoint
}
```

---

## Publish Flow

The "Publish to Google Docs" button appears on a sidebar event card when:
- The card has at least one associated Obsidian note (i.e., `findExistingNotes()` returns results), AND
- That note's frontmatter does not yet contain a `googleDocId`.

When clicked:

1. **Find or create Drive folder** — `GET /drive/v3/files?q=name='updoc' and mimeType='application/vnd.google-apps.folder' and trashed=false`. If not found, `POST /drive/v3/files` with `mimeType: application/vnd.google-apps.folder` to create it.
2. **Create Google Doc** — `POST /drive/v3/files` with `mimeType: application/vnd.google-apps.document`, `name: <note title>`, `parents: [updocFolderId]`. Returns `docId`.
3. **Write `googleDocId` to frontmatter** — update the note file's YAML frontmatter with `googleDocId: <docId>`. Preserve all existing frontmatter fields.
4. **Initial push** — run a full sync push (see Sync State Machine below) using the newly created (empty) doc as the base.
5. **Save sync metadata** — store `lastSyncedRevision` and `lastSyncedLocalContent` to plugin data.
6. **Update sidebar card** — the "Publish" button is replaced by a sync status indicator (last sync time or an error badge).

If any step fails, show a notice and do not write `googleDocId` to frontmatter (so the user can retry cleanly).

---

## Sync State Machine

### Polling

`SyncService` (in `sync.ts`) manages one active poll loop, keyed to the currently active Obsidian leaf. `main.ts` calls `syncService.startFor(file)` when the active leaf changes to a file with a `googleDocId` in its frontmatter, and `syncService.stop()` otherwise.

Adaptive intervals (matching `LiveSyncManager`):
- **Lazy:** 30 seconds (default)
- **Aggressive:** 2 seconds (after a remote edit is detected)
- **Backoff:** after each no-op cycle, `currentInterval = Math.min(currentInterval * 1.5, 30_000)`

### Each Poll Cycle

1. **Cheap revision check** — `GET /drive/v3/files/{docId}?fields=headRevisionId`. Returns a single string. Compare to `lastSyncedRevision`.
2. **Check local** — read the current note body from the vault (strip frontmatter). Compare to `lastSyncedLocalContent`.
3. **Decision matrix:**

| Local changed? | Remote revision changed? | Action |
|---|---|---|
| No | No | No-op → backoff |
| No | Yes | **Pull**: fetch full doc, convert to Markdown, update note body, save snapshot |
| Yes | No | **Push**: `batchUpdate` full doc with local content, save snapshot |
| Yes | Yes | **Conflict**: fetch full doc, show `ConflictModal` |

"Local changed" means the current note body differs from `lastSyncedLocalContent`. "Remote revision changed" means `headRevisionId` differs from `lastSyncedRevision`.

### Push

Uses the same 3-stage approach as the Swift original, required to preserve formatting indices:

1. **Replace text** — delete all existing content, insert the plain text of the Markdown body (no formatting). Send with `WriteControl.requiredRevisionId` set to the current doc revision. If the API returns 400 (revision mismatch), re-fetch the latest revision and retry up to 5 times with exponential backoff (500ms, 1s, 2s, 4s, 8s).
2. **Apply paragraph styles** — re-fetch the doc to get stable character indices. Send `updateParagraphStyle` and `createParagraphBullets` requests.
3. **Apply inline styles** — re-fetch again. Send `updateTextStyle` requests (bold, italic, code, links).

After a successful push, re-fetch the doc once more to record the final `revisionId` as `lastSyncedRevision`.

### Pull

Fetch the full doc via `GET /docs/v1/documents/{docId}`. Convert to Markdown via `requestsToMarkdown()`. Overwrite the note body in the vault (preserve frontmatter). Save the new revision and body snapshot to plugin data. Notify the UI.

---

## Markdown ↔ GDocs Formatter (`markdown.ts`)

Two pure functions with no API calls. These are the most heavily unit-tested code in the feature.

### `markdownToRequests(body: string): FormattedDoc`

Converts a Markdown string (note body, no frontmatter) into a structured object:

```ts
interface FormattedDoc {
  plainText: string;          // raw text for Stage 1 insertion
  paragraphRequests: GDocsRequest[];  // heading styles + bullet creation (Stage 2)
  inlineRequests: GDocsRequest[];     // bold, italic, code, links (Stage 3)
}
```

Supported Markdown elements (port of `GDocsMarkdownFormatter.swift`):
- Headings: `# H1` through `###### H6` → `HEADING_1` … `HEADING_6` named style
- Unordered bullets: `-` or `*` → `BULLET_DISC_CIRCLE_SQUARE` preset
- Ordered bullets: `1.` → `NUMBERED_DECIMAL_ALPHA_ROMAN` preset
- Checkboxes: `- [ ]` / `- [x]` → `BULLET_CHECKBOX` preset
- Bold: `**text**` → `bold: true` text style
- Italic: `*text*` → `italic: true` text style
- Inline code: `` `text` `` → `weightedFontFamily: { fontFamily: 'Courier New' }` text style
- Links: `[text](url)` → `link: { url }` text style

Unknown or unsupported syntax passes through as plain text.

**Implementation note:** The Swift formatter applied inline styles using `replacingOccurrences(of: trimmedContent, with: ...)`, which incorrectly replaces all occurrences of the same text within a paragraph. The TypeScript implementation must track character offsets directly and apply styles at the correct byte position.

### `requestsToMarkdown(doc: GDocsDocument): string`

Converts a parsed GDocs document response back to a Markdown string. Port of `convertToMarkdown()` from `GDocsService.swift`.

Known bugs in the Swift original to fix:
- **Multi-occurrence inline styles:** same fix as above — track positions, don't use string replacement.
- **Empty paragraph handling:** the Swift version silently drops empty paragraphs, breaking blank lines between sections. Preserve single blank lines.
- **Dead code:** `paragraphSuffix` was always `""` — remove.
- **Checkbox detection:** `glyphType == "GLYPH_TYPE_UNSPECIFIED"` is unreliable. Use the `BULLET_CHECKBOX` listPreset identifier instead if available; fall back to the glyphFormat `[%0]` check only as a secondary heuristic.

### Testing

Every supported Markdown element must have a round-trip test: `body → markdownToRequests → (simulate doc parse) → requestsToMarkdown → body`. Tests live in `src/services/markdown.test.ts` and run under Vitest with no Obsidian mocks needed (pure functions).

---

## Conflict Modal

An Obsidian `Modal` subclass. Opens when both local and remote have changed since the last sync.

**Layout:**
- Header: "Sync Conflict" title + one-sentence explanation ("This note was edited in both Obsidian and Google Docs since the last sync.")
- Two scrollable `<pre>` panels side by side: **Your Version (Obsidian)** on the left, **Google Docs Version** on the right.
- Three buttons at the bottom: **Use Mine** (primary), **Use Theirs**, **Cancel**.

**Outcomes:**
- **Use Mine**: push local content to GDocs (full 3-stage push), save new snapshot.
- **Use Theirs**: overwrite the local note body with remote Markdown, save new snapshot.
- **Cancel**: close the modal without writing anything. Pause sync for this note (`SyncService.pauseFor(docId)`) until the user navigates away and back to the note (which starts a fresh poll loop). Prevents the conflict modal from appearing on the very next poll.

---

## Settings Tab Changes

New **Sync** section added to `UpdocSettingTab`, below the existing Rules section:

- **Enable background sync** toggle — controls `settings.syncEnabled`. When disabled, `SyncService` never starts polling.
- Reconnect notice (shown only when scopes are missing): "Sync requires additional permissions — please disconnect and reconnect your Google Account." with a "Reconnect" button that calls `auth.startOAuthFlow()`.

---

## Out of Scope (Spec 2)

- Image sync (uploading Obsidian embedded images to Google Drive)
- Linking to an existing Google Doc (user pastes a doc ID) — only auto-creation is supported
- Address book / @mentions
- Weekly log
