# План: система уведомлений (push + toast)

Статус: план изменений. WIP-код push-подписок уже есть в рабочей копии, но система
не завершена: push-сервис нигде не вызывается, уведомления не хранятся, toast
используется только на странице профиля.

## 1. Что уже сделано

| Слой | Файл | Состояние |
|------|------|-----------|
| Domain | `CollegePortal.Domain/Entities/PushSubscription.cs` | сущность подписки |
| Application | `CollegePortal.Application/Services/IPushNotificationService.cs` | интерфейс отправки |
| Infrastructure | `Services/PushNotificationService.cs` | отправка через `Lib.Net.Http.WebPush` |
| Infrastructure | `ExternalApis/Notifications/PushServiceClientOptions.cs` | VAPID-настройки |
| Infrastructure | `Data/CollegePortalDbContext.cs`, миграция `20261025125456_AddPushSubscriptions` | таблица `PushSubscriptions` |
| Api | `Controllers/PushController.cs` | `public-key`, `subscribe`, `unsubscribe` |
| Client | `src/services/push.ts`, `src/sw.ts`, `vite.config.ts` | подписка и service worker |
| Client | `src/App.tsx`, `ProfilePage.tsx` | `sonner` Toaster + переключатель в профиле |
| Deploy | `docker-compose.yml` | проброс `PUSH_VAPID_*` |

Сборка зелёная: `dotnet build CollegePortal.slnx` и `npm run build` проходят.

## 2. Найденные проблемы (до реализации)

### Высокие

1. **Push-сервис — мёртвый код.** `IPushNotificationService` зарегистрирован, но нет
   ни одного вызова. Ни одно событие (новость, задание, сообщение клуба) не создаёт
   уведомление.
2. **Нет хранилища уведомлений.** Push доставляется «в никуда»: если вкладка закрыта
   или push не пришёл, пользователь не увидит событие. Нет inbox, счётчика
   непрочитанных и истории.
3. **Отправка будет в HTTP-запросе.** После подключения триггеров рассылка на всех
   подписчиков выполнится синхронно внутри запроса (`PushController`/сервисы), с
   request-scoped `DbContext`. Это замедлит создание новости и может уронить запрос
   из-за внешнего push-сервиса.
4. **`DELETE /api/push/unsubscribe` не проверяет владельца.**
   `PushController.cs:67-76` удаляет подписку по `endpoint` без `UserId`. Любой
   авторизованный пользователь, узнав endpoint, отпишет другого.

### Средние

5. **Привязка подписки к аккаунту не синхронизируется.** После выхода из аккаунта
   подписка остаётся привязанной к старому пользователю; после входа другого
   аккаунта push продолжат приходить старому. Нужна синхронизация при login/logout
   (см. §6).
6. **Нет валидации `subscribe`.** Не проверяются схема/длина endpoint, формат
   `p256dh`/`auth`, нет лимита на количество подписок и rate limiting.
7. **Конфигурация неполная.** В `appsettings.json` нет секции `PushServiceClient`,
   в `.env.example` нет `PUSH_VAPID_*`. Пустые ключи не валидируются: `public-key`
   вернёт пустую строку, клиент молча не подпишется. `PushServiceClientOptions`
   лежит в global namespace, хотя файл в папке `ExternalApis/Notifications`.
8. **Service worker не различает foreground/background.** `sw.ts:28-35` всегда
   показывает системное уведомление, даже если вкладка активна. Отсюда дубли
   «push + toast» и невозможность показать in-app toast из push.
9. **Нет `pushsubscriptionchange`.** При ротации подписки браузером (Chrome/Edge)
   сервер продолжает хранить мёртвый endpoint.
10. **Профиль определяет состояние только по браузеру.** `ProfilePage.tsx:70-82`
    смотрит `pushManager.getSubscription()`, но не состояние на сервере; при
    `denied` показывает общую ошибку. Нет подсказки для iOS (нужна установка PWA).

### Низкие

11. Ошибка отправки логируется без исключения и без `UserId`
    (`PushNotificationService.cs:66-69`); обрабатывается только `410 Gone`, но не
    `404`, `400`, `429`.
12. Нет очистки мёртвых подписок и уведомлений (retention).
13. Нет `tag`/`renotify` у системных уведомлений — несколько новостей подряд дают
    пачку окон.
14. `notificationclick` переходит по `data.url` без проверки, что это внутренний
    относительный путь.
15. Нет тестов на подписки, права доступа и рассылку.

## 3. Целевая архитектура

```
Событие (новость/задание)
        │
        ▼
INotificationService ──► Notification (БД, inbox + outbox)
        │                        │
        │                        └─► GET /api/notifications, unread-count
        ▼
Channel<Guid> (in-memory) ──► PushDeliveryWorker (BackgroundService)
                                     │
                                     ▼
                         IPushNotificationService
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
             Web Push (браузер)                PushSubscriptions
                     │                         (410/404 → удалить)
                     ▼
              Service Worker
              ┌──────┴────────┐
        вкладка активна   вкладка закрыта
              │                │
     postMessage → toast   showNotification
```

Принципы:

- **`Notification` — источник истины.** Строка создаётся в той же транзакции, что и
  бизнес-событие. Push — best-effort доставка поверх неё.
- **Toast — presentation layer.** В foreground push не показывает системное
  уведомление, а передаёт данные странице, которая показывает `sonner` toast.
  Polling непрочитанных (60 с) — fallback, если push запрещён/недоступен.
- **Без SSE/SignalR в MVP.** Отдельный realtime-канал не нужен: push уже даёт
  событие, polling закрывает остальное. SignalR можно добавить позже, если
  понадобится live-обновление без push.
- **Асинхронная отправка.** HTTP-запрос только пишет `Notification` и кладёт id в
  очередь. Отправку делает hosted service со своим scope.

## 4. Модель данных

### Новая сущность `Notification`

```csharp
public class Notification
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    public NotificationType Type { get; set; }
    public string Title { get; set; } = "";      // max 200
    public string Body { get; set; } = "";       // max 1000
    public string? Url { get; set; }             // max 500, только "/..."
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; }

    // outbox-поля
    public DateTime? PushSentAt { get; set; }
    public int PushAttempts { get; set; }
}

public enum NotificationType { System = 0, News = 1, Assignment = 2, ClubMessage = 3, Comment = 4, ChatMessage = 5 }
```

Конфигурация EF:

- индекс `(UserId, IsRead, CreatedAt DESC)`;
- индекс `(PushSentAt, CreatedAt)` для sweeper'а;
- FK на пользователя с `Cascade`;
- `Url` обязателен для типов, у которых есть страница (валидация в сервисе).

Fan-out «по одному row на пользователя» выбран осознанно: аудитория колледжа —
тысячи человек, зато просто читать статус и счётчик. Если появится рассылка на
десятки тысяч, вводится `Notification` + `NotificationRecipient`.

### Изменения `PushSubscription`

Добавить:

- `UserAgent` (max 300) — диагностика, какой браузер/устройство;
- `LastSuccessAt` (DateTime?) — видно, живая ли подписка;
- `FailureCount` (int) — удалять после N подряд ошибок доставки.

`Endpoint` остаётся уникальным. `UserId` — индекс.

## 5. API

| Метод | Путь | Доступ | Назначение |
|-------|------|--------|-----------|
| GET | `/api/push/public-key` | anonymous | VAPID public key |
| POST | `/api/push/subscribe` | auth | upsert по endpoint, привязка к текущему user |
| DELETE | `/api/push/subscribe?endpoint=` | auth | удалить **только свою** подписку |
| GET | `/api/notifications?limit=30&before=` | auth | список своих уведомлений (cursor) |
| GET | `/api/notifications/unread-count` | auth | `{ count }` |
| POST | `/api/notifications/{id}/read` | auth | отметить прочитанным (только своё) |
| POST | `/api/notifications/read-all` | auth | отметить все |
| DELETE | `/api/notifications/{id}` | auth | удалить (только своё) |
| POST | `/api/notifications/test` | auth, dev/admin | отправка тестового push |

DTO:

```csharp
public record NotificationDto(
    Guid Id, string Type, string Title, string Body,
    string? Url, bool IsRead, DateTime CreatedAt);
```

Валидация `SubscribeRequest`:

- `Endpoint` — абсолютный `https://`, длина ≤ 2048;
- `P256dh` — base64url, 80–120 символов; `Auth` — 16–40 символов;
- не более 10 подписок на пользователя (старые вытесняются);
- rate limit на `subscribe` (например, 20/мин на пользователя).

## 6. Клиентская часть

### 6.1 Провайдер уведомлений

`src/context/NotificationsContext.tsx`:

- `useQuery(['notifications','unread-count'])` с `refetchInterval: 60_000`,
  `refetchIntervalInBackground: false`, `enabled: !!user`;
- `useQuery(['notifications','list'])` — для inbox;
- `useEffect` слушает `navigator.serviceWorker.addEventListener('message')`:
  сообщение `{ type: 'push', notification }` → `toast(...)` + invalidate queries;
- дедупликация по `notification.id` через `useRef<Set<string>>` (один и тот же
  push может прийти и через SW, и через polling);
- методы `markRead`, `markAllRead`, `open(notification)`.

Провайдер вставляется в `App.tsx` внутри `AuthProvider` (там доступен `user`) и
оборачивает `AppRoutes`.

### 6.2 Колокольчик и inbox

- `src/components/notifications/NotificationBell.tsx` — счётчик + dropdown
  (desktop) / экран (mobile);
- размещается в шапке `RightSidebar` (desktop) и мобильной панели;
- пункт: иконка по типу, title, body (2 строки), относительное время, точка
  непрочитанного; клик → `markRead` + `navigate(url)`;
- кнопка «Прочитать все»;
- пустое состояние и скелетон загрузки.

### 6.3 Push-подписка

Переработать `src/services/push.ts`:

- `getPushState(): 'unsupported' | 'denied' | 'inactive' | 'active'` — учитывает
  `Notification.permission`, `pushManager.getSubscription()` и ответ сервера;
- `enablePush()` — запрос разрешения, `subscribe`, `POST /push/subscribe`;
- `disablePush()` — `DELETE` + `subscription.unsubscribe()`;
- `syncPushBinding()` — после входа: если разрешение `granted` и подписка есть,
  повторно `POST /push/subscribe` (перепривязка к текущему аккаунту);
- при выходе — `DELETE /push/subscribe` (сервер забывает binding, браузерная
  подписка остаётся; при следующем входе `syncPushBinding` вернёт её);
- определить iOS < 16.4 / «не установлено как PWA» и показать подсказку вместо
  кнопки.

Правило приватности: push не должен приходить на браузер после logout. Серверная
строка удаляется, поэтому доставки нет.

### 6.4 Service worker

`src/sw.ts`:

- `push`: если есть хотя бы один visible-клиент — `client.postMessage({ type:
  'push', notification })` и **не** показывать системное уведомление; иначе
  `showNotification` с `tag` (например, `news:<id>`), `icon`, `badge`, `data`;
- payload парсить defensively (`event.data.json()` в try/catch), проверять поля;
- `pushsubscriptionchange`: переподписаться и отправить новый endpoint на сервер;
- `notificationclick`: разрешать только same-origin относительные пути
  (`url.startsWith('/')`), иначе `/`; `client.focus()` + `navigate`, иначе
  `openWindow`;
- `notificationclose` — не требуется в MVP.

### 6.5 Toast для действий пользователя

`sonner` уже подключён. Добавить единый helper `src/utils/notify.ts` (success /
error / info) и использовать в мутациях, где сейчас ошибки только логируются:
новости, задания, клубы, админка. Это отдельный сквозной пункт, не блокирует
push-часть.

## 7. Триггеры

| Событие | Когда | Получатели | Тип |
|---------|-------|------------|-----|
| Новость опубликована | `Create` с `IsPublished` и `PublishedAt <= now`; `Update`/`TogglePublished` при переходе в опубликованное | студенты группы новости или все активные пользователи; автор исключён | `News` |
| Задание создано | `AssignmentService.CreateAsync` после `SaveChanges` | студенты `StudyGroupId`, автор исключён | `Assignment` |
| Задание изменено | только если изменился `DueAt` | те же | `Assignment` |
| Сообщение в клубе | `ClubService.PostMessageAsync` | участники клуба, автор исключён; агрегировать: не чаще 1 уведомления на клуб в 10 минут | `ClubMessage` |
| Комментарий к новости | `NewsCommentService.CreateAsync` | автор новости | `Comment` |
| Личное сообщение в чате | `ChatService.SendAsync` | второй участник Direct-чата; в «Поддержке» — владелец треда при ответе администратора («Избранное» — без уведомлений). Если получатель в этот момент читает этот чат (presence-heartbeat), уведомление не создаётся | `ChatMessage` |
| Оценки | по расписанию (diff при пересчёте) | — | вне MVP |

Важно: отложенная публикация (`PublishedAt` в будущем) не имеет планировщика.
Либо в MVP считать «опубликовано сейчас», либо добавить hosted job, который раз в
минуту публикует и рассылает созревшие новости. Рекомендуется второе — иначе
запланированные новости не дадут push.

Тексты уведомлений не должны содержать чувствительных данных (оценки, ФИО
преподавателя) — только нейтральный заголовок и ссылка.

## 8. Надёжность и безопасность

- **Очередь.** `Channel<Guid>` (unbounded/limited) + `PushDeliveryWorker`:
  `IServiceScopeFactory` → `IPushNotificationService.SendAsync(notificationId)`.
  HTTP-запрос не ждёт push.
- **Outbox-sweeper.** Тот же worker раз в минуту выбирает `Notification` с
  `PushSentAt == null AND PushAttempts < 3 AND CreatedAt < now-1min` — защита от
  падения процесса между записью и отправкой.
- **Ошибки.** `404`/`410` — удалить подписку; `429`/`5xx` — `PushAttempts++` и
  повтор с backoff; `400` — инкремент `FailureCount`, после 3 — удалить.
  Логировать `notificationId`, `userId`, статус, без endpoint/keys.
- **Retention.** Раз в сутки: удалять прочитанные старше 90 дней, все старше 180;
  подписки без успешной доставки > 180 дней.
- **Валидация URL.** Только относительный путь, начинающийся с `/`, без `//`.
- **Конфигурация.** `PushServiceClient` в `appsettings.json` (пустые значения),
  реальные ключи — user-secrets/env. `AddOptions<...>().Validate(...).ValidateOnStart()`
  при включённом push. Если ключи пусты — push отключён, `public-key` возвращает
  `204`/`{ enabled: false }`, клиент не показывает кнопку.
- **Секреты.** VAPID private key не попадает в логи, `.env` в gitignore.
- **Мультиинстансность.** In-memory очередь работает только при одном экземпляре
  API. В `docker-compose.yml` сервис один; при масштабировании потребуется
  Postgres outbox-polling без in-memory канала (sweeper уже покрывает это).

## 9. Этапы работ

### Этап 0. Стабилизация WIP (0.5 дня)

- [x] Перенести `PushServiceClientOptions` в namespace
      `CollegePortal.Infrastructure.ExternalApis.Notifications`.
- [x] Добавить секцию `PushServiceClient` в `appsettings.json`, `PUSH_VAPID_*` в
      `.env.example`, инструкцию генерации ключей
      (`npx web-push generate-vapid-keys`).
- [x] `PushController`: проверка владельца в `unsubscribe`, валидация
      `SubscribeRequest`, `[ProducesResponseType]`.
- [x] `PushNotificationService`: не глотать исключение, обрабатывать `404`,
      `FailureCount`, логировать контекст.
- [x] `sw.ts`: foreground → `postMessage` вместо `showNotification`; безопасный
      URL; `tag`.
- [x] `ProfilePage`: состояния `unsupported/denied/inactive/active`, `toast` с
      понятными текстами.

**Готово, когда:** подписка/отписка работают, повторный вход перепривязывает
подписку, foreground push даёт toast, `dotnet build` и `npm run build` зелёные.

### Этап 1. Ядро уведомлений на сервере (1–2 дня)

- [x] `Notification`, `NotificationType`, конфигурация EF, миграция.
- [x] `INotificationService` + `NotificationService` (fan-out, фильтры, URL).
- [x] `NotificationsController` (list, unread-count, read, read-all, delete).
- [x] `PushDeliveryWorker` + `Channel`, outbox-sweeper, retention.
- [x] Триггеры: новость, задание.
- [x] Тесты: фильтрация получателей и права на read/delete
      (`NotificationServiceTests`); удаление подписки при 410 и повтор при 5xx
      остаются интеграционным сценарием с реальным push-сервисом.

**Готово, когда:** публикация новости и создание задания создают строки
`Notifications`, push уходит подписчикам, автор не получает уведомление, повторный
запуск worker'а не теряет недоставленные.

### Этап 2. Toast и inbox на клиенте (1–2 дня)

- [x] `notificationsApi` + типы.
- [x] `NotificationsContext` (polling, SW message, дедупликация).
- [x] `NotificationBell` + список, счётчик, read/read-all.
- [x] `RightSidebar`: колокольчик в desktop и mobile.
- [x] `syncPushBinding` при login, `DELETE` при logout, состояние в профиле через
      хук.
- [x] Пустые/загрузочные/ошибочные состояния, доступность (aria-label, focus).

**Готово, когда:** при активной вкладке push превращается в toast без системного
уведомления; при закрытой — системное уведомление; клик открывает нужный раздел;
в inbox видны непрочитанные, счётчик уменьшается.

### Этап 3. Расширение (1–2 дня)

- [x] Сообщения клубов (с агрегацией: не чаще 1 уведомления на клуб в
      10 минут, ключ агрегации — URL `/clubs/{clubId}`) и комментарии к новостям
      (автор новости, комментатор исключён).
- [x] Настройки по типам уведомлений: таблица `NotificationPreference`
      (хранятся только отключённые типы), fan-out фильтрует получателей,
      `GET/PUT /api/notifications/preferences`, переключатели в профиле.
- [x] Отложенная публикация новостей через hosted job
      (`AnnouncementPublicationWorker`, маркер `Announcement.NotifiedAtUtc`).
- [x] Toast для успешных/неуспешных действий в остальных разделах:
      `utils/notify.ts` подключен к кружкам, новостям, комментариям, заданиям
      (Админ), профилю, админ-табам, карте колледжа.

### Этап 4. Эксплуатация (0.5–1 день)

- [ ] Метрики: отправлено/доставлено/ошибок, размер очереди, dead subscriptions.
- [ ] Обновить `docs/architecture.md`, `docs/deployment.md`, README.
- [ ] Ручной чек-лист: Chrome desktop, Android Chrome, iOS PWA, отказ в
      разрешении, offline.
- [ ] Очистка тестовых уведомлений и `POST /notifications/test` в prod.

Итого: ~4–6 рабочих дней одного разработчика.

## 10. Открытые решения

1. **Inbox обязателен?** Если нужны только toast + push без истории, этап 2
   сокращается: остаются polling unread-count и toast, без списка. Рекомендуется
   inbox — иначе пропущенные события теряются.
2. **Кто получает новости?** Все активные пользователи или только студенты
   (роль `Student`)? Сейчас в плане — все, кроме автора, с учётом группы новости.
3. **Сообщения клубов** — уведомлять всегда или только по `@упоминанию`? Чатовый
   спам — главный риск. Реализовано: всегда, с агрегацией не чаще 1 уведомления
   на клуб в 10 минут; отключается в профиле по типу `ClubMessage`. Упоминания —
   возможное развитие.
4. **Logout** — удалять серверную привязку push (рекомендуется) или оставлять
   подписку до явного отключения? Первое приватнее, второе удобнее.
5. **Мультиинстансность** — планируется ли горизонтальное масштабирование API?
   Если да, in-memory `Channel` заменяется на polling outbox с самого начала.
