# File Codemap

Directory-by-directory inventory of tracked source and configuration files.
Generated artifacts (`bin/`, `obj/`, `node_modules/`, `dist/`) are omitted.
See [MODULES.md](MODULES.md) for responsibilities and dependencies.

## Repository tree

```
Collegium/
├── CollegePortal.slnx              solution (5 .NET projects)
├── CollegePortal.Api/              ASP.NET Core HTTP host
│   ├── Controllers/                17 API controllers
│   ├── Middleware/                 security, ban, activity tracking
│   ├── Serialization/              UTC DateTime converter
│   ├── Properties/                 launch profiles
│   ├── Program.cs                  composition root and pipeline
│   └── appsettings*.json           runtime configuration
├── CollegePortal.Application/      contracts and DTOs
│   ├── Services/                   14 service interfaces
│   ├── DTOs/                       13 DTO files
│   └── ActivityTracking.cs         activity/online thresholds
├── CollegePortal.Domain/           entities and enums
│   ├── Entities/                   18 entity files
│   └── Enums/Permission.cs
├── CollegePortal.Infrastructure/   implementations
│   ├── Authorization/              permission requirement/handler
│   ├── Data/                       DbContext
│   ├── Extensions/                 AddInfrastructure DI
│   ├── ExternalApis/               Diary, Schedule, Gosuslugi clients
│   ├── Migrations/                 8 migrations + snapshot
│   └── Services/                   16 service/helper files
├── CollegePortal.Tests/            xUnit auth + refresh-token tests
├── college-portal-client/          React/Vite SPA
│   ├── public/                     PWA icons, favicon, map image
│   └── src/
│       ├── assets/                 logo/hero/map images
│       ├── components/             ui, layout, news, admin, college
│       ├── context/                AuthContext
│       ├── pages/                  route screens by feature
│       ├── services/api.ts         Axios client + typed endpoints
│       ├── types/                  TypeScript contracts
│       └── utils/                  date, name, performance helpers
├── deploy/Caddyfile                optional automatic HTTPS
├── docs/                           architecture/api/security/deployment
├── docker-compose.yml              db + api + web (+ caddy/cloudflared)
├── .env.example                    production env template
├── Main.py                         diary API research script
└── *_response.json                 captured diary API fixtures
```

---

## Root files

| File | Purpose |
|---|---|
| `CollegePortal.slnx` | Solution listing Api, Application, Domain, Infrastructure, Tests. |
| `docker-compose.yml` | Production stack: PostgreSQL 16, .NET API, nginx web, optional Caddy/Cloudflare Tunnel. |
| `.env.example` | Template for DB/JWT/admin/primary-admin/public-origin/TLS secrets. |
| `.env` | Local secrets (gitignored; never commit). |
| `.gitignore`, `.dockerignore` | VCS and Docker build exclusions. |
| `README.md` | Project overview, stack, quick start, endpoints, migrations. |
| `LICENSE` | MIT license. |
| `Main.py` | Ad-hoc Python/httpx script exploring the diary login and data endpoints; writes fixtures. |
| `login_response.json` | Captured diary login response (fixture). |
| `dashboard_response.json` | Captured diary dashboard/grades response (fixture). |
| `performance_response.json` | Captured diary performance response (fixture). |
| `schedule_response.json` | Captured diary schedule response (fixture). |
| `account_settings_response.json` | Captured diary account-settings response (fixture). |

> The captured JSON fixtures may contain personal data. Treat them as sensitive
> and prefer synthetic data in new tests.

---

## CollegePortal.Api

| File | Purpose |
|---|---|
| `CollegePortal.Api.csproj` | Web API project, references Application/Infrastructure, Swagger, EF design package. |
| `Program.cs` | DI, CORS, rate limiting, compression, forwarded headers, middleware order, role/admin seeding, optional auto-migration, primary-admin promotion. |
| `appsettings.json` | Default connection string, JWT issuer/audience, external API URLs/timeouts, CORS origins. |
| `appsettings.Development.json` | Development overrides. |
| `Properties/launchSettings.json` | Local URLs and environment. |
| `Serialization/UtcDateTimeJsonConverter.cs` | Serializes `DateTime` as UTC ISO-8601 with `Z`. |
| `WeatherForecast.cs` | Unused template artifact. |
| `Controllers/AuthController.cs` | `/api/auth`: login, diary-login, refresh, diary-relogin, logout, me, claim-primary-admin. |
| `Controllers/PermissionsController.cs` | `/api/permissions/me`: effective permissions. |
| `Controllers/ProfileController.cs` | `/api/profile`: own/public profile, update, avatar set/clear. |
| `Controllers/ScheduleController.cs` | `/api/schedule`: day, week, group week, kkepik. |
| `Controllers/GradesController.cs` | `/api/grades`: grades, performance. |
| `Controllers/RatingController.cs` | `/api/rating`: group rating, participation opt-in. |
| `Controllers/AnnouncementsController.cs` | `/api/news`: read published, CRUD/toggle with `NewsManage`. |
| `Controllers/NewsCommentsController.cs` | `/api/news/{id}/comments` and comment update/delete. |
| `Controllers/AssignmentsController.cs` | `/api/assignments`: student reads, managed writes. |
| `Controllers/ClubsController.cs` | `/api/clubs`: list/detail, CRUD, join/leave, leaders, members, messages, pin. |
| `Controllers/CollegeInfoController.cs` | `/api/college-info`: catalog, schedule search, teachers. |
| `Controllers/CollegeMapController.cs` | `/api/college-map`: map, buildings, disciplines, search. |
| `Controllers/AdminController.cs` | `/api/admin`: statistics, users, role/active/headman, recompute grades, audit, CSV export. |
| `Controllers/AdminPermissionsController.cs` | `/api/admin/permissions/{userId}`: read/write granular permissions. |
| `Controllers/AdminClubsController.cs` | `/api/admin/clubs`: moderation views and delete. |
| `Controllers/AdminCollegeInfoController.cs` | `/api/admin/college-info`: catalog/teacher refresh. |
| `Controllers/AdminCollegeMapController.cs` | `/api/admin/college-map`: building/auditorium CRUD. |
| `Middleware/SecurityHeadersMiddleware.cs` | Adds nosniff/frame/referrer/permissions headers and production CSP. |
| `Middleware/BannedUsersMiddleware.cs` | Rejects inactive users or tokens with stale security stamp. |
| `Middleware/ActivityTrackerMiddleware.cs` | Updates `LastActivityAt` at most once per minute per user. |

---

## CollegePortal.Application

| File | Purpose |
|---|---|
| `CollegePortal.Application.csproj` | Contracts project; references Domain. |
| `ActivityTracking.cs` | `ActivityWriteInterval` (1 min), `OnlineWindow` (5 min), `ActiveWindow` (7 days). |
| `Class1.cs` | Template placeholder. |
| `Services/IAuthService.cs` | Login/refresh/logout, current user, diary login/relogin, primary-admin claim, student profile assignment. |
| `Services/IScheduleService.cs` | Day/week/group schedules and kkepik schedule. |
| `Services/IGradesService.cs` | Grades and detailed performance. |
| `Services/IAnnouncementService.cs` | Published news and author-scoped CRUD. |
| `Services/INewsCommentService.cs` | Comment list/post/update/delete. |
| `Services/IAssignmentService.cs` | Student assignment list and managed CRUD. |
| `Services/IProfileService.cs` | Own, viewed and public profiles; update; avatar. |
| `Services/IAdminService.cs` | Admin users, stats, role/active/headman, grade recompute, audit. |
| `Services/IAdminPermissionService.cs` | Permission read/write/effective lookup. |
| `Services/IClubService.cs` | Club visibility, membership, leaders, chat, pinning, admin views. |
| `Services/ICollegeInfoService.cs` | Catalog, schedule search, teachers, refresh operations. |
| `Services/ICollegeMapService.cs` | Map aggregation, search, building/auditorium CRUD. |
| `Services/IRatingService.cs` | Group rating and participation. |
| `Services/IExternalApiProviders.cs` | `IScheduleProvider`, `IGradesProvider`, `IDiaryApiClient` contracts. |
| `DTOs/AuthDtos.cs` | Login request/response, `UserDto`, diary login payloads. |
| `DTOs/ScheduleDtos.cs` | Normalized schedule day/week/lesson/kkepik shapes. |
| `DTOs/GradesDtos.cs` | Grades and performance response DTOs. |
| `DTOs/ExternalApiDtos.cs` | Diary payload models (lesson, gradebook, dashboard, account settings). |
| `DTOs/AnnouncementDtos.cs` | News list/detail/create/update DTOs. |
| `DTOs/AssignmentDtos.cs` | Assignment list/detail/create/update DTOs. |
| `DTOs/ProfileDtos.cs` | Profile, public profile, update request/result. |
| `DTOs/AdminDtos.cs` | Admin user, statistics, audit, action result DTOs. |
| `DTOs/AdminPermissionDtos.cs` | Permission set/effective DTOs. |
| `DTOs/ClubDtos.cs` | Club list/detail/member/message/create/update DTOs. |
| `DTOs/CollegeInfoDtos.cs` | Catalog, schedule search, teacher DTOs. |
| `DTOs/MapDtos.cs` | Map, building, auditorium, discipline, search DTOs. |
| `DTOs/RatingDtos.cs` | Group rating and participation DTOs. |

---

## CollegePortal.Domain

| File | Purpose |
|---|---|
| `CollegePortal.Domain.csproj` | Domain project; no external dependencies. |
| `Class1.cs` | Template placeholder. |
| `Enums/Permission.cs` | Granular admin permissions 1–7. |
| `Entities/ApplicationUser.cs` | Identity user + display name, role, active/protected, timestamps, profile. |
| `Entities/StudentProfile.cs` | Group, external diary ID, bio/avatar, headman, average mark, rating opt-in, encrypted diary session. |
| `Entities/StudyGroup.cs` | Group name, course, academic year, collections. |
| `Entities/Announcement.cs` | News post with author, publication state and optional group scope. |
| `Entities/NewsComment.cs` | Comment on an announcement. |
| `Entities/Assignment.cs` | Group assignment with due date and creator. |
| `Entities/Club.cs` | Club with privacy/link-join/pin flags and invite token. |
| `Entities/ClubMember.cs` | Club membership and leader flag. |
| `Entities/ClubMessage.cs` | Club chat message with edit timestamp. |
| `Entities/Building.cs` | Map building with sort order and auditoriums. |
| `Entities/Auditorium.cs` | Room geometry, floor, hints, computer flag, discipline/teacher links. |
| `Entities/Discipline.cs` | Discipline name and linked auditoriums. |
| `Entities/CollegeTeacher.cs` | Synced staff directory entry. |
| `Entities/KkepikSchedule.cs` | Cached external schedule JSON per group/day. |
| `Entities/RefreshToken.cs` | Hashed refresh token, expiry/revocation, active predicate. |
| `Entities/UserPermission.cs` | Explicit permission grant per user. |
| `Entities/AdminAuditLog.cs` | Admin action log with target and details. |
| `Entities/HeadmanRole.cs` | `None`/`Headman`/`Deputy` enum. |

---

## CollegePortal.Infrastructure

| File | Purpose |
|---|---|
| `CollegePortal.Infrastructure.csproj` | EF Core/Npgsql, Identity, JWT, HTTP clients, Data Protection. |
| `Class1.cs` | Template placeholder. |
| `Data/CollegePortalDbContext.cs` | `IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>` with all `DbSet`s, indexes and relationships. |
| `Extensions/ServiceCollectionExtensions.cs` | `AddInfrastructure`: DbContext, Identity, JWT cookie auth, permission policies, Data Protection, typed clients, services, hosted sync. |
| `Authorization/PermissionRequirement.cs` | `IAuthorizationRequirement` wrapping a `Permission`. |
| `Authorization/PermissionAuthorizationHandler.cs` | Grants when user is admin or has matching `UserPermission`. |
| `Services/AuthService.cs` | Identity login, refresh rotation/revocation, diary login/relogin, primary-admin claim, profile assignment. |
| `Services/ScheduleService.cs` | Diary day/week/group schedules; kkepik cache and fallback. |
| `Services/GradesService.cs` | Diary grades/performance and average-mark caching. |
| `Services/AnnouncementService.cs` | News reads and author-scoped writes. |
| `Services/NewsCommentService.cs` | Comment CRUD with ownership/admin checks. |
| `Services/AssignmentService.cs` | Group assignments and creator-scoped mutations. |
| `Services/ProfileService.cs` | Profile views, updates, avatar data URLs. |
| `Services/AdminService.cs` | Admin users/statistics/actions, grade recompute, audit log. |
| `Services/AdminPermissionService.cs` | Permission grants and effective permissions. |
| `Services/ClubService.cs` | Club visibility/membership/chat/moderation logic. |
| `Services/CollegeInfoService.cs` | Catalog/teacher cache and external refresh. |
| `Services/CollegeMapService.cs` | Map aggregation, search, building/auditorium CRUD. |
| `Services/RatingService.cs` | Opt-in group rating by subject. |
| `Services/KkepikScheduleParser.cs` | Parses kkepik lines into lessons. |
| `Services/KkepikScheduleSyncService.cs` | `BackgroundService` periodic kkepik synchronization. |
| `Services/TextSanitizer.cs` | Trims/limits untrusted text. |
| `ExternalApis/Diary/DiaryApiClient.cs` | Diary login (plain/pre-hashed), schedule, dashboard, performance, account settings; per-user cookies/relogin; `DiaryApiOptions`. |
| `ExternalApis/Schedule/ScheduleApiClient.cs` | Kkepik groups/teachers/audiences/schedules/catalog and response records; `ScheduleApiOptions`. |
| `ExternalApis/Gosuslugi/GosuslugiStaffClient.cs` | Staff directory HTML scrape and `GosuslugiOptions`. |
| `Migrations/20261014132551_InitialCreate.cs` (+Designer) | Initial schema. |
| `Migrations/20261018071829_AddNewsComments.cs` (+Designer) | News comments. |
| `Migrations/20261018123859_LimitClubDescriptionAndBio.cs` (+Designer) | Length limits. |
| `Migrations/20261018124553_AddRefreshTokens.cs` (+Designer) | Refresh-token table. |
| `Migrations/20261018153043_AddClubPinningAndEditTimestamps.cs` (+Designer) | Club pinning and edit timestamps. |
| `Migrations/20261018154304_AddUserPermissions.cs` (+Designer) | Granular permissions. |
| `Migrations/20261019132220_AddStudentRatingOptIn.cs` (+Designer) | Rating opt-in. |
| `Migrations/20261020183738_AddUserLastActivityAt.cs` (+Designer) | `LastActivityAt` activity tracking. |
| `Migrations/CollegePortalDbContextModelSnapshot.cs` | Current EF model snapshot. |

---

## CollegePortal.Tests

| File | Purpose |
|---|---|
| `CollegePortal.Tests.csproj` | xUnit test project referencing all backend projects. |
| `AuthIntegrationTests.cs` | Diary login/relogin and refresh cookie integration tests. |
| `RefreshTokenTests.cs` | Rotation, sliding session, claims, revoked/expired/unknown tokens, disabled users, logout/revoke-all. |
| `UnitTest1.cs` | Empty scaffold test. |

---

## college-portal-client (configuration and root)

| File | Purpose |
|---|---|
| `package.json` | Scripts (`dev`, `build`, `lint`, `preview`) and dependencies (React 19, Router 7, TanStack Query 5, Axios, Tailwind 4, Vite 8, PWA, oxlint). |
| `package-lock.json` | Locked dependency tree. |
| `vite.config.ts` | Vite plugins (React, PWA manifest/service worker) and dev options. |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | TypeScript project references and strictness. |
| `tailwind.config.js`, `postcss.config.js` | Tailwind/PostCSS setup. |
| `.oxlintrc.json` | Linter rules. |
| `index.html` | SPA entry and metadata. |
| `Dockerfile`, `.dockerignore` | Multi-stage SPA build and nginx image. |
| `nginx.conf` | SPA fallback and `/api` reverse proxy. |
| `README.md` | Frontend-specific notes. |
| `.npmrc`, `.gitignore` | npm and VCS configuration. |
| `public/favicon.svg`, `icons.svg` | Favicon and icon sprite. |
| `public/pwa-192x192.png`, `pwa-512x512.png`, `pwa-512x512-maskable.png` | PWA icons. |
| `public/college-map.png` | Static map fallback image. |

---

## college-portal-client/src

### Entry, app shell, context

| File | Purpose |
|---|---|
| `main.tsx` | Mounts React app. |
| `App.tsx` | QueryClient defaults, router, route guards, all routes. |
| `App.css`, `index.css` | Global styles and Tailwind layers. |
| `context/AuthContext.tsx` | Session bootstrap, permissions, login/diary-login/claim/logout, diary password hashing, unauthorized listener. |

### Services and types

| File | Purpose |
|---|---|
| `services/api.ts` | Axios instance, cookie credentials, 401 refresh queue, typed API groups. |
| `types/index.ts` | Core contracts and `ALL_PERMISSIONS`. |
| `types/admin.ts` | Admin user/statistics/audit/permission types. |
| `types/clubs.ts` | Club, member, message types. |
| `types/college.ts` | College catalog, teachers, schedule search types. |
| `types/map.ts` | Map, building, auditorium, discipline, search types. |

### Components

| File | Purpose |
|---|---|
| `components/layout/Layout.tsx` | Main shell, `AuthLayout`, sidebar offset. |
| `components/layout/RightSidebar.tsx` | Collapsible navigation with role/permission filtering. |
| `components/ui/Avatar.tsx` | User/club avatar with fallback. |
| `components/ui/Badge.tsx` | Status/label badge. |
| `components/ui/Button.tsx` | Shared button variants. |
| `components/ui/Card.tsx` | Content card container. |
| `components/ui/Input.tsx` | Form input. |
| `components/ui/KebabMenu.tsx` | Context action menu. |
| `components/ui/Lightbox.tsx` | Image viewer. |
| `components/ui/Modal.tsx` | Accessible modal. |
| `components/ui/Tabs.tsx` | Tab navigation. |
| `components/news/NewsViewerModal.tsx` | News reader modal. |
| `components/admin/PermissionsModal.tsx` | Granular permission editor. |
| `components/college/CollegeMap.tsx` | Interactive map renderer. |
| `components/college/MapSearch.tsx` | Map search UI. |
| `components/college/RoomButton.tsx` | Auditorium hotspot button. |
| `components/college/AuditoriumPanel.tsx` | Auditorium details panel. |
| `components/college/AuditoriumForm.tsx` | Admin auditorium editor. |

### Pages

| File | Purpose |
|---|---|
| `pages/auth/LoginPage.tsx` | Portal and diary login forms; session-expired notice. |
| `pages/auth/ClaimPrimaryAdminPage.tsx` | `/YesIAmAdmin` protected-admin claim. |
| `pages/home/HomePage.tsx` | Dashboard: today schedule, average marks, news, assignments. |
| `pages/schedule/SchedulePage.tsx` | Day/week schedule views. |
| `pages/grades/GradesPage.tsx` | Subject grades. |
| `pages/performance/PerformancePage.tsx` | Performance detail and group rating. |
| `pages/assignments/AssignmentsPage.tsx` | Assignment list/detail and management. |
| `pages/news/NewsPage.tsx` | News feed, comments, admin authoring. |
| `pages/clubs/ClubsPage.tsx` | Club directory and creation. |
| `pages/clubs/ClubDetailPage.tsx` | Club detail, members, chat, invites. |
| `pages/college/CollegeInfoPage.tsx` | College catalog, schedule search, teachers. |
| `pages/college/CollegeMapPage.tsx` | Map exploration and admin editing. |
| `pages/profile/ProfilePage.tsx` | Own profile editing and avatar. |
| `pages/profile/PublicProfilePage.tsx` | Contact-free profile for other users. |
| `pages/admin/AdminPage.tsx` | Admin shell, tab selection, permission filtering. |
| `pages/admin/UsersTab.tsx` | User list, roles, bans, headman, permissions, CSV. |
| `pages/admin/StatisticsTab.tsx` | User/online/activity statistics. |
| `pages/admin/ClubsTab.tsx` | Club moderation. |
| `pages/admin/MapTab.tsx` | Buildings/auditoriums and catalog refresh. |
| `pages/admin/AuditTab.tsx` | Admin audit log. |

### Assets and utilities

| File | Purpose |
|---|---|
| `assets/logo.png`, `logo1.png` | Brand logos. |
| `assets/hero.png` | Landing/login artwork. |
| `assets/map.svg` | Vector campus map. |
| `assets/react.svg`, `assets/vite.svg` | Template assets. |
| `utils/datetime.ts` | Date/time parsing and formatting. |
| `utils/names.ts` | Name formatting/initials. |
| `utils/performance.ts` | Performance and rating calculations. |

---

## deploy and docs

| File | Purpose |
|---|---|
| `deploy/Caddyfile` | Automatic HTTPS reverse proxy to `web:80`. |
| `docs/architecture.md` | Existing narrative architecture document. |
| `docs/api-research.md` | Diary/kkepik endpoint research. |
| `docs/deployment.md` | Docker/Caddy/Tunnel deployment guide. |
| `docs/security.md` | Threat model and security decisions. |
| `docs/CODEMAPS/ARCHITECTURE.md` | System/data-flow codemap. |
| `docs/CODEMAPS/MODULES.md` | Module codemap. |
| `docs/CODEMAPS/FILES.md` | This file map. |
| `docs/CODEMAPS/README.md` | Codemap index and maintenance guide. |
