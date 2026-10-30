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
- `Entities/ApplicationUser` — пользователь с ролями (Student, Admin), `RegistrationSource`/`LastAuthMethod`
- `Entities/StudentProfile` — профиль студента, nullable-связь с внешним ID, зашифрованный diary hash
- `Entities/UserAuthProvider` — привязанные способы входа
- `Entities/EmailLoginCode` — OTP-коды и registration/pending-OAuth токены (только хэши)
- `Entities/StudyGroup` — учебная группа
- `Entities/Announcement` — новости/объявления
- `Entities/Assignment` — учебные задания
- `Entities/Notification` — уведомление пользователя (inbox + outbox-поля `PushSentAt`, `PushAttempts`)
- `Entities/PushSubscription` — Web Push подписка браузера, привязанная к пользователю
- `Enums/NotificationType` — System, News, Assignment, ClubMessage, Comment, ChatMessage
- `Enums/AuthMethod` — Diary, Email, Google, GitHub, Yandex, Vk

### Application (CollegePortal.Application)
- `Services/IScheduleProvider` — интерфейс получения расписания
- `Services/IGradesProvider` — интерфейс получения оценок
- `Services/IDiaryApiClient` — интерфейс клиента дневника
- `Services/IEmailSender` — отправка OTP-писем
- `Services/IOAuthService` — OAuth Authorization Code + PKCE
- `Services/INotificationService` — создание уведомлений и работа с inbox
- `Services/IPushNotificationService` — доставка Web Push по подпискам
- `DTOs/NotificationDtos.cs` — DTO уведомлений
- `DTOs/AlternativeAuthDtos.cs` — DTO альтернативного входа
- `DTOs/ExternalApiDtos.cs` — DTO для внешних API

### Infrastructure (CollegePortal.Infrastructure)
- `Data/CollegePortalDbContext` — EF Core контекст
- `Extensions/ServiceCollectionExtensions` — регистрация сервисов
- `ExternalApis/Diary/DiaryApiClient` — клиент электронного дневника
- `ExternalApis/Schedule/ScheduleApiClient` — клиент API расписания
- `ExternalApis/OAuth/OAuthService` — Google/GitHub/Yandex/VK
- `Services/AuthService` — Identity, OTP, OAuth, миграция и привязка аккаунтов
- `Services/SmtpEmailSender` — SMTP-доставка кодов
- `Services/NotificationService` — fan-out по получателям, inbox, нормализация URL
- `Services/PushNotificationService` — Web Push (VAPID), retry, удаление мёртвых подписок
- `Notifications/NotificationQueue` — in-memory `Channel<Guid>` для фоновой отправки
- `Notifications/PushDeliveryWorker` — hosted service: очередь, outbox-sweeper, retention
- `ExternalApis/Notifications/PushServiceClientOptions` — конфигурация VAPID

### Api (CollegePortal.Api)
- `Program.cs` — точка входа, DI, rate limiting, CORS
- `Controllers/AuthController` — вход, регистрация, OAuth callbacks
- `Controllers/ProfileController` — профиль, смена группы, привязка дневника
- `Controllers/NotificationsController` — inbox: список, unread-count, read/read-all, delete, admin test
- `Controllers/PushController` — публичный VAPID-ключ, subscribe/unsubscribe
- `Controllers/ChatsController` — личные чаты, «Избранное», «Поддержка», вложения, read-receipts, presence-heartbeat открытого чата, статус собеседника («в сети/печатает/записывает») через `GET /{id}/presence`, индикатор активности `POST /{id}/status`, редактирование `PATCH messages/{id}` и пересылка `POST messages/{id}/forward`
- `Controllers/AdminSupportController` — инбокс поддержки (только роль Admin): список обращений; чтение и ответы идут через `/api/chats`, где админу открыт доступ к Support-тредам

## Уведомления (push + in-app)

1. Доменный сервис (`NotificationService`) создаёт по строке `Notifications` на
   каждого получателя и кладёт id в `NotificationQueue` (`Channel<Guid>`).
2. HTTP-запрос не ждёт доставки: `PushDeliveryWorker` разбирает очередь и вызывает
   `PushNotificationService` в отдельном DI-scope.
3. `PushNotificationService` отправляет Web Push по всем подпискам пользователя
   через VAPID, повторяет временные ошибки, удаляет подписки при `404/410` и после
   трёх `400`.
4. `PushSentAt`/`PushAttempts` работают как outbox: sweeper раз в минуту добирает
   неотправленные строки после рестарта; retention чистит старые уведомления и
   подписки.
5. Service worker при открытой видимой вкладке пересылает push в страницу
   (`postMessage`) — клиент показывает toast; иначе показывает системное
   уведомление. Клик открывает только относительный SPA-путь.
6. Клиент опрашивает `/api/notifications` и `/unread-count` раз в 60 секунд,
   дедуплицирует push/polling по id и ведёт счётчик в колокольчике.

### Триггеры

| Событие | Сервис | Тип | Особенности |
|---------|--------|-----|-------------|
| Публикация новости | `AnnouncementService` | News | группа новости или все активные; автор исключён |
| Отложенная публикация новости | `AnnouncementPublicationWorker` | News | раз в минуту добирает `NotifiedAtUtc == null` |
| Создание задания / сдвиг дедлайна | `AssignmentService` | Assignment | студенты группы, автор исключён |
| Новое сообщение в клубе | `ClubService` | ClubMessage | агрегация: не чаще 1 уведомления на клуб за 10 минут |
| Новый комментарий к новости | `NewsCommentService` | Comment | автор новости, комментатор исключён |
| Личное сообщение в чате | `ChatService` | ChatMessage | получатель — второй участник Direct-чата; «Избранное» уведомлений не создаёт; в «Поддержке» владельца уведомляет только ответ администратора; уведомление пропускается, если получатель сейчас читает этот чат; сбой отправки уведомления не блокирует отправку. Пересланные сообщения (`forward`) уведомляют получателя чата-назначения по тем же правилам, что и обычные |

Каждая новость анонсируется не более одного раза: `Announcement.NotifiedAtUtc`
ставится после успешного fan-out; запланированная новость (.IsPublished +
будущий PublishedAt) доставляется именно hosted job'ом.

### Настройки по типам

`NotificationPreferences` хранит отключённые типы (отсутствие строки =
«включено»). Fan-out фильтрует получателей до создания строк, поэтому отключённый
тип не появляется ни в push, ни в inbox. API: `GET/PUT /api/notifications/preferences`
(News, Assignment, ClubMessage, Comment, ChatMessage); UI — карточка «Уведомления» в профиле.

Push отключён, если `PushServiceClient:PublicKey`/`PrivateKey` пусты;
`GET /api/push/public-key` тогда возвращает `{ enabled: false }`, и UI показывает
состояние «Недоступно». При выходе серверная привязка подписки удаляется, при
следующем входе — восстанавливается.

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
- JWT access/refresh в HttpOnly cookies
- Альтернативный вход: OTP по email и OAuth (PKCE S256, проверка state)
- Проверка прав доступа на уровне контроллеров; `403 diary_required` без дневника
- Валидация входных данных и группы по справочнику колледжа
- Смена учебной группы не чаще одного раза в 3 дня (`Profile:GroupChangeCooldownDays`)
- Тайм-ауты внешних запросов (30с дневник, 10с расписание)
- Отсутствие секретов, OTP и токенов в логах и коде
- User Secrets / Environment variables для конфигурации

## База данных

- **PostgreSQL** (Npgsql, локально через Docker)
- EF Core Code First с миграциями
- Таблицы:
  - `AspNetUsers` (ApplicationUser)
  - `AspNetRoles`, `AspNetUserRoles`
  - `StudentProfiles`
  - `UserAuthProviders`
  - `EmailLoginCodes`
  - `StudyGroups`
  - `Announcements`
  - `Assignments`
  - `Notifications`
  - `NotificationPreferences`
  - `PushSubscriptions`

## Frontend (college-portal-client)

- React 18 + TypeScript + Vite
- React Router для навигации
- TanStack Query для кэширования и синхронизации данных
- `App.tsx` — маршруты грузятся лениво (`React.lazy` + `Suspense`), чанки прогреваются в простое после входа, поэтому стартовый бандл содержит только оболочку и текущую страницу
- `utils/pageCache.ts` — небольшой in-memory кэш данных страниц (10 минут, очищается при входе/выходе): повторный заход на Главную, Расписание, Оценки, Успеваемость, Задания и Новости рисуется сразу, а свежие данные подгружаются в фоне
- Axios для HTTP клиента
- Адаптивный дизайн (mobile-first)
- `context/NotificationsContext` — polling, сообщения service worker, toast (`sonner`), дедупликация
- `components/notifications/NotificationBell` — счётчик и inbox
- `services/push.ts` — состояние подписки, включение/отключение, перепривязка при входе
- `utils/notify.ts` — тосты успеха/ошибок для мутаций (`sonner`), серверный текст ошибки имеет приоритет
- `pages/profile/ProfilePage` — push-статус, тест уведомления, переключатели по типам
- `sw.ts` (Workbox injectManifest) — foreground `postMessage`, системные уведомления, `pushsubscriptionchange`

## Развёртывание

1. Применить миграции: `dotnet ef database update`
2. Собрать frontend: `npm run build` в `college-portal-client`
3. Настроить переменные окружения / User Secrets
4. Запустить `CollegePortal.Api`
5. Настроить reverse proxy (nginx/IIS) для frontend и SSL