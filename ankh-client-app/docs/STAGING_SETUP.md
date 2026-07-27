# Isolated staging setup

Staging/UAT must use a separate Supabase project. Never attach a Vercel preview,
GitHub workflow, local integration test, or manager test account to production.

## One-time account setup

1. Create a new Supabase project named `ankh-staging` in the same region as production.
2. Record both Supabase project references. They must be different.
3. In GitHub, create an environment named `staging` and require a reviewer.
4. Add these environment secrets:
   - `STAGING_DATABASE_URL`: staging transaction-pooler URL (port 6543).
   - `STAGING_DIRECT_URL`: staging direct/session URL (port 5432).
   - `STAGING_PROJECT_REF`: the staging Supabase project reference.
   - `PRODUCTION_PROJECT_REF`: the production project reference used only as a rejection guard.
5. Do not add production database URLs to the `staging` GitHub environment.

## Migrate and prove staging

Run the GitHub Actions workflow **Migrate and Test Staging Database** manually.
It will:

1. Reject missing, placeholder, mismatched, or production project identities.
2. Run `prisma migrate deploy` only with the staging URLs.
3. Run the database-backed authorization and reservation-concurrency tests.

Do not continue to manager UAT unless all three steps pass.

Create the first staging manager only after migration, with a unique test-only
username and a generated password of at least 12 characters:

```powershell
$env:DATABASE_URL = $env:STAGING_DATABASE_URL
$env:DIRECT_URL = $env:STAGING_DIRECT_URL
npm run seed -- uat-manager "PASTE_A_GENERATED_STAGING_ONLY_PASSWORD"
```

Do not reuse a production username/password, and remove the command from shell
history if the workstation records commands containing secrets.

## Vercel staging project

Create a separate Vercel project (recommended) or a protected custom environment:

- Root directory: `ankh-client-app`
- Stable domain: for example `ankh-staging.example.com`
- Deployment Protection: enabled; grant access only to the UAT group
- `DATABASE_URL`: staging pooler URL
- `DIRECT_URL`: staging direct/session URL
- `JWT_SECRET`: a new staging-only random secret of at least 64 bytes
- `BUSINESS_TZ`: `Asia/Seoul`
- `NEXT_PUBLIC_APP_URL`: the stable staging HTTPS URL
- QStash and push credentials: staging-only; never production credentials

Use synthetic data by default. If realistic history is essential, restore a
production backup into staging and sanitize names, email addresses, phone
numbers, notes, symptoms, device tokens, and client credentials before access
is granted to testers.

## Manager handoff gate

- The workflow passed against the staging project.
- The Vercel deployment identifies the reviewed Git commit.
- Anonymous requests to staff APIs return 401.
- Instructor requests to manager-only APIs return 403.
- Manager, instructor, client, EN, and KO smoke tests pass.
- Dashboard totals are reconciled against a small manually calculated dataset.
- A rollback deployment and a named database owner are available.
