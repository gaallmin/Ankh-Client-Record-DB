# Reservations, Client App, and Push Notifications

Added 2026-07: 30-minute scheduling, native customer push notifications, a
separate client-facing reservation app, and client accounts linked to existing
customer records.

## Architecture

One Next.js codebase and database serve two app surfaces and three deployables:

| Surface | Route | Native shell | App ID |
|---|---|---|---|
| Staff app | `/[locale]` and `/[locale]/ops-schedule` | `ankh-client-app/android`, `ankh-client-app/ios` | `com.ankh.clientrecorddb` |
| Client reservation app | `/[locale]/client` | `ankh-client-portal-shell/android`, `ankh-client-portal-shell/ios` | `com.ankh.clientportal` |

Both Capacitor apps are remote-URL wrappers around the same deployed Next.js
application, so business logic remains server-side. These shells require a
network connection at launch; offline-first support would require bundling the
web application or adding an approved live-update strategy.

## Data model

- `Reservation` has `PENDING`, `CONFIRMED`, `WAITLISTED`, `CANCELLED`,
  `COMPLETED`, and `NO_SHOW` states. Each reservation has at most one
  instructor.
- `LessonInstructor` is the canonical many-to-many assignment model for
  lessons, including `PRIMARY` and `ASSISTANT` assignments. Only managers can
  manage those assignments.
- `ClientAccount` is a separate client login with a JWT audience of `client`.
  Staff users have exactly one role: `MANAGER` or `INSTRUCTOR`.
- A client account can be linked to exactly one existing `Customer` after staff
  identity verification. Registration never creates or auto-merges a customer.
- `ClientDevice` stores APNs or FCM tokens per account and device.
- `Notification` stores push-delivery status, provider ID, attempts, and a
  per-device unique deduplication key.
- The PostgreSQL exclusion constraint
  `reservations_no_confirmed_instructor_overlap` prevents overlapping confirmed
  reservations for one instructor under concurrent requests. Adjacent
  half-open intervals remain valid.

Reservations do not consume lesson credits because the current database has no
credit, package, or expiration model. `Reservation.lessonId` is the future
integration point if credits are introduced.

## Migrations

Apply migrations only after creating and verifying a production backup:

```sh
npx prisma migrate deploy
```

The release migrations add reservations and client accounts, normalize lesson
instructor assignments, enforce reservation intervals, and remove active SMS
preferences in favor of push-only notifications. The interval migration must
be preflighted for existing overlaps before production deployment.

## Scheduling

`src/lib/slots.ts` generates 30-minute slots from availability templates in
`BUSINESS_TZ` (default `Asia/Seoul`). Slot availability is checked in the API,
and confirmed instructor overlap is also rejected atomically by PostgreSQL.

## Authentication

- Missing, weak, or placeholder `JWT_SECRET` values fail closed.
- Staff and client tokens use separate JWT audiences.
- Client sessions are stored in Secure, SameSite=Strict, HttpOnly cookies.
- Client API calls use cookie credentials; client tokens are never written to
  localStorage.

## Push delivery

- Production requires `NOTIFICATIONS_MODE=live`; mock mode is rejected.
- Android uses FCM HTTP v1 with a service account.
- iOS uses APNs HTTP/2 with an ES256 provider token.
- Pushes are idempotent per event and device. Missing accounts, revoked tokens,
  and opt-outs create `SKIPPED` delivery rows.
- Reservation requested, confirmed, changed, cancelled, and
  waitlist-to-confirmed events can trigger push notifications.
- SMS is not advertised or sent.

External setup still required:

1. Register both Android package IDs in Firebase and place each app's
   `google-services.json` in its own `android/app/` directory.
2. Register both iOS bundle IDs in the Apple Developer portal with Push
   Notifications enabled. The checked-in Xcode projects include Debug and
   Release APNs entitlements.
3. Configure `FCM_SERVICE_ACCOUNT_JSON`, `APNS_TEAM_ID`, `APNS_KEY_ID`,
   `APNS_BUNDLE_ID_CLIENT`, and `APNS_PRIVATE_KEY` on the server, then set
   `NOTIFICATIONS_MODE=live`.
4. Test real-device registration and delivery in both APNs sandbox/production
   and FCM before store submission.

## Builds

- Web: `npm run build`
- Sync both native targets: `npm run sync:native` in the staff project and
  `npm run sync` in the client shell.
- Android validation: run `gradlew.bat assembleDebug` from each `android/`
  directory.
- Android release: configure the private release keystore outside source
  control, then generate and verify an AAB or release APK.
- iOS release: open each project on macOS with Xcode, select the owning Apple
  team, archive, validate, and export signed IPA files.

## Tests

- `npm test`: authentication, push-provider contracts, notification
  idempotency, scheduling, time-zone/DST, and overlap behavior.
- `npm run test:integration`: database-backed authorization and concurrent
  reservation tests. It intentionally skips unless
  `RUN_DB_INTEGRATION_TESTS=1` and `TEST_DATABASE_URL` target an isolated test
  database.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` are release gates.

Production migration, real push delivery, and signed store builds cannot be
validated without production credentials, provider accounts, and a macOS/Xcode
signing environment.
