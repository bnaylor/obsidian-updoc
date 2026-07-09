import { GDocsDocument, GDocsRequest, GDocsWriteControl, GDocsBatchUpdateResponse } from '../types';

const DOCS_API = 'https://docs.googleapis.com/v1/documents';

export class GDocsService {
  constructor(private fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  async fetchDoc(docId: string, token: string): Promise<GDocsDocument> {
    const res = await this.fetchFn(`${DOCS_API}/${encodeURIComponent(docId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`GDocs fetchDoc failed: ${res.status}`);
    return res.json() as Promise<GDocsDocument>;
  }

  async batchUpdate(
    docId: string,
    requests: GDocsRequest[],
    token: string,
    writeControl?: GDocsWriteControl,
  ): Promise<GDocsBatchUpdateResponse> {
    const payload: { requests: GDocsRequest[]; writeControl?: GDocsWriteControl } = { requests };
    if (writeControl) payload.writeControl = writeControl;

    const res = await this.fetchFn(`${DOCS_API}/${encodeURIComponent(docId)}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw Object.assign(new Error(`GDocs batchUpdate failed: ${res.status}`), { status: res.status, responseBody: body });
    }

    return res.json() as Promise<GDocsBatchUpdateResponse>;
  }
}
