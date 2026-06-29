# CSAT Tool — Frontend

React + TypeScript frontend for Mindteck's Quality Feedback Portal. Lets Quality, Delivery, and Sales users send CSAT feedback forms to customers, track responses, and view dashboards. Customer survey forms are public (no login required).

## Stack

| Layer | Library | Version |
|---|---|---|
| Framework | React + TypeScript | 18 / 5.3 |
| Build | Vite | 5.0 |
| Routing | React Router | v6 |
| Server state | TanStack Query (React Query) | v5 |
| Client state | Zustand (persisted) | 4.4 |
| HTTP | Axios | 1.6 |
| Validation | Zod | 3.22 |
| Styling | Tailwind CSS + inline styles | 3.4 |

No external UI component library — all components are hand-built.

## Prerequisites

- Node.js 18+
- Backend running at `http://localhost:8000`

## Getting started

```bash
cd frontend
npm install
cp .env.example .env      # set VITE_API_URL if backend is not on :8000
npm run dev               # http://localhost:3000
```

## Environment variables

```bash
# .env
VITE_API_URL=http://localhost:8000
```

Only one variable is required. Everything else is hardcoded in `src/utils/constants.ts`.

## Project structure

```
src/
├── main.tsx                    # Mounts React, wraps in QueryClientProvider 
├── App.tsx                     # All routes + auth guards
│
├── pages/
│   ├── home/                   # Public landing page (/)
│   ├── auth/                   # Login, Register, Unauthorized
│   ├── dashboard/              # QualityUserDashboard (QUALITY, DELIVERY, SALES)
│   ├── reports/                # ManagementDashboard + ReportsPage (DELIVERY, SALES)
│   ├── projects/               # ProjectListPage, ProjectDetailPage
│   ├── feedback/               # FeedbackRequestListPage, SendFeedbackPage, CustomerSurveyPage
│   ├── csat-cycles/            # CsatCycleListPage, Detail, Create
│   ├── action-plans/           # ActionPlanListPage, ActionPlanDetailPage
│   └── admin/                  # UserManagementPage, AuditLogsPage (QUALITY only)
│
├── components/
│   ├── common/
│   │   ├── AuthInitializer.tsx     # Calls /api/auth/me on startup; blocks render until resolved
│   │   ├── ProtectedRoute.tsx      # Redirects unauthenticated users to /login
│   │   └── RoleProtectedRoute.tsx  # Redirects to /unauthorized if role not allowed
│   ├── layout/                 # Sidebar, Navbar, PageWrapper
│   ├── dashboard/              # KPI cards, charts
│   └── feedback/               # FeedbackTable and related
│
├── hooks/
│   ├── useAuth.ts              # login / logout mutations + currentUser query
│   ├── useDashboard.ts         # getMetrics (auto-refetch every 60 s)
│   ├── useFeedback.ts          # listRequests, submitFeedback
│   └── useProjects.ts          # list, listCompleted, getById, getStatus, getProjectPeople
│
├── api/
│   ├── client.ts               # Axios instance, request/response interceptors
│   ├── auth.api.ts             # login, logout, getCurrentUser (/api/auth/me)
│   ├── projects.api.ts         # TMS project endpoints + peopleApi
│   ├── feedback.api.ts         # Feedback requests + public survey endpoints
│   ├── dashboard.api.ts        # Dashboard metrics
│   ├── csat-cycles.api.ts      # CSAT cycle CRUD
│   └── reports.api.ts          # Report export endpoints
│
├── store/
│   ├── auth.store.ts           # Zustand: user, accessToken, refreshToken, hasRole, hasPermission
│   └── filter.store.ts         # Shared filter state across pages
│
├── types/
│   ├── auth.types.ts           # User, UserRole enum, LoginRequest, MeResponse
│   ├── project.types.ts        # TMSProject and related
│   ├── feedback.types.ts       # FeedbackRequest, FeedbackResponse, FeedbackSubmission
│   ├── dashboard.types.ts      # DashboardMetrics
│   └── common.types.ts         # Shared pagination, API response wrappers
│
└── utils/
    ├── constants.ts            # ROUTES, USER_ROLES, FEEDBACK_STATUS, BRAND colours
    ├── formatters.ts           # Date, number formatting helpers
    └── validators.ts           # Zod schemas
```

## Roles and access

| Role | Default landing | What they can access |
|---|---|---|
| `QUALITY` | `/admin` → `/dashboard` | Everything including admin pages |
| `MANAGER` | `/admin` → `/dashboard` | Everything including admin pages |
| `DELIVERY` | `/dashboard` | Dashboard, Projects, Feedback, Reports, Action Plans |
| `SALES` | `/reports` | Reports, Dashboard, Projects, Feedback, Action Plans |
| `CUSTOMER` | — (no portal login) | `/survey/:token` only — public, no auth |

Roles are defined in `src/types/auth.types.ts` (`UserRole` enum) and must match the backend exactly.

## Authentication flow

1. User submits credentials → `authApi.login()` → backend returns `access_token` + `refresh_token`
2. `useAuth` hook immediately calls `authApi.getCurrentUser(access_token)` to get the full user object (role, permissions, `defaultRoute`)
3. Both tokens + user are stored in Zustand (`auth-storage` key in `localStorage`)
4. User is navigated to `user.defaultRoute` from the backend response (falls back to `ROLE_REDIRECT` map in `useAuth.ts`)
5. On every page load, `AuthInitializer` calls `/api/auth/me` to rehydrate auth state before rendering any protected content — prevents wrong-page flash on refresh
6. Axios request interceptor attaches `Bearer <accessToken>` to every request. It skips overwriting if the caller already set an `Authorization` header (important for the post-login `/api/auth/me` call where the store hasn't been updated yet)
7. On 401, the response interceptor attempts a silent token refresh via `/api/auth/refresh`. If that fails, `clearAuth()` is called and the user is sent to `/login`

> **Known quirk:** login errors previously caused a page reload because the 401 from a failed login was triggering the refresh flow. This is fixed by `isPublicAuthRequest()` in `client.ts` — auth paths are skipped by the 401 handler entirely.

## Data fetching

All server state goes through TanStack Query. The pattern is:

```
Page/Component
    ↓ calls
Hook  (useProjects, useFeedback…)     ← owns queryKey, enabled flag, staleTime
    ↓ calls
API file  (projects.api.ts…)          ← knows the URL and request shape
    ↓ uses
client.ts                             ← axios instance with auth + refresh interceptors
```

Default `staleTime` is 5 minutes (set in `queryClient` in `client.ts`). Dashboard metrics refetch every 60 seconds. Never call `api.*` directly from a component — always go through a hook.

## State management

**Zustand** (`auth.store.ts`) holds auth state and is persisted to `localStorage` under the key `auth-storage`. Two helper methods are available anywhere:

```typescript
const { hasRole, hasPermission } = useAuthStore();

hasRole(UserRole.QUALITY)                        // true/false
hasRole([UserRole.QUALITY, UserRole.DELIVERY])   // either role
hasPermission('send_feedback')                   // checks role-based permission map
```

`filter.store.ts` holds shared filter state (date range, project, cycle) so filter changes on one page persist when navigating away and back.

## Route guards

Two components in `src/components/common/`:

- `ProtectedRoute` — redirects to `/login` if not authenticated
- `RoleProtectedRoute` — redirects to `/unauthorized` if the user's role isn't in `allowedRoles`

They are always nested: `ProtectedRoute` wraps `RoleProtectedRoute`.

```tsx
<ProtectedRoute>
  <RoleProtectedRoute allowedRoles={[UserRole.QUALITY]}>
    <AdminPage />
  </RoleProtectedRoute>
</ProtectedRoute>
```

## Key pages

### SendFeedbackPage (`/feedback/send`)
A 3-step wizard: select a completed TMS project → enter recipient name + email + optional message → review and send. Navigating from a project detail page with `?project_id=X` pre-selects that project. On submit it calls `POST /api/feedback/requests`.

### CustomerSurveyPage (`/survey/:token`)
Fully public — no auth required. Renders the feedback form for a tokenized link sent to a customer. With no token in the URL it shows a "check your inbox" message. On submission it calls `POST /api/public/feedback/:token/submit`.

### QualityUserDashboard (`/dashboard`)
KPI cards (forms sent, submitted, pending, expired, avg CSAT, response rate), recent feedback requests table, quick Send Form card, and all-projects table. Data from `useDashboard()`, `useFeedbackRequests()`, and `useCompletedProjects()`.

## Brand / design system

All colours live in `BRAND` in `src/utils/constants.ts`. There is no Tailwind config for these — they are used as inline styles throughout the codebase. If you need to update a colour, change it there and it propagates everywhere.

```typescript
BRAND.green      // #1A5C3A  — primary
BRAND.gold       // #9B7C2A  — accent
BRAND.surface    // #F7F9F8  — page background
BRAND.border     // #D4E4DA
BRAND.textDark   // #1A2E22
```

## Feedback status lifecycle

Statuses are defined in `FEEDBACK_STATUS` in `constants.ts` and must match the backend enum exactly:

`ELIGIBLE → DRAFT → SENT → OPENED → SUBMITTED`
`SENT → REMINDER_SENT → EXPIRED / CANCELLED / FAILED`

Status badge colours and labels are defined in `STATUS_META` inside `QualityUserDashboard.tsx` and `SendFeedbackPage.tsx`.

## Adding a new page

1. Create `src/pages/feature/FeaturePage.tsx`
2. Add the route in `App.tsx` wrapped in the appropriate guards
3. Add the nav link in `src/components/layout/Sidebar.tsx`
4. If it needs data: add `src/api/feature.api.ts` → `src/hooks/useFeature.ts` → use the hook in the page

## Adding a new API endpoint

1. Add the function to the relevant `src/api/*.api.ts` file
2. Add or extend the hook in `src/hooks/`
3. Use the hook in the component — never call `api.*` directly from UI code

## Scripts

```bash
npm run dev          # dev server on :3000 with HMR
npm run build        # tsc + vite build → dist/
npm run preview      # preview the production build
npm run type-check   # tsc --noEmit (no emit, just type errors)
npm run lint         # eslint on src/
npm run format       # prettier on src/**/*.{ts,tsx,css}
```

## Common issues

**Login 401 causes page reload** — fixed in `client.ts` via `isPublicAuthRequest()`. If you see it again, check that the login endpoint path is in `PUBLIC_AUTH_PATHS`.

**Wrong page shown on refresh** — `AuthInitializer` handles this. If you bypass it or add routes outside its scope, you'll get a flash of the wrong page before the redirect fires.

**TypeScript error on `user.role`** — make sure the `UserRole` enum value you're using matches the string the backend actually sends. The enum lives in `auth.types.ts`.

**TMS projects not loading** — the projects API hits the TMS database via the backend's sync endpoints. If the backend can't reach TMS, `useCompletedProjects` will return an error. Check the backend logs.

**`BRAND.gold` looks different to the sidebar** — the sidebar uses `#C9A84C` directly in some older components. `BRAND.gold` is `#9B7C2A` (darker, for text). Use `BRAND.goldLight` (`#C4A44A`) for decorative gold elements.