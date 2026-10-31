-- Storage and dedupe checks for join_waitlist. The integration tests use reserved test domains, which are
-- never stored, so they can't see the INSERT path; this does, and then rolls everything back.
-- Run in the SQL editor. It always ends in an error on purpose (that's the rollback): read the message.
--   "PASS ..." = all good, "FAIL ..." = lists what broke.
do $$
declare
  fails text[] := '{}';
  n int;
  d text := '@rebloom-check.dev';
begin
  perform public.join_waitlist('real' || d, 'hero');
  perform public.join_waitlist('  REAL' || upper(d) || chr(8203) || ' ', 'final');
  select count(*) into n from public.waitlist where email = 'real' || d;
  if n <> 1 then fails := fails || format('real address stored %s times, want 1', n); end if;

  -- Non-ASCII addresses are rejected (same rule as the browser's type=email); both accent forms alike.
  begin
    perform public.join_waitlist('jos' || chr(233) || d, 'hero');        -- U+00E9 composed
    fails := fails || 'composed accent accepted'::text;
  exception when others then null;
  end;
  begin
    perform public.join_waitlist('jose' || chr(769) || d, 'hero');       -- e + U+0301 combining
    fails := fails || 'decomposed accent accepted'::text;
  exception when others then null;
  end;
  select count(*) into n from public.waitlist where email like 'jos%' || d;
  if n <> 0 then fails := fails || format('accented address stored %s rows, want 0', n); end if;

  perform public.join_waitlist('spaced' || d || ' . ', 'hero');
  perform public.join_waitlist('spaced' || d, 'hero');
  select count(*) into n from public.waitlist where email like 'spaced' || d || '%';
  if n <> 1 then fails := fails || format('trailing " . " stored %s rows, want 1', n); end if;

  perform public.join_waitlist('dot' || d, 'hero');
  perform public.join_waitlist('dot' || d || '.', 'hero');
  select count(*) into n from public.waitlist where email like 'dot' || d || '%';
  if n <> 1 then fails := fails || format('trailing-dot domain stored %s rows, want 1', n); end if;

  perform public.join_waitlist('someone@sub.example.org', 'hero');
  perform public.join_waitlist('qa@shop.test', 'hero');
  perform public.join_waitlist('a@example.com.', 'hero');
  select count(*) into n from public.waitlist where email ~ '(example\.(com|org|net)|\.test)\.?$';
  if n > (select count(*) from public.waitlist where email like 'rebloom-test+%@example.com') then
    fails := fails || 'a reserved test domain was stored'::text;
  end if;

  begin
    perform public.join_waitlist('bad' || chr(27) || d, 'hero');
    fails := fails || 'control character accepted'::text;
  exception when others then null;
  end;

  if cardinality(fails) = 0 then
    raise exception 'PASS (rolled back)';
  else
    raise exception 'FAIL (rolled back): %', array_to_string(fails, '; ');
  end if;
end $$;
