# Прогресс разработки

## Этап 0. Исследование внешних API ✅ ЗАВЕРШЁН

### Выполнено
- [x] Проверена документация API расписания (https://kkepik.rub1kub.ru/api/docs/)
- [x] Получены реальные примеры ответов от электронного дневника (spo.rso23.ru)
- [x] Подтверждена структура ответов дневника: расписание, dashboard, performance, account-settings
- [x] Выяснен способ получения ID студента: из ответа `/services/security/login` → `tenants.spo_04.studentRole.id`
- [x] Исследован официальный механизм авторизации: SSO/OIDC не предоставляется, только имитация логина через cookies
- [x] Проверены ограничения: rate limit 10 req/s на API расписания, TLS на обоих API
- [x] Зафиксированы найденные особенности в `docs/api-research.md`

### Результаты
- **Дневник (spo.rso23.ru)** — полностью рабочий, возвращает структурированные объекты
- **API расписания (kkepik.rub1kub.ru)** — публичный, возвращает текстовые строки (требует парсинга)
- **Основной источник расписания** — Дневник (персонализированные структурированные данные)
- **Fallback/справочники** — API расписания (группы, преподаватели, аудитории)
- **Интеграция** — прямой C# HttpClient с CookieContainer (без Python-адаптера)

---

## Этап 1. Инициализация проекта ✅ ЗАВЕРШЁН

### Выполнено
- [x] Создан Git-репозиторий (уже был)
- [x] Создана структура решения:
  - `CollegePortal.Api` — ASP.NET Core Web API
  - `CollegePortal.Application` — бизнес-логика, интерфейсы, DTO
  - `CollegePortal.Domain` — сущности, доменные правила
  - `CollegePortal.Infrastructure` — EF Core, SQL Server, внешние API клиенты
  - `CollegePortal.Tests` — xUnit тесты
  - `college-portal-client` — React + TypeScript + Vite
- [x] Настроены проектные ссылки (Project References)
- [x] Настроен SQL Server + EF Core (LocalDB для разработки)
- [x] Подключен Swagger/OpenAPI
- [x] Настроена конфигурация окружений (appsettings.json, appsettings.Development.json)
- [x] Обновлён README.md
- [x] Обновлён .gitignore для .NET + Node.js
- [x] Добавлены базовые тесты (1 тест проходит)
- [x] Проект собирается: `dotnet build` — успешно
- [x] Frontend собирается: `npm run build` — успешно

### Созданные сущности (Domain)
- `ApplicationUser` — пользователь с ролями
- `StudentProfile` — профиль студента с ExternalStudentId
- `StudyGroup` — учебная группа
- `Announcement` — новости
- `Assignment` — задания

### Инфраструктура
- `CollegePortalDbContext` с Identity и конфигурацией связей
- `DiaryApiClient` — клиент электронного дневника (авторизация, расписание, оценки, успеваемость, аккаунт)
- `ScheduleApiClient` — клиент API расписания (справочники, расписание по группе/преподавателю/аудитории)
- DI регистрация в `ServiceCollectionExtensions.AddInfrastructure()`

### Документация
- [x] `docs/api-research.md` — результаты исследования API
- [x] `docs/architecture.md` — описание архитектуры
- [x] `docs/progress.md` — этот файл
- [x] `docs/security.md` — решения по безопасности

---

## Этап 2. База данных и авторизация ✅ ЗАВЕРШЁН

### Выполнено
- [x] Создана миграция `InitialCreate`
- [x] Применена миграция: создана база `CollegePortal_Dev` в LocalDB
- [x] Реализован `AuthService`: регистрация, вход, выход, получение текущего пользователя, привязка профиля студента
- [x] Реализован `AuthController`:
  - `POST /api/auth/login` — вход (email/password → JWT)
  - `POST /api/auth/logout` — выход
  - `GET /api/auth/me` — профиль текущего пользователя
  - `POST /api/auth/register` — регистрация
  - `POST /api/auth/assign-profile` — привязка ExternalStudentId (Admin)
- [x] JWT аутентификация с валидацией issuer/audience/lifetime/signing key
- [x] Политики авторизации: `AdminOnly`, `StudentOnly`
- [x] Настроены `appsettings.json` / `appsettings.Development.json` с JWT ключами

---

## Этап 3. Интеграция расписания ✅ ЗАВЕРШЁН

### Выполнено
- [x] Созданы DTO для ответа API: `ScheduleResponseDto`, `WeekScheduleResponseDto`
- [x] Создан интерфейс `IScheduleService` в Application
- [x] Реализован `ScheduleService` в Infrastructure:
  - Получение ExternalStudentId из профиля авторизованного пользователя
  - Вызов `IScheduleProvider` (DiaryApiClient) для получения расписания
  - Маппинг внешних DTO в API DTO
- [x] Реализован `ScheduleController`:
  - `GET /api/schedule/day?date=YYYY-MM-DD` — расписание на день (авторизованный)
  - `GET /api/schedule/week?startDate=YYYY-MM-DD` — расписание на неделю (авторизованный)
  - `GET /api/schedule/group/week?group=...&startDate=...` — публичное расписание группы
- [x] Регистрация `IScheduleService` в DI
- [x] Обработка ошибок: профиль не найден, расписание недоступно

---

## Этап 4. Интеграция оценок ✅ ЗАВЕРШЁН

### Выполнено
- [x] Создан DTO `GradesDtos.cs`: `SubjectGradeResponseDto`, `GradesResponseDto`
- [x] Создан интерфейс `IGradesService` в Application
- [x] Реализован `GradesService` в Infrastructure:
  - Получение ExternalStudentId из профиля авторизованного пользователя
  - Получение dashboard (средние оценки) через `IGradesProvider`
  - Получение performance (детальная успеваемость) через `IGradesProvider`
  - Использование существующих типов из ExternalApiDtos (`PerformanceDto`, `SubjectPerformanceDto`, `DayWithMarksDto`, `MonthWithDaysDto`, `MonthDto`)
- [x] Реализован `GradesController`:
  - `GET /api/grades` — средние оценки по предметам
  - `GET /api/grades/performance` — детальная успеваемость по дням
- [x] Регистрация `IGradesService` в DI
- [x] Обработка ошибок: профиль не найден, оценки недоступны
- [x] Изоляция данных: каждый пользователь видит только свои оценки (ExternalStudentId из профиля)

---

## Этап 5. Новости и задания ✅ ЗАВЕРШЁН

### Выполнено
- [x] Добавлено поле `StudyGroupId` в сущность `Announcement` + миграция `AddStudyGroupToAnnouncement`
- [x] Созданы DTO: `AnnouncementDtos.cs` (`AnnouncementDto`, `CreateAnnouncementDto`, `UpdateAnnouncementDto`, `AnnouncementListDto`), `AssignmentDtos.cs` (`AssignmentDto`, `CreateAssignmentDto`, `UpdateAssignmentDto`, `AssignmentListDto`)
- [x] Созданы интерфейсы: `IAnnouncementService`, `IAssignmentService`
- [x] Реализованы сервисы: `AnnouncementService`, `AssignmentService`:
  - Авторизация: только автор или Admin могут редактировать/удалять
  - Студенты видят только публичные новости (IsPublished=true, PublishedAt <= now)
  - Студенты видят только задания своей группы (через StudyGroupId в профиле)
- [x] Реализованы контроллеры:
  - `AnnouncementsController`:
    - `GET /api/news` — публичные новости (AllowAnonymous, фильтр по группе)
    - `GET /api/news/{id}` — детали новости
    - `POST /api/news` — создание (Admin)
    - `PUT /api/news/{id}` — редактирование (Admin/Author)
    - `DELETE /api/news/{id}` — удаление (Admin/Author)
    - `PATCH /api/news/{id}/toggle-published` — переключение публикации (Admin/Author)
  - `AssignmentsController`:
    - `GET /api/assignments` — задания своей группы (Student)
    - `GET /api/assignments/{id}` — детали задания
    - `POST /api/assignments` — создание (Admin)
    - `PUT /api/assignments/{id}` — редактирование (Admin/Author)
    - `DELETE /api/assignments/{id}` — удаление (Admin/Author)
- [x] Регистрация сервисов в DI
- [x] Миграция применена к БД

---

## Этап 6. Frontend ✅ ЗАВЕРШЁН

### Страницы для создания
- [x] Вход (`/login`)
- [x] Главная (`/`)
- [x] Расписание (`/schedule`)
- [x] Оценки (`/grades`)
- [x] Успеваемость (`/performance`)
- [x] Задания (`/assignments`)
- [x] Новости (`/news` и `/news/:id`)
- [x] Административное управление контентом (`/admin`)

### Требования
- [x] Адаптивный интерфейс для компьютеров и телефонов (mobile-first)
- [x] Понятная навигация (боковое меню справа, закрывается на мобильных)
- [x] Состояния загрузки, ошибки и отсутствия данных (skeleton loaders)
- [x] Обработка истёкшей сессии (авто-редирект на /login)
- [x] Корректное отображение дат и времени (русский формат)
- [x] Отсутствие секретов во frontend-коде
- [x] Единый клиент для запросов к backend (Axios + interceptors для JWT)
- [x] Тёмная тема с акцентным цветом голубой (primary-500)
- [x] TanStack Query для кэширования и синхронизации данных

---

## Этап 7. Тестирование и запуск 🔄 В ПРОЦЕССЕ

### План проверки
- [x] Создание базы с нуля через миграции
- [x] Вход и выход
- [x] Разграничение ролей (Student / Admin)
- [x] Изоляция оценок пользователей
- [x] Корректность расписания
- [ ] Недоступность внешних API (graceful degradation)
- [ ] Пустые ответы и неожиданные данные
- [x] Адаптивность интерфейса (проверено на мобильных)
- [x] Отсутствие секретов в логах
- [ ] Развёртывание и резервное копирование базы

---

## Текущий фокус

**Следующий шаг:** Этап 7 — Финальное тестирование, graceful degradation при недоступности внешних API, подготовка к развёртыванию.