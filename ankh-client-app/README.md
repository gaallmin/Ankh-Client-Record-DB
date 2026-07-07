# Ankh Client Record Database

A production-grade, multi-language client management system for wellness studios and healthcare professionals. Built for teams that need to record sessions, track customer symptoms and improvements over time, manage instructors across multiple locations, and bulk-import years of historical Excel data.

**Live:** https://ankh-client-record-db.vercel.app  
**Repo:** https://github.com/DvbyDt/Ankh-Client-Record-DB

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6.16-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-336791?style=flat-square&logo=postgresql)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [API Reference](#6-api-reference)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Internationalization](#9-internationalization)
10. [Bulk Import Pipeline](#10-bulk-import-pipeline)
11. [CSV Export](#11-csv-export)
12. [Performance Optimizations](#12-performance-optimizations)
13. [Environment Variables](#13-environment-variables)
14. [Local Development](#14-local-development)
15. [Database Migrations](#15-database-migrations)
16. [Deployment](#16-deployment)
17. [Role-Based Access Control](#17-role-based-access-control)
18. [Error Handling](#18-error-handling)
19. [Common Issues & Fixes](#19-common-issues--fixes)
20. [Debug Diaries](#20-debug-diaries)

---

## 1. Project Overview

### What it does

- **Lesson Recording** — Log sessions with instructor, location, lesson type, content notes, and date
- **Health Tracking** — Record customer symptoms and improvements at each session
- **Customer Management** — Search, view full history, edit profiles, and soft-delete records
- **User Management** — Managers create and manage instructor/manager accounts
- **Location Management** — Create and assign training venues to sessions
- **Bulk Import** — Upload Excel or CSV files via async background processing with live progress
- **CSV Export** — Download all customer and lesson data as a structured spreadsheet
- **Bilingual UI** — Full English and Korean support with locale-aware name formatting

### Who uses it

```
┌─────────────────────────────────────────────────────────────┐
│                          ROLES                              │
├───────────────────────────┬─────────────────────────────────┤
│         MANAGER           │          INSTRUCTOR             │
├───────────────────────────┼─────────────────────────────────┤
│  ✅ Search customers      │  ✅ Search customers            │
│  ✅ View lesson history   │  ✅ View lesson history         │
│  ✅ Add lesson records    │  ✅ Add lesson records          │
│  ✅ Export CSV            │  ✅ Export CSV (configurable)   │
│  ✅ Edit/delete customers │  ❌ Edit/delete customers       │
│  ✅ Bulk import Excel     │  ❌ Bulk import Excel           │
│  ✅ Create/delete users   │  ❌ Create/delete users         │
│  ✅ View all users        │  ❌ View all users              │
│  ✅ Add locations         │  ❌ Add locations               │
│  ✅ Access settings       │  ❌ Access settings             │
└───────────────────────────┴─────────────────────────────────┘
```

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       USER'S BROWSER                         │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐    │
│   │           React UI  (Next.js App Router)            │    │
│   │                                                     │    │
│   │   /en/          /en/add-record    /en/manage-users  │    │
│   │  Dashboard       Lesson Form       User Search      │    │
│   └───────────────────────┬─────────────────────────────┘    │
│                           │ HTTP + JWT                       │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                  VERCEL SERVERLESS FUNCTIONS                  │
│                                                              │
│  /api/auth   /api/customers   /api/lessons   /api/import/*  │
│                                                              │
│          All routes verified via JWT middleware              │
└───────────────────────────┬──────────────────────────────────┘
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
┌─────────────────────────┐   ┌──────────────────────────────┐
│   UPSTASH QSTASH        │   │  SUPABASE PGBOUNCER (6543)   │
│                         │   │                              │
│  HTTP message queue     │   │  Connection pool (~20 conns) │
│  Async import chunks    │   │  Serverless-safe pooling     │
│  Auto-retries on fail   │   └──────────────┬───────────────┘
└─────────────────────────┘                  │
                                             ▼
                              ┌──────────────────────────────┐
                              │  SUPABASE POSTGRESQL          │
                              │  (AWS ap-northeast-2 Seoul)  │
                              │                              │
                              │  users · customers · lessons │
                              │  lesson_participants          │
                              │  locations · import_jobs      │
                              └──────────────────────────────┘
```

### Request Lifecycle

```
Browser                  Vercel                   Database
  │                        │                         │
  │─── POST /api/auth ──────►│                         │
  │                        │── SELECT user ──────────►│
  │                        │◄── { hash, role } ────────│
  │                        │   bcrypt.compare()        │
  │                        │   jwt.sign()              │
  │◄── { token, user } ────│                         │
  │  cookie: jwt-token     │                         │
  │                        │                         │
  │─── GET /api/customers ──►│                         │
  │   Authorization: Bearer │   jwt.verify(token)     │
  │                        │── SELECT customers ─────►│
  │◄── { customers } ───────│◄── rows ─────────────────│
```

---

## 3. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 16 (App Router, Turbopack) | Full-stack — frontend + API routes in one deployment |
| Language | TypeScript 5 (strict mode) | Type safety across client, server, and DB layer |
| Styling | Tailwind CSS 4 | Utility-first styling without a separate design system |
| UI Components | shadcn/ui + Radix UI | Accessible, unstyled primitives (used on add-record page only — see §8) |
| Icons | Lucide React | Consistent icon set |
| ORM | Prisma 6 | Type-safe queries, migration system, generated client |
| Database | PostgreSQL via Supabase | Managed Postgres with connection pooler for serverless |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` | Stateless — correct for serverless where there is no session store |
| Forms | React Hook Form 7 + Zod 4 | Form state management + schema validation |
| i18n | next-intl 4 | URL-based locale routing, EN + KO |
| Async Jobs | Upstash QStash | HTTP message queue for background import processing |
| File Parsing | SheetJS (XLSX) + PapaParse | Excel and CSV reading |
| Deployment | Vercel | Serverless, auto-deploy from GitHub |

### Why Two Connection URLs (Supabase)

```
┌──────────────────────────┬──────────────────────────────┐
│   DATABASE_URL           │   DIRECT_URL                 │
│   port 6543              │   port 5432                  │
│   PgBouncer pooled       │   Direct to Postgres         │
├──────────────────────────┼──────────────────────────────┤
│  Used at runtime         │  Used by Prisma CLI only     │
│                          │                              │
│  Vercel serverless fns   │  PgBouncer doesn't support   │
│  spin up/down rapidly.   │  DDL statements (CREATE,     │
│  Without pooling they    │  ALTER) that migrations need │
│  exhaust the DB's 100    │                              │
│  connection limit        │                              │
└──────────────────────────┴──────────────────────────────┘
```

---

## 4. Project Structure

```
ankh-client-app/
│
├── src/
│   ├── app/
│   │   ├── [locale]/                        # /en and /ko routes
│   │   │   ├── layout.tsx                   # NextIntlClientProvider wrapper
│   │   │   ├── page.tsx                     # Main dashboard (~1,300 lines)
│   │   │   ├── add-record/page.tsx          # Multi-step lesson form
│   │   │   ├── manage-users/page.tsx        # User search & management
│   │   │   └── settings/page.tsx            # App settings (MANAGER only)
│   │   │
│   │   ├── api/
│   │   │   ├── auth/login/route.ts          # POST — credentials → JWT
│   │   │   ├── customers/
│   │   │   │   ├── route.ts                 # GET paginated list
│   │   │   │   ├── search/route.ts          # GET ?name= search
│   │   │   │   └── [customerId]/route.ts    # GET / PUT / DELETE (soft)
│   │   │   ├── lessons/
│   │   │   │   ├── new/route.ts             # POST — lesson + participants
│   │   │   │   ├── recent/route.ts          # GET — dashboard feed
│   │   │   │   └── [lessonId]/participants/
│   │   │   │       └── [customerId]/route.ts # PUT symptoms / DELETE
│   │   │   ├── users/
│   │   │   │   ├── route.ts                 # GET all / POST create
│   │   │   │   ├── [userId]/route.ts        # PUT / DELETE
│   │   │   │   ├── instructors/route.ts     # GET INSTRUCTOR-role users
│   │   │   │   └── search/route.ts          # GET ?name=
│   │   │   ├── instructors/
│   │   │   │   ├── search/route.ts          # GET ?name=
│   │   │   │   └── [id]/lessons/route.ts    # GET instructor lesson history
│   │   │   ├── locations/route.ts           # GET all / POST create
│   │   │   ├── import/
│   │   │   │   ├── start/route.ts           # POST — parse file, queue job
│   │   │   │   ├── process/route.ts         # POST — QStash worker
│   │   │   │   └── status/[jobId]/route.ts  # GET — poll progress
│   │   │   ├── export-csv/route.ts          # GET — download all as CSV
│   │   │   ├── settings/route.ts            # GET / POST app settings
│   │   │   └── health/db/route.ts           # GET — DB connectivity check
│   │   │
│   │   ├── page.tsx                         # Root → redirect to /en
│   │   └── layout.tsx                       # Root HTML shell
│   │
│   ├── components/
│   │   ├── LanguageSwitcher.tsx             # EN / 한국어 toggle
│   │   ├── UploadModal.tsx                  # File picker + live progress bar
│   │   └── ui/                              # shadcn/ui primitives
│   │       └── button, card, dialog, input, label, select, textarea
│   │
│   ├── lib/
│   │   └── prisma.ts                        # Singleton Prisma client
│   ├── generated/prisma/                    # Auto-generated — do not edit
│   └── i18n.ts                              # next-intl configuration
│
├── prisma/
│   ├── schema.prisma                        # Source of truth for the DB
│   ├── seed.ts                              # Creates first manager account
│   └── migrations/                          # SQL history (git-tracked)
│
├── messages/
│   ├── en.json                              # English translation strings
│   └── ko.json                              # Korean translation strings
│
├── middleware.ts                            # Locale detection & routing
├── next.config.ts                           # next-intl plugin config
├── tsconfig.json                            # TypeScript strict config
└── components.json                          # shadcn/ui configuration
```

---

## 5. Database Schema

### Entity Relationship Diagram

```
┌──────────────────────┐          ┌──────────────────────┐
│       users          │          │      locations        │
├──────────────────────┤          ├──────────────────────┤
│ id         CUID  PK  │          │ id         CUID  PK  │
│ username   String UQ │          │ name       String UQ │
│ password   String    │          │ createdAt  DateTime  │
│ role       Enum      │          │ updatedAt  DateTime  │
│  MANAGER|INSTRUCTOR  │          └──────────┬───────────┘
│ firstName  String    │                     │ 1
│ lastName   String    │                     │ N
│ email      String UQ │          ┌──────────▼───────────┐
│ isActive   Boolean   │          │       lessons         │
│ createdAt  DateTime  │          ├──────────────────────┤
│ updatedAt  DateTime  │          │ id           CUID PK │
└─────────┬────────────┘          │ lessonType   String  │
          │ 1                     │ lessonContent String?│
          │ N                     │ instructorId FK→User │
          └───────────────────────► locationId   FK→Loc  │
                                  │ createdAt    DateTime│
                                  └──────────┬───────────┘
                                             │ 1
                                             │ N
┌──────────────────────┐          ┌──────────▼───────────┐
│      customers       │          │  lesson_participants  │
├──────────────────────┤          ├──────────────────────┤
│ id         CUID  PK  │◄─────────┤ customerId   FK→Cust │
│ externalId String?   │    N     │ lessonId     FK→Less │
│ firstName  String    │          │ customerSymptoms  ?  │
│ lastName   String    │          │ customerImprovements?│
│ email      String?   │          │ status       String  │
│ phone      String?   │          │ createdAt    DateTime│
│ company    String?   │          │ UNIQUE(customerId,   │
│ createdAt  DateTime  │          │        lessonId)     │
│ updatedAt  DateTime  │          └──────────────────────┘
│ deletedAt  DateTime? │
└──────────────────────┘

┌──────────────────────┐          ┌──────────────────────┐
│  lesson_instructors  │          │     import_jobs       │
├──────────────────────┤          ├──────────────────────┤
│ id         CUID  PK  │          │ id         CUID  PK  │
│ lessonId   FK→Less   │          │ status     String    │
│ userId     FK→User   │          │  queued|processing   │
│ UNIQUE(lessonId,     │          │  complete|failed     │
│         userId)      │          │ progress   Int 0–100 │
└──────────────────────┘          │ message    String    │
                                  │ totalRows  Int       │
┌──────────────────────┐          │ rowErrors  Json      │
│     app_settings     │          │ rowsJson   String?   │
├──────────────────────┤          │ createdAt  DateTime  │
│ id       "singleton" │          │ updatedAt  DateTime  │
│ settings Json        │          └──────────────────────┘
└──────────────────────┘
```

### Schema Design Decisions

**CUID primary keys** — collision-resistant, URL-safe, and do not expose record counts. Auto-increment IDs like `/customers/1` allow anyone to enumerate all records by incrementing the ID.

**`LessonParticipant` as explicit join table** — attendance carries its own data (symptoms, improvements, status) that cannot live on either `Customer` or `Lesson`. It only exists in the context of one customer at one session.

**Soft delete on `Customer`** (`deletedAt DateTime?`) — sets a timestamp instead of removing the row, preserving all historical lesson records. All queries filter `WHERE "deletedAt" IS NULL`.

**`createdAt` doubles as lesson date** — during import, the parsed lesson date from the spreadsheet is passed as the `createdAt` value rather than adding a separate date column.

**`@@unique([customerId, lessonId])`** — prevents a customer being added to the same lesson twice. Combined with `createMany({ skipDuplicates: true })`, re-importing the same file is safe.

**`ImportJob` table** — import state must survive across multiple independent serverless function invocations. The database is the only shared persistent state between the start route, QStash worker calls, and the polling frontend. This is the Saga Pattern.

### Recommended Indexes

Run these in Supabase SQL Editor after the initial migration:

```sql
CREATE INDEX IF NOT EXISTS "customers_firstName_idx"
  ON "customers"("firstName");
CREATE INDEX IF NOT EXISTS "customers_lastName_idx"
  ON "customers"("lastName");
CREATE INDEX IF NOT EXISTS "customers_deletedAt_idx"
  ON "customers"("deletedAt");
CREATE INDEX IF NOT EXISTS "customers_createdAt_idx"
  ON "customers"("createdAt");
CREATE INDEX IF NOT EXISTS "lesson_participants_customerId_idx"
  ON "lesson_participants"("customerId");
CREATE INDEX IF NOT EXISTS "lesson_participants_lessonId_idx"
  ON "lesson_participants"("lessonId");
CREATE INDEX IF NOT EXISTS "lessons_createdAt_idx"
  ON "lessons"("createdAt");
CREATE INDEX IF NOT EXISTS "lessons_instructorId_idx"
  ON "lessons"("instructorId");
CREATE INDEX IF NOT EXISTS "users_firstName_idx"
  ON "users"("firstName");
CREATE INDEX IF NOT EXISTS "users_lastName_idx"
  ON "users"("lastName");
```

The `deletedAt` index has the biggest impact — every customer query filters `WHERE "deletedAt" IS NULL`, and without it PostgreSQL performs a full table scan on every request.

---

## 6. API Reference

### Route Map

```
/api/
├── auth/login                POST    Validate credentials → JWT
│
├── customers/
│   ├── (root)                GET     Paginated list
│   ├── search                GET     ?name= full-text search
│   └── [customerId]          GET     Full profile + lesson history
│                             PUT     Update fields (MANAGER)
│                             DELETE  Soft delete (MANAGER)
│
├── lessons/
│   ├── new                   POST    Create lesson + participants
│   ├── recent                GET     Last N lesson entries (dashboard)
│   └── [lessonId]/participants/
│       └── [customerId]      PUT     Update symptoms/improvements
│                             DELETE  Remove participant (MANAGER)
│
├── users/
│   ├── (root)                GET     All users (MANAGER)
│   │                         POST    Create user (MANAGER)
│   ├── [userId]              PUT     Update user
│   │                         DELETE  Delete user (MANAGER)
│   ├── instructors           GET     INSTRUCTOR-role users (dropdown)
│   └── search                GET     ?name=
│
├── instructors/
│   ├── search                GET     ?name=
│   └── [id]/lessons          GET     Instructor lesson history
│
├── locations/                GET     All locations
│                             POST    Create location (MANAGER)
│
├── import/
│   ├── start                 POST    Parse file, create job, queue work
│   ├── process               POST    QStash worker (called by QStash)
│   └── status/[jobId]        GET     Poll progress 0–100
│
├── export-csv                GET     Download all data as CSV
├── settings                  GET     Get app settings
│                             POST    Update settings (MANAGER)
└── health/db                 GET     Database connectivity check
```

### Authentication

#### `POST /api/auth/login`

**Request:**
```json
{ "username": "manager1", "password": "secret" }
```

**Response 200:**
```json
{
  "token": "eyJhbGci...",
  "user": {
    "id": "clx...",
    "username": "manager1",
    "role": "MANAGER",
    "firstName": "Min",
    "lastName": "Jegal"
  }
}
```

### Customers

#### `GET /api/customers/search`

Query params: `?name=kim&take=20&skip=0`

The search runs `ILIKE` across `firstName`, `lastName`, and `email` using Prisma's `mode: 'insensitive'`.

#### `POST /api/lessons/new`

```json
{
  "instructorId": "clx...",
  "location": "clx...",
  "lessonType": "Group",
  "lessonContent": "Neck and shoulder work",
  "customers": [
    {
      "id": "clx...",
      "firstName": "Ji-young",
      "lastName": "Kim",
      "symptoms": "Lower back pain",
      "improvements": "More flexible than last week"
    }
  ]
}
```

---

## 7. Authentication & Authorization

### Login Flow

```
Browser                      Server                      Database
   │                            │                           │
   │── POST /api/auth/login ────►│                           │
   │   { username, password }   │                           │
   │                            │── SELECT user ───────────►│
   │                            │◄── { id, hash, role } ────│
   │                            │   bcrypt.compare(pw, hash)│
   │                            │   jwt.sign(               │
   │                            │     { userId, role },     │
   │                            │     JWT_SECRET,           │
   │                            │     { expiresIn: '24h' }  │
   │                            │   )                       │
   │◄── 200 { token, user } ────│                           │
   │   cookie: jwt-token (1d)   │                           │
```

### JWT Structure

```
Header:   { "alg": "HS256", "typ": "JWT" }
Payload:  { "userId": "clx...", "role": "MANAGER", "iat": ..., "exp": ... }
Signature: HMACSHA256(header + payload, JWT_SECRET)
```

### Protected Route Pattern

```typescript
function requireManager(request: NextRequest) {
  const token = request.headers.get('authorization')?.slice(7) ?? null
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role?: string }
    if (decoded.role !== 'MANAGER')
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    return { ok: true }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
}
```

**Important:** RBAC is enforced at the API layer. The UI conditionally hides buttons based on role, but that is only convenience — a user calling the API directly still gets a 403 if their JWT does not contain the required role.

---

## 8. Frontend Architecture

### Page & Component Map

```
/en  →  [locale]/layout.tsx
            └── NextIntlClientProvider (loads en.json)
                └── [locale]/page.tsx  (Dashboard)
                    │
                    ├── HEADER
                    │   ├── Logo + Customer Count
                    │   ├── LanguageSwitcher (en / 한국어)
                    │   └── Avatar + Role Badge + Logout
                    │
                    ├── TOOLBAR
                    │   ├── Add New Record → /en/add-record
                    │   ├── Export CSV → /api/export-csv (download)
                    │   ├── Import Excel → UploadModal
                    │   └── [MANAGER ONLY]
                    │       ├── All Customers → AllCustomersPanel
                    │       ├── All Users → AllUsersPanel
                    │       ├── Add User → AddUserModal
                    │       ├── Add Location → AddLocationModal
                    │       └── Manage Users → /en/manage-users
                    │
                    ├── RECENT LESSONS PANEL (auto-loads, 8 entries)
                    │
                    ├── SEARCH BOX
                    │   ├── useDebounce(400ms) — fires on 2+ chars
                    │   ├── Shimmer skeleton while loading
                    │   └── Paginated results (20 per page)
                    │       └── Expandable rows → lesson preview
                    │
                    └── MODALS (pure HTML + Tailwind, no Radix)
                        ├── LoginModal
                        ├── CustomerDetailModal
                        ├── EditCustomerModal
                        ├── AddUserModal
                        ├── AddLocationModal
                        ├── UploadModal
                        └── ConfirmDialog
```

### Search State Flow

```
User types "kim"
  → setSearchTerm("kim")
  → useDebounce waits 400ms
  → debouncedSearch changes → useEffect fires
  → setIsLoading(true)
  → fetch /api/customers/search?name=kim
  → setSearchResults(data.customers) + setIsLoading(false)
  → User clicks a result
  → fetch /api/customers/[id]  (full history, on-demand)
  → CustomerDetailModal opens
```

### Why No Radix UI on the Main Dashboard

The dashboard uses **pure HTML + Tailwind only**, deliberately avoiding shadcn/Radix components. Radix UI uses a portal pattern that inserts DOM nodes into `document.body`. Korean IME input methods, browser translation extensions, and password managers mutate these portal nodes in ways React's virtual DOM reconciliation does not expect, causing `NotFoundError: removeChild` crashes. The `add-record` page still uses shadcn Select components where the UX trade-off is acceptable.

---

## 9. Internationalization

The app supports **English** (`/en/...`) and **Korean** (`/ko/...`) via [next-intl](https://next-intl-docs.vercel.app/).

```
User visits /
  → middleware.ts reads Accept-Language header
  → Redirects to /ko (Korean browser) or /en (everything else)
  → [locale]/layout.tsx loads ko.json or en.json
  → NextIntlClientProvider injects messages
  → useTranslations() available in all components
```

### Name Formatting

```
locale = 'en'  →  formatName("John", "Doe") = "John Doe"
locale = 'ko'  →  formatName("준호", "김")  = "김 준호"
```

Used in search results, lesson cards, user lists, avatars, and detail modals.

### Adding a New Language

```typescript
// 1. Create messages/ja.json — copy all keys from en.json
// 2. Add to src/i18n.ts:
export const locales = ['en', 'ko', 'ja'] as const
// 3. Done — middleware and routing handle the rest
```

---

## 10. Bulk Import Pipeline

The import system processes thousands of rows from historical Excel or CSV files asynchronously.

### The Problem

```
Vercel Hobby plan   →  60 second max function timeout
Serverless arch     →  No persistent background threads
3,741 row file      →  Impossible to process synchronously
Real users watching →  Must show live progress feedback
```

### Why Synchronous Failed

```
Browser ──► POST /api/import ──► parse + insert all rows ──► response
                                    │
                              ⏱ 60 seconds max
                                    │
                                    ▼
                           ❌ 504 GATEWAY TIMEOUT
```

### The QStash Solution

QStash is an HTTP-based message queue. Instead of doing work in the request, the work is queued and QStash calls back in chunks:

```
Browser ──► POST /api/import/start ──► QStash
                                            │
                QStash ──► POST /api/import/process  (chunk 1)
                                            │  ~1000 rows in one createMany
                                            │
                QStash ──► POST /api/import/process  (chunk 2)
                                            │
                         ... continues until complete ...

Browser  (polls /api/import/status/[jobId] every 2s)
  ◄── { progress: 25 }
  ◄── { progress: 50 }
  ◄── { progress: 100, status: "complete" }
```

### What Happens in Each Phase

**`POST /api/import/start`** (synchronous, runs in < 10 seconds):

```
1. Parse Excel/CSV in memory (SheetJS)
2. createMany locations (small — 8 rows)       → 1 query
3. createMany instructors (small — 43 rows)    → 1 query
4. createMany customers (small — 165 rows)     → 1 query
5. Resolve all IDs (locationMap, instructorMap, customerMap)
6. Pre-build all lesson + participant rows with IDs already resolved
7. Store pre-resolved data in ImportJob.rowsJson
8. Publish first chunk to QStash
9. Return { jobId } to browser immediately
```

**`POST /api/import/process`** (called by QStash, one chunk at a time):

```
1. Verify QStash signature
2. Load ImportJob.rowsJson from DB
3. createMany(1000 lesson rows, skipDuplicates: true)   → 1 query
4. createMany(1000 participant rows, skipDuplicates: true)
5. Update ImportJob.progress
6. Queue next chunk to QStash (or mark complete)
```

### Performance Results

```
Metric                Before (per-row upserts)    After (bulk createMany)
─────────────────────────────────────────────────────────────────────────
DB queries (3,741 r)       ~11,223                      ~12
Import time                35 minutes                 ~2 minutes
QStash calls               40+                          9
50K row estimate           Never finishes            ~15 minutes
```

### System Design Concepts Applied

| Concept | Where |
|---------|-------|
| Async processing | Browser gets `jobId` immediately; work happens independently |
| Message queue | QStash delivers chunks reliably with auto-retry |
| Chunking | 3,741 ÷ 1,000 = 4 safe calls, each within 60s timeout |
| Bulk operations | `createMany` = O(1) queries/chunk vs O(n) per-row upserts |
| Phase separation | Reference data (tiny, sync) separated from bulk data (async) |
| Idempotency | `skipDuplicates: true` — re-importing the same file is safe |
| Saga pattern | Long operation split across steps; each step updates `ImportJob` state |
| Pre-resolution | IDs resolved once in start route, not on every QStash call |

---

## 11. CSV Export

```
Browser ──► GET /api/export-csv (Authorization: Bearer ...)
                │
                ├── SELECT customers WHERE deletedAt IS NULL
                │   INCLUDE lessonParticipants → lessons → instructor → location
                │
                ├── flatMap: one CSV row per lesson attendance record
                │
                └── Response headers:
                    Content-Type: text/csv
                    Content-Disposition: attachment; filename=export.csv
```

The exported CSV column headers match the import pipeline's expected field names — you can export, edit, and re-import.

---

## 12. Performance Optimizations

### Parallel DB Queries

```typescript
// Sequential — 2× slower
const customers = await prisma.customer.findMany(...)
const total = await prisma.customer.count(...)

// Parallel — both queries fire simultaneously
const [customers, total] = await Promise.all([
  prisma.customer.findMany({ skip, take, where, include }),
  prisma.customer.count({ where })
])
```

### Lazy Panel Loading

```
Page loads → fetches only recent lessons (8 rows)
          ↓ user clicks "All Customers"
          → first open: fetch page 1 (50 customers)
          → subsequent opens: use cached React state
```

### Customer Detail On Demand

```
Search results → 5 lesson previews per customer (fast, included in search)
                  ↓ user opens detail modal
                  → fetch full history (only when needed)
```

### Edge Caching for Reference Data

```typescript
// Instructors and locations change rarely — serve from Vercel CDN edge
return NextResponse.json(data, {
  headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
})
```

### Debounced Search

```typescript
// 400ms debounce prevents an API call on every keystroke
const debouncedSearch = useDebounce(searchTerm, 400)
useEffect(() => {
  if (debouncedSearch.length >= 2) fetchCustomers(debouncedSearch)
}, [debouncedSearch])
```

---

## 13. Environment Variables

Create a `.env.local` file at the project root (never commit this):

```bash
# PostgreSQL pooled via PgBouncer — used at runtime
DATABASE_URL="postgresql://postgres.[ref]:[password]@pooler.supabase.com:6543/postgres?pgbouncer=true"

# PostgreSQL direct connection — used by Prisma CLI migrations only (port 5432)
DIRECT_URL="postgresql://postgres.[ref]:[password]@[host].supabase.com:5432/postgres"

# JWT signing secret
# Generate: openssl rand -hex 64
JWT_SECRET="your-64-char-hex-secret"

# Upstash QStash — from Upstash dashboard → QStash → Quickstart
QSTASH_URL="https://qstash.upstash.io"
QSTASH_TOKEN="eyJVc2VySUQi..."
QSTASH_CURRENT_SIGNING_KEY="sig_..."
QSTASH_NEXT_SIGNING_KEY="sig_..."

# Your production domain (no trailing slash) — used by QStash to call back
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
```

**Where to find Supabase URLs:**  
Project → Settings → Database → Connection string.  
Port **6543** = pooled (`DATABASE_URL`). Port **5432** = direct (`DIRECT_URL`).

---

## 14. Local Development

**Prerequisites:** Node.js 18+, a Supabase project (free tier works)

```bash
# 1. Clone
git clone https://github.com/DvbyDt/Ankh-Client-Record-DB.git
cd Ankh-Client-Record-DB/ankh-client-app

# 2. Install dependencies (also runs prisma generate via postinstall)
npm install

# 3. Configure environment
cp .env.production.example .env.local
# Edit .env.local — fill in DATABASE_URL, DIRECT_URL, JWT_SECRET,
# QSTASH_* values, and NEXT_PUBLIC_APP_URL as needed

# 4. Apply database migrations
npx prisma migrate deploy

# 5. Create the first manager account
npm run seed
# Prompts for username and password

# 6. Start the dev server with Turbopack
npm run dev
# → http://localhost:3000 (redirects to /en)
```

If you only need a quick local run, the minimum required steps are: install dependencies, set up `.env.local`, apply migrations, seed the first account, and run `npm run dev`. For production-like verification, also run `npm run build` before deploying.

### Useful Commands

```bash
npm run dev                                      # Turbopack dev server
npm run build                                    # Production build
npm run start                                    # Serve production build locally
npm run lint                                     # ESLint check
npx prisma studio                                # Visual DB browser at localhost:5555
npx prisma migrate dev --name "describe_change"  # New migration after schema edits
npx prisma generate                              # Regenerate TypeScript client
```

---

## 15. Database Migrations

```
1. Edit prisma/schema.prisma
2. npx prisma migrate dev --name "add_field"
      ├── Compares schema to last migration
      ├── Generates SQL migration file
      ├── Applies to dev database
      └── Regenerates TypeScript Prisma client
```

### Production Migration

```bash
# IMPORTANT: Must use DIRECT_URL (port 5432), not DATABASE_URL (port 6543)
# PgBouncer does not support DDL transaction modes required by Prisma migrate

export DATABASE_URL="postgresql://...supabase.com:5432/postgres"
npx prisma migrate deploy

# OR paste the SQL from prisma/migrations/... directly in Supabase SQL Editor
```

---

## 16. Deployment

### Vercel + Supabase

```
git push → GitHub → Vercel auto-deploys
                        │
                        ▼
               npm install
               postinstall: prisma generate   ← regenerates types on every build
               next build --turbopack
                        │
                        ▼
            Vercel Edge CDN (static assets)
                        │
                 Serverless Functions
                 /api/auth · /api/customers · /api/import · ...
                        │
               Supabase PgBouncer :6543
                        │
               Supabase PostgreSQL (AWS Seoul)
```

### Deploy Steps

```bash
# Push to main — Vercel auto-deploys
git add .
git commit -m "your change"
git push origin main

# After schema changes — run migration manually before or immediately after deploy
DIRECT_URL="your_direct_url" npx prisma migrate deploy
```

### Environment Variables on Vercel

Set all variables from [Section 13](#13-environment-variables) in:  
Vercel Dashboard → Your Project → Settings → Environment Variables

---

## 17. Role-Based Access Control

Two independent enforcement layers:

```
                    REQUEST
                       │
                       ▼
            ┌─────────────────────┐
            │      API LAYER      │  ← REAL security boundary
            │   jwt.verify()      │
            │   role === 'MANAGER'│
            └────────┬────────────┘
                     │
            ALLOWED  │  REJECTED
            proceed  │  401 / 403
```

```
                      UI
                       │
          currentUser?.role === 'MANAGER'
                       │
            Show/hide button
            (UX convenience only)

⚠️  The UI is NOT a security boundary.
    A user bypassing the UI and calling the
    API directly still gets 403 if their JWT
    does not contain the MANAGER role.
```

---

## 18. Error Handling

### API Pattern

```typescript
try {
  const data = await prisma.customer.findMany(...)
  return NextResponse.json({ data })
} catch (error) {
  console.error('/api/customers error:', error)     // full error in server logs
  return NextResponse.json(
    { error: 'Internal server error' },             // never expose stack traces
    { status: 500 }
  )
}
```

### Import Partial Success

```
3,741 rows in file
  ├── 3,738 rows valid → imported ✅
  └── 3 rows invalid → skipped with reason

Response:
{
  "status": "complete",
  "processedCount": 3738,
  "errorCount": 3,
  "errors": [
    "Row 12: Missing customerId",
    "Row 45: Invalid date format"
  ]
}
```

---

## 19. Common Issues & Fixes

### `PrismaClientInitializationError` on Vercel

`DATABASE_URL` is not set or is using the wrong port. Must be port **6543** (pooled):

```
postgresql://postgres.[ref]:[pass]@pooler.supabase.com:6543/postgres?pgbouncer=true
```

### Migrations fail with "prepared statement already exists"

You're running `prisma migrate deploy` with the pooled URL. Always use `DIRECT_URL` (port 5432) for migrations — PgBouncer does not support DDL transaction modes.

### `NotFoundError: removeChild` crash

A browser extension (Korean IME, Microsoft Translator, password manager) is mutating Radix UI portal nodes. Add `translate="no"` to the `<html>` element in `src/app/[locale]/layout.tsx` as a primary fix. See [Debug Diary #001](#001--korean-names-crashing-react-in-microsoft-edge) for the full root cause.

### Import progress stuck cycling at the same percentage

A QStash processing chunk is timing out and retrying. Check Vercel function logs for the cause:

```
Invalid date in spreadsheet   → check Lesson Date column format (DD/MM/YYYY)
Missing instructor name       → verify Instructor Name column is non-empty
DB timeout under load         → reduce CHUNK_SIZE from 1000 to 500
```

### QStash returning 401 errors

Wrong regional endpoint. Check the `QSTASH_URL` value. If your Supabase is in Europe, use `https://qstash-eu-central-1.upstash.io`.

### Search returns no results for Korean names

Korean search uses Prisma `mode: 'insensitive'` which maps to `ILIKE` in PostgreSQL. Verify the name indexes exist — PostgreSQL falls back to a full table scan without them, which can time out on larger datasets.

### Build fails with ESLint errors

Set lint rules to `"warn"` instead of `"error"` in `eslint.config.mjs` to prevent warnings from blocking the build:

```javascript
rules: {
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-vars": "warn",
}
```

---

## 20. Debug Diaries

A log of non-obvious bugs found in production. The symptoms were misleading, the root causes subtle, and the fixes small but the reasoning matters.

---

### #001 — Korean Names Crashing React in Microsoft Edge

**Date:** 2026-03-27  
**Affected flow:** Add New Record → Existing Customer → Search  
**Browsers affected:** Microsoft Edge (Chromium), any browser with auto-translate enabled

**Symptoms:**

```
Uncaught Error: Minified React error #418
Uncaught NotFoundError: Failed to execute 'insertBefore' on 'Node':
  The node before which the new node is to be inserted is not a child of this node.
```

App crashes silently mid-search. No API errors in the network tab. Only reproducible with specific Korean names — Latin names work fine.

#### Root Cause

Edge ships with a built-in **Microsoft Translator**. When it detects text in a language that differs from the browser's UI language, it automatically wraps individual words in `<span>` elements — **directly mutating the real DOM** without React's knowledge.

React maintains a virtual DOM and computes the minimal set of DOM operations to reach the correct UI. When Edge injects extra `<span>` nodes, React's virtual DOM no longer matches the real DOM. On the next render cycle, React attempts `insertBefore` relative to what it believes is a sibling — but that sibling has been moved by the translator. This throws `NotFoundError`, surfaced as React error `#418`.

**Why only certain names?** The translator's detection triggers on character density. Three Korean characters reliably trigger it; one or two sometimes do not, making the bug appear intermittent.

**Why no API errors?** The crash is entirely in the browser render layer after the API response has already been received. The server is healthy.

#### Fix

**1. `translate="no"` on `<html>` — primary fix** (`src/app/[locale]/layout.tsx`):

```tsx
<html lang={locale} translate="no">
```

This is the W3C-standard attribute that instructs all browsers and translation tools not to auto-translate the page. For a database app that stores real patient names and clinical notes, this is always the correct setting.

This attribute has **zero effect on `next-intl`** or app-level translations — it only stops the browser's own translation layer from touching the DOM.

**2. `translate="no"` on the customer name container** (belt-and-suspenders):

```tsx
<div className="flex-1 cursor-pointer" onClick={...} translate="no">
```

**3. `spellCheck={false}` and `autoComplete="off"` on the search input:**

```tsx
<Input spellCheck={false} autoComplete="off" ... />
```

Edge's Microsoft Editor also injects DOM annotations for grammar/style suggestions. Disabling spellcheck on the search input prevents mutation on the text being typed.

#### What `translate="no"` Does NOT Affect

| Feature | Affected? |
|---------|-----------|
| `next-intl` Korean ↔ English switching | No |
| API calls and database queries | No |
| User-typed input in forms | No |
| Search / filter functionality | No |
| The "Translate this page?" browser prompt | Yes — it will no longer appear (intentional) |

#### Lesson

When a React crash is browser-specific, non-reproducible via network inspection, and correlated with a specific character set — check browser-level DOM mutation first (translation tools, spellcheck, grammar extensions, password managers) before assuming an application bug. The DOM React reconciles against is not always the DOM only React has written.

---

*Built for production. Evolved through real constraints. Every architectural decision documented.*
