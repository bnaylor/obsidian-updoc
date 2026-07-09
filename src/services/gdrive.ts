const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

export class GDriveService {
  constructor(private fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  async getFileRevision(docId: string, token: string): Promise<string> {
    const res = await this.fetchFn(
      `${DRIVE_API}/${encodeURIComponent(docId)}?fields=headRevisionId`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Drive getFileRevision failed: ${res.status}`);
    const data = await res.json() as { headRevisionId?: string };
    return data.headRevisionId ?? '';
  }

  async getOrCreateFolder(name: string, token: string): Promise<string> {
    const q = encodeURIComponent(
      `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    );
    const searchRes = await this.fetchFn(`${DRIVE_API}?q=${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!searchRes.ok) throw new Error(`Drive folder search failed: ${searchRes.status}`);
    const { files } = await searchRes.json() as { files: Array<{ id: string }> };
    if (files.length > 0) return files[0].id;

    const createRes = await this.fetchFn(DRIVE_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!createRes.ok) throw new Error(`Drive folder create failed: ${createRes.status}`);
    const folder = await createRes.json() as { id: string };
    return folder.id;
  }

  async createDoc(name: string, parentId: string, token: string): Promise<string> {
    const res = await this.fetchFn(DRIVE_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.document',
        parents: [parentId],
      }),
    });
    if (!res.ok) throw new Error(`Drive createDoc failed: ${res.status}`);
    const doc = await res.json() as { id: string };
    return doc.id;
  }
}
