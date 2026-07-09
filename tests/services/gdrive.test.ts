import { describe, it, expect, vi } from 'vitest';
import { GDriveService } from '../../src/services/gdrive';

const mockFetch = (body: unknown, status = 200): typeof fetch =>
  vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch;

describe('GDriveService.getFileRevision', () => {
  it('returns headRevisionId from Drive', async () => {
    const svc = new GDriveService(mockFetch({ headRevisionId: 'rev42' }));
    const rev = await svc.getFileRevision('doc123', 'tok');
    expect(rev).toBe('rev42');
  });

  it('throws on non-200 response', async () => {
    const svc = new GDriveService(mockFetch({ error: 'forbidden' }, 403));
    await expect(svc.getFileRevision('doc123', 'tok')).rejects.toThrow('403');
  });
});

describe('GDriveService.getOrCreateFolder', () => {
  it('returns existing folder id if found', async () => {
    const svc = new GDriveService(mockFetch({ files: [{ id: 'folder1', name: 'updoc', mimeType: 'application/vnd.google-apps.folder' }] }));
    const id = await svc.getOrCreateFolder('updoc', 'tok');
    expect(id).toBe('folder1');
  });

  it('creates and returns folder id if not found', async () => {
    let callCount = 0;
    const fetch = vi.fn().mockImplementation(() => {
      callCount++;
      const body = callCount === 1
        ? { files: [] }
        : { id: 'newFolder', name: 'updoc', mimeType: 'application/vnd.google-apps.folder' };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') });
    }) as unknown as typeof fetch;
    const svc = new GDriveService(fetch);
    const id = await svc.getOrCreateFolder('updoc', 'tok');
    expect(id).toBe('newFolder');
    expect(callCount).toBe(2);
  });
});

describe('GDriveService.createDoc', () => {
  it('returns the new doc id', async () => {
    const svc = new GDriveService(mockFetch({ id: 'doc456', name: 'My Meeting', mimeType: 'application/vnd.google-apps.document' }));
    const id = await svc.createDoc('My Meeting', 'folder1', 'tok');
    expect(id).toBe('doc456');
  });

  it('throws on failure', async () => {
    const svc = new GDriveService(mockFetch({ error: 'quota' }, 429));
    await expect(svc.createDoc('x', 'f', 'tok')).rejects.toThrow('429');
  });
});
