import { App, TFile } from 'obsidian';
import { UpdocSettings, GDocsDocument, GDocsRequest } from '../types';
import { AuthService } from './auth';
import { GDriveService } from './gdrive';
import { GDocsService } from './gdocs';
import { markdownToRequests, requestsToMarkdown } from './markdown';

export type SyncAction = 'no-op' | 'push' | 'pull' | 'conflict';

export function determineSyncAction(
  currentBody: string,
  lastSyncedBody: string,
  currentRevision: string,
  lastSyncedRevision: string,
): SyncAction {
  const localChanged = currentBody !== lastSyncedBody;
  const remoteChanged = currentRevision !== lastSyncedRevision;
  if (!localChanged && !remoteChanged) return 'no-op';
  if (!localChanged) return 'pull';
  if (!remoteChanged) return 'push';
  return 'conflict';
}

export function extractBody(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return m ? m[1] : content;
}

export function replaceBody(content: string, newBody: string): string {
  const m = content.match(/^(---\n[\s\S]*?\n---\n)/);
  return m ? m[1] + newBody : newBody;
}

const LAZY_MS = 30_000;
const AGGRESSIVE_MS = 2_000;
const MAX_PUSH_RETRIES = 5;

export class SyncService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeFile: TFile | null = null;
  private currentIntervalMs = LAZY_MS;
  private pausedDocs = new Set<string>();

  constructor(
    private app: App,
    private auth: AuthService,
    private gdrive: GDriveService,
    private gdocs: GDocsService,
    private settings: UpdocSettings,
    private saveSettings: () => Promise<void>,
    private openConflictModal: (
      local: string,
      remote: string,
      onMine: () => Promise<void>,
      onTheirs: () => Promise<void>,
    ) => void = () => {},
  ) {}

  startFor(file: TFile): void {
    if (this.activeFile?.path === file.path) return;
    this.stop();
    this.activeFile = file;
    this.currentIntervalMs = LAZY_MS;
    // Clear pause for this file so navigating back resumes sync
    const docId = this.getDocId(file);
    if (docId) this.pausedDocs.delete(docId);
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.activeFile = null;
  }

  pauseFor(docId: string): void {
    this.pausedDocs.add(docId);
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => this.runPollCycle(), this.currentIntervalMs);
  }

  private async runPollCycle(): Promise<void> {
    const file = this.activeFile;
    if (!file || !this.settings.syncEnabled) {
      this.scheduleNext();
      return;
    }

    const docId = this.getDocId(file);
    if (!docId || this.pausedDocs.has(docId)) {
      this.scheduleNext();
      return;
    }

    try {
      const token = await this.auth.getValidAccessToken();
      const meta = this.settings.syncMeta[docId];
      if (!meta) { this.scheduleNext(); return; }

      const content = await this.app.vault.read(file);
      const currentBody = extractBody(content);

      const currentRevision = await this.gdrive.getFileRevision(docId, token);
      const action = determineSyncAction(
        currentBody, meta.lastSyncedLocalContent,
        currentRevision, meta.lastSyncedRevision,
      );

      if (action === 'no-op') {
        this.currentIntervalMs = Math.min(this.currentIntervalMs * 1.5, LAZY_MS);
      } else if (action === 'pull') {
        await this.pull(file, docId, token);
        this.currentIntervalMs = AGGRESSIVE_MS;
      } else if (action === 'push') {
        await this.push(file, docId, token, currentBody, meta.lastSyncedRevision);
        this.currentIntervalMs = Math.min(this.currentIntervalMs * 1.5, LAZY_MS);
      } else {
        const remoteDoc = await this.gdocs.fetchDoc(docId, token);
        const remoteBody = requestsToMarkdown(remoteDoc);
        this.openConflictModal(
          currentBody,
          remoteBody,
          async () => { await this.push(file, docId, token, currentBody, meta.lastSyncedRevision); },
          async () => { await this.applyPull(file, docId, remoteDoc, remoteBody); },
        );
        this.pausedDocs.add(docId);
        return;
      }
    } catch (e) {
      console.error('[updoc] sync poll error:', e);
    }

    this.scheduleNext();
  }

  async publishNote(file: TFile, title: string): Promise<void> {
    const token = await this.auth.getValidAccessToken();
    const folderId = await this.gdrive.getOrCreateFolder('updoc', token);
    const docId = await this.gdrive.createDoc(title, folderId, token);

    await this.writeFrontmatterField(file, 'googleDocId', docId);

    const content = await this.app.vault.read(file);
    const body = extractBody(content);
    await this.pushBody(docId, body, token, undefined);

    const finalDoc = await this.gdocs.fetchDoc(docId, token);
    this.settings.syncMeta[docId] = {
      lastSyncedRevision: finalDoc.revisionId ?? '',
      lastSyncedLocalContent: body,
    };
    await this.saveSettings();
  }

  private async push(file: TFile, docId: string, token: string, body: string, baseRevision: string): Promise<void> {
    await this.pushBody(docId, body, token, baseRevision);
    const finalDoc = await this.gdocs.fetchDoc(docId, token);
    this.settings.syncMeta[docId] = {
      lastSyncedRevision: finalDoc.revisionId ?? '',
      lastSyncedLocalContent: body,
    };
    await this.saveSettings();
  }

  private async pushBody(docId: string, body: string, token: string, baseRevision: string | undefined): Promise<void> {
    const { plainText, paragraphRequests, inlineRequests } = markdownToRequests(body);

    // Stage 1: get current doc structure to find endIndex, then replace text
    let baseDoc = await this.gdocs.fetchDoc(docId, token);
    const endIndex = baseDoc.body.content.at(-1)?.endIndex ?? 2;

    const stage1: GDocsRequest[] = [];
    if (endIndex > 2) {
      stage1.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
    }
    if (plainText) {
      stage1.push({ insertText: { text: plainText, location: { index: 1 } } });
    }

    let retries = 0;
    let writeRevision = baseRevision ?? baseDoc.revisionId;
    while (retries < MAX_PUSH_RETRIES) {
      try {
        await this.gdocs.batchUpdate(docId, stage1, token, writeRevision ? { requiredRevisionId: writeRevision } : undefined);
        break;
      } catch (e: unknown) {
        const err = e as { status?: number };
        if (err.status === 400 && retries < MAX_PUSH_RETRIES - 1) {
          retries++;
          await sleep(500 * Math.pow(2, retries - 1));
          baseDoc = await this.gdocs.fetchDoc(docId, token);
          writeRevision = baseDoc.revisionId;
        } else { throw e; }
      }
    }

    // Stage 2: paragraph styles (re-fetch for fresh revision)
    if (paragraphRequests.length > 0) {
      const doc2 = await this.gdocs.fetchDoc(docId, token);
      await this.gdocs.batchUpdate(docId, paragraphRequests, token, doc2.revisionId ? { requiredRevisionId: doc2.revisionId } : undefined);
    }

    // Stage 3: inline styles
    if (inlineRequests.length > 0) {
      const doc3 = await this.gdocs.fetchDoc(docId, token);
      await this.gdocs.batchUpdate(docId, inlineRequests, token, doc3.revisionId ? { requiredRevisionId: doc3.revisionId } : undefined);
    }
  }

  private async pull(file: TFile, docId: string, token: string): Promise<void> {
    const doc = await this.gdocs.fetchDoc(docId, token);
    const remoteBody = requestsToMarkdown(doc);
    await this.applyPull(file, docId, doc, remoteBody);
  }

  private async applyPull(file: TFile, docId: string, doc: GDocsDocument, remoteBody: string): Promise<void> {
    const content = await this.app.vault.read(file);
    await this.app.vault.modify(file, replaceBody(content, remoteBody));
    this.settings.syncMeta[docId] = {
      lastSyncedRevision: doc.revisionId ?? '',
      lastSyncedLocalContent: remoteBody,
    };
    await this.saveSettings();
    this.pausedDocs.delete(docId);
  }

  private getDocId(file: TFile): string | null {
    return this.app.metadataCache.getFileCache(file)?.frontmatter?.['googleDocId'] ?? null;
  }

  private async writeFrontmatterField(file: TFile, key: string, value: string): Promise<void> {
    const content = await this.app.vault.read(file);
    const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---\n)/);
    if (!fmMatch) return;
    const keyRe = new RegExp(`^${key}:.*$`, 'm');
    let fm = fmMatch[2];
    if (keyRe.test(fm)) {
      fm = fm.replace(keyRe, `${key}: ${value}`);
    } else {
      fm = fm + `\n${key}: ${value}`;
    }
    await this.app.vault.modify(file, `---\n${fm}\n---\n` + content.slice(fmMatch[0].length));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
