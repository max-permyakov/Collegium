# Исследование внешних API

## Цель
Подтвердить работоспособность интеграций с двумя внешними источниками данных:
1. **Электронный дневник** (https://spo.rso23.ru)
2. **API расписания колледжа** (https://kkepik.rub1kub.ru/api/docs/)

---

## 1. Электронный дневник (spo.rso23.ru) — **ПОДТВЕРЖДЁН И РАБОТАЕТ**

### Base URL
https://spo.rso23.ru

### Авторизация
- **Endpoint**: POST `/services/security/login`
- **Поля запроса**: `login`, `password`, `isRemember` (boolean)
- **Метод**: JSON в теле запроса
- **Куки**: Сервер возвращает `.AspNetCore.Cookies`, `.AspNetCore.Session`, `UID` — клиент должен сохранять и передавать их в последующих запросах
- **Результат**: Успешный вход (200 OK), возвращает JSON с данными организации и `studentRole.id` (в данном случае `2370`)

### Получение ID студента
- **Источник**: Поле `studentRole.id` в ответе `/services/security/login` (внутри `tenants.spo_04.studentRole.id`)
- **Дополнительно**: `/services/security/account-settings` возвращает массив `persons` с полем `id` (в данном случае `3155`) — это другой идентификатор (возможно, ID пользователя в системе авторизации)
- **Вывод**: Для вызова endpoints расписания/оценок используется `studentRole.id` (2370)

### Endpoints (все работают с авторизацией через cookies)

| Метод | Путь | Статус | Описание |
|-------|------|--------|----------|
| GET | `/services/students/{studentId}/lessons/{start}/{end}` | ✅ 200 | Расписание на период (YYYY-MM-DD/YYYY-MM-DD) |
| GET | `/services/students/{studentId}/dashboard` | ✅ 200 | Средние оценки по предметам |
| GET | `/services/reports/current/performance/{studentId}` | ✅ 200 | Детальная успеваемость по дням |
| GET | `/services/security/account-settings` | ✅ 200 | Настройки аккаунта, email, телефон, привязка ЕСИА |

### Структура данных (подтверждённые факты)

#### Расписание (`/lessons`)
- Массив дней с полями: `date` (ISO 8601), `isHoliday` (bool), `isShort` (bool), `lessons` (массив)
- Поля занятия:
  - `startTime`, `endTime` (HH:mm)
  - `name` (название предмета)
  - `timetable.classroom`: `buildingName`, `buildingId`, `name` (аудитория), `id`
  - `timetable.teacher`: `firstName`, `lastName`, `middleName`, `id`
  - `gradebook` (опционально): `id`, `themes` (массив строк), `lessonType` (enum: `PracticalTraining`, `Lecture`, ...), `tasks` (массив: `id`, `type` (Home/Class), `topic`, `isRequired`, `attachments`, `condition`)

#### Dashboard (`/dashboard`)
- Объект с полем `subjects` — массив предметов:
  - `id` (int), `name` (string), `mark` (number — средняя оценка, напр. 4.67)

#### Performance (`/performance`)
- `monthsWithDays`: массив месяцев с `month.num`, `month.name`, `daysWithLessons` (массив ISO дат)
- `daysWithMarksForSubject`: массив предметов с:
  - `subjectName` (string)
  - `daysWithMarks`: массив дней с `day` (ISO), `markValues` (массив строк: "Five", "Four", "Three", "Two"), `absenceType` (enum: "IsAbsentByValidReason", "IsAbsentByNotValidReason")
  - `averageMark` (number)

#### Account Settings (`/account-settings`)
- `esiaBound` (bool)
- `persons`: массив с `id`, `login`, `email`, `phone`, `firstName`, `lastName`, `middleName`, `birthday`, `orgName`, `orgId`, `isEsiaBound`, `trusted`

### Официальная авторизация (SSO/OAuth/OIDC)
- **Проверено**: В ответе `/account-settings` есть поле `esiaBound: true` и `isEsiaBound: true` у персоны — поддержка ЕСИА (Госуслуги) есть
- **Endpoints OAuth/OIDC не найдены** в публичной части API (нет `/.well-known/openid-configuration`, `/oauth/`, `/openid/`)
- **Вывод**: Официальный SSO/OIDC для сторонних приложений **не предоставляется**. ЕСИА используется для входа в саму систему дневника. Для интеграции остаётся только имитация логина через POST `/services/security/login` с сохранением cookies.

### Ограничения и допустимость
- **Rate limits**: Не документально подтверждены, но присутствуют стандартные ASP.NET Core защиты
- **TLS**: Работает по HTTPS, самоподписанные/невалидные сертификаты возможны (в тестах использовался `verify=False`)
- **Законность**: Требует согласования с администрацией колледжа. Пароль в `.env` хранится в зашифрованном/хешированном виде (base64-подобная строка) — **не хранить в открытом виде**

---

## 2. API расписания колледжа (kkepik.rub1kub.ru) — **ИЗУЧЕН, НЕТРЕБУЕТ АВТОРИЗАЦИИ**

### Base URL
https://kkepik.rub1kub.ru/api

### Документация
- Swagger UI: https://kkepik.rub1kub.ru/api/docs/
- OpenAPI spec: https://kkepik.rub1kub.ru/api/openapi.json

### Авторизация
- **Не требуется** (публичный API)
- Регистрация и API ключи не нужны

### Rate limiting
- Лимит: **10 запросов/секунду на IP**
- При 429 вернуть заголовок `Retry-After` (секунды)
- Не использовать в бесконечных циклах

### Endpoints

| Метод | Путь | Назначение | Параметры |
|-------|------|------------|-----------|
| GET | `/api/audiences` | Список аудиторий | — |
| GET | `/api/groups` | Список групп | — |
| GET | `/api/teachers` | Список преподавателей | — |
| GET | `/api/schedule/catalog` | Все справочники (группы, преподаватели, аудитории) за 60 сек | — |
| GET | `/api/schedule/group` | Расписание группы на день/текущий день | `group` (string, required), `date` (DD.MM.YYYY, optional) |
| GET | `/api/schedule/teacher` | Расписание преподавателя | `teacher` (string, required), `date` (DD.MM.YYYY, optional) |
| GET | `/api/schedule/audience` | Расписание аудитории | `audience` (string, required), `date` (DD.MM.YYYY, optional) |
| GET | `/api/schedule/download/{type}/{date}` | Скачать PDF/Excel (groups/teachers) | `schedule_type`: groups/teachers, `date`: DD.MM.YYYY |

### Формат ответа расписания (`Schedule`)
```json
{
  "date": "DD.MM.YYYY",
  "group": "128-Д9-2ИСП",
  "teacher": "Иванов И.И.",
  "audience": "53",
  "schedule": [
    "■1 пара – Математика – Иванов И.И. – 22"
  ]
}
```
- **Важно**: `schedule` — это **массив строк** (текстовые строки), **не объекты** занятий. Парсинг потребует regex/парсинга текста.
- Без параметра `date` — возвращает расписание на **текущий день** (или "последнее загруженное актуальное")

### Сравнение с дневником

| Характеристика | Дневник (spo.rso23.ru) | API расписания (kkepik.rub1kub.ru) |
|----------------|------------------------|-----------------------------------|
| Авторизация | Да (cookies) | Нет |
| Детализация | Объекты занятий (время, аудитория, преподаватель, темы, задания) | Текстовые строки |
| Групповое/персональное | Персональное (по studentId) | По группе/преподавателю/аудитории |
| Актуальность | Полное расписание на период | Только текущий день или указанная дата |
| Надёжность | Официальная система дневника | Внешний публичный API |

### Выбор основного источника расписания
**Основной — Дневник (spo.rso23.ru)**:
- Возвращает структурированные объекты, а не текст
- Содержит темы занятий, типы, привязанные задания
- Персонализировано для студента (учитывает подгруппы)
- Официальная система колледжа

**API расписания (kkepik.rub1kub.ru)** — как **fallback/дополнение**:
- Не требует авторизации
- Можно использовать для отображения расписания группы без входа
- Получение списков групп/преподавателей/аудиторий для справочников

---

## Текущие находки (зафиксировано)

### Электронный дневник
- ✅ Базовый URL: https://spo.rso23.ru
- ✅ Авторизация: POST /services/security/login (login, password, isRemember) → cookies
- ✅ Student ID: из `tenants.spo_04.studentRole.id` (2370)
- ✅ Расписание: GET /services/students/{id}/lessons/{start}/{end} → структурированные объекты
- ✅ Dashboard: GET /services/students/{id}/dashboard → subjects с средними оценками
- ✅ Performance: GET /services/reports/current/performance/{id} → детальная успеваемость по дням
- ✅ Account Settings: GET /services/security/account-settings → профиль, ЕСИА
- ✅ ЕСИА: Поддерживается в системе, но официального OIDC для сторонних приложений нет
- ⚠️ Пароль в .env — хеш/зашифрован, не открытый текст

### API расписания
- ✅ Базовый URL: https://kkepik.rub1kub.ru/api
- ✅ Swagger/OpenAPI: доступен
- ✅ Авторизация: не нужна
- ✅ Endpoints: groups, teachers, audiences, schedule по группе/преподавателю/аудитории
- ⚠️ Формат расписания — текстовые строки, требует парсинга
- ⚠️ Rate limit: 10 req/s на IP

---

## Необходимые действия перед разработкой (все выполнены)

1. ✅ Запустить `Main.py` и получить реальный ответ от `/services/security/login`
2. ✅ Исследовать ответ на предмет `studentId` и токенов/cookies
3. ✅ Открыть Swagger документацию API расписания
4. ✅ Зафиксировать все подтверждённые факты и неизвестные деталя
5. ✅ Принять решение о способе интеграции

---

## Решение об интеграции

### Способ: Прямой C# HTTP-клиент (без Python-адаптера)
**Причины**:
- Все endpoints дневника работают через стандартные HTTP + cookies
- C# `HttpClient` с `CookieContainer`/`HttpClientHandler.UseCookies` умеет сохранять куки
- Нет необходимости в отдельном процессе Python
- Упрощает развёртывание (один процесс backend)

### Архитектура интеграции
1. **DiaryApiClient** (C#) — обёртка над HttpClient:
   - `LoginAsync(login, password)` → сохраняет cookies в памяти/БД
   - `GetScheduleAsync(studentId, start, end)`
   - `GetDashboardAsync(studentId)`
   - `GetPerformanceAsync(studentId)`
   - `GetAccountSettingsAsync()`
   - Тайм-ауты: 30 сек
   - Обработка 401 → перелогин

2. **ScheduleApiClient** (C#) — для kkepik.rub1kub.ru:
   - `GetGroupsAsync()`, `GetTeachersAsync()`, `GetAudiencesAsync()`
   - `GetGroupScheduleAsync(group, date?)`
   - Парсинг текстовых строк в объекты (best effort)

3. **ScheduleProvider** (Application layer):
   - Пытается получить расписание из Дневника (персонализированное)
   - При ошибке — fallback на API расписания по группе студента
   - Кэширование: 5-10 минут в памяти (IMemoryCache)

---

## Следующий шаг: Этап 1 — Инициализация проекта

Создать структуру решения:
```
CollegePortal.sln
├── CollegePortal.Api           # ASP.NET Core Web API
├── CollegePortal.Application   # Business logic, interfaces
├── CollegePortal.Domain        # Entities, domain rules
├── CollegePortal.Infrastructure # EF Core, SQL Server, External API clients
├── CollegePortal.Tests         # xUnit tests
└── college-portal-client       # React + TypeScript + Vite
```

Задачи:
1. Создать solution и проекты
2. Настроить EF Core + SQL Server (LocalDB для разработки)
3. Подключить Swagger/OpenAPI
4. Настроить конфигурацию (appsettings.json, user-secrets)
5. Добавить README.md и обновить .gitignore
6. Настроить базовые тесты и проверку сборки

**Результат**: Проект запускается локально, backend доступен через Swagger, frontend открывается в браузере.