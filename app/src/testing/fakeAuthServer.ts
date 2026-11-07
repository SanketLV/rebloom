// A `fetch` stand-in that answers the few Supabase Auth endpoints the session tests use, so the
// real supabase-js runs against it. Switch an endpoint's behaviour with `server.next.<endpoint>`.

// rejected: the endpoint's usual refusal (verify: otp_expired, refresh: refresh_token_not_found,
// logout: session_not_found). session_gone / bad_jwt: what logout answers when the session was
// already ended / when the access token has expired.
type Mode =
  | 'ok'
  | 'rejected'
  | 'offline'
  | 'rate_limited'
  | 'server_error'
  | 'session_gone'
  | 'bad_jwt';

export type FakeSessionOptions = {
  userId?: string;
  email?: string;
  provider?: string;
  /** Seconds from now; negative = already expired. */
  expiresIn?: number;
  refreshToken?: string;
  /** Default: one identity of `provider`, signed in now. */
  identities?: { provider: string; last_sign_in_at: string | null }[];
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
      identities: (
        options.identities ?? [{ provider, last_sign_in_at: new Date().toISOString() }]
      ).map((identity, i) => ({ id: `${userId}-${i}`, user_id: userId, ...identity })),
      created_at: '2026-11-03T10:00:00.000Z',
      updated_at: '2026-11-03T10:00:00.000Z',
    },
  };
}

// Real Supabase Auth (API version 2024-01-01) answers errors as { code, message } with this
// header; supabase-js only reads `code` when the header is there.
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
  });
}

const REAL_REFUSALS = {
  otp_expired: 403,
  refresh_token_not_found: 400,
  session_not_found: 403,
} as const;

function failure(
  mode: Exclude<Mode, 'ok'>,
  rejectedCode: keyof typeof REAL_REFUSALS,
): Promise<Response> {
  switch (mode) {
    case 'offline':
      return Promise.reject(new TypeError('Network request failed'));
    case 'rate_limited':
      return Promise.resolve(
        json(429, { code: 'over_request_rate_limit', message: 'Request rate limit reached' }),
      );
    case 'server_error':
      return Promise.resolve(json(502, { message: 'Bad gateway' }));
    case 'session_gone':
      return Promise.resolve(json(403, { code: 'session_not_found', message: 'Session not found' }));
    case 'bad_jwt':
      return Promise.resolve(
        json(403, { code: 'bad_jwt', message: 'invalid JWT: token is expired' }),
      );
    case 'rejected':
      return Promise.resolve(
        json(REAL_REFUSALS[rejectedCode], { code: rejectedCode, message: 'Rejected' }),
      );
  }
}

export class FakeAuthServer {
  next: { verify: Mode; refresh: Mode; logout: Mode; otp: Mode; deleteAccount: Mode | 'unauthorized' } = {
    verify: 'ok',
    refresh: 'ok',
    logout: 'ok',
    otp: 'ok',
    deleteAccount: 'ok',
  };
  /** What a successful verify or refresh returns. */
  sessionOptions: FakeSessionOptions = {};
  readonly calls: {
    method: string;
    path: string;
    body: unknown;
    authorization: string | null;
  }[] = [];

  callsTo(path: string): number {
    return this.calls.filter((c) => c.path === path).length;
  }

  private holds: Partial<Record<'verify' | 'refresh' | 'logout', Promise<void>>> = {};

  /** Delays the next answers from an endpoint until the returned function is called. */
  hold(endpoint: 'verify' | 'refresh' | 'logout'): () => void {
    let release = () => {};
    this.holds[endpoint] = new Promise<void>((resolve) => (release = resolve));
    return () => {
      delete this.holds[endpoint];
      release();
    };
  }

  readonly fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const method = (init?.method ?? 'GET').toUpperCase();
    const path =
      url.pathname +
      (url.searchParams.get('grant_type')
        ? `?grant_type=${url.searchParams.get('grant_type')}`
        : '');
    const headers = new Headers(init?.headers);
    let body: unknown = null;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    } catch {
      body = init?.body;
    }
    this.calls.push({ method, path, body, authorization: headers.get('Authorization') });

    const endpoint =
      path === '/auth/v1/verify'
        ? 'verify'
        : path === '/auth/v1/token?grant_type=refresh_token'
          ? 'refresh'
          : path === '/auth/v1/logout'
            ? 'logout'
            : null;
    if (endpoint && this.holds[endpoint]) await this.holds[endpoint];

    if (path === '/auth/v1/verify') {
      if (this.next.verify !== 'ok') return failure(this.next.verify, 'otp_expired');
      return json(200, fakeSession(this.sessionOptions));
    }
    if (path === '/auth/v1/token?grant_type=refresh_token') {
      if (this.next.refresh !== 'ok') return failure(this.next.refresh, 'refresh_token_not_found');
      return json(200, fakeSession(this.sessionOptions));
    }
    if (path === '/auth/v1/otp') {
      if (this.next.otp === 'rate_limited') {
        return json(429, { code: 'over_email_send_rate_limit', message: 'Too many emails' });
      }
      if (this.next.otp === 'rejected') {
        return json(400, { code: 'email_address_invalid', message: 'Email address is invalid' });
      }
      if (this.next.otp !== 'ok') return failure(this.next.otp, 'otp_expired');
      return json(200, {});
    }
    if (path === '/functions/v1/delete-account') {
      const mode = this.next.deleteAccount;
      if (mode === 'unauthorized') return json(401, { error: 'unauthorized' });
      if (mode === 'offline') return Promise.reject(new TypeError('Network request failed'));
      if (mode === 'rate_limited') return json(429, { error: 'rate_limited' });
      if (mode !== 'ok') return json(500, { error: 'failed' });
      return new Response(null, { status: 204 });
    }
    if (path === '/auth/v1/logout') {
      if (this.next.logout !== 'ok') return failure(this.next.logout, 'session_not_found');
      return new Response(null, { status: 204 });
    }
    return json(404, { message: `fake auth server: no route for ${method} ${path}` });
  });
}
