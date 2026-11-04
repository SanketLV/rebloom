# Rebloom

Plant care app. `app/` is the Expo app (see `app/AGENTS.md`), `landing/` the landing page, `supabase/` the backend.

## Backend

- One Supabase project (`rebloom`) serves the landing waitlist and the app. **Production changes only through `npx -y supabase@3 db push --remote` of reviewed, merged migrations**: never the dashboard or SQL editor. Build and test on the local stack (`npx -y supabase@3 start`, Docker).
- Supabase CLI v3: `migration list`, `db diff`, `db push` act on the local stack unless given `--remote`.
- Every app table and function follows the rules in `supabase/README.md` (owner-only RLS, no `using (true)`, revoke new functions from `public, anon, authenticated`). `supabase test db` enforces them.
- `supabase/tests/local/` makes users and sends email: local stack only (its guard refuses anything else). `supabase/tests/*.test.mjs` is static (no network); the waitlist tests against production live in `supabase/tests/production/` and run only with `REBLOOM_PROD_TESTS=1`.
- The app reaches Supabase only through `app/src/backend/` (see `app/README.md`, Backend).

@app/AGENTS.md

Review rules and the risk scale for every change:

@review.md
