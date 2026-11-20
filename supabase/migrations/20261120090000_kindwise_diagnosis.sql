-- Kindwise diagnosis (spec .planning/specs/kindwise-diagnosis.md, plan D1-D3, D7).
--
-- Server-only tables: the app never syncs them, so they skip the synced-table template (no app-made
-- `id`, no soft delete). Rows go with the account through `on delete cascade`.
--   scan_usage            free scans used per user and UTC month; the owner may read their own.
--   kindwise_daily_usage  Kindwise credits spent per UTC day (the global cap); no app access.
--   diagnosis_requests    one row per scan in progress: the lock against double charges, then the
--                         Kindwise access token until the app confirms it has the result.
--
-- All counting goes through the security definer functions below, called only by the `diagnose`
-- Edge Function with the secret key (service_role). They take the user id as an argument because
-- that caller has no auth.uid(); no API role can execute them, so nobody can pass someone else's.
-- The limits live here, in one place: changing one is a reviewed migration.

create table public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null, -- first day of the UTC month
  count int not null default 0 check (count between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.scan_usage enable row level security;
revoke all on table public.scan_usage from anon, authenticated;
grant select on table public.scan_usage to authenticated;
create policy "owner reads" on public.scan_usage for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.kindwise_daily_usage (
  day date primary key, -- UTC
  credits int not null default 0 check (credits >= 0),
  updated_at timestamptz not null default now()
);
alter table public.kindwise_daily_usage enable row level security; -- no policies: no app access
revoke all on table public.kindwise_daily_usage from anon, authenticated;

create table public.diagnosis_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null,
  access_token text, -- null while Kindwise hasn't accepted the create yet
  created_at timestamptz not null default now(),
  primary key (user_id, scan_id)
);
alter table public.diagnosis_requests enable row level security; -- no policies: no app access
revoke all on table public.diagnosis_requests from anon, authenticated;

-- Gives back one scan to the month the request was made in, and optionally its credits to that day.
create function public.release_diagnosis(p_user uuid, p_created_at timestamptz, p_release_credits boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.scan_usage set count = greatest(count - 1, 0), updated_at = now()
  where user_id = p_user and month = date_trunc('month', p_created_at at time zone 'utc')::date;
  update public.kindwise_daily_usage set credits = greatest(credits - 2, 0), updated_at = now()
  where p_release_credits and day = (p_created_at at time zone 'utc')::date;
$$;

-- Starts a scan, or says why not. One transaction; row locks make two calls with one scan_id (or two
-- scans of one user) wait for each other, so a scan is never counted or charged twice.
-- outcome: started | running | has_token | quota | daily_cap.
create function public.begin_diagnosis(p_user uuid, p_scan uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  free_scans constant int := 3;
  daily_cap constant int := 40;     -- Kindwise credits per UTC day, all users together
  scan_credits constant int := 2;   -- health=all costs 2 credits
  this_month constant date := date_trunc('month', now() at time zone 'utc')::date;
  today constant date := (now() at time zone 'utc')::date;
  resets_at constant timestamptz := (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc';
  request public.diagnosis_requests;
  used int;
  spent int;
begin
  -- Serializes this user's scans: the usage row is the lock.
  insert into public.scan_usage (user_id, month) values (p_user, this_month) on conflict do nothing;
  select count into used from public.scan_usage where user_id = p_user and month = this_month for update;

  select * into request from public.diagnosis_requests
  where user_id = p_user and scan_id = p_scan for update;
  if found then
    if request.access_token is not null then
      return jsonb_build_object('outcome', 'has_token', 'access_token', request.access_token,
        'scans_left', greatest(free_scans - used, 0), 'resets_at', resets_at);
    end if;
    if request.created_at > now() - interval '60 seconds' then
      return jsonb_build_object('outcome', 'running');
    end if;
    -- A call that died before Kindwise answered: give its scan back (its credits may have been
    -- spent, so they stay), then start over.
    perform public.release_diagnosis(p_user, request.created_at, false);
    delete from public.diagnosis_requests where user_id = p_user and scan_id = p_scan;
    select count into used from public.scan_usage where user_id = p_user and month = this_month;
  end if;

  if used >= free_scans then
    return jsonb_build_object('outcome', 'quota', 'scans_left', 0, 'resets_at', resets_at);
  end if;

  insert into public.kindwise_daily_usage (day) values (today) on conflict do nothing;
  select credits into spent from public.kindwise_daily_usage where day = today for update;
  if spent + scan_credits > daily_cap then
    return jsonb_build_object('outcome', 'daily_cap');
  end if;

  insert into public.diagnosis_requests (user_id, scan_id) values (p_user, p_scan);
  update public.scan_usage set count = count + 1, updated_at = now()
  where user_id = p_user and month = this_month;
  update public.kindwise_daily_usage set credits = credits + scan_credits, updated_at = now()
  where day = today;
  return jsonb_build_object('outcome', 'started', 'scans_left', free_scans - used - 1, 'resets_at', resets_at);
end;
$$;

-- Kindwise accepted the create: keep its token so the result can be fetched again for free.
create function public.attach_token(p_user uuid, p_scan uuid, p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.diagnosis_requests set access_token = p_token
  where user_id = p_user and scan_id = p_scan;
$$;

-- The scan didn't produce a diagnosis: give the scan back and drop the row. Credits only when
-- Kindwise never accepted the create (plan D3).
create function public.fail_diagnosis(p_user uuid, p_scan uuid, p_release_credits boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.diagnosis_requests;
begin
  -- Same lock order as begin_diagnosis (the user's usage rows first), so the two never deadlock.
  perform 1 from public.scan_usage where user_id = p_user for update;
  delete from public.diagnosis_requests where user_id = p_user and scan_id = p_scan returning * into request;
  if found then
    perform public.release_diagnosis(p_user, request.created_at, p_release_credits);
  end if;
end;
$$;

-- The app has the result (plan D1): the row goes, the scan stays counted.
create function public.end_diagnosis(p_user uuid, p_scan uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.diagnosis_requests where user_id = p_user and scan_id = p_scan;
$$;

-- Rows older than 7 days, for the sweep inside the diagnose function (plan D7).
create function public.expired_diagnoses(p_limit int)
returns table (user_id uuid, scan_id uuid, access_token text)
language sql
security definer
set search_path = ''
as $$
  select r.user_id, r.scan_id, r.access_token from public.diagnosis_requests r
  where r.created_at < now() - interval '7 days'
  order by r.created_at
  limit greatest(least(p_limit, 50), 0);
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.release_diagnosis(uuid, timestamptz, boolean)',
    'public.begin_diagnosis(uuid, uuid)',
    'public.attach_token(uuid, uuid, text)',
    'public.fail_diagnosis(uuid, uuid, boolean)',
    'public.end_diagnosis(uuid, uuid)',
    'public.expired_diagnoses(integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
