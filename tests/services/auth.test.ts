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
  syncEnabled: true,
  syncMeta: {},
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
    settings.tokens = { accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 60_000, email: 'a@b.com', scopes: [] };
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
