# Ankh Client Record DB — Full Deployment Manual

Last verified against this repository: 27 July 2026.

This runbook covers all three deliverables built from this repository:

| Deliverable | Source | Production route / identifier |
|---|---|---|
| Vercel web application and API | `ankh-client-app` | `https://ankh-client-record-db.vercel.app` (or a custom domain) |
| Staff Android/iOS app | `ankh-client-app/android`, `ankh-client-app/ios` | `com.ankh.clientrecorddb` |
| Client reservation Android/iOS app | `ankh-client-portal-shell/android`, `ankh-client-portal-shell/ios` | `com.ankh.clientportal` |

The native apps are Capacitor WebView shells that load the deployed Vercel app. They require network access and do not contain an offline copy of the application.

## 1. Release decision and current blockers

Do not treat the current repository as ready for an unrestricted public production launch until the following items are closed and evidenced:

- Complete the remaining API authorization audit. Some legacy staff/data routes still do not enforce staff authentication, including customer/user/export/import surfaces. The client route must remain public, but staff data routes must not.
- Implement client-account deletion in the app and on the web. Both Apple and Google require a deletion path when an app permits account creation.
- Publish a privacy policy and complete Apple App Privacy and Google Play Data Safety declarations. The app processes identity, contact, lesson, symptom/improvement, reservation, and device-token data.
- Change `android:allowBackup="true"` to an approved secure backup policy for both Android apps. For this type of personal/health-adjacent data, the recommended default is `false` unless encrypted backup behavior is explicitly designed and reviewed.
- Configure and test real FCM and APNs credentials. No `google-services.json` or `GoogleService-Info.plist` credential/config files are currently present.
- Configure private Android upload keys and Apple signing teams/profiles. The repository does not contain release signing material, intentionally.
- Increment both apps from the current `1.0 (1)` version before every subsequent store upload.
- Run all migrations against a restored production backup or Supabase duplicate before production. The instructor-role migration deliberately fails if a manager is assigned to a lesson; the interval constraint fails if confirmed reservations overlap.
- Move/fix the migration workflow before relying on it. It currently lives at `ankh-client-app/.github/workflows/prisma-migrate.yml`; GitHub only discovers workflows under the repository-root `.github/workflows/`. It also needs `working-directory: ankh-client-app` (or equivalent) for `npm ci` and Prisma commands.
- Test iOS review suitability. Both apps are remote web wrappers; Apple App Review Guideline 4.2 requires functionality and UX beyond a repackaged website. Native push, device integration, polished offline/error handling, and clear utility must be demonstrated in review notes.

For an internal web pilot, close at minimum the authorization, database backup/migration, secret, and real-environment smoke-test items. Store submission additionally requires all mobile signing, privacy, deletion, push, metadata, and review items.

## 2. Release ownership and accounts

Assign named owners before starting:

- Release lead: owns the checklist and go/no-go decision.
- Database owner: creates and verifies the backup, preflights data, applies migrations, and owns restore access.
- Vercel owner: manages domains, environment variables, deployment, logs, and rollback.
- Firebase/Google Play owner: manages the Firebase project, FCM service account, upload keys, Play Console, and Android releases.
- Apple owner: Account Holder/Admin access, bundle IDs, APNs key, signing profiles, TestFlight, and App Store submission.
- QA owner: executes the web/native/push/concurrency test matrix and records evidence.

Required external accounts:

- GitHub repository access.
- Vercel project/team.
- Supabase production and separate staging/test projects.
- Upstash QStash if bulk import is enabled.
- Firebase project and Google Play Console account.
- Apple Developer Program and App Store Connect access.
- A macOS machine with a supported Xcode version for iOS signing and upload.

Enable MFA/2FA on every account. Never share one signing or cloud-admin login between the team.

## 3. Immutable production identities

Confirm these before creating store records. Package and bundle IDs are difficult or impossible to change after publication:

```text
Staff Android applicationId: com.ankh.clientrecorddb
Staff iOS bundle ID:         com.ankh.clientrecorddb
Client Android applicationId: com.ankh.clientportal
Client iOS bundle ID:         com.ankh.clientportal
```

Recommended production URLs:

```text
Web/staff:  https://app.example.com/en
Client:     https://app.example.com/en/client
API:        https://app.example.com/api/...
```

Use one stable HTTPS custom domain before building store binaries. Changing the domain later requires native app updates because the WebView server URL is embedded in each native project during Capacitor synchronization.

## 4. Local release workstation

Use Node.js 20 LTS, npm, Git, PostgreSQL client tools, and the platform SDKs.

From the repository root:

```powershell
Set-Location A:\ankh\Ankh-Client-Record-DB\ankh-client-app
node --version
npm --version
npm ci
npx prisma generate
```

Android additionally requires Android Studio, Android SDK 36, and a JDK compatible with the checked-in Android Gradle Plugin 8.13.0 and Gradle 8.14.3. Prefer Android Studio's bundled JDK and verify it:

```powershell
Set-Location android
.\gradlew.bat --version
Set-Location ..
```

iOS additionally requires macOS, Xcode, Xcode command-line tools, and access to the Apple signing team. The projects use Capacitor's Swift Package Manager structure (`CapApp-SPM`), so use `npm run open:ios` rather than assuming a CocoaPods workspace.

## 5. Environment variables

### 5.1 Production Vercel variables

Set these under Vercel Project → Settings → Environment Variables. Mark all credentials/keys as sensitive. Environment-variable changes apply only to new deployments, so redeploy after every change.

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | Supabase transaction pooler/runtime URL, normally port `6543`, with `pgbouncer=true` for Prisma |
| `DIRECT_URL` | Yes | Direct or session-mode port `5432` URL used by Prisma migrations and maintenance |
| `JWT_SECRET` | Yes | Random server-only signing secret, at least 32 characters; use 64 random bytes |
| `BUSINESS_TZ` | Yes | Studio scheduling timezone; currently expected to be `Asia/Seoul` |
| `NEXT_PUBLIC_APP_URL` | Yes for imports | Stable HTTPS production origin, no trailing slash; used for QStash callbacks |
| `QSTASH_URL` | Yes for imports | QStash base URL |
| `QSTASH_TOKEN` | Yes for imports | QStash publishing credential |
| `QSTASH_CURRENT_SIGNING_KEY` | Yes for imports | Verifies incoming QStash worker requests |
| `QSTASH_NEXT_SIGNING_KEY` | Yes for imports | Supports QStash signing-key rotation |
| `NOTIFICATIONS_MODE` | Yes | Must be `live` in a production Node runtime |
| `FCM_SERVICE_ACCOUNT_JSON` | Android push | Complete service-account JSON serialized as one line |
| `APNS_TEAM_ID` | iOS push | Apple Developer Team ID |
| `APNS_KEY_ID` | iOS push | APNs `.p8` signing-key ID |
| `APNS_BUNDLE_ID_CLIENT` | iOS push | Must be `com.ankh.clientportal` |
| `APNS_PRIVATE_KEY` | iOS push | Complete `.p8` private key; use literal `\n` escapes if stored on one line |
| `APNS_ENVIRONMENT` | iOS push | `production` for TestFlight/App Store; `sandbox` only for debug development builds |

Do not manually set `NODE_ENV` on Vercel. Do not prefix secrets with `NEXT_PUBLIC_`. Generate the JWT secret locally:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Rotating `JWT_SECRET` invalidates every active staff and client session. Schedule and communicate the logout.

### 5.2 Preview/staging variables

Never point arbitrary Vercel preview branches or integration tests at the production database.

Create a separate Supabase staging project and separate push configuration. Because Vercel preview functions still run with a production Node runtime, `NOTIFICATIONS_MODE=mock` is rejected by this application. Use `live` with staging credentials when push is under test, or avoid triggering push flows.

Use a stable staging domain for QStash and native debug shells. Do not use a short-lived per-commit URL in a native release build.

APNs sandbox and production device tokens are not interchangeable. The current `ClientDevice` model does not record APNs environment, so use separate staging and production databases to prevent token mixing.

### 5.3 Local environment

Copy `.env.production.example` to `.env.local` and add the missing QStash variables when testing imports. Never commit `.env.local`, service-account JSON, `.p8` keys, database dumps, or signing keystores.

## 6. Database backup, preflight, and migration

### 6.1 Create a recoverable backup

1. In Supabase Dashboard → Database → Backups, confirm a recent successful backup or PITR restore point.
2. Create an independent logical backup with the direct/session port `5432` connection. Supabase recommends direct connections for migrations and `pg_dump`; use session pooler mode if the release machine cannot reach the IPv6 direct endpoint.
3. Store the encrypted backup off-site with date, project reference, Postgres version, and SHA-256 hash.
4. Restore the backup into a separate Supabase project or isolated PostgreSQL database. A backup is not verified until a restore succeeds and basic row counts are checked.

Example with PostgreSQL tools:

```powershell
pg_dump --format=custom --no-owner --no-acl --file ankh-prod-predeploy.dump "<DIRECT_OR_SESSION_5432_URL>"
Get-FileHash -Algorithm SHA256 .\ankh-prod-predeploy.dump
pg_restore --list .\ankh-prod-predeploy.dump
```

Do not put the connection URI directly into shared shell history. Prefer a protected password file, secret manager, or interactive prompt.

### 6.2 Preflight the data

Run these read-only checks on the restored backup first and then production immediately before migration.

Managers incorrectly assigned to lessons (must return zero rows):

```sql
SELECT l.id AS lesson_id, u.id AS user_id, u.username, u.role
FROM public.lessons l
JOIN public.users u ON u.id = l."instructorId"
WHERE u.role <> 'INSTRUCTOR'
UNION ALL
SELECT li."lessonId", u.id, u.username, u.role
FROM public.lesson_instructors li
JOIN public.users u ON u.id = li."userId"
WHERE u.role <> 'INSTRUCTOR';
```

Overlapping confirmed reservations for one instructor (must return zero rows):

```sql
SELECT
  a.id AS reservation_a,
  b.id AS reservation_b,
  a."instructorId",
  a."scheduledAt" AS a_start,
  b."scheduledAt" AS b_start
FROM public.reservations a
JOIN public.reservations b
  ON a.id < b.id
 AND a."instructorId" = b."instructorId"
 AND a.status = 'CONFIRMED'
 AND b.status = 'CONFIRMED'
 AND tsrange(
       a."scheduledAt",
       a."scheduledAt" + a."durationMinutes" * interval '1 minute',
       '[)'
     ) && tsrange(
       b."scheduledAt",
       b."scheduledAt" + b."durationMinutes" * interval '1 minute',
       '[)'
     );
```

Also record baseline counts:

```sql
SELECT 'users' AS entity, count(*) FROM public.users
UNION ALL SELECT 'customers', count(*) FROM public.customers
UNION ALL SELECT 'lessons', count(*) FROM public.lessons
UNION ALL SELECT 'reservations', count(*) FROM public.reservations
UNION ALL SELECT 'client_accounts', count(*) FROM public.client_accounts;
```

Resolve invalid data deliberately; do not disable the migration guards.

### 6.3 Test migrations on the restored backup

From `ankh-client-app`, with `DATABASE_URL` and `DIRECT_URL` targeting only the restored test database:

```powershell
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
npx prisma generate
```

Run the database-backed tests against an isolated test database—not production:

```powershell
$env:RUN_DB_INTEGRATION_TESTS='1'
$env:TEST_DATABASE_URL='<ISOLATED_TEST_DATABASE_URL>'
npm run test:integration
Remove-Item Env:RUN_DB_INTEGRATION_TESTS
Remove-Item Env:TEST_DATABASE_URL
```

Verify row counts, create/confirm/cancel a reservation, and confirm two concurrent overlapping confirmations cannot both succeed.

### 6.4 Apply production migrations

Use CI/CD after fixing the workflow location and working directory. Prisma recommends `migrate deploy` in CI rather than from a developer laptop.

If an approved emergency manual run is necessary:

1. Freeze writes or announce a short maintenance window.
2. Confirm the backup timestamp and restore evidence.
3. Confirm the target database host/project reference aloud with a second reviewer.
4. Run `npx prisma migrate status`.
5. Run `npx prisma migrate deploy` exactly once.
6. Run `npx prisma migrate status` again and save the output.
7. Never run `prisma migrate dev`, `prisma db push`, or `prisma migrate reset` against production.

Database migrations are not automatically reversed by a Vercel rollback. Prefer a forward-fix migration. Restore the database only as an incident decision because it causes downtime and can discard writes made after the backup.

## 7. Release gates before Vercel deployment

Run from `ankh-client-app`:

```powershell
npm ci
npx prisma generate
npx tsc --noEmit
npm test
npm run lint
npm audit --omit=dev
npm run build
git status --short
```

Expected minimum gate:

- TypeScript exits 0.
- Unit tests exit 0; investigate all skips.
- Integration tests pass against an isolated migrated database.
- ESLint has zero errors; warnings are reviewed and recorded.
- Production build exits 0 using a production-equivalent variable set.
- `npm audit --omit=dev` has no accepted-unreviewed production vulnerabilities.
- Worktree is clean and the commit has peer review.
- No secrets or database dumps appear in `git status`, Git history, build logs, or source maps.

## 8. Vercel deployment

### 8.1 Create or correct the project

1. Import the GitHub repository into Vercel.
2. Set **Root Directory** to `ankh-client-app`. The repository is a multi-project repository and the root has no application `package.json`.
3. Framework preset: Next.js.
4. Install command: `npm ci` (or Vercel's lockfile-aware default).
5. Build command: `npm run build`.
6. Output directory: leave the Next.js default.
7. Production branch: the reviewed release branch after merge, normally `main`.
8. Add the production environment variables from section 5.
9. Attach the stable custom domain and enforce HTTPS.
10. Deploy a staging/preview build first using staging services.

The `postinstall` script runs `prisma generate`; it does not apply migrations. Keep migration deployment as a separate controlled job.

### 8.2 Production release order

For the current additive schema changes, use this sequence:

1. Announce release and optionally freeze writes.
2. Verify backup and migration preflight.
3. Apply production migrations.
4. Deploy/promote the reviewed Vercel build.
5. Run smoke tests immediately.
6. Unfreeze writes.
7. Monitor logs and database metrics for at least one full business cycle.

### 8.3 Web smoke tests

Test both `/en` and `/ko` on desktop and mobile widths:

- Manager login sets an `ankh-staff-session` cookie with `HttpOnly`, `Secure`, and `SameSite=Strict`; no token appears in JSON or browser storage.
- Staff logout clears the session.
- Manager and instructor authorization boundaries behave correctly.
- Customer search, detail, lesson creation, instructor assignment, location management, import, and export work.
- Staff schedule loads real reservations. A forced/staging API failure displays an explicit error and Retry action rather than an empty schedule.
- Month/week views and 30-minute intervals are correct in `Asia/Seoul` around midnight and DST boundaries of the viewing device.
- Client registration/login works independently from staff login.
- A manager links the client account to the correct existing customer.
- The client can view lesson history, book, cancel, and reschedule only their own reservation.
- Concurrent booking/confirmation cannot create overlapping confirmed reservations for one instructor.
- QStash processes a small import to completion and rejects an invalid signature.
- Vercel function logs contain no secret values, full tokens, or unexpected database errors.

The public `/api/health/db` route currently returns a user count and may return a raw database error message. Protect or remove it before public production; do not use it as a permanent unauthenticated monitoring endpoint in its current form.

## 9. Push notification setup

Only the client reservation surface currently registers a push token. The staff app contains the Capacitor push dependency and entitlement but does not mount `ClientPushBridge`; configuring staff push credentials will not create staff notifications without additional product implementation.

### 9.1 Android / FCM

1. Create or select a Firebase project.
2. Add an Android app with package name `com.ankh.clientportal`.
3. Download the file with the exact name `google-services.json`.
4. Place it at:

   ```text
   ankh-client-portal-shell/android/app/google-services.json
   ```

5. Do not reuse a file registered for a different package name.
6. Enable the FCM HTTP v1 API and create a dedicated server service account with only the permissions required to send FCM messages.
7. Serialize that service-account JSON into the Vercel sensitive variable `FCM_SERVICE_ACCOUNT_JSON`. Do not put the service-account file in either mobile app.
8. Run `npm run sync` in the client shell and rebuild.

The client-side `google-services.json` contains Firebase app identifiers, not the server private key, but keep environment-specific files controlled and verify the package ID before release.

### 9.2 iOS / APNs

1. Register explicit App ID `com.ankh.clientportal` in Apple Developer Certificates, Identifiers & Profiles.
2. Enable Push Notifications for the App ID.
3. In the client Xcode target, add/verify the Push Notifications capability. The checked-in entitlements already map Debug to `development` and Release to `production` through `APS_ENVIRONMENT`.
4. Create an APNs token-signing key (`.p8`) and record its Key ID and Team ID. Download it once and store it in a secret manager.
5. Set the Vercel APNs variables from section 5. Use `APNS_BUNDLE_ID_CLIENT=com.ankh.clientportal`.
6. Use `APNS_ENVIRONMENT=sandbox` only with development-signed debug builds and their database. Use `production` for TestFlight and App Store builds.
7. Recreate provisioning profiles after changing App ID capabilities, or use Xcode automatic signing to refresh them.

No `GoogleService-Info.plist` is required for the current direct-APNs iOS implementation. The server sends iOS notifications directly to APNs over HTTP/2.

### 9.3 Real-device push acceptance test

Perform this separately for Android internal testing, iOS debug sandbox, and iOS TestFlight production:

1. Install a freshly signed app on a physical device.
2. Log in to a client account already linked to a customer.
3. Grant notification permission.
4. Confirm one active `client_devices` row exists for the correct account/platform.
5. Put the app in the background, then terminate it.
6. Create/confirm/change/cancel a reservation from staff UI.
7. Confirm the notification arrives with correct bilingual content and sound.
8. Confirm the corresponding `notifications` row becomes `SENT`, has a provider ID, and has one attempt.
9. Re-trigger the same event and verify deduplication prevents a duplicate delivery.
10. Revoke or invalidate a test token and verify delivery becomes `FAILED` without breaking the reservation action.
11. Log out/unregister where supported and verify revoked devices stop receiving pushes.

Do not claim push is production-ready based on mock-provider tests or an emulator alone.

## 10. Staff and client Android releases

### 10.1 Synchronize production URLs

Staff shell:

```powershell
Set-Location A:\ankh\Ankh-Client-Record-DB\ankh-client-app
$env:CAPACITOR_SERVER_URL='https://app.example.com'
npm run sync:native
Remove-Item Env:CAPACITOR_SERVER_URL
```

Client shell: update `ankh-client-portal-shell/capacitor.config.json` so `server.url` is the stable client URL, for example `https://app.example.com/en/client`, then:

```powershell
Set-Location A:\ankh\Ankh-Client-Record-DB\ankh-client-portal-shell
npm ci
npm run sync
```

Commit reviewed native configuration changes, but never commit signing keys or server credentials.

### 10.2 Versioning

For each app, update `android/app/build.gradle`:

```gradle
versionCode 2       // integer; must increase every Play upload
versionName "1.0.1"
```

Maintain independent versions for staff and client apps. Record which web commit/domain each native binary loads.

### 10.3 Debug validation

Run in each app's `android` directory:

```powershell
.\gradlew.bat clean assembleDebug
```

Install on physical test devices and exercise login, cookies, navigation, back button, rotation, file import/export where applicable, notification permission, and process death/relaunch.

### 10.4 Release signing and AAB

Create a different upload keystore/alias for each package unless the organization has an approved shared-key policy. Store keystores in a hardware-backed or enterprise secret store with offline recovery copies. Never commit them.

The current Gradle files do not define `signingConfigs.release`. The safest first release path is:

1. Open each Android project with `npm run open:android`.
2. Android Studio → Build → Generate Signed Bundle / APK.
3. Choose Android App Bundle.
4. Select/create the correct upload keystore and alias.
5. Select `release` and generate the signed AAB.
6. Verify the certificate and save its SHA-256 fingerprint:

   ```powershell
   jarsigner -verify -verbose -certs .\app-release.aab
   Get-FileHash -Algorithm SHA256 .\app-release.aab
   ```

Expected artifact is normally under `android/app/build/outputs/bundle/release/`.

Enroll each app in Play App Signing; Google recommends signing the uploaded AAB with a separate upload key while Google protects the app-signing key.

### 10.5 Google Play rollout

Create two Play Console apps with the exact package IDs. For the staff app, strongly consider Managed Google Play/private distribution or a closed organizational track instead of a public listing.

For each app:

1. Complete developer verification, store listing, support contact, privacy policy, content rating, target audience, ads declaration, app access instructions, and Data Safety.
2. Provide a working review account. Do not provide production administrator credentials; create least-privilege review/test accounts and data.
3. Upload the signed AAB to Internal testing first.
4. Install from Google Play—not via adb—to validate Play signing and delivery.
5. Run the complete acceptance matrix, including FCM while terminated.
6. Promote to Closed testing, then staged Production only after evidence and approval.
7. Monitor crashes, ANRs, failed pushes, authentication errors, and backend load. Halt the staged rollout if thresholds are exceeded.

## 11. Staff and client iOS releases

All iOS release work must be performed on macOS.

### 11.1 Synchronize and open

For the staff app:

```sh
cd ankh-client-app
CAPACITOR_SERVER_URL=https://app.example.com npm run sync:native
npm run open:ios
```

For the client app:

```sh
cd ankh-client-portal-shell
npm ci
npm run sync
npm run open:ios
```

### 11.2 Signing and capabilities

For each Xcode target:

1. Select the correct Apple Team.
2. Confirm the exact bundle identifier.
3. Prefer automatic signing unless the organization has managed manual profiles.
4. Set Marketing Version and increment Build Number for every upload.
5. Confirm Release configuration uses `APS_ENVIRONMENT=production` if the target retains the push entitlement.
6. Client app: Push Notifications capability is mandatory.
7. Staff app: either enable Push Notifications for its App ID to match the checked-in entitlement or remove that capability/entitlement in a reviewed change if staff push is not used.
8. Confirm the production server URL appears in the generated Capacitor config.

### 11.3 Device and TestFlight testing

1. Run Debug on a registered physical device against staging/APNs sandbox.
2. Archive a Release build and distribute it to TestFlight internal testers.
3. Test the TestFlight build against production APNs, including foreground, background, terminated, permission denied, and token refresh behavior.
4. Test login persistence, logout, language routes, native back/navigation behavior, network loss, slow launch, and Vercel outage messaging.

### 11.4 Archive and upload

In Xcode:

1. Select Any iOS Device (arm64) / Generic iOS Device.
2. Product → Archive.
3. Organizer → Validate App.
4. Distribute App → App Store Connect → Upload.
5. Wait for processing, review all warnings, and select the build in App Store Connect.
6. Complete screenshots, description, support URL, privacy policy, App Privacy, age rating, export compliance, and review notes.
7. Provide a working demo/review account and explain the staff/client relationship, native push, and why each app provides lasting app-specific utility.
8. Submit TestFlight external review if needed, then App Review.

The remote-wrapper architecture has an App Review 4.2 risk. Do not disguise it. In review notes, document native push, reservation workflows, authenticated customer history, device-specific behavior, and the operational need for the app. Ensure all URLs are live and no placeholders or empty screens remain.

## 12. Privacy, account deletion, and store policy

Before public client-app submission:

- Add an easily discoverable in-app Delete Account flow.
- Add a publicly accessible web deletion-request URL for Google Play.
- Define what is deleted immediately, what is retained for legal/business obligations, retention periods, identity verification, and how linked historical customer/lesson records are handled.
- Do not silently delete shared business records without an approved retention model. Separate deletion of client login/device tokens from legally retained lesson records and explain this to the user.
- Publish Privacy Policy, Terms/Service information, support email, and data-contact details.
- Accurately declare WebView-collected data. Google explicitly treats user data collected by a controlled WebView as app data collection.
- Review notification content so sensitive symptoms or health details never appear on a lock screen. Current reservation notifications should remain minimal.

Have the privacy and retention language reviewed by qualified counsel for the countries where the app is offered. This runbook is technical guidance, not legal advice.

## 13. Post-deployment monitoring

No complete production observability stack is configured in the repository. At minimum configure:

- Vercel function/error logs and alerts.
- Supabase connection, CPU, storage, slow-query, and backup/PITR monitoring.
- QStash delivery failures and retry exhaustion.
- Counts/alerts for `notifications.status='FAILED'` and repeated provider errors.
- Counts/alerts for stuck `import_jobs`.
- Mobile crash and ANR reporting with a reviewed privacy configuration.
- External HTTPS uptime checks for a safe, non-sensitive health endpoint.
- Secret-expiry/rotation calendar for APNs keys, service accounts, database credentials, and signing certificates.

Review during the first release window:

```sql
SELECT status, count(*)
FROM public.notifications
WHERE "createdAt" >= now() - interval '24 hours'
GROUP BY status;

SELECT status, count(*)
FROM public.import_jobs
WHERE "createdAt" >= now() - interval '24 hours'
GROUP BY status;
```

Never log passwords, JWTs, session cookies, APNs/FCM tokens, private keys, full service-account JSON, or sensitive lesson notes.

## 14. Rollback and incident procedure

### Web-only defect

1. Stop promotion/traffic changes.
2. Use Vercel Instant Rollback or promote the last known-good deployment.
3. Confirm the old code is compatible with the already-migrated schema.
4. Run smoke tests and monitor.
5. Create a forward fix; do not rewrite Git history or applied migrations.

### Database defect

1. Freeze writes.
2. Preserve logs and take a new incident-time backup if safe.
3. Prefer a reviewed forward migration.
4. Restore/PITR only with database-owner approval and an explicit accepted data-loss point.
5. Reconcile QStash jobs, notifications, and reservations created around the incident.

### Mobile defect

1. Halt staged rollout in Play Console/App Store Connect.
2. The shells load remote web code, so a compatible web hotfix may resolve UI/API issues without a store release.
3. Native config, signing, entitlement, permission, plugin, or startup defects require a new binary with a higher version/build number.
4. Never point an already released binary to an unreviewed server or use remote content changes to bypass store review.

### Credential compromise

Rotate the affected secret immediately, redeploy Vercel, revoke provider keys/tokens, invalidate sessions if `JWT_SECRET` changed, and audit access logs. Revoke APNs keys in Apple Developer and service-account keys in Google Cloud; creating a new value without revoking the old key is insufficient.

## 15. Final go-live checklist

### Source and review

- [ ] Release commit/branch peer-reviewed and merged.
- [ ] Worktree clean; release tag created.
- [ ] No secrets, dumps, keystores, or `.p8` files tracked.
- [ ] Authorization audit complete; public routes explicitly approved.
- [ ] Account deletion and privacy changes complete.

### Database

- [ ] Backup/PITR timestamp and restore test recorded.
- [ ] Migration preflight queries return zero blockers.
- [ ] `prisma migrate deploy` passed on restored backup.
- [ ] Integration/concurrency tests passed on isolated DB.
- [ ] Production migration output and post-counts recorded.

### Web/API

- [ ] Vercel root is `ankh-client-app`.
- [ ] Production and staging variables independently verified.
- [ ] Custom domain/TLS active.
- [ ] Build, typecheck, unit tests, lint, and audit passed.
- [ ] EN/KO, manager, instructor, and client smoke tests passed.
- [ ] HttpOnly session cookie attributes verified.
- [ ] QStash import completed end-to-end.

### Push

- [ ] Android FCM delivered on a physical Play-installed client app.
- [ ] iOS APNs sandbox delivered on physical debug client app.
- [ ] iOS APNs production delivered through TestFlight.
- [ ] Deduplication, revoked tokens, denied permission, logout, and failure rows verified.

### Stores

- [ ] Unique version code/build number set for every binary.
- [ ] AAB/IPA signed with approved identities; hashes/fingerprints recorded.
- [ ] Privacy policy, Data Safety/App Privacy, content rating, support and review accounts complete.
- [ ] Android internal/closed testing passed before staged production.
- [ ] iOS TestFlight passed before App Review.
- [ ] Apple 4.2 review risk and native utility addressed in notes/product.

### Operations

- [ ] Named release, DB, mobile, QA, and incident owners online.
- [ ] Dashboards/alerts active.
- [ ] Rollback compatibility confirmed.
- [ ] First-business-cycle monitoring window scheduled.
- [ ] Release record contains commit, migration set, Vercel deployment, DB backup, native hashes, signing fingerprints, push evidence, and approvers.

## 16. Authoritative references

- [Vercel monorepo root-directory configuration](https://vercel.com/docs/monorepos)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Prisma production migration workflow](https://docs.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase backups](https://supabase.com/docs/guides/platform/backups)
- [GitHub Actions workflow location](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows)
- [Firebase Android configuration](https://firebase.google.com/docs/android/setup)
- [Android app signing](https://developer.android.com/studio/publish/app-signing)
- [Google Play app setup and Android App Bundles](https://support.google.com/googleplay/android-developer/answer/9859152)
- [Apple APNs token authentication](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)
- [Apple capability setup](https://developer.apple.com/help/account/identifiers/enable-app-capabilities/)
- [Apple App Store build upload](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple account deletion requirement](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Google Play account deletion requirement](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Google Play Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469)
