# College Portal

Веб-портал для студентов колледжа, объединяющий данные существующих информационных систем в едином интерфейсе.

## Технологический стек

### Backend
- **ASP.NET Core 10** Web API
- **C# 13** / .NET 10
- **Entity Framework Core** с PostgreSQL (Npgsql)
- **ASP.NET Core Identity** для авторизации
- **Swagger / OpenAPI** для документации API
- **xUnit** для тестирования

### Frontend
- **React 18** + **TypeScript**
- **Vite** для сборки и разработки
- **React Router** для навигации
- **TanStack Query (React Query)** для работы с API
- **Axios** для HTTP-запросов

### Интеграции
- **Электронный дневник** (spo.rso23.ru) — расписание, оценки, успеваемость
- **API расписания колледжа** (kkepik.rub1kub.ru) — справочники групп, преподавателей, аудиторий

## Структура решения

```
CollegePortal.sln
├── CollegePortal.Api           # ASP.NET Core Web API (endpoints, middleware)
├── CollegePortal.Application   # Бизнес-логика, интерфейсы сервисов, DTO
├── CollegePortal.Domain        # Сущности, доменные правила
├── CollegePortal.Infrastructure # EF Core, PostgreSQL, внешние API клиенты
├── CollegePortal.Tests         # Автоматические тесты (xUnit)
└── college-portal-client       # React + TypeScript + Vite frontend
```

## Быстрый старт

### Предварительные требования
- .NET 10 SDK
- Node.js 18+ и npm
- PostgreSQL 16 (локально или через `docker compose up -d db`)

### Backend

```bash
# Восстановление зависимостей и сборка
dotnet restore
dotnet build

# Применение миграций (создаст базу CollegePortal в LocalDB)
dotnet ef database update --project CollegePortal.Infrastructure --startup-project CollegePortal.Api

# Запуск API
dotnet run --project CollegePortal.Api
```

API будет доступен по адресу: `https://localhost:7xxx` (порт указан в launchSettings.json)
Swagger UI: `https://localhost:7xxx/swagger`

### Frontend

```bash
cd college-portal-client
npm install
npm run dev
```

Frontend будет доступен по адресу: `http://localhost:5173`

## Конфигурация

### Backend (appsettings.json)

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Database=CollegePortal;Username=postgres;Password=postgres"
  },
  "ExternalApis": {
    "Diary": {
      "BaseUrl": "https://spo.rso23.ru",
      "TimeoutSeconds": 30
    },
    "Schedule": {
      "BaseUrl": "https://kkepik.rub1kub.ru/api",
      "TimeoutSeconds": 10
    }
  },
  "Auth": {
    "OtpPepper": "long-random-secret"
  },
  "Smtp": {
    "Host": "smtp.example.com",
    "Port": 587,
    "User": "no-reply@example.com",
    "Password": "secret",
    "From": "College Portal <no-reply@example.com>",
    "EnableSsl": true
  },
  "OAuth": {
    "RedirectBaseUrl": "https://portal.example.com",
    "Google": { "ClientId": "", "ClientSecret": "" },
    "GitHub": { "ClientId": "", "ClientSecret": "" },
    "Yandex": { "ClientId": "", "ClientSecret": "" },
    "Vk": { "ClientId": "", "ClientSecret": "" }
  }
}
```

Секреты (пароли, ключи) хранятся в **User Secrets** или переменных окружения, не в репозитории.
Для Docker-развёртывания используйте `.env.example`: `AUTH_OTP_PEPPER`, `SMTP_*`, `OAUTH_*`.
Callback URL OAuth: `/api/auth/external/<google|github|yandex|vk>/callback`.

## API Endpoints

### Аутентификация
- `GET /api/auth/providers` — доступные способы входа
- `POST /api/auth/email/request-code` — отправить код на email
- `POST /api/auth/email/verify-code` — проверить код
- `POST /api/auth/email/complete-registration` — завершить регистрацию
- `GET /api/auth/external/{provider}/start` — начать OAuth-вход
- `GET /api/auth/external/{provider}/callback` — OAuth callback
- `POST /api/auth/link-diary` — привязать дневник
- `POST /api/auth/complete-profile` — заполнить профиль после OAuth
- `PUT /api/profile/me/group` — сменить учебную группу

### Личный кабинет
- `GET /api/me` — профиль текущего пользователя
- `GET /api/me/schedule?date=YYYY-MM-DD` — расписание на день
- `GET /api/me/grades` — оценки текущего пользователя
- `GET /api/me/grades/performance` — подробная успеваемость
- `GET /api/me/assignments` — задания учебной группы

### Общие данные
- `GET /api/news` — опубликованные новости
- `GET /api/schedule/week?startDate=YYYY-MM-DD` — расписание на неделю

### Администрирование (требует роли Admin)
- `POST /api/admin/news` — создание новости
- `PUT /api/admin/news/{id}` — редактирование новости
- `DELETE /api/admin/news/{id}` — удаление/снятие публикации
- `POST /api/admin/assignments` — создание задания
- `PUT /api/admin/assignments/{id}` — редактирование задания

## Миграции БД

```bash
# Создание миграции
dotnet ef migrations add <Name> --project CollegePortal.Infrastructure --startup-project CollegePortal.Api

# Применение миграций
dotnet ef database update --project CollegePortal.Infrastructure --startup-project CollegePortal.Api

# Откат миграции
dotnet ef database update <PreviousMigrationName> --project CollegePortal.Infrastructure --startup-project CollegePortal.Api
```

## Документация

- [Архитектура](docs/architecture.md)
- [Исследование API](docs/api-research.md)
- [Прогресс разработки](docs/progress.md)
- [Безопасность](docs/security.md)

## Лицензия

MIT License — см. файл [LICENSE](LICENSE)