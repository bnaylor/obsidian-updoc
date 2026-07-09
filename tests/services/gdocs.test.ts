import { describe, it, expect, vi } from 'vitest';
import { GDocsService } from '../../src/services/gdocs';
import { GDocsDocument, GDocsRequest } from '../../src/types';

const emptyDoc = (): GDocsDocument => ({
  documentId: 'doc1',
  revisionId: 'rev1',
  title: 'Test',
  body: { content: [] },
});

const mockFetch = (body: unknown, status = 200): typeof fetch =>
  vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch;

describe('GDocsService.fetchDoc', () => {
  it('returns parsed GDocsDocument', async () => {
    const svc = new GDocsService(mockFetch(emptyDoc()));
    const doc = await svc.fetchDoc('doc1', 'tok');
    expect(doc.documentId).toBe('doc1');
    expect(doc.revisionId).toBe('rev1');
  });

  it('throws on non-200', async () => {
    const svc = new GDocsService(mockFetch({}, 404));
    await expect(svc.fetchDoc('doc1', 'tok')).rejects.toThrow('404');
  });
});

describe('GDocsService.batchUpdate', () => {
  it('sends requests and returns response', async () => {
    const svc = new GDocsService(mockFetch({ replies: [] }));
    const requests: GDocsRequest[] = [{ insertText: { text: 'hello', location: { index: 1 } } }];
    const result = await svc.batchUpdate('doc1', requests, 'tok');
    expect(result.replies).toEqual([]);
  });

  it('includes writeControl when provided', async () => {
    let sentBody = '';
    const fetch = vi.fn().mockImplementation((_url, opts) => {
      sentBody = opts.body as string;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ replies: [] }), text: () => Promise.resolve('') });
    }) as unknown as typeof fetch;
    const svc = new GDocsService(fetch);
    await svc.batchUpdate('doc1', [], 'tok', { requiredRevisionId: 'rev42' });
    expect(JSON.parse(sentBody).writeControl.requiredRevisionId).toBe('rev42');
  });

  it('throws with status on failure, including body for debugging', async () => {
    const svc = new GDocsService(mockFetch({ error: 'revision mismatch' }, 400));
    await expect(svc.batchUpdate('doc1', [], 'tok')).rejects.toThrow('400');
  });
});
