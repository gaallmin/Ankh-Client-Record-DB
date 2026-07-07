# Ankh Client Record Database - Architecture Guide

This document provides an in-depth technical explanation of the Ankh Record Database application architecture, including system design, data flows, component interactions, and implementation details.

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Patterns](#architecture-patterns)
3. [Tech Stack Deep Dive](#tech-stack-deep-dive)
4. [Application Layers](#application-layers)
5. [Database Architecture](#database-architecture)
6. [API Layer Architecture](#api-layer-architecture)
7. [Frontend Architecture](#frontend-architecture)
8. [Authentication & Authorization](#authentication--authorization)
9. [CSV Import/Export Pipeline](#csvimportexport-pipeline)
10. [Search & Query Architecture](#search--query-architecture)
11. [Internationalization (i18n) Architecture](#internationalization-i18n-architecture)
12. [Data Flow Diagrams](#data-flow-diagrams)
13. [Error Handling Strategy](#error-handling-strategy)
14. [Performance Architecture](#performance-architecture)
15. [Security Architecture](#security-architecture)
16. [Deployment Architecture](#deployment-architecture)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Browser                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js Client (React Components + TypeScript)     │   │
│  │  - LanguageSwitcher (i18n routing)                  │   │
│  │  - Customer Search UI                               │   │
│  │  - Customer Details Modal                           │   │
│  │  - Add Record Form                                  │   │
│  │  - User Management Interface                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↕                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js Middleware (Locale Detection)              │   │
│  │  - Route locale prefix → (/en, /ko)                 │   │
│  │  - Inject locale into request context               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↕
        ┌─────────────────────────────────────┐
        │  Next.js API Routes (Edge)          │
        │  ┌───────────────────────────────┐  │
        │  │ Authentication                │  │
        │  │ - POST /api/auth/login        │  │
        │  ├───────────────────────────────┤  │
        │  │ Customers                     │  │
        │  │ - GET /api/customers          │  │
        │  │ - GET /api/customers/search   │  │
        │  │ - GET /api/customers/{id}     │  │
        │  │ - PUT /api/customers/{id}     │  │
        │  │ - DELETE /api/customers/{id}  │  │
        │  ├───────────────────────────────┤  │
        │  │ Lessons                       │  │
        │  │ - POST /api/lessons/new       │  │
        │  │ - GET /api/lessons/search     │  │
        │  │ - DELETE /api/lessons/{id}... │  │
        │  ├───────────────────────────────┤  │
        │  │ Import/Export                 │  │
        │  │ - POST /api/import-csv        │  │
        │  │ - GET /api/export-csv         │  │
        │  ├───────────────────────────────┤  │
        │  │ Users & Locations             │  │
        │  │ - User CRUD                   │  │
        │  │ - Location CRUD               │  │
        │  └───────────────────────────────┘  │
        └─────────────────────────────────────┘
                          ↕
        ┌─────────────────────────────────────┐
        │  Prisma ORM Layer                   │
        │ (Query Building & Optimization)    │
        └─────────────────────────────────────┘
                          ↕
        ┌─────────────────────────────────────┐
        │  PostgreSQL Supabase                │
        │ (Connection Pool + Direct)          │
        └─────────────────────────────────────┘
```

### Request Lifecycle

```
1. Browser Request
   ↓
2. Next.js Middleware
   - Extract locale from URL path (/en/*, /ko/*)
   - Add locale to request context
   ↓
3. Route Matching
   - App Router matches URL to page or API route
   ↓
4. Middleware Chain (API Routes Only)
   - Authentication check (JWT verification)
   - Authorization check (role-based)
   ↓
5. Route Handler
   - Process request logic
   - Call database via Prisma
   ↓
6. Prisma Query
   - Build optimized SQL query
   - Execute against connection pool
   ↓
7. Database Response
   - Fetch results from PostgreSQL
   ↓
8. Response Processing
   - Transform to JSON
   - Add error handling
   ↓
9. HTTP Response
   - Send back to client
   ↓
10. Frontend Render
    - React updates UI
    - Re-run effects if needed
```

---

## Architecture Patterns

### 1. Next.js App Router Pattern

**What it is:** Modern Next.js routing based on file structure in `src/app/`

**Implementation:**
```
src/app/
├── [locale]/              → Catch-all route for /en, /ko
│   ├── page.tsx           → Main dashboard (/en, /ko)
│   ├── layout.tsx         → Locale-aware layout
│   └── add-record/        → Lesson form (/en/add-record)
├── api/                   → API routes
│   ├── auth/login/route.ts
│   ├── customers/[customerId]/route.ts
│   └── import-csv/route.ts
└── layout.tsx             → Root layout
```

**Why:**
- File-based routing matches URL structure
- Zero config routing
- Easy to organize features
- Built-in API routes (no separate backend needed)

### 2. Soft Delete Pattern

**What it is:** Logical deletion instead of permanent deletion

**Implementation:**
```sql
-- Delete customer (soft)
UPDATE customers 
SET "deletedAt" = NOW() 
WHERE id = $1;

-- Query customers (only non-deleted)
SELECT * FROM customers
WHERE "deletedAt" IS NULL;
```

**Why:**
- Data recovery capability
- Audit trail preservation
- Regulatory compliance (many laws require data preservation)
- No cascading deletes (relationships remain intact)

**Usage in Code:**
```typescript
// API returns only non-deleted customers
const customers = await prisma.customer.findMany({
  where: {
    deletedAt: null  // Filter built into every query
  }
});

// Soft delete operation
await prisma.customer.update({
  where: { id },
  data: { deletedAt: new Date() }
});
```

### 3. Batch Processing Pattern

**What it is:** Process large datasets in chunks to optimize performance and memory

**Implementation:**
```typescript
const BATCH_SIZE = 50;

// Process in batches of 50
for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);
  
  await prisma.customer.createMany({
    data: batch,
    skipDuplicates: true
  });
}
```

**Why:**
- Prevents memory overflow with large imports
- Faster than per-row transactions
- ~10× performance improvement vs. per-row
- Easier database recovery if batch fails

### 4. Repository Pattern (with Prisma)

**What it is:** Abstract database access logic into reusable functions

**Implementation:**
```typescript
// File: src/app/api/customers/route.ts
// The route IS the repository - all customer queries here

async function getCustomers(limit?: number, offset?: number) {
  return prisma.customer.findMany({
    where: { deletedAt: null },
    take: limit || 100,
    skip: offset || 0,
    include: { lessonParticipants: { take: 1, orderBy: { lesson: { createdAt: 'desc' } } } }
  });
}
```

**Why:**
- Centralized database access
- Single responsibility
- Easy to test
- Consistent error handling

### 5. Layered Architecture

```
┌────────────────────────────────────────┐
│  Presentation Layer (UI Components)    │
│  - React components                    │
│  - Forms & modals                      │
│  - State hooks (useState, useCallback) │
└────────────────────────────────────────┘
           ↕ (HTTP Requests)
┌────────────────────────────────────────┐
│  API Layer (Route Handlers)            │
│  - Business logic                      │
│  - Authorization checks                │
│  - Data validation                     │
└────────────────────────────────────────┘
           ↕ (SQL Queries)
┌────────────────────────────────────────┐
│  Data Layer (Prisma ORM)               │
│  - Query building                      │
│  - Connection management               │
│  - Result mapping                      │
└────────────────────────────────────────┘
           ↕ (Network)
┌────────────────────────────────────────┐
│  Database Layer (PostgreSQL)           │
│  - Data storage                        │
│  - Indexing                            │
│  - Query optimization                  │
└────────────────────────────────────────┘
```

---

## Tech Stack Deep Dive

### Frontend Ecosystem

**Core Framework: Next.js 14 (App Router)**
- Server-side rendering for SEO
- API routes (no separate backend)
- Automatic code splitting
- Built-in optimization (image, fonts, scripts)

**React 18**
- Hooks for state management (useState, useCallback, useEffect)
- Function components
- Automatic batching of updates

**TypeScript**
- Full type safety
- Prevents runtime errors
- Better IDE support and autocomplete
- Enforced interface contracts

**Styling: Tailwind CSS**
- Utility-first CSS framework
- No naming conflicts
- Tree-shakable (only used styles shipped)
- Consistent spacing/colors

**UI Component Library: shadcn/ui**
- Pre-built accessible components
- Built on Radix UI (accessibility primitives)
- Customizable via CSS
- Components included: Button, Input, Dialog, Card, Table, etc.

**Internationalization: next-intl**
- Locale routing (`/en/...`, `/ko/...`)
- Message catalogs per language
- Automatic locale detection
- Type-safe message keys

### Backend Ecosystem

**Runtime: Node.js**
- Built into Next.js
- Single language for full-stack (TypeScript)
- NPM ecosystem

**API Routes**
- File-based routing
- Built into Next.js App Router
- Serverless functions on Vercel
- Standard HTTP (GET, POST, PUT, DELETE, etc.)

**ORM: Prisma v6.19.0**
- Type-safe queries
- Migration system
- Automatic relationship loading
- Query optimization

**Database: PostgreSQL**
- ACID transactions
- Complex queries with JOINs
- Indexing for performance
- JSON support (for extensibility)

**Connection Management:**
```
DATABASE_URL    → Pooled connection (pgbouncer)
                  Used for: Application queries
                  Why: High concurrency, connection limits

DIRECT_URL      → Direct connection (no pgbouncer)
                  Used for: Database migrations (DDL)
                  Why: pgbouncer doesn't support DDL operations
```

**File Processing: XLSX**
- Parse Excel files (.xlsx, .xls)
- Handles Excel date format (serial numbers)
- Extract data to JSON
- Supports formulas and cell references

### Authentication Stack

**JWT (JSON Web Tokens)**
- Stateless authentication
- Stored in HTTP-only cookies
- Self-contained user info
- No database lookups for validation

**Bcrypt**
- Password hashing
- Salt rounds: 10 (default)
- One-way encryption (cannot be reversed)

---

## Application Layers

### Layer 1: Presentation Layer (UI Components)

**Location:** `src/app/[locale]/page.tsx`

**Components:**
- Search bar (customer name, instructor name, location)
- Action buttons (Add Record, Export CSV, Import CSV, View Users, View Customers)
- Search results (expandable cards)
- All Customers table (with edit & delete)
- Edit customer modal
- Customer details modal
- File upload dialog
- Forms (add record, manage users)

**State Management:**
```typescript
// Customer Search
const [searchTerm, setSearchTerm] = useState('');
const [searchResults, setSearchResults] = useState([]);
const [loading, setLoading] = useState(false);

// Customer Edit
const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
const [editCustomerForm, setEditCustomerForm] = useState({});
const [isSavingCustomerEdit, setIsSavingCustomerEdit] = useState(false);

// File Upload
const [file, setFile] = useState<File | null>(null);
const [uploading, setUploading] = useState(false);
```

**User Interactions Flow:**
```
1. User types in search → setSearchTerm
2. onChange handler calls /api/customers/search
3. Results displayed in real-time
4. User clicks customer name → opens customer details modal
5. User clicks edit → opens edit modal → saves via PUT
6. User clicks delete → soft delete via DELETE → re-fetch list
```

### Layer 2: API Layer (Route Handlers)

**Authentication Route:** `src/app/api/auth/login/route.ts`
```typescript
export async function POST(request: Request) {
  const { username, password } = await request.json();
  
  // 1. Find user by username
  const user = await prisma.user.findUnique({ where: { username } });
  
  // 2. Verify password (bcrypt compare)
  const valid = await bcrypt.compare(password, user.password);
  
  // 3. Generate JWT token
  const token = sign({ userId: user.id, role: user.role }, SECRET);
  
  // 4. Set cookie
  response.cookies.set('token', token, { httpOnly: true });
  
  return response;
}
```

**Customer Routes:** `src/app/api/customers/route.ts`

GET All Customers:
```typescript
export async function GET(request: Request) {
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    include: {
      lessonParticipants: {
        take: 1,  // Last lesson only
        orderBy: { lesson: { createdAt: 'desc' } },
        include: { lesson: true }
      }
    }
  });
  return Response.json(customers);
}
```

PUT Update Customer:
```typescript
export async function PUT(request: Request, context: { params: { customerId: string } }) {
  const { firstName, lastName, email, phone } = await request.json();
  
  const updated = await prisma.customer.update({
    where: { id: context.params.customerId },
    data: { firstName, lastName, email, phone }
  });
  
  return Response.json(updated);
}
```

DELETE Soft Delete:
```typescript
export async function DELETE(request: Request, context: { params: { customerId: string } }) {
  // Soft delete - set deletedAt timestamp
  await prisma.customer.update({
    where: { id: context.params.customerId },
    data: { deletedAt: new Date() }
  });
  
  return Response.json({ success: true });
}
```

### Layer 3: Data Layer (Prisma ORM)

**Query Types:**

1. **Simple Fetch:**
```typescript
const customer = await prisma.customer.findUnique({
  where: { id: customerId }
});
```

2. **Relational Query (Include):**
```typescript
const customer = await prisma.customer.findUnique({
  where: { id: customerId },
  include: {
    lessonParticipants: {
      include: { lesson: true }
    }
  }
});
```

3. **Conditional Query:**
```typescript
const customers = await prisma.customer.findMany({
  where: {
    AND: [
      { deletedAt: null },
      {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      }
    ]
  }
});
```

4. **Batch Operations:**
```typescript
await prisma.customer.createMany({
  data: [
    { id: '1', firstName: 'John', ... },
    { id: '2', firstName: 'Jane', ... }
  ],
  skipDuplicates: true  // Don't error if already exists
});
```

**Prisma Client Location:** `src/lib/prisma.ts`
```typescript
// Singleton pattern - prevents duplicate instances
let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient();
  }
  prisma = global.prisma;
}

export default prisma;
```

### Layer 4: Database Layer (PostgreSQL)

**Connection Details:**
```
Host: db.supabase.co
Port: 6543 (pooled), 5432 (direct)
SSL: Required (mode: require)
Database: postgres
```

**Connection Pools:**
- Pooled (port 6543): pgbouncer manages 30-50 connections
- Direct (port 5432): One connection per client
- Failover: Falls back to direct if pooled fails

---

## Database Architecture

### Schema Overview

```
┌─────────────────────┐
│     User            │
├─────────────────────┤
│ id (String)         │◄─────────┐
│ username (String)   │          │
│ password (String)   │          │ Many
│ role (Enum)         │          │
│ firstName (String)  │          │
│ lastName (String)   │          │
│ email (String)      │         ┌─────────────────┐
│ createdAt (DateTime)│         │ Lesson          │
└─────────────────────┘         ├─────────────────┤
                                │ id              │
                                │ lessonType      │
                                │ lessonContent   │
                                │ createdAt       │
┌─────────────────────┐         │ instructorId ───┼──→ User
│ Location            │         │ locationId ─────┼──→ Location
├─────────────────────┤         │ participants ───┼──→ LessonParticipant
│ id (String)         │         └─────────────────┘
│ name (String)       │
├─────────────────────┤
│ lessons ────────────┼──→ Lesson (Many)
└─────────────────────┘

┌──────────────────────────────┐
│ Customer                      │
├──────────────────────────────┤
│ id (String)                  │
│ firstName (String)           │
│ lastName (String)            │
│ email (String)               │
│ phone (String, nullable)     │
│ createdAt (DateTime)         │
│ deletedAt (DateTime, soft del)
│ lessonParticipants ─────────┐
│   (Many LessonParticipant)   │
└──────────────────────────────┘
                ↑
         ┌──────┴──────┐
         │             │
┌─────────────────────────────┐
│ LessonParticipant (Join)    │
├─────────────────────────────┤
│ customerId (String, FK) ────┼──→ Customer
│ lessonId (String, FK) ──────┼──→ Lesson
│ customerSymptoms (String)   │
│ customerImprovements (String)
│ status (Enum)               │
│ composite primary key       │
│ (customerId, lessonId)      │
└─────────────────────────────┘
```

### Key Design Decisions

**1. Customer Table - String IDs**
```prisma
model Customer {
  id        String   @id @default(cuid())  // Collision Resistant Unique ID
  ...
}
```
**Why:** UUIDs or CUIDs are better than auto-increment for:
- Distributed systems
- Security (cannot guess IDs)
- Database replication
- URL-safe

**2. LessonParticipant - Join Table**
```prisma
model LessonParticipant {
  customerId String
  lessonId   String
  
  @@id([customerId, lessonId])  // Composite primary key
}
```
**Why:** Many-to-many relationship requires intermediate table
- One customer can attend many lessons
- One lesson can have many customers
- Join table stores attendance-specific data (symptoms, improvements)

**3. Soft Delete with deletedAt**
```prisma
model Customer {
  deletedAt DateTime?  // null = active, has timestamp = deleted
}
```
**Why:** Better than separate `isDeleted Boolean` flag
- Stores when deletion occurred (audit trail)
- Easier to find recently deleted records
- Can calculate retention metrics

**4. Lesson.createdAt as Lesson Date**
```prisma
model Lesson {
  createdAt DateTime  // Stores the actual lesson date from import
}
```
**Why:** 
- One column for one date (simplicity)
- `createdAt` semantically means "when this was created" ← can be imported date
- Automatic timestamp from database is overridden during import

**5. Enum for Role**
```prisma
enum UserRole {
  MANAGER
  INSTRUCTOR
}
```
**Why:**
- Type safety at database level
- Cannot insert invalid roles
- Database enforces constraint

### Indexes & Performance

**Auto-indexed by Prisma:**
```prisma
@id                    // Primary key
@unique                // Unique constraints
foreign keys (FK)      // Relations
```

**Recommended additional indexes:**
```sql
CREATE INDEX idx_customer_firstname ON customers(firstName);
CREATE INDEX idx_customer_lastname ON customers(lastName);
CREATE INDEX idx_customer_email ON customers(email);
CREATE INDEX idx_customer_deletedat ON customers("deletedAt");
CREATE INDEX idx_lesson_createdat ON lessons("createdAt");
CREATE INDEX idx_lessonparticipant_customerid ON lesson_participants("customerId");
```

---

## API Layer Architecture

### Route Organization

```
api/
├── auth/
│   └── login/route.ts              # POST /api/auth/login
│
├── customers/
│   ├── route.ts                    # GET (all), POST (create)
│   ├── [customerId]/
│   │   └── route.ts                # GET (one), PUT (update), DELETE (soft delete)
│   ├── search/
│   │   └── route.ts                # GET /api/customers/search?name=...
│   └── [customerId]/
│       └── route.ts
│
├── lessons/
│   ├── [lessonId]/
│   │   └── participants/
│   │       └── route.ts            # DELETE lesson participant
│   ├── new/
│   │   └── route.ts                # POST /api/lessons/new
│   └── search/
│       └── route.ts                # GET /api/lessons/search?name=...
│
├── users/
│   ├── route.ts                    # GET (all), POST (create)
│   ├── [userId]/
│   │   └── route.ts                # DELETE /api/users/{id}
│   └── instructors/
│       └── route.ts                # GET /api/users/instructors
│
├── locations/
│   └── route.ts                    # GET (all), POST (create)
│
├── import-csv/
│   └── route.ts                    # POST /api/import-csv (file upload)
│
├── export-csv/
│   └── route.ts                    # GET /api/export-csv
│
└── health/
    └── db/
        └── route.ts                # GET /api/health/db
```

### Request/Response Pattern

**Standard Success Response:**
```typescript
{
  "data": { /* actual data */ },
  "success": true,
  "timestamp": "2026-02-24T10:00:00Z"
}
```

**Standard Error Response:**
```typescript
{
  "error": "Descriptive error message",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "timestamp": "2026-02-24T10:00:00Z"
}
```

**Typical Error Codes:**
```
400 - VALIDATION_ERROR (missing/invalid fields)
401 - UNAUTHORIZED (missing/invalid token)
403 - FORBIDDEN (insufficient permissions)
404 - NOT_FOUND (resource doesn't exist)
409 - CONFLICT (duplicate record)
500 - INTERNAL_SERVER_ERROR
```

### Authorization Pattern

**JWT Verification:**
```typescript
export async function GET(request: Request) {
  const token = request.cookies.get('token')?.value;
  
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const decoded = verify(token, SECRET);
    // Token is valid, proceed
  } catch {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }
}
```

**Role-Based Access Control:**
```typescript
const decoded = verify(token, SECRET);

if (decoded.role === 'MANAGER') {
  // Allow full access
} else if (decoded.role === 'INSTRUCTOR') {
  // Allow read-only
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}
```

### Content-Type Handling

**Form Data (File Upload):**
```typescript
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'buffer' });
}
```

**JSON Body:**
```typescript
export async function POST(request: Request) {
  const body = await request.json();
  const { firstName, lastName } = body;
}
```

**CSV Export (Streaming):**
```typescript
const csvHeaders = 'First Name, Last Name, Email, Phone\n';
const csvRows = customers.map(c => `${c.firstName}, ${c.lastName}, ${c.email}, ${c.phone || ''}`).join('\n');
const csv = csvHeaders + csvRows;

return new Response(csv, {
  headers: {
    'Content-Type': 'text/csv',
    'Content-Disposition': 'attachment; filename="customers.csv"'
  }
});
```

---

## Frontend Architecture

### Component Hierarchy

```
layout.tsx (Root)
├── language-switcher.tsx
├── page.tsx (Main Dashboard)
│   ├── Search Section
│   │   ├── Search Input
│   │   ├── Type Selector (Customer/Instructor/Location)
│   │   └── Create/Import/Export Buttons
│   │
│   ├── Stats Display
│   │   ├── Instructor Count
│   │   ├── Location Count
│   │   └── Customer Count
│   │
│   ├── Search Results Section
│   │   └── ResultCard (Expandable)
│   │       ├── Name & Contact
│   │       ├── Quick Stats
│   │       └── Expandable Lesson Details
│   │
│   ├── All Customers Section
│   │   └── Table
│   │       ├── Name Column
│   │       ├── Email Column
│   │       ├── Phone Column
│   │       ├── Last Lesson Date Column
│   │       └── Action Column
│   │
│   ├── EditCustomerModal
│   │   ├── Form Fields (Name, Email, Phone)
│   │   └── Save/Cancel Buttons
│   │
│   ├── CustomerDetailsModal
│   │   ├── Customer Info
│   │   ├── Lesson History
│   │   └── Delete Button
│   │
│   ├── FileUploadDialog
│   │   ├── File Input
│   │   └── Upload Progress
│   │
│   └── AddRecordForm
│       ├── Lesson Date Input
│       ├── Customer Select
│       ├── Instructor Select
│       ├── Location Select
│       └── Submit Button
│
├── [locale]/
│   └── add-record/
│       └── page.tsx
│
└── manage-users/
    └── page.tsx
```

### State Management Flow

```
Component State (Hooks)
    ↓
┌─────────────────────────────────────┐
│ useState Hooks                      │
│ - searchTerm                        │
│ - searchResults                     │
│ - loading                           │
│ - customers                         │
│ - editingCustomer                   │
│ - editCustomerForm                  │
│ - isSavingCustomerEdit              │
│ - editCustomerError                 │
└─────────────────────────────────────┘
    ↓
useCallback Effects
    ↓
API Fetch Calls
    ↓
setXxx Updaters
    ↓
Component Re-render
    ↓
Updated UI
```

**Example State Update Flow:**

```typescript
// 1. User types search term
<input onChange={(e) => setSearchTerm(e.target.value)} />

// 2. useCallback watches searchTerm
useCallback(() => {
  if (searchTerm.length > 2) {
    fetch(`/api/customers/search?name=${searchTerm}`)
      .then(data => setSearchResults(data))
      .catch(err => setSearchError(err))
      .finally(() => setLoading(false));
  }
}, [searchTerm])

// 3. Results are displayed
{searchResults.map(result => (
  <ResultCard key={result.id} customer={result} />
))}

// 4. User clicks edit
<button onClick={() => setEditingCustomer(customer)} />

// 5. EditCustomerModal opens
{editingCustomer && <EditCustomerModal>...</EditCustomerModal>}

// 6. User saves
<button onClick={async () => {
  setIsSavingCustomerEdit(true);
  await fetch(`/api/customers/${editingCustomer.id}`, {
    method: 'PUT',
    body: JSON.stringify(editCustomerForm)
  });
  setIsSavingCustomerEdit(false);
  setEditingCustomer(null);
  // Refresh customer list
  fetchCustomers();
}} />
```

### Event Handling Pattern

```typescript
// Search handler
const handleSearch = useCallback(async (term: string) => {
  setLoading(true);
  setSearchError(null);
  
  try {
    const response = await fetch(`/api/customers/search?name=${term}`);
    const data = await response.json();
    setSearchResults(data);
  } catch (err) {
    setSearchError(err.message);
  } finally {
    setLoading(false);
  }
}, []);

// Edit handler
const handleEditCustomer = (customer: Customer) => {
  setEditingCustomer(customer);
  setEditCustomerForm({
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone || ''
  });
};

// Save handler
const handleSaveCustomerEdit = async () => {
  setIsSavingCustomerEdit(true);
  setEditCustomerError(null);
  
  try {
    await fetch(`/api/customers/${editingCustomer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editCustomerForm)
    });
    
    setEditingCustomer(null);
    // Show success
    setSuccessMessage('Customer updated successfully');
    
    // Refresh customer list
    await fetchCustomers();
  } catch (err) {
    setEditCustomerError(err.message);
  } finally {
    setIsSavingCustomerEdit(false);
  }
};

// Delete handler (with confirmation)
const handleDeleteCustomer = async (id: string) => {
  if (!confirm('Are you sure you want to delete this customer?')) {
    return;
  }
  
  try {
    await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    // Refresh list
    await fetchCustomers();
  } catch (err) {
    setError(err.message);
  }
};
```

---

## Authentication & Authorization

### Authentication Flow

```
1. Login Page
   ├─ User enters username & password
   └─ Submits form
        ↓
2. Client sends POST /api/auth/login
   ├─ Body: { username, password }
   └─ Request sent
        ↓
3. Server validates credentials
   ├─ Look up user by username (in database)
   ├─ Compare provided password with stored hash (bcrypt)
   └─ If match, proceed; if not, return 401
        ↓
4. Generate JWT token
   ├─ Payload: { userId, role, iat, exp }
   ├─ Sign with SECRET key
   └─ Token string generated
        ↓
5. Set HTTP-only cookie
   ├─ response.cookies.set('token', token, { httpOnly: true })
   ├─ Cookie cannot be accessed via JavaScript (XSS protection)
   └─ Sent to browser in Set-Cookie header
        ↓
6. Browser receives cookie
   ├─ Stores cookie in secure storage
   └─ Automatically includes in future requests
        ↓
7. Redirect to dashboard
   └─ User logged in
```

### JWT Token Structure

```javascript
// Header
{
  "alg": "HS256",
  "typ": "JWT"
}

// Payload (contains user info)
{
  "userId": "cuid_123456789",
  "role": "MANAGER",
  "iat": 1708799400,      // Issued at
  "exp": 1708885800       // Expires in (24 hours)
}

// Signature
HMACSHA256(
  base64UrlEncode(header) + "." +
  base64UrlEncode(payload),
  SECRET_KEY
)

// Final token (sent to client)
eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJjdWlkXzEyMzQ1Njc4OSIsImhXHJvbGUiOiJNQU5BR0VSIn0.zT82...
```

### Authorization Middleware

**Applied to all API routes:**

```typescript
// Verify JWT token exists
const token = request.cookies.get('token')?.value;
if (!token) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

// Verify JWT signature (decode)
let decoded;
try {
  decoded = verify(token, SECRET);
} catch (err) {
  return Response.json({ error: 'Invalid token' }, { status: 401 });
}

// Check role-based permissions
if (route === DELETE && decoded.role !== 'MANAGER') {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

// Proceed with request
const userId = decoded.userId;
```

### Role-Based Access Control (RBAC)

**MANAGER Role:**
- ✅ View customers
- ✅ Edit customers
- ✅ Delete customers (soft)
- ✅ Import CSV
- ✅ Export CSV
- ✅ Create lessons
- ✅ Manage users
- ✅ Manage locations

**INSTRUCTOR Role:**
- ✅ View customers
- ❌ Edit customers
- ❌ Delete customers
- ❌ Import/export
- ❌ Manage users
- ✅ Record lessons (for own lessons)

### Password Security

**Hashing with Bcrypt:**
```typescript
// Registration
import bcrypt from 'bcrypt';

const hashedPassword = await bcrypt.hash(plainPassword, 10);
// Store hashedPassword in database

// Login
const isMatch = await bcrypt.compare(plainPassword, storedHash);
```

**Why Bcrypt:**
- Includes salt automatically
- Adaptive cost (slows down over time as computers get faster)
- Cannot be reversed (one-way encryption)
- Industry standard for password hashing

---

## CSV Import/Export Pipeline

### Import Architecture

```
1. File Selection
   ├─ User selects .xlsx or .csv file
   └─ File object in memory
        ↓
2. Upload to Server
   ├─ POST /api/import-csv
   ├─ formData with file
   └─ Content-Type: multipart/form-data
        ↓
3. XLSX Parsing
   ├─ XLSX.read(buffer)
   ├─ Extract worksheet[0] (first sheet)
   └─ Convert to JSON rows
        ↓
4. Header Normalization
   ├─ Lowercase all headers
   ├─ Trim whitespace
   ├─ Match to known aliases
   └─ Map to schema fields
        ↓
5. Data Validation
   ├─ Check required fields present
   ├─ Check data types correct
   ├─ Skip rows with errors (log them)
   └─ Build valid rows array
        ↓
6. Deduplication
   ├─ Map customers by (firstName, lastName, email)
   ├─ Map instructors by name
   ├─ Map lessons by (lessonDate, instructorId)
   ├─ Set locations
   └─ Prevent duplicates within import
        ↓
7. Batch Processing
   ├─ Chunk: 50 rows per batch
   ├─ For each batch:
   │   ├─ Upsert locations
   │   ├─ Upsert users/instructors
   │   ├─ Upsert customers
   │   ├─ Upsert lessons
   │   └─ Upsert lesson participants
   └─ Wait for batch completion before next
        ↓
8. Response
   ├─ Success count
   ├─ Error details with row numbers
   └─ Warnings (skipped records)
        ↓
9. Frontend
   ├─ Show success toast
   ├─ Display errors if any
   └─ Refresh customer list
```

### CSV Format Specifications

**Required Headers (case-insensitive with aliases):**

```
Customer Information:
  - Customer ID | CUSTOMER ID | ID
  - Customer Name | CUSTOMER NAME | NAME
  - Email | EMAIL ADDRESS
  - Phone | PHONE NUMBER | MOBILE

Lesson Information:
  - Lesson ID | LESSON ID | ID
  - Lesson Date | DATE | LESSON DATE (Excel format or ISO)
  - Lesson Type | TYPE (Group/Individual)
  - Lesson Content | CONTENT | NOTES

Instructor Information:
  - Instructor Name | INSTRUCTOR | INSTRUCTOR NAME
  
Location Information:
  - Location Name | LOCATION | LOCATION NAME

Symptoms & Feedback:
  - Customer Symptoms | SYMPTOMS | INITIAL CONDITION
  - Course Completion Status | IMPROVEMENTS | FEEDBACK | CURRENT CONDITION

Example row:
Customer ID | Customer Name | Email | Lesson Date | Lesson Type | Instructor Name | Location Name
1           | John Doe      | john@example.com | 2026-01-15 | Group | Jane Smith | Downtown
```

### Date Parsing Logic

**Excel Serial Number Format:**
```
Excel stores dates as serial numbers (days since 1899-12-31)
Example: 45335 = 2024-01-15

Parsing:
1. Check if value is number
2. If number && > 30000 && < 60000 → Excel date
3. Convert: excelDate = (serialNumber - 25569) * 86400 * 1000
4. Parse as milliseconds since epoch
5. Result: ISO date string
```

**ISO String Format:**
```
Example: "2026-01-15" or "2026-01-15T10:30:00Z"

Parsing:
1. Check if value is string
2. Parse with new Date(dateString)
3. Validate: isNaN(date) checks if invalid
4. If valid, use; if invalid, log error and skip
```

**Implementation:**
```typescript
function parseLessonDate(value: any): Date | null {
  // Excel serial number (15-digit numbers in range)
  if (typeof value === 'number' && value > 30000 && value < 99999) {
    const excelDate = new Date((value - 25569) * 86400 * 1000);
    if (!isNaN(excelDate.getTime())) {
      return excelDate;
    }
  }

  // ISO string (YYYY-MM-DD, etc.)
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;  // Invalid date
}
```

### Deduplication Strategy

```typescript
// Customer deduplication
const customerMap = new Map<string, Customer>();

for (const row of rows) {
  const key = [row.firstName, row.lastName, row.email].join('|');
  
  if (!customerMap.has(key)) {
    customerMap.set(key, {
      id: generateId(),
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone
    });
  }
}

const uniqueCustomers = Array.from(customerMap.values());
```

**Why Not Just Upsert Directly:**
- Upsert in database requires unique constraints
- Multiple errors if constraint violated during import
- Deduplication first = one-pass, one database transaction set
- Better error handling and reporting

### Export Architecture

```
1. User clicks Export CSV
   ├─ GET /api/export-csv
   └─ Request sent
        ↓
2. Server fetches customers with lessons
   ├─ Prisma query: findMany with include
   ├─ Fetch all non-deleted customers
   ├─ Include lesson participants & lessons
   └─ Results in memory
        ↓
3. Format as CSV
   ├─ Build headers row
   ├─ For each customer:
   │   └─ For each lesson:
   │       └─ Add row with customer + lesson data
   └─ CSV string built
        ↓
4. Send response
   ├─ Set Content-Type: text/csv
   ├─ Set Content-Disposition: attachment; filename="customers.csv"
   └─ Stream CSV content
        ↓
5. Browser
   ├─ Receives response
   ├─ Recognizes attachment
   └─ Triggers download
```

**CSV Export Format:**
```
Customer Name | Email | Phone | Lesson Date | Lesson Type | Instructor | Location | Symptoms | Improvements
John Doe      | john@example.com | 555-1234 | 2026-01-15 | Group | Jane Smith | Downtown | Stiff neck | Pain reduced 50%
John Doe      | john@example.com | 555-1234 | 2026-01-08 | Individual | Bob Johnson | Uptown | Headache | Feeling better
```

---

## Search & Query Architecture

### Search Implementation

**Frontend Search Flow:**
```
User Input
    ↓
setSearchTerm(value)
    ↓
useCallback dependency triggered
    ↓
Check min length (> 2 characters)
    ↓
setLoading(true)
    ↓
fetch(/api/customers/search?name={term})
    ↓
setSearchResults(data)
setLoading(false)
    ↓
Map results to ResultCard components
    ↓
Display expandable cards
```

**Backend Search Query:**

```typescript
// Prisma query
const customers = await prisma.customer.findMany({
  where: {
    AND: [
      { deletedAt: null },                    // Soft delete filter
      {
        OR: [                                  // Search in 3 fields
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } }
        ]
      }
    ]
  },
  take: 10,                                   // Limit results
  include: {
    lessonParticipants: {
      take: 5,                                // Last 5 lessons
      orderBy: { lesson: { createdAt: 'desc' } },
      include: {
        lesson: {
          include: {
            instructor: true,
            location: true
          }
        }
      }
    }
  }
});
```

**SQL Generated by Prisma:**
```sql
SELECT 
  c.*,
  lp.*, l.*, u.*, loc.*
FROM customers c
LEFT JOIN lesson_participants lp ON c.id = lp."customerId"
LEFT JOIN lessons l ON lp."lessonId" = l.id
LEFT JOIN users u ON l."instructorId" = u.id
LEFT JOIN locations loc ON l."locationId" = loc.id
WHERE c."deletedAt" IS NULL
  AND (
    c."firstName" ILIKE $1
    OR c."lastName" ILIKE $1
    OR c.email ILIKE $1
  )
ORDER BY l."createdAt" DESC
LIMIT 10;
```

### Query Optimization

**N+1 Query Problem (Solved with `include`):**
```typescript
// ❌ Bad: N+1 queries
const customers = await prisma.customer.findMany();
for (const customer of customers) {
  customer.lessons = await prisma.lesson.findMany({
    where: { participants: { some: { customerId: customer.id } } }
  });
}
// Total: 1 + N queries

// ✅ Good: 1 query with include
const customers = await prisma.customer.findMany({
  include: {
    lessonParticipants: { include: { lesson: true } }
  }
});
// Total: 1 query with join
```

**Field Selection Optimization:**
```typescript
// ✅ Only fetch needed fields
const customers = await prisma.customer.findMany({
  select: {
    id: true,
    firstName: true,
    lastName: true,
    email: true
    // Don't select phone if not needed
  }
});
```

---

## Internationalization (i18n) Architecture

### Implementation Pattern

**1. Locale Routing (Next.js Middleware)**

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Check if pathname already has locale
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (!pathnameHasLocale) {
    // Redirect to default locale
    return NextResponse.redirect(
      new URL(`/en${pathname}`, request.url)
    );
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};
```

**2. Message Catalogs**

Stored in `/messages/{locale}.json`:

```json
{
  "Common": {
    "search": "Search",
    "delete": "Delete",
    "edit": "Edit",
    "save": "Save",
    "cancel": "Cancel"
  },
  "CustomerSearch": {
    "placeholder": "Search by name or email",
    "noResults": "No customers found",
    "lessonsCount": "Number of Lessons",
    "customerFeedback": "Customer Feedback"
  },
  "HomePage": {
    "title": "Record Management System",
    "addRecord": "Add Record",
    "exportCSV": "Export CSV",
    "importCSV": "Import CSV"
  }
}
```

**3. Component Usage**

```typescript
import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations();

  return (
    <div>
      <h1>{t('HomePage.title')}</h1>
      <button>{t('HomePage.addRecord')}</button>
      <input placeholder={t('CustomerSearch.placeholder')} />
    </div>
  );
}
```

**4. Locale-Specific Layout**

```typescript
// app/[locale]/layout.tsx
export default function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  return (
    <html lang={params.locale}>
      <body>
        <NextIntlClientProvider messages={messages[params.locale]}>
          <Header />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**5. Language Switcher**

```typescript
// LanguageSwitcher.tsx
export function LanguageSwitcher() {
  const pathname = usePathname();
  const router = useRouter();

  const switchLanguage = (newLocale: string) => {
    const newPath = pathname.replace(/^\/(en|ko)/, `/${newLocale}`);
    router.push(newPath);
  };

  return (
    <div>
      <button onClick={() => switchLanguage('en')}>English</button>
      <button onClick={() => switchLanguage('ko')}>한국어</button>
    </div>
  );
}
```

### Supported Languages

**English (en)**
- Default language
- All labels, errors, messages in English

**Korean (한국어)**
- Full Korean translations
- Proper terminology (e.g., "레슨 횟수" = "Lessons Count")
- Korean date formatting (if implemented)

### Translation Keys Structure

```
{
  "Common": {/*Shared labels*/},
  "Auth": {/*Login labels*/},
  "HomePage": {/*Main page*/},
  "CustomerSearch": {/*Search/results*/},
  "AddRecord": {/*Lesson form*/},
  "Dialogs": {/*Modal labels*/},
  "CSVImport": {/*Import/export labels*/},
  "UserManagement": {/*User CRUD labels*/},
  "LocationManagement": {/*Location labels*/},
  "Errors": {/*Error messages*/},
  "Validation": {/*Form validation messages*/}
}
```

---

## Data Flow Diagrams

### Customer Creation Flow

```
┌─────────────────────────────────────────────────────────────┐
│ CSV Import                                                  │
├─────────────────────────────────────────────────────────────┤
│ 1. Upload file to /api/import-csv                           │
│ 2. Parse XLSX into rows                                     │
│ 3. Normalize headers                                        │
│ 4. Extract customer row:                                    │
│    { firstName: "John", lastName: "Doe", email: "..." }     │
│ 5. Deduplicate via Map (if duplicate in import, skip)       │
│ 6. Batch chunk: collect 50 customers                        │
│ 7. Execute:                                                 │
│    prisma.customer.createMany({                             │
│      data: [{...}, {...}, ...],                             │
│      skipDuplicates: true  // ignore db conflicts           │
│    })                                                       │
│ 8. Return success count                                     │
└─────────────────────────────────────────────────────────────┘
```

### Lesson Search & Display Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User Types Search Term                                       │
│    Customer Search: "John"                                      │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Frontend Handler                                             │
│    useCallback → fetch(/api/customers/search?name=John)        │
│    setLoading(true)                                            │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. API Route Handler (/api/customers/search)                   │
│    - Verify JWT token                                          │
│    - Extract search term: "John"                               │
│    - Build Prisma query                                        │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Prisma Query Construction                                    │
│    findMany({                                                   │
│      where: {                                                   │
│        AND: [                                                   │
│          { deletedAt: null },                                   │
│          { OR: [                                                │
│            { firstName: { contains: "John", mode: ... } },      │
│            { lastName: { contains: "John", mode: ... } },       │
│            { email: { contains: "John", mode: ... } }           │
│          ]}                                                     │
│        ]                                                        │
│      },                                                         │
│      take: 10,                                                  │
│      include: { lessonParticipants: { ... } }                  │
│    })                                                           │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Generated SQL                                                │
│    SELECT c.*, lp.*, l.*, u.*, loc.*                           │
│    FROM customers c                                            │
│    LEFT JOIN lesson_participants lp USING (customerId)        │
│    LEFT JOIN lessons l USING (lessonId)                       │
│    LEFT JOIN users u ON l.instructorId = u.id                 │
│    LEFT JOIN locations loc ON l.locationId = loc.id          │
│    WHERE c.deletedAt IS NULL                                   │
│      AND (c.firstName ILIKE '%John%'                           │
│           OR c.lastName ILIKE '%John%'                         │
│           OR c.email ILIKE '%John%')                           │
│    LIMIT 10;                                                    │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Database Execution                                           │
│    - Query engine optimizes plan                               │
│    - Indexes used (if available)                               │
│    - Rows fetched                                              │
│    - Results returned to Prisma                                │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. Prisma Result Mapping                                        │
│    Raw SQL rows → JavaScript objects                           │
│    Relationships resolved (lessonParticipants with lessons)    │
│    Type checking (TypeScript)                                  │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. API Response                                                 │
│    JSON.stringify([                                             │
│      {                                                          │
│        id: "cuid_...",                                          │
│        firstName: "John",                                       │
│        lastName: "Doe",                                         │
│        email: "john@...",                                       │
│        lessonParticipants: [                                    │
│          {                                                      │
│            lesson: {                                            │
│              id: "...",                                         │
│              lessonType: "Group",                               │
│              contentful: "...",                                 │
│              createdAt: "2026-01-15T...",                       │
│              instructor: {...},                                │
│              location: {...}                                   │
│            },                                                   │
│            customerSymptoms: "...",                             │
│            customerImprovements: "..."                          │
│          }                                                      │
│        ]                                                        │
│      }                                                          │
│    ])                                                           │
│    Response code: 200 OK                                       │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. Frontend Receives Response                                   │
│    setSearchResults(data)                                      │
│    setLoading(false)                                           │
│    state.searchResults = [...]                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. Component Re-render                                         │
│     searchResults.map(customer => (                             │
│       <ResultCard key={customer.id}>                            │
│         <h3>{customer.firstName} {customer.lastName}</h3>      │
│         <p>{customer.email}</p>                                │
│         <button onClick={() => setShowDetails(true)}>View</button>
│       </ResultCard>                                             │
│     ))                                                          │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ 11. User Interaction                                            │
│     Click on customer name                                      │
│     setSelectedCustomer(customer)                               │
│     Open CustomerDetailsModal                                   │
│     Display full lesson history                                │
└─────────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
                    ┌─────────────────────┐
                    │  Login Page         │
                    │  username/password  │
                    └──────────┬──────────┘
                              ↓
                    ┌─────────────────────┐
                    │  POST /api/auth/login
                    │  { username, pwd }  │
                    └──────────┬──────────┘
                              ↓
        ┌───────────────────────────────────────────┐
        │ API Route Handler                         │
        │ 1. Verify JWT middleware (if exists)     │
        │ 2. Extract username/password from body   │
        │ 3. Call prisma.user.findUnique({username})
        │ 4. User not found → 401 error            │
        └─────────────────────────────────────────┬─┘
                              ↓
        ┌───────────────────────────────────────────────────┐
        │ Password Verification                             │
        │ bcrypt.compare(inputPassword, storedHashedPwd)   │
        │ If no match → 401 error                          │
        └────────────────────────────────────────┬──────────┘
                              ↓
        ┌───────────────────────────────────────────────────────┐
        │ JWT Token Generation                                  │
        │ payload = { userId, role, iat, exp }                 │
        │ token = jwt.sign(payload, SECRET_KEY)                │
        │ token = "eyJhbGc..." (long encoded string)           │
        └────────────────────────────────────────┬──────────────┘
                              ↓
        ┌───────────────────────────────────────────────────────┐
        │ Set HTTP-Only Cookie                                  │
        │ response.cookies.set('token', token, {                │
        │   httpOnly: true,   // JS can't access              │
        │   secure: true,     // HTTPS only                    │
        │   maxAge: 86400000  // 24 hours                      │
        │ })                                                    │
        └────────────────────────────────────────┬──────────────┘
                              ↓
        ┌───────────────────────────────────────────────────────┐
        │ Response                                              │
        │ 200 OK {                                              │
        │   user: { id, username, role },                      │
        │   redirect: "/en" (or /ko)                           │
        │ }                                                     │
        │ Set-Cookie: token=eyJ...; HttpOnly; Secure; ...      │
        └────────────────────────────────────────┬──────────────┘
                              ↓
        ┌───────────────────────────────────────────────────────┐
        │ Browser                                               │
        │ 1. Receives Set-Cookie header                         │
        │ 2. Stores cookie in secure storage                    │
        │ 3. Automatically includes in future requests          │
        │ 4. Redirects to dashboard                             │
        │ 5. Cookie sent as: Cookie: token=eyJ...              │
        └────────────────────────────────────────┬──────────────┘
                              ↓
        ┌───────────────────────────────────────────────────────┐
        │ Protected Route Request                               │
        │ GET /api/customers                                    │
        │ Cookie: token=eyJ... (sent automatically)            │
        │                                                       │
        │ API checks:                                           │
        │ 1. Extract token from request.cookies.get('token')   │
        │ 2. Verify JWT: jwt.verify(token, SECRET_KEY)        │
        │ 3. If valid: decoded = { userId, role, ... }        │
        │ 4. If invalid/expired: 401 error                     │
        │ 5. Proceed with request using userId from token     │
        └───────────────────────────────────────────────────────┘
```

---

## Error Handling Strategy

### Error Hierarchy

```
┌─────────────────────────────────┐
│ Network Error                   │ Client can't reach server
├─────────────────────────────────┤
│ HTTP Errors (4xx, 5xx)          │ Server responds with error
├─ 400 Bad Request               │ Validation failed
├─ 401 Unauthorized              │ JWT missing/invalid
├─ 403 Forbidden                 │ Insufficient permissions
├─ 404 Not Found                 │ Resource doesn't exist
├─ 409 Conflict                  │ Duplicate/constraint violation
├─ 429 Too Many Requests         │ Rate limited
└─ 500 Internal Server Error     │ Unexpected server error
│
├─────────────────────────────────┤
│ Business Logic Errors           │
├─ CSV parsing errors             │ Invalid file format
├─ Database transaction errors    │ Concurrent modification
└─ Validation errors              │ Data doesn't meet requirements
│
├─────────────────────────────────┤
│ Component Errors                │ Frontend state issues
├─ State update errors            │ React state problems
├─ Form validation errors         │ User input validation
└─ Display errors                 │ Rendering issues
└─────────────────────────────────┘
```

### API Error Response Format

```typescript
{
  error: string;           // User-friendly message
  code: string;            // Machine-readable error code
  statusCode: number;      // HTTP status code
  details?: Record<string, string>;  // Field-level errors
  timestamp: string;       // ISO timestamp
}

// Example validation error
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "statusCode": 400,
  "details": {
    "firstName": "First name is required",
    "email": "Invalid email format"
  },
  "timestamp": "2026-02-24T10:00:00Z"
}

// Example auth error
{
  "error": "Invalid credentials",
  "code": "INVALID_CREDENTIALS",
  "statusCode": 401,
  "timestamp": "2026-02-24T10:00:00Z"
}
```

### Frontend Error Handling

```typescript
// Try-catch pattern
try {
  const response = await fetch('/api/customers/search?name=John');
  
  if (!response.ok) {
    const error = await response.json();
    // error = { error: "...", code: "...", statusCode: ... }
    setError(error.error);  // Show user-friendly message
    return;
  }
  
  const data = await response.json();
  setSearchResults(data);
  
} catch (err: unknown) {
  if (err instanceof Error) {
    setError(`Network error: ${err.message}`);
  } else {
    setError('Unknown error occurred');
  }
}
```

### Database Error Handling

```typescript
// Prisma provides specific error codes
import { Prisma } from '@prisma/client';

try {
  await prisma.customer.create({ data: {...} });
  
} catch (err) {
  if (err instanceof Prisma.PrismaClientUniqueConstraintViolationError) {
    // Duplicate email
    return Response.json(
      { error: 'Email already exists', code: 'DUPLICATE_EMAIL' },
      { status: 409 }
    );
  }
  
  if (err instanceof Prisma.PrismaClientValidationError) {
    // Invalid field type
    return Response.json(
      { error: 'Invalid data', code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }
  
  // Unknown error
  return Response.json(
    { error: 'Database error', code: 'DB_ERROR' },
    { status: 500 }
  );
}
```

---

## Performance Architecture

### Database Performance

**Connection Pooling:**
- Pooled (pgbouncer): Max connections
- Connection reuse reduces overhead
- Automatic connection cleanup

**Query Optimization:**
```typescript
// ❌ Slow: No indexes, OR conditions evaluated
SELECT * FROM customers
WHERE firstName LIKE '%john%'
   OR lastName LIKE '%john%'
   OR email LIKE '%john%'

// ✅ Fast: Multiple indexed columns with OR
CREATE INDEX idx_customer_firstname ON customers(firstName);
CREATE INDEX idx_customer_lastname ON customers(lastName);
CREATE INDEX idx_customer_email ON customers(email);

SELECT * FROM customers
WHERE firstName ILIKE $1
   OR lastName ILIKE $1
   OR email ILIKE $1
```

**Pagination (Future):**
```typescript
// Instead of loading all customers
const customers = await prisma.customer.findMany({
  where: { deletedAt: null },
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: 'desc' }
});
```

### CSV Import Performance

**Batch Processing:**
- 50 rows per batch = ~17 batches for 1000 rows
- Each batch = 1 database transaction
- ~10× faster than 1 row per transaction

**Deduplication:**
- In-memory Maps (O(1) lookup)
- Prevents database constraint violations
- Reduces unnecessary inserts

**Memory Management:**
- XLSX.read() loads entire file into memory
- For large files (>10MB): Could stream instead
- Current: File size limit not enforced (could add)

### Frontend Performance

**Code Splitting:**
- Next.js automatic per-route splitting
- Only loaded code for current page

**CSS Optimization:**
- Tailwind tree-shaking
- Only used utilities in final build

**Image Optimization:**
- Next.js next/image component
- Automatic LQIP (low-quality image placeholders)
- Responsive sizing
- WebP format where supported

---

## Security Architecture

### Authentication Security

**JWT Validation:**
```typescript
// Verify signature (prevents tampering)
try {
  const decoded = verify(token, SECRET);
} catch {
  // Token invalid, expired, or tampered with
  return 401;
}

// Check expiration
if (decoded.exp * 1000 < Date.now()) {
  return 401;  // Token expired
}
```

**HTTPS Only:**
```typescript
response.cookies.set('token', token, {
  httpOnly: true,  // JS can't access (XSS protection)
  secure: true,    // HTTPS only (MITM protection)
  sameSite: 'strict'  // CSRF protection
})
```

### SQL Injection Prevention

**Prisma Parameterized Queries:**
```typescript
// ❌ Vulnerable
const query = `SELECT * FROM customers WHERE email = '${email}'`;
// If email = "'; DROP TABLE customers; --" → SQL injection

// ✅ Safe with Prisma
await prisma.customer.findUnique({
  where: { email }
});
// Prisma automatically parameterizes: $1, $2, etc.
```

### Authorization Enforcement

**Role-Based Access Control:**
```typescript
const token = verify(request.cookies.get('token')?.value, SECRET);

// Manager only
if (request.method === 'DELETE' && token.role !== 'MANAGER') {
  return 403;
}

// All logged-in users
if (!token) {
  return 401;
}
```

**Scope-Limited Queries:**
```typescript
// Prevent users from seeing deleted customers
const customers = await prisma.customer.findMany({
  where: { deletedAt: null }  // Always enforced
});
```

### Input Validation

**Whitelist Validation:**
```typescript
const role = input.role.toUpperCase();

if (!['MANAGER', 'INSTRUCTOR'].includes(role)) {
  return { error: 'Invalid role' };
}
```

**Length Limits:**
```typescript
if (firstName.length > 100) {
  return { error: 'First name too long' };
}
```

**Email Validation:**
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!emailRegex.test(email)) {
  return { error: 'Invalid email' };
}
```

---

## Deployment Architecture

### Application Structure

```
Production Environment (Vercel, AWS, or self-hosted)
│
├─ Frontend Assets
│   ├─ JavaScript bundles
│   ├─ CSS files (Tailwind)
│   ├─ Images & static files
│   └─ Served from CDN (global)
│
├─ Next.js Server
│   ├─ App Router
│   ├─ API Routes (serverless or Node.js)
│   ├─ i18n middleware
│   └─ SSR rendering
│
└─ Database Connection
    ├─ DATABASE_URL (pooled)
    ├─ DIRECT_URL (for migrations)
    └─ SSL/TLS encrypted
```

### Build Process

```
1. Code Push to GitHub
   ├─ Trigger deployment pipeline
   └─ Run tests (if configured)
        ↓
2. Install Dependencies
   ├─ npm install
   └─ Download packages from npm registry
        ↓
3. Build Next.js App
   ├─ npm run build
   ├─ TypeScript compilation
   ├─ Route optimization
   ├─ Tailwind CSS generation
   └─ Output: .next/ folder
        ↓
4. Database Migrations
   ├─ npx prisma migrate deploy
   ├─ Apply pending migrations
   └─ Using DIRECT_URL (no pgbouncer)
        ↓
5. Deploy to Hosting
   ├─ Upload optimized build
   ├─ Set environment variables
   └─ Configure custom domain
        ↓
6. Health Check
   ├─ GET /api/health/db
   ├─ Verify database connection
   └─ Smoke tests
```

### Environment Configuration

**Development (.env.local):**
```env
DATABASE_URL="postgresql://localhost/ankh"
DIRECT_URL="postgresql://localhost/ankh"
NODE_ENV="development"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

**Production (.env.production):**
```env
DATABASE_URL="postgresql://user:pass@db.supabase.co/postgres?schema=public&sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://user:pass@db.supabase.co/postgres?schema=public&sslmode=require"
NODE_ENV="production"
NEXT_PUBLIC_SITE_URL="https://ankh-record.example.com"
```

### Monitoring & Logging

**Application Monitoring:**
```
- Response times (each API endpoint)
- Error rates (4xx, 5xx)
- Request volume
- Database query performance
```

**Error Tracking:**
```
- Sentry (or similar)
- Catches unhandled errors
- Sends alerts for production issues
- Groups similar errors
```

**Database Monitoring:**
```
- Query execution time
- Slow query logs
- Connection pool utilization
- Disk space usage
```

---

## Development Workflow

### Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/DvbyDt/Ankh-Client-Record-DB.git
cd ankh-client-app

# 2. Install dependencies
npm install

# 3. Create .env.local with credentials
echo "DATABASE_URL=..." > .env.local
echo "DIRECT_URL=..." >> .env.local

# 4. Set up database
npx prisma migrate dev

# 5. (Optional) Seed test data
npx prisma db seed

# 6. Start development server
npm run dev

# 7. Open http://localhost:3000
```

### Making Changes

**Frontend Change:**
```bash
# 1. Edit component in src/app/[locale]/page.tsx
# 2. Hot module reload (automatic)
# 3. Changes visible immediately in browser
```

**API Route Change:**
```bash
# 1. Edit route in src/app/api/*/route.ts
# 2. Restart dev server (if needed)
# 3. Test in Postman or fetch()
```

**Database Schema Change:**
```bash
# 1. Update src/prisma/schema.prisma
# 2. Create migration:
npx prisma migrate dev --name describe_change
# 3. Review generated SQL in migrations/ folder
# 4. Migration applied automatically
# 5. Client types regenerated
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes
git add .
git commit -m "feat: Add new feature"

# Push to GitHub
git push origin feature/my-feature

# Create Pull Request (on GitHub.com)
# - Description should explain changes & why
# - Link to related issues

# After review and approval:
git merge --squash feature/my-feature
git push origin main

# Delete feature branch
git branch -d feature/my-feature
```

---

## Conclusion

This Ankh Client Record Database represents a production-grade full-stack application with the following architectural strengths:

1. **Separation of Concerns**: Clear layers (presentation, API, data, database)
2. **Type Safety**: TypeScript throughout for compile-time error detection
3. **Scalability**: Batch processing, connection pooling, indexed queries
4. **Security**: JWT auth, RBAC, SQL injection prevention, soft deletes
5. **Internationalization**: Multi-language support via next-intl
6. **Maintainability**: Clear code organization, documentation, testing hooks
7. **Performance**: Optimized queries, CSS/JS splitting, image optimization
8. **Reliability**: Error handling, validation, transaction management

The architecture supports current requirements while providing foundation for future features like reporting dashboards, advanced filtering, mobile app, and real-time updates.
