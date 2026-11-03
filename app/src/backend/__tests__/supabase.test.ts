import { createClient } from '@supabase/supabase-js';

import { fakeLocalStorage } from '@/testing/fakeLocalStorage';

// T6 (spike): the real supabase-js client loads in jest-expo over the fake localStorage and a
// mocked fetch, and reading the session with nothing stored makes no request.
test('a real client over the fake storage reads no session and makes no request', async () => {
  require('expo-sqlite/localStorage/install');
  const fetchMock = jest.fn();
  const client = createClient('https://example.supabase.co', 'sb_publishable_test', {
    auth: {
      storage: globalThis.localStorage,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { fetch: fetchMock },
  });

  const { data, error } = await client.auth.getSession();

  expect(error).toBeNull();
  expect(data.session).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(globalThis.localStorage).toBe(fakeLocalStorage);
});
