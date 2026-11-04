-- Property test for the RLS template: over 20 seeded random rounds of 2-5 users with randomly
-- owned rows, every user sees exactly their own rows and can't write anyone else's. The template
-- table only exists inside this rolled-back transaction. Runs with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- Same table and policies as the template (supabase/README.md, rls_template.test.sql).
create table public.prop (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.prop enable row level security;
revoke all on table public.prop from anon, authenticated;
grant select, insert, update on table public.prop to authenticated;
create policy "owner reads"   on public.prop for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner inserts" on public.prop for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner updates" on public.prop for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create temp table prop_failures (failure text);
create temp table prop_stats (users int, rows_made int);

do $$
declare
  n_users int;
  uids uuid[];
  u uuid;
  other uuid;
  expected bigint;
  seen bigint;
  changed bigint;
  made int;
  bad text[] := '{}';
begin
  perform setseed(0.42);
  for round in 1..20 loop
    n_users := 2 + floor(random() * 4)::int;
    uids := array(select gen_random_uuid() from generate_series(1, n_users));
    insert into auth.users (id, email) select id, id::text || '@example.org' from unnest(uids) as id;
    made := 0;
    for k in 1..n_users loop
      for r in 1..floor(random() * 9)::int loop
        insert into public.prop (id, user_id) values (gen_random_uuid(), uids[1 + floor(random() * n_users)::int]);
        made := made + 1;
      end loop;
    end loop;
    insert into prop_stats values (n_users, made);

    for i in 1..n_users loop
      u := uids[i];
      other := uids[1 + (i % n_users)];
      select count(*) into expected from public.prop where user_id = u;

      perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
      set local role authenticated;

      select count(*) into seen from public.prop;
      if seen <> expected then
        bad := bad || format('round %s: user %s saw %s rows but owns %s', round, i, seen, expected);
      end if;

      select count(*) into seen from public.prop where user_id <> u;
      if seen <> 0 then
        bad := bad || format('round %s: user %s saw %s rows of others', round, i, seen);
      end if;

      begin
        insert into public.prop (id, user_id) values (gen_random_uuid(), other);
        bad := bad || format('round %s: user %s inserted a row owned by someone else', round, i);
      exception when insufficient_privilege then null;
      end;

      update public.prop set updated_at = now() where user_id <> u;
      get diagnostics changed = row_count;
      if changed <> 0 then
        bad := bad || format('round %s: user %s updated %s rows of others', round, i, changed);
      end if;

      update public.prop set deleted_at = now() where user_id <> u;
      get diagnostics changed = row_count;
      if changed <> 0 then
        bad := bad || format('round %s: user %s soft-deleted %s rows of others', round, i, changed);
      end if;

      begin
        truncate public.prop;
        bad := bad || format('round %s: user %s truncated the table', round, i);
      exception when insufficient_privilege then null;
      end;

      begin
        delete from public.prop where user_id <> u;
        bad := bad || format('round %s: user %s ran a delete', round, i);
      exception when insufficient_privilege then null;
      end;

      begin
        update public.prop set user_id = other where user_id = u;
        get diagnostics changed = row_count;
        if changed <> 0 then
          bad := bad || format('round %s: user %s handed %s rows to someone else', round, i, changed);
        end if;
      exception when insufficient_privilege then null;
      end;

      reset role;
    end loop;

    delete from auth.users where id = any (uids);
  end loop;
  insert into prop_failures select unnest(bad);
end $$;

select is_empty('select failure from prop_failures', 'no user ever sees or changes another user''s rows');
select ok((select sum(rows_made) from prop_stats) >= 100, 'the rounds made enough rows to mean something');
select ok((select min(users) = 2 and max(users) = 5 from prop_stats), 'the rounds covered 2 to 5 users');

select * from finish();
rollback;
