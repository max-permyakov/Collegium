# Архитектура College Portal

## Обзор

Приложение построено по принципу **Clean Architecture** с модульной структурой внутри монолитного ASP.NET Core Web API.

```
┌─────────────────────────────────────────────────────────────┐
│                    CollegePortal.Api                        │
│  Controllers, Middleware, Swagger, Program.cs               │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  CollegePortal.Application                  │
│  Interfaces (IScheduleProvider, IGradesProvider, etc.)      │
│  Services, DTOs, Validation, Business Rules                 │
└─────────────────────────────┬───────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│     CollegePortal.Domain    │   │  CollegePortal.Infrastructure│
│  Entities, Value Objects,   │   │  EF Core, DbContext,        │
│  Domain Events, Exceptions  │   │  External API Clients,      │
│                             │   │  Identity, Migrations       │
└─────────────────────────────┘   └─────────────────────────────┘
```

## Правила зависимостей

1. **Domain** — не зависит ни от чего
2. **Application** — зависит только от Domain
3. **Infrastructure** — зависит от Application и Domain
4. **Api** — зависит от Infrastructure, Application, Domain
5. **Tests** — зависят от всех проектов

## Модули

### Domain (CollegePortal.Domain)
- `Entities/ApplicationUser` — пользователь с ролями (Student, Admin)
- `Entities/StudentProfile` — профиль студента, связь с внешним ID
- `Entities/StudyGroup` — учебная группа
- `Entities/Announcement` — новости/объявления
- `Entities/Assignment` — учебные задания

### Application (CollegePortal.Application)
- `Services/IScheduleProvider` — интерфейс получения расписания
- `Services/IGradesProvider` — интерфейс получения оценок
- `Services/IDiaryApiClient` — интерфейс клиента дневника
- `DTOs/ExternalApiDtos.cs` — DTO для внешних API
- `DTOs/ApiDtos.cs` — DTO для собственного API (планируется)

### Infrastructure (CollegePortal.Infrastructure)
- `Data/CollegePortalDbContext` — EF Core контекст
- `Extensions/ServiceCollectionExtensions` — регистрация сервисов
- `ExternalApis/Diary/DiaryApiClient` — клиент электронного дневника
- `ExternalApis/Schedule/ScheduleApiClient` — клиент API расписания

### Api (CollegePortal.Api)
- `Program.cs` — точка входа, настройка DI, Swagger
- `Controllers/` — API контроллеры (планируется)

## Внешние интеграции

### Электронный дневник (spo.rso23.ru)
- Авторизация через POST `/services/security/login` + cookies
- Получение Student ID из ответа логина (`tenants.spo_04.studentRole.id`)
- Endpoints:
  - Расписание: `GET /services/students/{id}/lessons/{start}/{end}`
  - Dashboard: `GET /services/students/{id}/dashboard`
  - Performance: `GET /services/reports/current/performance/{id}`
  - Account settings: `GET /services/security/account-settings`

### API расписания (kkepik.rub1kub.ru)
- Публичный API, авторизация не требуется
- Rate limit: 10 req/s на IP
- Endpoints:
  - Справочники: `/api/groups`, `/api/teachers`, `/api/audiences`, `/api/schedule/catalog`
  - Расписание: `/api/schedule/group`, `/api/schedule/teacher`, `/api/schedule/audience`

## Безопасность

- HTTPS в production
- ASP.NET Core Identity с хэшированием паролей
- JWT токены для API (планируется)
- Проверка прав доступа на уровне контроллеров
- Валидация входных данных
- Тайм-ауты внешних запросов (30с дневник, 10с расписание)
- Отсутствие секретов в логах и коде
- User Secrets / Environment variables для конфигурации

## База данных

- **SQL Server** (LocalDB для разработки)
- EF Core Code First с миграциями
- Таблицы:
  - `AspNetUsers` (ApplicationUser)
  - `AspNetRoles`, `AspNetUserRoles`
  - `StudentProfiles`
  - `StudyGroups`
  - `Announcements`
  - `Assignments`

## Frontend (college-portal-client)

- React 18 + TypeScript + Vite
- React Router для навигации
- TanStack Query для кэширования и синхронизации данных
- Axios для HTTP клиента
- Адаптивный дизайн (mobile-first)

## Развёртывание

1. Применить миграции: `dotnet ef database update`
2. Собрать frontend: `npm run build` в `college-portal-client`
3. Настроить переменные окружения / User Secrets
4. Запустить `CollegePortal.Api`
5. Настроить reverse proxy (nginx/IIS) для frontend и SSL