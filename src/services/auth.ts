import * as http from 'http';
import { UpdocSettings, TokenData } from '../types';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
];

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
    private fetchFn: typeof fetch = fetch.bind(globalThis),
  ) {}

  isConnected(): boolean {
    return this.settings.tokens !== null;
  }

  needsScopeUpgrade(): boolean {
    if (!this.settings.tokens) return false;
    const scopes = this.settings.tokens.scopes ?? [];
    return !scopes.includes('https://www.googleapis.com/auth/drive.file') ||
      !scopes.includes('https://www.googleapis.com/auth/documents');
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

    const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number; scope: string };

    const userInfoResponse = await this.fetchFn(USERINFO_URL, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const userInfo = await userInfoResponse.json() as { email: string };

    this.settings.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      email: userInfo.email,
      scopes: data.scope ? data.scope.split(' ') : [],
    };
    await this.saveSettings();
  }
}
