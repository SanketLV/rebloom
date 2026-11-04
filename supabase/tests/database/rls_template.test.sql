-- The table template every app table copies (supabase/README.md), checked as two users.
-- Runs with `supabase test db`; the table only exists inside this rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- ---- the template, as in supabase/README.md ----
create table public.example (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.example enable row level security;
revoke all on table public.example from anon;
create policy "owner reads"   on public.example for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner inserts" on public.example for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner updates" on public.example for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index on public.example (user_id) where deleted_at is null;
-- ---- end of template ----

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@example.org'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@example.org');
-- B's row, written as the owner of the table (bypasses RLS).
insert into public.example (id, user_id) values
  ('bbbbbbbb-1111-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002');

-- ---- as user A ----
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.example (id) values ('aaaaaaaa-1111-4000-8000-000000000001')$$,
  'A inserts a row; user_id defaults to A');
select results_eq(
  'select user_id from public.example',
  $$values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid)$$,
  'A sees only their own row');
select results_eq(
  $$update public.example set updated_at = now() where id = 'aaaaaaaa-1111-4000-8000-000000000001' returning 1$$,
  $$values (1)$$,
  'A updates their own row');
select results_eq(
  $$update public.example set deleted_at = now() where id = 'aaaaaaaa-1111-4000-8000-000000000001' returning 1$$,
  $$values (1)$$,
  'A soft-deletes their own row');
select is_empty(
  $$select 1 from public.example where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'$$,
  'A cannot see B''s rows, even when asking for them');
select throws_ok(
  $$insert into public.example (id, user_id) values ('aaaaaaaa-1111-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002')$$,
  '42501', null,
  'A cannot insert a row owned by B');
select is_empty(
  $$update public.example set updated_at = now() where user_id = 'bbbbbbbb-0000-4000-8000-000000000002' returning 1$$,
  'A updating B''s row changes nothing');
select is_empty(
  $$update public.example set deleted_at = now() where user_id = 'bbbbbbbb-0000-4000-8000-000000000002' returning 1$$,
  'A soft-deleting B''s row changes nothing');
select throws_ok(
  $$update public.example set user_id = 'bbbbbbbb-0000-4000-8000-000000000002' where id = 'aaaaaaaa-1111-4000-8000-000000000001'$$,
  '42501', null,
  'A cannot hand their row to B');
select is_empty(
  $$delete from public.example returning 1$$,
  'A cannot hard-delete (no delete policy; rows go only with the user)');
reset role;

-- ---- as a visitor (anon) ----
set local role anon;
select throws_ok('select count(*) from public.example', '42501', null, 'anon cannot read the table at all');
reset role;

-- ---- deleting a user removes their rows and nobody else's ----
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is_empty(
  $$select 1 from public.example where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'deleting A removes A''s rows');
select results_eq(
  'select count(*) from public.example',
  array[1::bigint],
  'B''s row is still there');

select * from finish();
rollback;
