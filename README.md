# 🏛️ Ankh Client Record Database

A production-grade, multi-language client management system for healthcare and wellness professionals. Built for studios that need to record sessions, track customer symptoms and improvements over time, manage a team of instructors across multiple locations, and bulk-import years of historical Excel data.

**Live:** https://ankh-client-record-db.vercel.app  
**Repo:** https://github.com/DvbyDt/Ankh-Client-Record-DB

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-336791?style=flat-square&logo=postgresql)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Tech Stack & Why Each Tool Was Chosen](#3-tech-stack--why-each-tool-was-chosen)
4. [Project Structure](#4-project-structure)
5. [Database Architecture](#5-database-architecture)
6. [API Reference](#6-api-reference)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Internationalization i18n](#9-internationalization-i18n)
10. [The Import Pipeline — A System Design Story](#10-the-import-pipeline--a-system-design-story)
11. [CSV Export](#11-csv-export)
12. [Performance Optimizations](#12-performance-optimizations)
13. [Environment Variables](#13-environment-variables)
14. [Local Development Setup](#14-local-development-setup)
15. [Database Migrations](#15-database-migrations)
16. [Deployment Vercel + Supabase](#16-deployment-vercel--supabase)
17. [Role-Based Access Control](#17-role-based-access-control)
18. [Error Handling Strategy](#18-error-handling-strategy)
19. [Scalability Analysis](#19-scalability-analysis)
20. [Adding New Features](#20-adding-new-features)
21. [Common Issues & Fixes](#21-common-issues--fixes)
22. [Debug Diaries — Bugs, Root Causes & Fixes](#22-debug-diaries--bugs-root-causes--fixes)

---

## 1. Project Overview

### What it does

- **Lesson Recording** — Log individual or group sessions with instructor, location, lesson type, and content notes
- **Health Tracking** — Record customer symptoms and improvements at each session to track progress over time
- **Customer Management** — Search, view, edit, and soft-delete customer profiles with full lesson history
- **User Management** — Managers can create instructor accounts, assign roles, and search/edit users
- **Location Management** — Create and manage training venue records
- **Bulk Import** — Upload Excel or CSV files with thousands of rows via asynchronous background processing with live progress tracking
- **CSV Export** — Download all customer and lesson data as a structured spreadsheet
- **Bilingual UI** — Full English and Korean language support with locale-aware name formatting

### Who uses it

```
┌─────────────────────────────────────────────────────────────┐
│                        USERS                                │
├───────────────────────────┬─────────────────────────────────┤
│         MANAGER           │          INSTRUCTOR             │
├───────────────────────────┼─────────────────────────────────┤
│  ✅ Search customers      │  ✅ Search customers            │
│  ✅ View lesson history   │  ✅ View lesson history         │
│  ✅ Add lesson records    │  ✅ Add lesson records          │
│  ✅ Export CSV            │  ✅ Export CSV                  │
│  ✅ Edit/delete customers │  ❌ Edit/delete customers       │
│  ✅ Bulk import Excel     │  ❌ Bulk import Excel           │
│  ✅ Create/delete users   │  ❌ Create/delete users         │
│  ✅ View all users        │  ❌ View all users              │
│  ✅ Add locations         │  ❌ Add locations               │
└───────────────────────────┴─────────────────────────────────┘
```

---

## 2. High-Level Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER'S BROWSER                             │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │              React UI (Next.js App Router)                   │  │
│   │                                                              │  │
│   │   /en/          /en/add-record      /en/manage-users         │  │
│   │  Dashboard       Lesson Form         User Search             │  │
│   └──────────────────────────┬───────────────────────────────────┘  │
│                               │ HTTP Requests                       │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                    VERCEL EDGE NETWORK (CDN)                          │
│         Static assets · Edge-cached API responses                    │
└────────────────────────────────┬──────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│                  VERCEL SERVERLESS FUNCTIONS                          │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  /api/auth   │  │ /api/customers│  │   /api/import/           │   │
│  │  /api/users  │  │ /api/lessons  │  │   start · process · status│  │
│  │  /api/locations│ /api/export-csv│  │   (QStash pipeline)      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
│                                                                       │
│              All routes verified via JWT middleware                   │
└────────────────────────────────┬──────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
┌───────────────────────────┐   ┌─────────────────────────────────┐
│   UPSTASH QSTASH (EU)     │   │  SUPABASE PGBOUNCER (port 6543) │
│                           │   │                                 │
│  Message Queue            │   │  Connection Pool (~20 conns)    │
│  Automatic retries        │   │  Queues requests under load     │
│  Calls /api/import/process│   │                                 │
└───────────────────────────┘   └────────────────┬────────────────┘
                                                  │
                                                  ▼
                                 ┌────────────────────────────────┐
                                 │  SUPABASE POSTGRESQL           │
                                 │  AWS ap-northeast-2 (Seoul)    │
                                 │                                │
                                 │  users · customers · lessons   │
                                 │  lesson_participants · locations│
                                 │  import_jobs                   │
                                 └────────────────────────────────┘
```

### Request Lifecycle

```
Browser                 Vercel                  Database
  │                       │                        │
  │─── GET /en/page ──────►│                        │
  │◄── HTML + JS ──────────│                        │
  │                       │                        │
  │─── POST /api/auth/login►│                        │
  │                       │── SELECT user ─────────►│
  │                       │◄── { hash, role } ──────│
  │                       │   bcrypt.compare()       │
  │                       │   jwt.sign()             │
  │◄── { token, user } ───│                        │
  │  cookie: jwt-token    │                        │
  │                       │                        │
  │─── GET /api/customers ►│                        │
  │   Authorization: Bearer│                        │
  │                       │   jwt.verify(token)     │
  │                       │── SELECT customers ────►│
  │                       │◄── rows ────────────────│
  │◄── { customers } ─────│                        │
```

---

## 3. Tech Stack & Why Each Tool Was Chosen

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TECH STACK MAP                              │
├─────────────────┬───────────────────────────────────────────────────┤
│  LAYER          │  TECHNOLOGY                                        │
├─────────────────┼───────────────────────────────────────────────────┤
│  Framework      │  Next.js 15 (App Router)                          │
│  Language       │  TypeScript 5                                      │
│  Styling        │  Tailwind CSS v4                                   │
│  UI Components  │  shadcn/ui + Radix UI (add-record page only)      │
│  Icons          │  Lucide React                                      │
├─────────────────┼───────────────────────────────────────────────────┤
│  ORM            │  Prisma 6.19                                       │
│  Database       │  PostgreSQL via Supabase                           │
│  Auth           │  JWT (jsonwebtoken) + bcryptjs                     │
│  File Parsing   │  SheetJS (xlsx)                                    │
│  Cookies        │  js-cookie                                         │
├─────────────────┼───────────────────────────────────────────────────┤
│  i18n           │  next-intl (EN + KO)                               │
│  Background Jobs│  QStash by Upstash                                 │
│  Deployment     │  Vercel Hobby                                      │
│  Database Host  │  Supabase (AWS Seoul)                              │
└─────────────────┴───────────────────────────────────────────────────┘
```

### Next.js 15 (App Router)

Next.js was chosen because it provides both the frontend React UI and the backend API routes in one unified project — no separate Express server, no CORS configuration, and a single deployment unit. The App Router allows server components, streaming, and file-based routing for API endpoints.

**What it gives us:**
- `src/app/api/**` folders become API endpoints automatically
- `src/app/[locale]/page.tsx` becomes the main page at `/en` and `/ko`
- Built-in TypeScript support, image optimization, and bundle splitting

### TypeScript

The entire codebase is TypeScript. With a data model involving customers, lessons, participants, users, and locations all referencing each other via foreign keys, type safety prevents entire classes of bugs at compile time — passing a `customerId` where a `lessonId` was expected, for example. Prisma's generated client is fully typed, so database query results come back with known shapes.

### Prisma ORM

Prisma sits between the application code and PostgreSQL. All queries are written in TypeScript using Prisma's query builder:

- **Type-safe queries** — Every `findMany`, `create`, and `update` call has fully typed inputs and outputs
- **Migration system** — Schema changes tracked in migration files so the database evolves safely
- **Relation handling** — Deeply nested includes expressed cleanly without manual JOINs
- **`createMany` for bulk ops** — The import pipeline uses `createMany` with `skipDuplicates: true` to bulk-insert thousands of rows in a single SQL statement

The Prisma client is imported via a singleton in `src/lib/prisma.ts` to prevent multiple instances during hot-reload:

```typescript
// src/lib/prisma.ts — singleton pattern
import { PrismaClient } from '@/generated/prisma'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

The singleton pattern is critical because in Next.js development, hot-module replacement would otherwise create a new `PrismaClient` on every file change, exhausting the database connection pool.

### PostgreSQL via Supabase

```
┌─────────────────────────────────────────────────────────┐
│              TWO CONNECTION URLS — WHY                  │
├──────────────────────────┬──────────────────────────────┤
│   DATABASE_URL           │   DIRECT_URL                 │
│   port 6543              │   port 5432                  │
│   PgBouncer pooled       │   Direct to Postgres         │
├──────────────────────────┼──────────────────────────────┤
│  Used by: App at runtime │  Used by: Prisma CLI only    │
│                          │                              │
│  Why: Vercel serverless  │  Why: PgBouncer doesn't      │
│  functions spin up/down  │  support DDL statements      │
│  rapidly. Without pool   │  (CREATE TABLE, ALTER, etc.) │
│  they'd exhaust the DB's │  that migrations require     │
│  100 connection limit    │                              │
│  in seconds under load   │                              │
└──────────────────────────┴──────────────────────────────┘
```

### QStash by Upstash

QStash is an HTTP-based serverless message queue — the backbone of the bulk import pipeline. It solves the 60-second Vercel function timeout constraint. Full explanation in [Section 10](#10-the-import-pipeline--a-system-design-story).

### JWT + bcryptjs

Authentication uses stateless JSON Web Tokens. On serverless infrastructure (Vercel) there is no persistent in-memory session store, so JWT is the correct choice — each API route verifies the token independently with no database lookup.

Passwords are hashed with `bcryptjs` at 10–12 salt rounds. bcryptjs is a pure-JavaScript implementation with no native bindings — important for Vercel's serverless environment.

---

## 4. Project Structure

```
ankh-client-app/
│
├── src/
│   ├── app/
│   │   ├── [locale]/                        # /en and /ko routes
│   │   │   ├── layout.tsx                   # NextIntlClientProvider wrapper
│   │   │   ├── page.tsx                     # Main dashboard
│   │   │   ├── globals.css                  # Tailwind base + CSS variables
│   │   │   ├── add-record/page.tsx          # Multi-step lesson form
│   │   │   └── manage-users/page.tsx        # User search & edit (managers)
│   │   │
│   │   ├── api/
│   │   │   ├── auth/login/route.ts          # POST — credentials → JWT
│   │   │   ├── customers/
│   │   │   │   ├── route.ts                 # GET paginated list
│   │   │   │   ├── search/route.ts          # GET ?name= full-text search
│   │   │   │   └── [customerId]/route.ts    # GET / PUT / DELETE (soft)
│   │   │   ├── lessons/
│   │   │   │   ├── new/route.ts             # POST — lesson + participants
│   │   │   │   ├── recent/route.ts          # GET — dashboard feed
│   │   │   │   └── [lessonId]/participants/
│   │   │   │       └── [customerId]/route.ts # DELETE participant
│   │   │   ├── users/
│   │   │   │   ├── route.ts                 # GET all / POST create
│   │   │   │   ├── [userId]/route.ts        # PUT / DELETE
│   │   │   │   ├── instructors/route.ts     # GET instructors (dropdowns)
│   │   │   │   └── search/route.ts          # GET ?name=
│   │   │   ├── locations/route.ts           # GET all / POST create
│   │   │   ├── import/
│   │   │   │   ├── start/route.ts           # POST — parse + queue
│   │   │   │   ├── process/route.ts         # POST — QStash worker
│   │   │   │   └── status/[jobId]/route.ts  # GET — poll progress
│   │   │   ├── export-csv/route.ts          # GET — stream CSV download
│   │   │   └── health/db/route.ts           # GET — DB health check
│   │   │
│   │   ├── page.tsx                         # Root → redirect /en
│   │   └── layout.tsx                       # Root HTML shell
│   │
│   ├── components/
│   │   ├── LanguageSwitcher.tsx             # EN / 한국어 dropdown
│   │   ├── UploadModal.tsx                  # File picker + progress bar
│   │   └── ui/                              # shadcn/ui (add-record only)
│   │       └── button, card, dialog, input, label, select, textarea
│   │
│   ├── lib/prisma.ts                        # Prisma singleton
│   ├── generated/prisma/                    # Auto-generated — do not edit
│   └── i18n.ts                              # next-intl config
│
├── prisma/
│   ├── schema.prisma                        # Source of truth for DB
│   ├── seed.ts                              # Creates first manager account
│   └── migrations/                          # SQL migration history (git tracked)
│
├── messages/
│   ├── en.json                              # English strings
│   └── ko.json                              # Korean strings
│
├── middleware.ts                            # Locale routing
├── next.config.ts                           # next-intl plugin
└── .env.local                               # Secrets — never commit
```

---

## 5. Database Architecture

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
│ lastName   String    │                     │
│ email      String UQ │                     │ N
│ createdAt  DateTime  │          ┌──────────▼───────────┐
│ updatedAt  DateTime  │          │       lessons         │
└─────────┬────────────┘          ├──────────────────────┤
          │ 1                     │ id           CUID PK │
          │                       │ lessonType   String  │
          │ N                     │  Group|Individual    │
          └───────────────────────► instructorId FK→User │
                                  │ locationId   FK→Loc  │
                                  │ lessonContent String?│
                                  │ createdAt    DateTime│
                                  │ updatedAt    DateTime│
                                  └──────────┬───────────┘
                                             │ 1
                                             │ N
┌──────────────────────┐          ┌──────────▼───────────┐
│      customers       │          │  lesson_participants  │
├──────────────────────┤          ├──────────────────────┤
│ id         CUID  PK  │◄─────────┤ id           CUID PK │
│ firstName  String    │    N     │ customerId   FK→Cust │
│ lastName   String    │          │ lessonId     FK→Less │
│ email      String UQ │          │ customerSymptoms  ?  │
│ phone      String?   │          │ customerImprovements?│
│ createdAt  DateTime  │          │ status       String  │
│ updatedAt  DateTime  │          │  attended|absent     │
│ deletedAt  DateTime? │          │ createdAt    DateTime│
└──────────────────────┘          │ UNIQUE(customerId,   │
                                  │        lessonId)     │
                                  └──────────────────────┘

┌──────────────────────────────────────────────┐
│              import_jobs                      │
├──────────────────────────────────────────────┤
│ id         CUID  PK                          │
│ status     String  queued|processing|        │
│                    complete|failed           │
│ progress   Int     0–100                     │
│ message    String                            │
│ totalRows  Int                               │
│ rowErrors  Json    skipped row details       │
│ rowsJson   String? pre-resolved bulk data    │
│                    (cleared after import)    │
│ createdAt  DateTime                          │
│ updatedAt  DateTime                          │
└──────────────────────────────────────────────┘
```

### Why This Schema Design

**CUID primary keys** instead of auto-incrementing integers: CUIDs are collision-resistant, URL-safe, and do not expose the total record count. Incrementing IDs like `/customers/1`, `/customers/2` allow anyone to enumerate all records.

**`LessonParticipant` as explicit join table**: A lesson can have multiple customers, and a customer can attend many lessons. Attendance carries its own data — symptoms at that session, improvements noted, status. This data cannot live on either `Customer` or `Lesson`; it exists only in the context of one customer at one lesson.

**Soft delete on `Customer`** (`deletedAt DateTime?`): Sets `deletedAt` to now rather than removing the row. Historical lesson records remain intact. All queries filter `WHERE "deletedAt" IS NULL`.

**`createdAt` doubles as lesson date**: The `Lesson.createdAt` stores the actual lesson date. During import, the parsed lesson date from the spreadsheet is passed as the `createdAt` value. Simpler schema, one timestamp instead of two.

**`@@unique([customerId, lessonId])`**: Prevents a customer being added to the same lesson twice. Combined with `createMany({ skipDuplicates: true })`, re-importing the same file is safe.

**`ImportJob` table**: Import state must survive across multiple independent serverless function invocations. The database is the only shared persistent state between the start route, QStash processing calls, and the polling frontend. This is the **Saga Pattern**.

### Database Indexes

```sql
-- Run in Supabase SQL Editor after initial migration
CREATE INDEX IF NOT EXISTS "customers_firstName_idx"            ON "customers"("firstName");
CREATE INDEX IF NOT EXISTS "customers_lastName_idx"             ON "customers"("lastName");
CREATE INDEX IF NOT EXISTS "customers_deletedAt_idx"            ON "customers"("deletedAt");
CREATE INDEX IF NOT EXISTS "customers_createdAt_idx"            ON "customers"("createdAt");
CREATE INDEX IF NOT EXISTS "lesson_participants_customerId_idx" ON "lesson_participants"("customerId");
CREATE INDEX IF NOT EXISTS "lesson_participants_lessonId_idx"   ON "lesson_participants"("lessonId");
CREATE INDEX IF NOT EXISTS "lessons_createdAt_idx"              ON "lessons"("createdAt");
CREATE INDEX IF NOT EXISTS "lessons_instructorId_idx"           ON "lessons"("instructorId");
CREATE INDEX IF NOT EXISTS "lessons_locationId_idx"             ON "lessons"("locationId");
CREATE INDEX IF NOT EXISTS "users_firstName_idx"                ON "users"("firstName");
CREATE INDEX IF NOT EXISTS "users_lastName_idx"                 ON "users"("lastName");
```

The `deletedAt` index is the most impactful — every customer query filters `WHERE "deletedAt" IS NULL`, and without an index PostgreSQL performs a full table scan on every request.

---

## 6. API Reference

### API Map

```
/api/
├── auth/
│   └── login                POST   Validate credentials, return JWT
│
├── customers/
│   ├── (root)               GET    Paginated list (countOnly=true for count)
│   ├── search               GET    ?name= full-text across name + email
│   └── [customerId]         GET    Full detail with lesson history
│                            PUT    Update fields (MANAGER)
│                            DELETE Soft delete (MANAGER)
│
├── lessons/
│   ├── new                  POST   Create lesson + register participants
│   ├── recent               GET    Last N participants (dashboard feed)
│   └── [lessonId]/
│       └── participants/
│           └── [customerId] DELETE Remove participant (MANAGER)
│
├── users/
│   ├── (root)               GET    All users
│   │                        POST   Create user
│   ├── [userId]             PUT    Update (re-hashes pw if changed)
│   │                        DELETE Hard delete (MANAGER, guards last manager)
│   ├── instructors          GET    INSTRUCTOR role only (edge-cached 60s)
│   └── search               GET    ?name= search by name
│
├── locations/
│   └── (root)               GET    All locations (edge-cached 60s)
│                            POST   Create location
│
├── import/
│   ├── start                POST   Parse file, run refs, queue bulk work
│   ├── process              POST   QStash worker — one chunk at a time
│   └── status/[jobId]       GET    Poll progress (0–100)
│
├── export-csv               GET    Stream full CSV download
└── health/db                GET    DB connectivity check
```

### Authentication

#### `POST /api/auth/login`

**Request:**
```json
{ "username": "manager1", "password": "secret" }
```

**Response (200):**
```json
{
  "token": "eyJhbGci...",
  "user": { "id": "clx...", "username": "manager1", "role": "MANAGER", "firstName": "Min", "lastName": "Jegal" }
}
```

### Customers

#### `GET /api/customers/search`

**Query params:** `?name=kim&take=20&skip=0`

**How the query is built:**
```typescript
where: {
  AND: [
    { deletedAt: null },
    { OR: [
      { firstName: { contains: name, mode: 'insensitive' } },
      { lastName:  { contains: name, mode: 'insensitive' } },
      { email:     { contains: name, mode: 'insensitive' } }
    ]}
  ]
}
```

Prisma translates `mode: 'insensitive'` to `ILIKE` in PostgreSQL, which handles Korean characters correctly under Supabase's default `en_US.UTF-8` collation.

### Lessons

#### `POST /api/lessons/new`

**Request:**
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
      "email": "jy@example.com",
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
Browser                       Server                      Database
   │                             │                            │
   │── POST /api/auth/login ─────►│                            │
   │   { username, password }    │                            │
   │                             │── SELECT * FROM users ────►│
   │                             │   WHERE username = ?       │
   │                             │◄── { id, hash, role } ─────│
   │                             │                            │
   │                             │  bcrypt.compare(pw, hash)  │
   │                             │  → true ✓                  │
   │                             │                            │
   │                             │  jwt.sign(                 │
   │                             │    { userId, role },       │
   │                             │    JWT_SECRET,             │
   │                             │    { expiresIn: '24h' }    │
   │                             │  )                         │
   │                             │                            │
   │◄── 200 { token, user } ─────│                            │
   │                             │                            │
   │  cookie: jwt-token (1 day)  │                            │
   │  cookie: user-data (7 days) │                            │
   │                             │                            │
   │── GET /api/customers ───────►│                            │
   │   Authorization: Bearer ... │                            │
   │                             │  jwt.verify(token, SECRET) │
   │                             │  → { userId, role }        │
   │                             │                            │
   │                             │── SELECT customers ───────►│
   │◄── { customers } ───────────│◄── rows ───────────────────│
```

### Protected Route Pattern

```typescript
function requireManager(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role?: string }
    if (decoded.role !== 'MANAGER') {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { ok: true }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
}
```

### JWT Token Structure

```
┌─────────────────────────────────────────────────────────┐
│                    JWT TOKEN                            │
├─────────────────────────────────────────────────────────┤
│  Header    { "alg": "HS256", "typ": "JWT" }            │
├─────────────────────────────────────────────────────────┤
│  Payload   {                                            │
│              "userId":   "clx9f2...",                   │
│              "username": "manager1",                    │
│              "role":     "MANAGER",                     │
│              "iat":      1748000000,  ← issued at       │
│              "exp":      1748086400   ← expires 24h     │
│            }                                            │
├─────────────────────────────────────────────────────────┤
│  Signature  HMACSHA256(header + payload, JWT_SECRET)    │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Frontend Architecture

### Page & Component Map

```
Browser URL: /en
│
└── [locale]/layout.tsx
    └── NextIntlClientProvider (loads en.json)
        └── [locale]/page.tsx  ← HomePage
            │
            ├── HEADER
            │   ├── Logo + Customer Count Badge
            │   ├── LanguageSwitcher (en / 한국어)
            │   └── Avatar + Name + Role Badge + Logout
            │
            ├── TOOLBAR
            │   ├── Add New Record ──────────────► /en/add-record
            │   ├── Export CSV ──────────────────► /api/export-csv (download)
            │   ├── Import CSV ──────────────────► UploadModal (QStash progress)
            │   └── [MANAGER ONLY]
            │       ├── All Customers ───────────► AllCustomersPanel (lazy)
            │       ├── All Users ───────────────► AllUsersPanel (lazy)
            │       ├── Add User ────────────────► AddUserModal
            │       ├── Add Location ────────────► AddLocationModal
            │       └── Manage Users ────────────► /en/manage-users
            │
            ├── RECENT LESSONS PANEL
            │   └── Last 8 participants (auto-loads, hides if empty)
            │       └── Click → CustomerDetailModal
            │
            ├── ALL USERS PANEL (lazy, toggle)
            │   └── Role filter: ALL / MANAGER / INSTRUCTOR
            │
            ├── ALL CUSTOMERS PANEL (lazy, paginated 50/page)
            │
            ├── SEARCH BOX
            │   ├── useDebounce(400ms) → fires on 2+ chars
            │   ├── Shimmer skeleton while loading
            │   ├── Results list (20/page + pagination)
            │   └── Each row → expandable lesson preview
            │
            └── MODALS (all portal-based, pure HTML+Tailwind)
                ├── LoginModal
                ├── CustomerDetailModal
                ├── EditCustomerModal
                ├── AddUserModal
                ├── AddLocationModal
                ├── UploadModal
                └── ConfirmDialog
```

### State Flow

```
User types "kim" in search box
         │
         ▼
setSearchTerm("kim")
         │
         ▼
useDebounce waits 400ms for typing to stop
         │
         ▼
debouncedSearch changes → useEffect fires
         │
         ▼
setIsLoading(true) + fetch /api/customers/search?name=kim
         │
         ▼
Response arrives
         │
         ▼
setSearchResults(data.customers)
setIsLoading(false)
         │
         ▼
Component re-renders → results displayed
         │
         ▼
User clicks customer name
         │
         ▼
handleViewCustomerDetails(customerId)
→ fetch /api/customers/[id]  (full lesson history)
→ setSelectedCustomerInfo(data)
→ CustomerDetailModal opens
```

### Why No Radix UI on Main Pages

The main dashboard and manage-users page are built with **pure HTML + Tailwind only**, deliberately avoiding shadcn/Radix UI components. Radix UI uses a portal pattern that inserts DOM nodes into `document.body`. Korean IME input methods, password managers, and translation browser extensions modify these portal nodes in ways that React's virtual DOM reconciliation does not expect:

```
NotFoundError: Failed to execute 'removeChild' on 'Node':
  The node to be removed is not a child of this node.
```

The `add-record` page still uses shadcn Select components for dropdowns — a deliberate trade-off where the convenience outweighs the lower crash risk on that specific page.

---

## 9. Internationalization i18n

### Locale Routing Flow

```
User visits https://app.com/
         │
         ▼
middleware.ts intercepts request
Reads Accept-Language header
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Korean     English
browser    browser
    │         │
    ▼         ▼
redirect   redirect
to /ko     to /en
    │         │
    ▼         ▼
[locale]/layout.tsx loads ko.json or en.json
         │
         ▼
NextIntlClientProvider injects messages
         │
         ▼
useTranslations() available in all components
```

### Name Formatting by Locale

```
┌─────────────────────────────────────────────────────┐
│               formatName() logic                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  locale = 'en'                                      │
│  formatName("John", "Doe") → "John Doe"             │
│                FirstName + " " + LastName           │
│                                                     │
│  locale = 'ko'                                      │
│  formatName("준호", "김") → "김 준호"                  │
│                LastName + " " + FirstName           │
│                                                     │
│  Used in: search results, lesson cards,             │
│  user lists, avatars, detail modals                 │
└─────────────────────────────────────────────────────┘
```

---

## 10. The Import Pipeline — A System Design Story

This section documents the full engineering journey of the import feature. Each attempt is documented because understanding **why** the final architecture exists requires understanding what failed first and why.

### The Problem

```
┌─────────────────────────────────────────────────────────────┐
│                    CONSTRAINTS                              │
├─────────────────────────────────────────────────────────────┤
│  Vercel Hobby plan    →  60 second max function timeout     │
│  Serverless arch      →  No persistent background threads   │
│  Real users watching  →  Must show live progress feedback   │
│  HTTP must return     →  Cannot block the connection        │
├─────────────────────────────────────────────────────────────┤
│                    INPUT DATA                               │
├─────────────────────────────────────────────────────────────┤
│  File size            →  ~3,741 rows (real production file) │
│  Unique locations     →  8                                  │
│  Unique instructors   →  43                                 │
│  Unique customers     →  165                                │
│  Unique lessons       →  3,741  (every row is unique)       │
│  Unique participants  →  3,741                              │
└─────────────────────────────────────────────────────────────┘
```

---

### Attempt 1 — Synchronous Processing (Naive)

```
Browser ──► POST /api/import ──► parse ──► insert all rows ──► response
                                                    │
                                              ⏱ 60 seconds
                                                    │
                                                    ▼
                                           ❌ 504 GATEWAY TIMEOUT
                                           No data imported
```

**System Design Lesson:**
> Never do unbounded work in a synchronous HTTP handler. If execution time scales with input size, it does not belong in a request-response cycle.

---

### Attempt 2 — Inngest (Failed)

```
                    ┌─────────────────────────────────────┐
                    │              INNGEST                 │
                    │                                     │
┌──────────┐        │  ❌ BLOCKER 1: 256KB event limit    │
│  Browser │──3.3MB►│  File payload rejected (13× over)  │
└──────────┘        │                                     │
                    │  ❌ BLOCKER 2: Deployment protection │
                    │  Vercel Hobby blocks Inngest sync    │
                    │  on preview URLs                    │
                    │                                     │
                    │  ❌ BLOCKER 3: 405 Method Not Allowed│
                    │  Serve route exported wrong methods  │
                    └─────────────────────────────────────┘
```

**System Design Lesson:**
> Understand your platform constraints before choosing a tool. Always validate the full integration on your actual deployment tier — not just locally.

---

### Attempt 3 — QStash (The Right Tool)

**The key insight — Inngest vs QStash flow direction:**

```
INNGEST (push model — Inngest calls you to sync):
  Inngest ──► POST /api/inngest  ← Vercel blocks this on Hobby plan
  Browser ──► POST /api/send-event ──► Inngest ──► POST /api/inngest
                                               ← BLOCKED ❌

QSTASH (pull model — you push to QStash, QStash calls you back):
  Browser ──► POST /api/import/start ──► QStash
                                              │
              QStash ──► POST /api/import/process  ← your public URL
                                              │      Vercel allows this ✅
              QStash ──► POST /api/import/process  (next chunk)
                                              │
              ... repeats until done ...
```

**Full QStash pipeline:**

```
Browser                QStash                 Vercel Functions           Database
   │                      │                          │                      │
   │──POST /import/start──►│                          │                      │
   │                      │                          │                      │
   │                      │──POST /import/process────►│                      │
   │                      │  { jobId, phase:         │──createMany─────────►│
   │                      │    'lessons', chunk: 0 } │  1000 lessons        │
   │                      │                          │◄─ done ──────────────│
   │                      │◄── 200 OK ───────────────│                      │
   │                      │                          │──UPDATE importJob───►│
   │                      │                          │  progress: 25%       │
   │                      │                          │  queue next chunk    │
   │                      │──POST /import/process────►│                      │
   │                      │  { jobId, chunk: 1 }     │──createMany─────────►│
   │                      │                          │  1000 lessons        │
   │                      │◄── 200 OK ───────────────│                      │
   │                      │                          │                      │
   │  (polls every 2s)    │                          │                      │
   │──GET /import/status──────────────────────────────────────────────────► │
   │◄── { progress: 25 }───────────────────────────────────────────────────│
   │                      │                          │                      │
   │  ... continues ...   │  ... continues ...       │                      │
   │                      │                          │                      │
   │──GET /import/status──────────────────────────────────────────────────► │
   │◄── { status: 'complete', progress: 100 } ─────────────────────────────│
   │                      │                          │                      │
   │  Progress bar → 100% │                          │                      │
   │  "Import complete"   │                          │                      │
```

**System Design Lesson:**
> Message queues decouple producers from consumers. The browser returns immediately. Processing continues independently. If a step fails, QStash retries automatically.

---

### Attempt 4 — Per-Row Upserts (Too Slow)

```
// WRONG — N+1 queries
for (const row of rows) {                    ← 3,741 iterations
  await prisma.lesson.upsert({ ... })        ← ~50ms per DB round trip
}

Total time: 3,741 × 50ms = 187 seconds per phase
3 phases × 187s = ~9 minutes just in DB time
Plus retries, overhead → 35 MINUTES TOTAL ❌

At 50,000 rows:
50,000 × 50ms = 2,500 seconds = 41 minutes per phase
→ NEVER FINISHES ❌
```

**System Design Lesson:**
> N+1 queries are fatal at scale. Per-row processing grows linearly and becomes impossible at large data sizes.

---

### Final Architecture — Bulk Inserts + Phase Separation

**The data shape revelation:**

```
┌──────────────────────────────────────────────────────────┐
│         ANALYZING THE ACTUAL IMPORT FILE                 │
├─────────────────────┬──────────┬────────────────────────┤
│  Entity             │  Count   │  Strategy              │
├─────────────────────┼──────────┼────────────────────────┤
│  Locations          │  8       │  Sync in start route   │
│  Instructors        │  43      │  Sync in start route   │
│  Customers          │  165     │  Sync in start route   │
│  Lessons            │  3,741   │  Background QStash     │
│  Participants       │  3,741   │  Background QStash     │
└─────────────────────┴──────────┴────────────────────────┘

Key insight: Reference data (locations/instructors/customers)
is TINY. It belongs in the sync start route.
Only the BULK data needs the background queue.
```

**The `createMany` breakthrough:**

```
BEFORE — per-row upsert:
  3,741 × upsert()  =  3,741 database round trips
  3,741 × 50ms      =  187 seconds
  ❌

AFTER — createMany in chunks:
  4 × createMany(1000 rows)  =  4 database round trips
  4 × ~3 seconds             =  12 seconds
  ✅  15× faster

SQL generated by createMany:
  INSERT INTO lessons (id, lessonType, instructorId, ...)
  VALUES (?, ?, ?, ...), (?, ?, ?, ...), ...  ← 1000 rows in ONE statement
  ON CONFLICT DO NOTHING;
```

**The start route architecture:**

```
POST /api/import/start  (synchronous, < 10 seconds)
  │
  ├── 1. Parse Excel file in memory (SheetJS)
  │
  ├── 2. createMany locations (8 rows)        ← 1 query, instant
  │
  ├── 3. createMany instructors (43 rows)     ← 1 query, instant
  │       (auto-generates username + hashed default password)
  │
  ├── 4. createMany customers (165 rows)      ← 1 query, instant
  │
  ├── 5. Resolve all IDs (2 SELECT queries)
  │       locationMap: { "Studio A" → "clx..." }
  │       instructorMap: { "john@abc.com" → "clx..." }
  │       customerMap: { "C001" → "clx..." }
  │
  ├── 6. Pre-build lesson rows
  │       { id, lessonType, instructorId, locationId, createdAt }
  │       (IDs already resolved — no lookup needed in processing)
  │
  ├── 7. Pre-build participant rows
  │       { customerId, lessonId, symptoms, improvements }
  │
  ├── 8. Store pre-resolved data in ImportJob.rowsJson
  │       (~1.1MB vs 3.3MB raw — 3× smaller)
  │
  ├── 9. Publish first chunk to QStash
  │       { jobId, phase: 'lessons', chunkIndex: 0 }
  │
  └── 10. Return { jobId, totalRows: 3741 } to browser immediately
```

**Performance comparison:**

```
┌───────────────────────────────────────────────────────────┐
│                  PERFORMANCE RESULTS                      │
├──────────────────────┬───────────────┬────────────────────┤
│  Metric              │  Before       │  After             │
├──────────────────────┼───────────────┼────────────────────┤
│  DB queries (3741 r) │  ~11,223      │  ~12               │
│  Import time         │  35 minutes   │  ~2 minutes        │
│  QStash calls        │  40+          │  9                 │
│  Data in DB (JSON)   │  3.3MB        │  1.1MB             │
│  50K row estimate    │  Never ends   │  ~15 minutes       │
└──────────────────────┴───────────────┴────────────────────┘
```

### Key System Design Concepts Applied

```
┌──────────────────────────────────────────────────────────────────┐
│              SYSTEM DESIGN CONCEPTS IN THIS PIPELINE            │
├────────────────────────────┬─────────────────────────────────────┤
│  Concept                   │  Where It Appears                   │
├────────────────────────────┼─────────────────────────────────────┤
│  Async Processing          │  Browser gets jobId immediately,    │
│                            │  work happens independently         │
├────────────────────────────┼─────────────────────────────────────┤
│  Message Queue             │  QStash delivers chunks reliably,   │
│                            │  auto-retries on failure            │
├────────────────────────────┼─────────────────────────────────────┤
│  Chunking                  │  3741 rows ÷ 1000 = 4 safe calls   │
│                            │  each fits in 60s timeout           │
├────────────────────────────┼─────────────────────────────────────┤
│  Bulk Operations           │  createMany = O(1) queries/chunk    │
│                            │  vs O(n) with per-row upserts       │
├────────────────────────────┼─────────────────────────────────────┤
│  Phase Separation          │  Refs (tiny, sync) vs bulk          │
│                            │  (large, async) separated           │
├────────────────────────────┼─────────────────────────────────────┤
│  Producer-Consumer         │  Processing writes progress to DB,  │
│                            │  browser polls independently        │
├────────────────────────────┼─────────────────────────────────────┤
│  Idempotency               │  skipDuplicates: true — re-import   │
│                            │  same file = same result            │
├────────────────────────────┼─────────────────────────────────────┤
│  Saga Pattern              │  Long operation split across steps, │
│                            │  each step updates ImportJob state  │
├────────────────────────────┼─────────────────────────────────────┤
│  Pre-resolution            │  IDs resolved once in start route,  │
│                            │  not on every QStash call           │
└────────────────────────────┴─────────────────────────────────────┘
```

---

## 11. CSV Export

```
Browser                        Server                     Database
   │                              │                           │
   │── GET /api/export-csv ───────►│                           │
   │                              │── SELECT customers ───────►│
   │                              │   WHERE deletedAt IS NULL  │
   │                              │   INCLUDE lessonParticipants│
   │                              │   → lessons → instructor   │
   │                              │   → location               │
   │                              │◄── all rows ───────────────│
   │                              │                           │
   │                              │  Build CSV in memory:     │
   │                              │  flatMap customers        │
   │                              │  → one row per lesson     │
   │                              │                           │
   │◄── CSV file download ────────│                           │
   │  Content-Disposition:        │                           │
   │  attachment; filename=...    │                           │
```

The exported CSV can be re-imported — column headers match the import pipeline's expected field names exactly.

---

## 12. Performance Optimizations

### Parallel Queries

```typescript
// ❌ Sequential — 2× slower
const customers = await prisma.customer.findMany({ ... })
const total = await prisma.customer.count({ ... })

// ✅ Parallel — both queries fire simultaneously
const [customers, total] = await Promise.all([
  prisma.customer.findMany({ skip, take, where, include }),
  prisma.customer.count({ where })
])
```

### Lazy Panel Loading

```
Page load cost is CONSTANT regardless of customer count:

┌──────────────────────────────────────────┐
│  Page loads                              │
│  → Fetch: recent lessons (8 rows) only  │
│  → Panels NOT fetched                   │
└──────────────────────────────────────────┘
          │
          │ User clicks "All Customers"
          ▼
┌──────────────────────────────────────────┐
│  First open: fetch page 1 (50 customers)│
│  Subsequent opens: use cached state     │
└──────────────────────────────────────────┘
```

### Customer Detail On-Demand

```
Search results → load 5 lesson previews per customer (fast)
                          │
                          │ User opens detail modal
                          ▼
              GET /api/customers/[id] → full history
              (only fetched when actually needed)
```

### Edge Caching for Reference Data

```typescript
// Instructors and locations change rarely
// Serve from Vercel's CDN edge for 60 seconds
return NextResponse.json(data, {
  headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
})

// s-maxage=60            → CDN serves without hitting DB for 60s
// stale-while-revalidate → serve stale + revalidate in background
//                          users never wait for dropdown data
```

---

## 13. Environment Variables

```bash
# .env.local — never commit this file

# PostgreSQL pooled via PgBouncer (runtime queries)
DATABASE_URL="postgresql://postgres.[ref]:[pw]@pooler.supabase.com:6543/postgres?pgbouncer=true"

# PostgreSQL direct (Prisma migrations only — port 5432 not 6543)
DIRECT_URL="postgresql://postgres.[ref]:[pw]@supabase.com:5432/postgres"

# JWT signing secret
# Generate with: openssl rand -hex 64
JWT_SECRET="your-64-char-hex-secret"

# QStash — from Upstash dashboard → QStash → Quickstart
# Use EU regional endpoint if your Supabase is in Europe
QSTASH_URL="https://qstash-eu-central-1.upstash.io"
QSTASH_TOKEN="eyJVc2VySUQi..."
QSTASH_CURRENT_SIGNING_KEY="sig_..."
QSTASH_NEXT_SIGNING_KEY="sig_..."

# Your production domain (no trailing slash)
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
```

**Where to find Supabase URLs:**
Project → Settings → Database → Connection string.
Port 6543 = pooled (`DATABASE_URL`), port 5432 = direct (`DIRECT_URL`).

---

## 14. Local Development Setup

**Prerequisites:** Node.js 18+, Supabase project (or any PostgreSQL)

```bash
# 1. Clone
git clone https://github.com/DvbyDt/Ankh-Client-Record-DB.git
cd Ankh-Client-Record-DB/ankh-client-app

# 2. Install
npm install

# 3. Environment
cp .env.production.example .env.local
# Fill in DATABASE_URL, DIRECT_URL, JWT_SECRET

# 4. Generate Prisma client (required before first run)
npx prisma generate

# 5. Run migrations (creates all tables)
npx prisma migrate dev

# 6. Create first manager account
npm run seed -- yourusername yourpassword

# 7. Start dev server
npm run dev
# → http://localhost:3000 (redirects to /en)
```

### Useful Commands

```bash
npm run dev                                     # Turbopack dev server
npm run build                                   # Production build
npm run lint                                    # ESLint check
npx prisma studio                               # Visual DB browser (localhost:5555)
npx prisma migrate dev --name "describe_change" # New migration after schema edit
npx prisma generate                             # Regenerate TypeScript client
```

---

## 15. Database Migrations

```
Edit prisma/schema.prisma
         │
         ▼
npx prisma migrate dev --name "add_field"
         │
         ├── Compares schema to last migration
         ├── Generates migration.sql
         ├── Applies to dev database
         └── Regenerates TypeScript client
```

### Production Migration

```bash
# IMPORTANT: Use DIRECT_URL (port 5432) not DATABASE_URL (port 6543)
# PgBouncer does not support DDL transaction modes

export DATABASE_URL="postgresql://...supabase.com:5432/postgres"
npx prisma migrate deploy

# OR paste migration SQL directly in Supabase SQL Editor
```

---

## 16. Deployment Vercel + Supabase

### Full Deployment Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                     │
└────────────────────────────────────────────────────────────────┘

  git push → GitHub → Vercel auto-deploy
                            │
                            ▼
                   ┌─────────────────┐
                   │  npm install    │
                   │  postinstall:   │
                   │  prisma generate│  ← always regenerates types
                   │  next build     │
                   └────────┬────────┘
                            │
                            ▼
             ┌──────────────────────────────────┐
             │         VERCEL EDGE CDN           │
             │  JS bundles, CSS, images         │
             │  Edge-cached API responses        │
             └──────────────┬───────────────────┘
                            │
                 ┌──────────┼──────────┐
                 │          │          │
                 ▼          ▼          ▼
           /api/auth  /api/customers  /api/import/...
           Serverless  Serverless     Serverless
           Function    Function       Function
           ~50ms cold  ~50ms cold     ~50ms cold
           60s max     60s max        60s max
                 │          │          │
                 └──────────┼──────────┘
                            │
                            ▼
                  ┌─────────────────────┐
                  │  SUPABASE PGBOUNCER  │
                  │  port 6543          │
                  │  Pool: ~20 conns    │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │  SUPABASE POSTGRES  │
                  │  AWS Seoul          │
                  │  Daily backups      │
                  └─────────────────────┘

  Background jobs:
  Vercel fn ──► QStash (EU) ──► POST /api/import/process ──► DB
```

### Deploy Steps

```bash
# Push to GitHub — Vercel auto-deploys on push to main
git add .
git commit -m "your change"
git push origin main

# After schema changes — run migrations manually
DIRECT_URL="your_direct_url" npx prisma migrate deploy
```

---

## 17. Role-Based Access Control

RBAC is enforced at two independent layers:

```
                      REQUEST
                         │
                         ▼
              ┌─────────────────────┐
              │   API LAYER         │  ← REAL security boundary
              │   jwt.verify()      │
              │   role === 'MANAGER'│
              └────────┬────────────┘
                       │
              ┌────────┴────────────┐
              │                     │
              ▼                     ▼
         ALLOWED                REJECTED
         proceed                401 / 403
```

```
                      UI
                       │
          currentUser?.role === 'MANAGER'
                       │
              ┌────────┴────────────┐
              │                     │
              ▼                     ▼
         Show button            Hide button
         (convenience)          (convenience)

    ⚠️  UI is NOT a security boundary.
    A user who bypasses the UI and calls
    the API directly still gets 403 if
    their JWT does not contain MANAGER role.
```

---

## 18. Error Handling Strategy

### API Error Flow

```
Route handler
     │
     ▼
┌─────────────────────────────────────────┐
│  try {                                  │
│    const data = await prisma.customer   │
│      .findMany(...)                     │
│    return NextResponse.json({ data })   │
│  } catch (error) {                      │
│    console.error(error)  ← server logs  │
│    return NextResponse.json(            │
│      { error: 'Internal server error' },│  ← never expose stack trace
│      { status: 500 }                    │
│    )                                    │
│  }                                      │
└─────────────────────────────────────────┘
```

### Import Partial Success

```
3,741 rows in file
     │
     ├── 3,738 rows valid → imported ✅
     └── 3 rows invalid → skipped with reason

HTTP 207 Multi-Status response:
{
  "status": "complete",
  "processedCount": 3738,
  "errorCount": 3,
  "errors": [
    "Row 12: Missing customerId",
    "Row 45: Invalid date format",
    "Row 892: Missing instructor name"
  ]
}

207 ≠ 200 (full success)
207 ≠ 5xx (total failure)
Frontend distinguishes all three cases
```

---

## 19. Scalability Analysis

```
Import time grows LINEARLY with data size:

Rows     │ Time        │ QStash calls │ DB queries
─────────┼─────────────┼──────────────┼───────────
  3,741  │  ~2 min     │     9        │    ~12
 10,000  │  ~4 min     │    22        │    ~22
 50,000  │ ~15 min     │   102        │   ~102
100,000  │ ~28 min     │   202        │   ~202

O(n / chunk_size) — doubling data doubles time.
This is correct and expected for a bulk import pipeline.

              Time
               │
               │                          ╱
   28 min ─────┼─────────────────────────╱─────
               │                    ╱
   15 min ─────┼────────────────╱──────────────
               │           ╱
    4 min ─────┼────────╱──────────────────────
    2 min ─────┼─────╱─────────────────────────
               │  ╱
               └──┬──────┬───────┬──────┬──────
                 3.7K  10K    50K   100K  rows

Linear growth (O(n)) — NOT exponential.
```

**Future scaling bottleneck:** At 100K+ rows, `rowsJson` in the `ImportJob` table becomes a large JSON blob. Solution: move pre-resolved data to a dedicated staging table with proper indexing.

---

## 20. Adding New Features

### Add a New Field to Customer

```bash
# 1. Edit schema
vim prisma/schema.prisma

# 2. Create migration
npx prisma migrate dev --name "add_field_to_customer"

# 3. Update API routes (GET, PUT)
# 4. Update frontend form + display
```

### Add a New API Route

```typescript
// src/app/api/your-resource/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const data = await prisma.yourModel.findMany()
    return NextResponse.json({ data })
  } catch (error) {
    console.error('GET /api/your-resource error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Add a New Language

```typescript
// 1. Create messages/ja.json with all keys from en.json
// 2. Add to src/i18n.ts:
export const locales = ['en', 'ko', 'ja'] as const
// 3. Done — middleware and routing handle the rest
```

---

## 21. Common Issues & Fixes

### `PrismaClientInitializationError` on Vercel

`DATABASE_URL` not set or using wrong port. Must be port **6543** (pooled).

```bash
# Check in Vercel: Project Settings → Environment Variables
# Value must look like: postgresql://...pooler.supabase.com:6543/postgres
```

### Migrations fail with "prepared statement already exists"

Using pooled URL for migrations. Always use `DIRECT_URL` (port 5432):

```bash
export DATABASE_URL="postgresql://...supabase.com:5432/postgres"  # port 5432
npx prisma migrate deploy
```

### `NotFoundError: removeChild` crash

Browser extension (Korean IME, password manager) mutating Radix UI portal nodes. Rebuild the affected page using pure HTML + Tailwind, removing all shadcn/Radix components.

### JWT token not persisting after login

`JWT_SECRET` not set in environment. `jwt.sign()` throws → login returns 500 → frontend silently fails to store token.

### Import stuck cycling at same percentage

A QStash processing chunk is timing out and retrying. Check Vercel function logs. Common causes:

```
Invalid date in spreadsheet  → check Lesson Date column format
Missing instructor name      → check Instructor Name column is non-empty
DB timeout under heavy load  → reduce CHUNK_SIZE from 1000 to 500
```

### QStash returning 401 errors

Wrong regional endpoint. If Supabase is in EU, `QSTASH_URL` must be `https://qstash-eu-central-1.upstash.io`. Also ensure you use the `@upstash/qstash` SDK with `baseUrl: process.env.QSTASH_URL` explicitly — raw `fetch` to QStash bypasses regional routing.

### Search returns no results for Korean names

Prisma's `contains` with `mode: 'insensitive'` uses `ILIKE`. Supabase's default `en_US.UTF-8` collation handles Korean correctly. If missing, verify the `customers_firstName_idx` and `customers_lastName_idx` indexes exist — PostgreSQL may fall back to sequential scan without them.

### Build fails with ESLint errors

Set rules to `"warn"` not `"error"` in `eslint.config.mjs`:

```javascript
rules: {
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-vars": "warn",
  "react/no-unescaped-entities": "warn",
}
```

---

---

## 22. Debug Diaries — Bugs, Root Causes & Fixes

A running log of interesting, non-obvious bugs encountered in production. These are worth documenting because the symptoms are misleading, the root causes are subtle, and the fixes are small but the reasoning behind them matters.

---

### #001 — Korean Names Crashing React in Microsoft Edge

**Date discovered:** 2026-03-27
**Affected flow:** Add New Record → Existing Customer → Search
**Affected browsers:** Microsoft Edge (Chromium), any browser with auto-translate enabled
**Symptom in console:**
```
Uncaught Error: Minified React error #418
Uncaught NotFoundError: Failed to execute 'insertBefore' on 'Node':
  The node before which the new node is to be inserted is not a child of this node.
```
**Symptom for user:** The app crashes silently mid-search. No API errors visible in the network tab. Only reproducible with specific Korean names (e.g. `김동훈`) — Latin names work fine.

#### Root Cause

Edge ships with a built-in **Microsoft Translator**. When it detects text in a language that differs from the browser's UI language (e.g., Korean text inside an otherwise English page), it automatically wraps individual words and characters in `<span>` elements to annotate them for translation — **directly mutating the real DOM**.

React maintains a virtual DOM and computes the minimal set of DOM operations needed to reach the correct UI state. When Edge injects extra `<span>` nodes into the DOM, React's virtual DOM no longer matches the real DOM. On the next render cycle, React attempts to `insertBefore` a node relative to what it believes is its sibling — but that sibling has been moved or wrapped by the translator. This throws `NotFoundError`, which React surfaces as error `#418` (a DOM reconciliation failure / hydration mismatch).

**Why only certain names?** The translator's language-detection triggers on character density. A name like `김동훈` (3 Korean characters) reliably triggers it; a name with only 1–2 characters sometimes does not, making the bug appear intermittent.

**Why only Edge?** Chrome's translation is opt-in via an extension; Edge's Microsoft Translator activates automatically based on detected language. Safari on iOS has the same architecture but a different triggering heuristic.

**Why no API errors in the logs?** The crash happens entirely in the browser's render layer after the API response has already been received and rendered. The server is healthy — this is a pure client-side DOM corruption issue.

#### Fix
Three changes, each addressing a different layer of the problem:

**1. `translate="no"` on `<html>` — primary fix**
File: `src/app/[locale]/layout.tsx`
```tsx
<html lang={locale} translate="no">
```
This is the W3C-standard attribute that instructs all browsers and translation tools (Edge Translator, Google Translate, DeepL browser extension) not to auto-translate this document. For a database app that stores real patient names and clinical notes, this is always the correct setting — you never want the browser silently rewriting stored data.

This attribute has **zero effect on `next-intl`** or any other app-level translation logic. It only stops the browser's own automatic translation layer from touching the DOM.

**2. `translate="no"` on the customer name container — belt-and-suspenders**
File: `src/app/[locale]/add-record/page.tsx`
```tsx
<div className="flex-1 cursor-pointer" onClick={...} translate="no">
```
In case a user has a browser extension that ignores the `<html>` attribute, scoping `translate="no"` directly to the element that renders Korean names provides a second line of defence on the exact node that was crashing.

**3. `spellCheck={false}` and `autoComplete="off"` on the search input**
File: `src/app/[locale]/add-record/page.tsx`
```tsx
<Input spellCheck={false} autoComplete="off" ... />
```
Browser spellcheck on an input field can also inject DOM annotations (especially Edge's Microsoft Editor, which adds grammar/style suggestions). Disabling it on the search input prevents any browser-side DOM mutation on the text the user is actively typing.

#### What `translate="no"` does NOT affect

| Feature | Affected? |
|---|---|
| `next-intl` Korean ↔ English UI switching | No — this is app code, not browser translation |
| API calls and database queries | No |
| User-typed input in forms | No |
| Copy-paste of Korean text | No |
| Search / filter functionality | No |
| The "Translate this page?" browser prompt | Yes — it will no longer appear (intentional) |

#### Lesson

When a React crash is **browser-specific**, **non-reproducible via network inspection**, and **correlated with a specific character set** — look at browser-level DOM mutation first (translation, spellcheck, grammar tools, accessibility extensions) before assuming an application bug. The DOM React reconciles against is not always the DOM only React has written.

---

*Built for production. Evolved through real constraints. Every architectural decision has a reason.*
