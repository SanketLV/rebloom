// A `fetch` stand-in that answers the few Supabase Auth endpoints the session tests use, so the
// real supabase-js runs against it. Switch an endpoint's behaviour with `server.next.<endpoint>`.

type Mode = 'ok' | 'rejected' | 'offline' | 'rate_limited' | 'server_error';

export type FakeSessionOptions = {
  userId?: string;
  email?: string;
  provider?: string;
  /** Seconds from now; negative = already expired. */
  expiresIn?: number;
  refreshToken?: string;
};

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function fakeSession(options: FakeSessionOptions = {}) {
  const userId = options.userId ?? '00000000-0000-4000-8000-000000000001';
  const email = options.email ?? 'sam@example.com';
  const provider = options.provider ?? 'email';
  const expiresIn = options.expiresIn ?? 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const accessToken = [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ sub: userId, email, role: 'authenticated', aud: 'authenticated', exp: expiresAt }),
    'signature',
  ].join('.');
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: expiresAt,
    refresh_token: options.refreshToken ?? `refresh-${userId}`,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: { provider, providers: [provider] },
      user_metadata: {},
      identities: [],
      created_at: '2026-11-03T10:00:00.000Z',
      updated_at: '2026-11-03T10:00:00.000Z',
    },
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function failure(mode: Exclude<Mode, 'ok'>, rejectedCode: string): Promise<Response> {
  switch (mode) {
    case 'offline':
      return Promise.reject(new TypeError('Network request failed'));
    case 'rate_limited':
      return Promise.resolve(
        json(429, { code: 'over_request_rate_limit', msg: 'Request rate limit reached' }),
      );
    case 'server_error':
      return Promise.resolve(json(502, { msg: 'Bad gateway' }));
    case 'rejected':
      return Promise.resolve(json(400, { code: rejectedCode, msg: 'Rejected' }));
  }
}

export class FakeAuthServer {
  next: { verify: Mode; refresh: Mode; logout: Mode } = {
    verify: 'ok',
    refresh: 'ok',
    logout: 'ok',
  };
  /** What a successful verify or refresh returns. */
  sessionOptions: FakeSessionOptions = {};
  readonly calls: { method: string; path: string }[] = [];

  callsTo(path: string): number {
    return this.calls.filter((c) => c.path === path).length;
  }

  readonly fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname + (url.searchParams.get('grant_type') ? `?grant_type=${url.searchParams.get('grant_type')}` : '');
    this.calls.push({ method, path });

    if (path === '/auth/v1/verify') {
      if (this.next.verify !== 'ok') return failure(this.next.verify, 'otp_expired');
      return json(200, fakeSession(this.sessionOptions));
    }
    if (path === '/auth/v1/token?grant_type=refresh_token') {
      if (this.next.refresh !== 'ok') return failure(this.next.refresh, 'refresh_token_not_found');
      return json(200, fakeSession(this.sessionOptions));
    }
    if (path === '/auth/v1/logout') {
      if (this.next.logout !== 'ok') return failure(this.next.logout, 'session_not_found');
      return new Response(null, { status: 204 });
    }
    return json(404, { msg: `fake auth server: no route for ${method} ${path}` });
  });
}
