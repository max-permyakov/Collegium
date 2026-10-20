# Module Codemap

Module-by-module inventory with purposes, locations, key files, dependencies
and public exports. See [ARCHITECTURE.md](ARCHITECTURE.md) for the system view
and [FILES.md](FILES.md) for the complete file list.

## Backend solution

Solution file: `CollegePortal.slnx` (.NET 10, C# 13).

```
CollegePortal.Api ──────────┐
CollegePortal.Infrastructure├──► CollegePortal.Application ──► CollegePortal.Domain
CollegePortal.Tests ────────┘
```

---

## CollegePortal.Domain

**Purpose**: Pure domain model — persistence entities and enums with no
framework dependencies.

**Location**: `CollegePortal.Domain/`

**Key files**:
- `Entities/ApplicationUser.cs` — Identity user plus display name, role,
  active/protected flags, login/activity timestamps, student profile.
- `Entities/StudentProfile.cs` — group link, external diary ID, bio/avatar,
  headman role, cached average mark, rating opt-in, diary session secrets.
- `Entities/StudyGroup.cs` — group name, course, academic year, relations to
  students, announcements and assignments.
- `Entities/Announcement.cs`, `Entities/NewsComment.cs` — news posts and
  threaded comments.
- `Entities/Assignment.cs` — group assignments with due date and creator.
- `Entities/Club.cs`, `ClubMember.cs`, `ClubMessage.cs` — clubs, membership
  and chat messages (pinning, invite token, privacy flags).
- `Entities/Building.cs`, `Auditorium.cs`, `Discipline.cs`,
  `CollegeTeacher.cs` — college map model with discipline/teacher links.
- `Entities/KkepikSchedule.cs` — cached external schedule per group/day.
- `Entities/RefreshToken.cs`, `UserPermission.cs`, `AdminAuditLog.cs` —
  session rotation, granular permissions and admin audit trail.
- `Entities/HeadmanRole.cs` — headman role constants/type.
- `Enums/Permission.cs` — `UsersManage`, `NewsManage`, `AssignmentsManage`,
  `ClubsManage`, `CollegeInfoManage`, `MapManage`, `AuditView`.

**Dependencies**: none.

**Exports**: entity classes consumed by Infrastructure (EF Core) and
Application DTO mappings.

**Usage example**:
```csharp
var profile = await db.StudentProfiles
    .Include(p => p.StudyGroup)
    .FirstOrDefaultAsync(p => p.UserId == userId);
```

> `Class1.cs` in Domain, Application and Infrastructure are leftover template
> placeholders and can be deleted.

---

## CollegePortal.Application

**Purpose**: Contracts and transport models between the API and Infrastructure;
contains no EF Core or ASP.NET dependencies.

**Location**: `CollegePortal.Application/`

**Key files**:
- `Services/I*.cs` — one interface per feature: `IAuthService`,
  `IScheduleService`, `IGradesService`, `IAnnouncementService`,
  `INewsCommentService`, `IAssignmentService`, `IProfileService`,
  `IAdminService`, `IAdminPermissionService`, `IClubService`,
  `ICollegeInfoService`, `ICollegeMapService`, `IRatingService`.
- `Services/IExternalApiProviders.cs` — `IScheduleProvider`, `IGradesProvider`
  and `IDiaryApiClient` contracts for diary data.
- `DTOs/AuthDtos.cs` — login, user and refresh results.
- `DTOs/ScheduleDtos.cs`, `GradesDtos.cs`, `ExternalApiDtos.cs` — normalized
  schedule/grade/performance shapes and diary payloads.
- `DTOs/AnnouncementDtos.cs`, `AssignmentDtos.cs`, `ProfileDtos.cs` — portal
  content and profile contracts.
- `DTOs/AdminDtos.cs`, `AdminPermissionDtos.cs` — admin users, stats, audit,
  permissions.
- `DTOs/ClubDtos.cs`, `CollegeInfoDtos.cs`, `MapDtos.cs`, `RatingDtos.cs` —
  feature-specific request/response models.
- `ActivityTracking.cs` — shared time windows: 1-minute activity write
  interval, 5-minute online window, 7-day active window.

**Dependencies**: `CollegePortal.Domain`.

**Exports**: service interfaces, DTO records/classes, `ActivityTracking`
constants.

**Usage example**:
```csharp
public class ProfileController(IProfileService profiles) : ControllerBase
{
    [HttpGet("me")]
    public async Task<ActionResult<ProfileDto>> Me(CancellationToken ct)
        => await profiles.GetProfileAsync(CurrentUserId, ct) is { } p
            ? Ok(p)
            : NotFound();
}
```

---

## CollegePortal.Infrastructure

**Purpose**: Implementations for all application contracts: EF Core/PostgreSQL,
Identity, JWT, authorization handlers, external API clients, background sync
and Data Protection.

**Location**: `CollegePortal.Infrastructure/`

### Data

- `Data/CollegePortalDbContext.cs` — IdentityDbContext with all portal
  `DbSet`s, indexes, relationships and column constraints.
- `Migrations/` — Code First migrations from `InitialCreate` through
  `AddUserLastActivityAt` (current head), plus the model snapshot.

### Extensions

- `Extensions/ServiceCollectionExtensions.cs` — `AddInfrastructure` composes:
  - `CollegePortalDbContext` on Npgsql,
  - ASP.NET Core Identity (password/lockout policy, EF stores),
  - JWT bearer auth reading the `cp_access` cookie,
  - role and `Permission.*` policies + `PermissionAuthorizationHandler`,
  - Data Protection key persistence,
  - typed `HttpClient`s (`IDiaryApiClient`, `ScheduleApiClient`,
    `GosuslugiStaffClient`),
  - all feature services and `KkepikScheduleSyncService` hosted service.

### Services (implementation)

| File | Implements | Notable behavior |
|---|---|---|
| `AuthService.cs` | `IAuthService` | Identity login, refresh-token rotation/revocation, diary login/relogin, primary-admin claim, student profile assignment |
| `ScheduleService.cs` | `IScheduleService` | day/week/group schedule; kkepik cache + fallback sync |
| `GradesService.cs` | `IGradesService` | grades and performance from diary; cached average mark |
| `AnnouncementService.cs` | `IAnnouncementService` | published news, author-owned CRUD, publish toggle |
| `NewsCommentService.cs` | `INewsCommentService` | comment CRUD with ownership/admin checks |
| `AssignmentService.cs` | `IAssignmentService` | group assignments, creator-scoped mutations |
| `ProfileService.cs` | `IProfileService` | own/full/public profile views, update, avatar storage |
| `AdminService.cs` | `IAdminService` | users, statistics, role/ban/headman, grade recompute, audit log |
| `AdminPermissionService.cs` | `IAdminPermissionService` | granular permission read/write, effective permissions |
| `ClubService.cs` | `IClubService` | visibility, membership, leaders, chat paging, pinning, admin views |
| `CollegeInfoService.cs` | `ICollegeInfoService` | catalog/teacher cache and refresh, schedule search |
| `CollegeMapService.cs` | `ICollegeMapService` | map aggregation, search, building/auditorium CRUD |
| `RatingService.cs` | `IRatingService` | opt-in group rating by subject |
| `KkepikScheduleParser.cs` | static parser | parses raw schedule lines into `LessonDto[]` |
| `KkepikScheduleSyncService.cs` | `BackgroundService` | periodic kkepik sync, `TrySyncAsync` |
| `TextSanitizer.cs` | internal static | trims and length-limits user text |

### ExternalApis

- `ExternalApis/Diary/DiaryApiClient.cs` — diary login (plain and pre-hashed
  password), schedule, dashboard/grades, performance, account settings;
  per-user cookie persistence, relogin, tolerant SSL handling for the legacy
  host. Defines `DiaryApiOptions`.
- `ExternalApis/Schedule/ScheduleApiClient.cs` — kkepik groups/teachers/
  audiences, group/teacher/audience schedules, catalog. Defines
  `ScheduleApiOptions`, `ScheduleResponseDto`, `CatalogDto`.
- `ExternalApis/Gosuslugi/GosuslugiStaffClient.cs` — scrapes staff directory
  HTML into `GosuslugiStaffItem`. Defines `GosuslugiOptions`.

### Authorization

- `Authorization/PermissionRequirement.cs` — requirement carrying a
  `Permission`.
- `Authorization/PermissionAuthorizationHandler.cs` — resolves the user's
  effective permissions from a scoped DbContext; admins pass all.

**Dependencies**: `CollegePortal.Application`, `CollegePortal.Domain`, EF Core,
Npgsql, ASP.NET Core Identity, JwtBearer, `Microsoft.Extensions.Http`.

**Exports**: `AddInfrastructure(IServiceCollection, IConfiguration)` and all
service implementations/clients used by DI.

**Usage example**:
```csharp
builder.Services.AddInfrastructure(builder.Configuration);
```

---

## CollegePortal.Api

**Purpose**: HTTP boundary — controllers, middleware, DI composition, startup
seeding, JSON serialization and Swagger.

**Location**: `CollegePortal.Api/`

**Key files**:
- `Program.cs` — configuration, CORS, rate limiting, compression, pipeline
  order, role/admin/primary-admin seeding, optional auto-migration.
- `Controllers/AuthController.cs` — login, diary flows, refresh, logout, me,
  primary-admin claim (rate limited).
- `Controllers/PermissionsController.cs` — effective permissions.
- `Controllers/ProfileController.cs`, `ScheduleController.cs`,
  `GradesController.cs`, `RatingController.cs` — student-facing features.
- `Controllers/AnnouncementsController.cs`, `NewsCommentsController.cs`,
  `AssignmentsController.cs` — content with granular write permissions.
- `Controllers/ClubsController.cs` — clubs, membership, chat.
- `Controllers/CollegeInfoController.cs`, `CollegeMapController.cs` — public
  read models for college data and map.
- `Controllers/AdminController.cs`, `AdminPermissionsController.cs`,
  `AdminClubsController.cs`, `AdminCollegeInfoController.cs`,
  `AdminCollegeMapController.cs` — administration, gated by `Permission.*`
  policies.
- `Middleware/SecurityHeadersMiddleware.cs` — defensive response headers/CSP.
- `Middleware/BannedUsersMiddleware.cs` — blocks inactive users and stale
  security stamps.
- `Middleware/ActivityTrackerMiddleware.cs` — debounced `LastActivityAt`
  updates using `IMemoryCache`.
- `Serialization/UtcDateTimeJsonConverter.cs` — emits UTC `Z` timestamps.
- `appsettings.json`, `appsettings.Development.json` — connection string,
  JWT, external API, CORS, admin and primary-admin configuration keys.
- `WeatherForecast.cs` — unused scaffold; safe to remove.

**Dependencies**: `CollegePortal.Infrastructure`, `CollegePortal.Application`,
`CollegePortal.Domain`.

**Exports**: the running Web API; no library exports.

**Usage example**:
```bash
dotnet run --project CollegePortal.Api
# Swagger (Development): https://localhost:<port>/swagger
```

---

## CollegePortal.Tests

**Purpose**: xUnit tests covering authentication cookies and refresh-token
rotation semantics.

**Location**: `CollegePortal.Tests/`

**Key files**:
- `AuthIntegrationTests.cs` — diary login success/failure, relogin, refresh
  cookie behavior.
- `RefreshTokenTests.cs` — rotation, sliding sessions, claim contents,
  unknown/revoked/expired tokens, disabled users, logout scoping and revoke-all.
- `UnitTest1.cs` — empty scaffold test; can be removed.

**Dependencies**: all backend projects, xUnit, test host/EF providers.

**Exports**: test assembly only.

**Usage example**:
```bash
dotnet test CollegePortal.Tests
```

---

## Frontend: college-portal-client

**Purpose**: Installable React SPA for students and administrators.

**Location**: `college-portal-client/`

**Stack**: React 19, TypeScript, Vite 8, React Router 7, TanStack Query 5,
Axios, Tailwind CSS 4, `vite-plugin-pwa`; linting via `oxlint`.

### App shell

- `src/main.tsx` — React root.
- `src/App.tsx` — QueryClient defaults, router, `ProtectedRoute`,
  `AdminRoute`, `PublicRoute`, `UserProfileRoute`, all route definitions.
- `src/context/AuthContext.tsx` — session bootstrap, permission state,
  login/diary-login/claim/logout, diary password hashing, unauthorized handling.
- `src/components/layout/Layout.tsx` — main two-column layout and auth layout.
- `src/components/layout/RightSidebar.tsx` — navigation (home, schedule,
  grades, performance, assignments, news, clubs, college info, map, profile,
  admin), role/permission aware.

**Dependencies**: `src/services/api.ts`, `src/types`.

**Exports**: `App`, `AuthProvider`, `useAuth`, `Layout`, `AuthLayout`.

### API adapter

- `src/services/api.ts` — Axios instance (`VITE_API_URL`, default
  `http://localhost:5221/api`) with `withCredentials`, 401 silent refresh and
  request queueing. Exports typed groups: `authApi`, `scheduleApi`,
  `gradesApi`, `ratingApi`, `newsApi`, `assignmentsApi`, `profileApi`,
  `adminApi`, `permissionsApi`, `clubsApi`, `collegeInfoApi`, `collegeMapApi`.

**Usage example**:
```ts
const { data } = useQuery({
  queryKey: ['schedule', 'week', startDate],
  queryFn: () => scheduleApi.getWeek(startDate),
});
```

### Pages

| Directory | Page | Primary APIs |
|---|---|---|
| `pages/auth` | `LoginPage`, `ClaimPrimaryAdminPage` | `authApi`, `useAuth` |
| `pages/home` | `HomePage` | `scheduleApi`, `gradesApi`, `newsApi`, `assignmentsApi` |
| `pages/schedule` | `SchedulePage` | `scheduleApi` |
| `pages/grades` | `GradesPage` | `gradesApi` |
| `pages/performance` | `PerformancePage` | `gradesApi`, `ratingApi` |
| `pages/assignments` | `AssignmentsPage` | `assignmentsApi` |
| `pages/news` | `NewsPage` | `newsApi` |
| `pages/clubs` | `ClubsPage`, `ClubDetailPage` | `clubsApi` |
| `pages/college` | `CollegeInfoPage`, `CollegeMapPage` | `collegeInfoApi`, `collegeMapApi`, `adminApi` |
| `pages/profile` | `ProfilePage`, `PublicProfilePage` | `profileApi`, `adminApi` |
| `pages/admin` | `AdminPage` + `UsersTab`, `StatisticsTab`, `ClubsTab`, `MapTab`, `AuditTab` | `adminApi`, `newsApi`, `assignmentsApi`, `clubsApi`, `collegeMapApi`, `collegeInfoApi` |

`AdminPage` hosts the tabs and filters them by
`hasPermission(Permission.X)`.

### Components

- `components/ui/` — `Avatar`, `Badge`, `Button`, `Card`, `Input`, `KebabMenu`,
  `Lightbox`, `Modal`, `Tabs`.
- `components/layout/` — `Layout`, `RightSidebar`.
- `components/news/NewsViewerModal.tsx` — news reader.
- `components/admin/PermissionsModal.tsx` — granular permission editor.
- `components/college/` — `CollegeMap`, `MapSearch`, `RoomButton`,
  `AuditoriumPanel`, `AuditoriumForm` for the interactive map.

### Types and utilities

- `src/types/index.ts` — core user/schedule/grades/news/assignment/profile/
  admin/club/college/map/rating contracts and `ALL_PERMISSIONS`.
- `src/types/admin.ts`, `clubs.ts`, `college.ts`, `map.ts` — domain-specific
  types.
- `src/utils/datetime.ts` — date/time formatting helpers.
- `src/utils/names.ts` — display-name and initials helpers.
- `src/utils/performance.ts` — performance/rating calculations.

**Dependencies**: backend HTTP API; no direct imports from .NET projects.

**Exports**: SPA bundle served by Vite (dev) or nginx (production).

**Usage example**:
```bash
cd college-portal-client
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

---

## Deployment module

**Purpose**: Container topology and reverse proxy/TLS options.

**Location**: `deploy/`, repository root.

**Key files**:
- `docker-compose.yml` — `db`, `api`, `web`, optional `caddy` (profile `tls`),
  optional `cloudflared` (profile `tunnel`).
- `.env.example` — required secrets and configuration template.
- `deploy/Caddyfile` — automatic HTTPS reverse proxy to `web:80`.
- `college-portal-client/Dockerfile`, `nginx.conf` — SPA build and `/api` proxy.
- `CollegePortal.Api/Dockerfile` — API runtime image.

**Dependencies**: Docker Compose, external DNS/Cloudflare for public hosting.

**Exports**: running production stack; see [../deployment.md](../deployment.md).
