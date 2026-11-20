// Test-only: answers /functions/v1/diagnose like the real function (supabase/functions/diagnose),
// on top of FakeAuthServer, so the real supabase-js runs against both. Set `next` per call.

import { FakeAuthServer } from './fakeAuthServer';

export type DiagnoseAnswer =
  | { status: 200; body: unknown }
  | { status: 202 }
  | { status: 204 }
  | { status: 401 | 404 | 409 | 422 | 502 | 503 }
  | { status: 429; resetsAt: string }
  | { status: 503; code: 'daily_cap' }
  | 'offline'
  | 'hang';

export const SICK_BODY = {
  is_plant: { probability: 0.98, binary: true },
  is_healthy: { probability: 0.12, binary: false },
  species: [{ name: 'Monstera deliciosa', common_names: ['Swiss cheese plant'], probability: 0.91 }],
  diseases: [
    {
      id: 'd1',
      name: 'water excess or uneven watering',
      common_names: [],
      probability: 0.64,
      description: 'Too much water.',
      treatment: { prevention: ['Let the soil dry.'], biological: [], chemical: [] },
    },
    {
      id: 'd2',
      name: 'fungal leaf spot',
      common_names: [],
      probability: 0.21,
      description: 'Spots caused by fungi. They spread in damp air.',
      treatment: { prevention: [], biological: [], chemical: [] },
    },
  ],
  question: {
    text: 'Is the soil still wet a day after watering?',
    yes: { id: 'd1', name: 'water excess or uneven watering' },
    no: { id: 'd2', name: 'fungal leaf spot' },
  },
  scans_left: 2,
  resets_at: '2026-12-01T00:00:00Z',
};

const CODES: Record<number, string> = {
  401: 'unauthorized',
  404: 'not_found',
  409: 'in_progress',
  422: 'not_a_plant',
  502: 'upstream_failed',
  503: 'unavailable',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export class FakeDiagnoseServer extends FakeAuthServer {
  /** Answers, used in order; the last one repeats. */
  answers: DiagnoseAnswer[] = [{ status: 200, body: SICK_BODY }];
  readonly diagnoseCalls: { method: string; scanId: string | null; body: unknown; authorization: string | null }[] = [];

  constructor() {
    super();
    const auth = this.fetch.getMockImplementation()!;
    this.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname !== '/functions/v1/diagnose') return auth(input, init);
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: unknown = null;
      try {
        body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      } catch {
        body = null;
      }
      const scanId = url.searchParams.get('scan_id') ?? (body as { scan_id?: string } | null)?.scan_id ?? null;
      this.diagnoseCalls.push({ method, scanId, body, authorization: new Headers(init?.headers).get('Authorization') });
      if (method === 'DELETE') return new Response(null, { status: 204 });

      const answer = this.answers.length > 1 ? this.answers.shift()! : this.answers[0];
      if (answer === 'offline') throw new TypeError('Network request failed');
      if (answer === 'hang') {
        // Never answers, but gives way when the caller aborts (functions.invoke's timeout).
        return new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        );
      }
      if (answer.status === 200) return json(200, answer.body);
      if (answer.status === 202) return json(202, { status: 'pending' });
      if (answer.status === 204) return new Response(null, { status: 204 });
      if (answer.status === 429) {
        return json(429, { error: { code: 'quota_exceeded', message: 'Used', resets_at: answer.resetsAt } });
      }
      const code = 'code' in answer ? answer.code : CODES[answer.status];
      return json(answer.status, { error: { code, message: code } });
    });
  }

  callsOf(method: string): number {
    return this.diagnoseCalls.filter((c) => c.method === method).length;
  }
}
