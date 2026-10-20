# Architecture Codemap

High-level map of the College Portal system. For module-level details see
[MODULES.md](MODULES.md), and for a file-by-file inventory see
[FILES.md](FILES.md).

## System overview

College Portal is a monolith with a clean-architecture backend and a React SPA
frontend. It aggregates data from two external systems (the electronic diary
and the college schedule API) and adds portal-native features: news, comments,
assignments, clubs with chat, a college map, profiles, ratings and granular
administration.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Browser / PWA                                                          │
│  React 19 + TypeScript + Vite + TanStack Query + Axios                 │
│  Auth: HttpOnly access/refresh cookies, silent refresh on 401          │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ HTTPS, cookies, JSON
┌───────────────────────────────▼────────────────────────────────────────┐
│ Reverse proxy / static host (nginx in web image, optional Caddy/Tunnel)│
│  Serves SPA, proxies /api/* to the API container                       │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ /api
┌───────────────────────────────▼────────────────────────────────────────┐
│ CollegePortal.Api (ASP.NET Core 10)                                    │
│  Controllers → middleware pipeline → JWT auth → permission policies    │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ interfaces from Application
┌───────────────────────────────▼────────────────────────────────────────┐
│ CollegePortal.Infrastructure                                           │
│  EF Core + PostgreSQL, Identity stores, external API clients, services │
└───────────────┬────────────────────────────────┬───────────────────────┘
                │                                │
┌───────────────▼──────────────┐  ┌──────────────▼───────────────────────┐
│ CollegePortal.Application    │  │ CollegePortal.Domain                 │
│  Service interfaces, DTOs,   │  │  Entities, enums, domain constants   │
│  activity windows            │  │  (no dependencies)                   │
└──────────────────────────────┘  └──────────────────────────────────────┘

External systems
  spo.rso23.ru          electronic diary: login, schedule, grades,
                        performance, account settings (cookie based)
  kkepik.rub1kub.ru     public schedule API: groups, teachers, audiences,
                        schedule, catalog (rate limited, no auth)
  gosuslugi staff page  staff directory scrape used to enrich teachers
```

## Layer dependency rules

| Project | May depend on | Responsibility |
|---|---|---|
| `CollegePortal.Domain` | nothing | Entities and enums |
| `CollegePortal.Application` | Domain | Service contracts, DTOs, shared constants |
| `CollegePortal.Infrastructure` | Application, Domain | Implementations, EF Core, Identity, external clients |
| `CollegePortal.Api` | Infrastructure, Application, Domain | HTTP surface, middleware, DI composition, seeding |
| `CollegePortal.Tests` | all projects | Integration/unit tests |
| `college-portal-client` | Backend over HTTP only | SPA, types, API adapters, UI |

Dependency inversion is used throughout: controllers depend on
`CollegePortal.Application/Services/I*Service.cs`, and Infrastructure supplies
the implementations registered in
`CollegePortal.Infrastructure/Extensions/ServiceCollectionExtensions.cs`.

## Request pipeline

Order defined in `CollegePortal.Api/Program.cs`:

```
ForwardedHeaders
→ ResponseCompression
→ Swagger (Development only)
→ HttpsRedirection / HSTS (Production)
→ SecurityHeadersMiddleware
→ CORS ("Client")
→ RateLimiter ("auth" fixed window: 10 req/min per IP)
→ Authentication (JWT from HttpOnly cookie "cp_access")
→ BannedUsersMiddleware (IsActive + security-stamp check)
→ ActivityTrackerMiddleware (debounced LastActivityAt write)
→ Authorization (role and Permission.* policies)
→ Controllers
```

Startup also seeds the `Student`/`Admin` roles, the bootstrap admin from
configuration and configured primary/protected admins. `Database:AutoMigrate`
applies EF migrations with retry when enabled (container deployments).

## Authentication and authorization

1. `POST /api/auth/login` or `/api/auth/diary-login` authenticates via
   ASP.NET Core Identity or the diary, then issues:
   - short-lived JWT in the `cp_access` HttpOnly cookie (also contains the
     `sstamp` security-stamp claim),
   - long-lived refresh token in an HttpOnly cookie scoped to `/api/auth`,
     stored as a hash in `RefreshTokens`.
2. `POST /api/auth/refresh` rotates the refresh token and re-issues both cookies.
3. The SPA never reads tokens. On a `401` the Axios interceptor in
   `college-portal-client/src/services/api.ts` calls `/auth/refresh` once and
   retries queued requests; a failed refresh emits `auth:unauthorized`.
4. `BannedUsersMiddleware` rejects banned users and stale security stamps, so
   bans, logout and role changes revoke access immediately.
5. Authorization is role-based (`AdminOnly`, `StudentOnly`) plus granular
   policies `Permission.<Permission>` backed by `PermissionRequirement` and
   `PermissionAuthorizationHandler`. Full admins implicitly hold all
   permissions; other users receive explicit `UserPermission` rows.

Permission enum (`CollegePortal.Domain/Enums/Permission.cs`):
`UsersManage`, `NewsManage`, `AssignmentsManage`, `ClubsManage`,
`CollegeInfoManage`, `MapManage`, `AuditView`.

## Endpoint map

| Area | Route prefix | Controller | Notes |
|---|---|---|---|
| Auth | `/api/auth` | `AuthController` | login, diary-login, refresh, diary-relogin, logout, me, claim-primary-admin; rate limited |
| Permissions | `/api/permissions/me` | `PermissionsController` | effective permissions of current user |
| Profile | `/api/profile` | `ProfileController` | own profile, public profile, update, avatar |
| Schedule | `/api/schedule` | `ScheduleController` | day, week, group week, kkepik schedule |
| Grades | `/api/grades` | `GradesController` | grades, performance |
| Rating | `/api/rating` | `RatingController` | group rating, opt-in participation |
| News | `/api/news` | `AnnouncementsController`, `NewsCommentsController` | published news; writes require `NewsManage`; comments |
| Assignments | `/api/assignments` | `AssignmentsController` | read for students; writes require `AssignmentsManage` |
| Clubs | `/api/clubs` | `ClubsController` | membership, leaders, messages, pin, invite token |
| College info | `/api/college-info` | `CollegeInfoController` | catalog, schedule search, teachers |
| College map | `/api/college-map` | `CollegeMapController` | map, buildings, disciplines, search |
| Admin users | `/api/admin` | `AdminController` | stats, users, roles, ban, headman, grade recompute, audit, CSV; `UsersManage` / `AuditView` |
| Admin permissions | `/api/admin/permissions` | `AdminPermissionsController` | `UsersManage` |
| Admin clubs | `/api/admin/clubs` | `AdminClubsController` | `ClubsManage` |
| Admin college info | `/api/admin/college-info` | `AdminCollegeInfoController` | catalog/teacher refresh; `CollegeInfoManage` |
| Admin map | `/api/admin/college-map` | `AdminCollegeMapController` | building/auditorium CRUD; `MapManage` |

> Note: `authApi.assignProfile` in the SPA points at `/auth/assign-profile`,
> but `AuthController` currently exposes no such route. `AssignStudentProfileAsync`
> exists in `IAuthService` but is not surfaced over HTTP.

## Data flow examples

### Diary-backed schedule and grades

```
Schedule/GradesController
  → IScheduleService / IGradesService
  → IDiaryApiClient (cookie/session persisted in StudentProfile)
  → spo.rso23.ru
```

`DiaryApiClient` stores per-user cookies and the hashed diary password in
`StudentProfile` (encrypted at rest via ASP.NET Data Protection), performs
re-login when the session expires, and returns normalized DTOs. `Services`
verify the current user and their `ExternalStudentId` rather than trusting
client-provided IDs.

### Kkepik schedule synchronization

```
KkepikScheduleSyncService (BackgroundService, registered via AddHostedService)
  → ScheduleApiClient (kkepik)
  → KkepikScheduleParser
  → KkepikSchedules (unique GroupName + Date)
```

`ScheduleController.GetKkepikScheduleAsync` reads cached rows and falls back to
on-demand sync through the same service.

### Clubs and news

```
ClubsController → IClubService → CollegePortalDbContext
  Club, ClubMember, ClubMessage (membership/leader checks in service)

AnnouncementsController → IAnnouncementService → Announcement, StudyGroup
NewsCommentsController → INewsCommentService → NewsComment
```

### Activity tracking

```
Authenticated request
  → ActivityTrackerMiddleware
  → IMemoryCache marker per user (write at most once per minute)
  → UPDATE AspNetUsers.LastActivityAt via ExecuteUpdateAsync
```

Thresholds live in `CollegePortal.Application/ActivityTracking.cs`:
`ActivityWriteInterval` (1 min), `OnlineWindow` (5 min), `ActiveWindow`
(7 days). The admin statistics endpoint uses these windows to report online
and recently active users.

## Data model

```
ApplicationUser (IdentityUser<Guid>)
 ├─ 1:1 StudentProfile ── StudyGroup
 │     └─ ExternalStudentId, diary cookies/password hash,
 │        HeadmanRole, AverageMark, RatingOptIn
 ├─ 1:n RefreshToken
 ├─ 1:n UserPermission
 ├─ 1:n Announcement (author)
 ├─ 1:n NewsComment
 ├─ 1:n Assignment (creator)
 ├─ 1:n Club (owner) ── ClubMember, ClubMessage
 ├─ 1:n ClubMember
 ├─ 1:n ClubMessage
 └─ 1:n AdminAuditLog (admin)

StudyGroup
 ├─ 1:n StudentProfile
 ├─ 1:n Announcement
 └─ 1:n Assignment

College map
 Building 1:n Auditorium
 Discipline n:n Auditorium
 Auditorium n:n CollegeTeacher
 CollegeTeacher (synced staff directory)

KkepikSchedule  (cached external schedule, unique GroupName + Date)
Announcement 1:n NewsComment
```

All `Guid` keys are generated by EF Core. Unique indexes include
`StudentProfile.UserId`, `StudentProfile.ExternalStudentId`,
`Club.InviteToken`, `ClubMember(ClubId, UserId)`,
`UserPermission(UserId, Permission)`, `RefreshToken.TokenHash`,
`Building.Name`, `Discipline.Name`, `Auditorium(BuildingId, Number)`,
`KkepikSchedule(GroupName, Date)` and `CollegeTeacher.FullName`.

## Frontend architecture

```
main.tsx
└─ App.tsx
   ├─ QueryClientProvider (staleTime 5m, gcTime 10m, retry 1)
   ├─ BrowserRouter
   └─ AuthProvider (AuthContext)
      └─ AppRoutes
         ├─ PublicRoute → /login (AuthLayout + LoginPage)
         ├─ ProtectedRoute → Layout (RightSidebar navigation)
         │  ├─ /, /schedule, /grades, /performance, /assignments
         │  ├─ /news, /clubs, /clubs/:clubId
         │  ├─ /college-info, /college-info/map
         │  ├─ /profile, /users/:userId
         │  └─ /admin (AdminRoute, permission-gated tabs)
         └─ /YesIAmAdmin (ClaimPrimaryAdminPage)
```

- `AuthContext` bootstraps the session via `GET /auth/me`, loads effective
  permissions via `GET /permissions/me`, hashes diary passwords client-side
  (SHA-256, base64) and reacts to `auth:unauthorized`.
- `src/services/api.ts` is the single HTTP adapter with cookie credentials,
  401 refresh/queue logic and typed API groups.
- `src/types/` mirrors backend DTO contracts, including `ALL_PERMISSIONS`.
- Pages own data fetching; shared UI lives in `src/components/ui`, layout and
  navigation in `src/components/layout`, map UI in `src/components/college`.

## Deployment topology

`docker-compose.yml` services:

```
db      postgres:16-alpine, volume pgdata
api     .NET image, port 8080, auto-migrate, Data Protection keys in dpkeys
web     nginx serving the SPA and proxying /api → api:8080, 127.0.0.1:WEB_PORT
caddy   optional profile "tls": automatic HTTPS → web:80
cloudflared optional profile "tunnel": public hostname → http://web:80
```

Environment/secrets are supplied through `.env` (see `.env.example`):
`POSTGRES_PASSWORD`, `JWT_KEY` (≥32 bytes), `ADMIN_EMAIL/PASSWORD`,
`PRIMARY_ADMIN_SECRET`, `PUBLIC_ORIGIN`, optional `CADDY_DOMAIN` or
`CLOUDFLARE_TUNNEL_TOKEN`. See [../deployment.md](../deployment.md) and
[../security.md](../security.md).

## Cross-cutting concerns

- **Security headers** (`SecurityHeadersMiddleware`): nosniff, DENY framing,
  no-referrer, restrictive Permissions-Policy, CSP outside Development.
- **Rate limiting**: fixed window of 10 requests/minute per IP for auth routes.
- **Response compression**: gzip/brotli for JSON (large admin payloads).
- **Input sanitization**: `TextSanitizer` trims/limits user text; DTO
  validation guards admin mutations.
- **Audit**: `AdminAuditLog` records administrative actions.
- **Data protection**: diary credentials and cookies encrypted with keys
  persisted at `DataProtection:KeysPath` (DPAPI on Windows).
- **PWA**: `vite-plugin-pwa`, icons in `public/`, service worker generated at
  build time.
