# План перехода на авторизацию через электронный дневник (spo.rso23.ru)

## 1. Исследование алгоритма хеширования пароля

### Задача
Пароль в .env: `LOGIN="60300078"`, `PASSWORD="n91LLc3kEf5Z0y2/wzxKbmw3wXeoUYYhng9Do9pVgxM="`
Нужно определить алгоритм: `hash("60300078") == "n91LLc3kEf5Z0y2/wzxKbmw3wXeoUYYhng9Do9pVgxM="`

### План исследования
1. **Создать тестовый скрипт** для подбора алгоритма:
   - SHA-256("60300078") → base64
   - SHA-256("60300078" + salt) → base64 (попробовать известные соли)
   - PBKDF2-SHA256 с разными итерациями (ASP.NET Core Identity: 100000)
   - HMAC-SHA256 с известными ключами
   - Попробовать известные форматы ASP.NET Core Identity hash

2. **Проверить JS-код дневника** (если доступен) на наличие клиентского хеширования

3. **Результат**: Определить точный алгоритм для реализации на клиенте (TypeScript/Web Crypto API) и сервере (C#)

---

## 2. Архитектура новой авторизации

### Общий флоу
```
┌─────────────┐     Логин/Хеш пароля      ┌──────────────┐     Куки/StudentId      ┌─────────────┐
│  Браузер    │ ─────────────────────────▶ │  Наш API     │ ───────────────────────▶ │ Дневник API │
│  (клиент)   │  POST /api/auth/diary-login │  (прокси)    │  GET /students/{id}/... │  (spo.rso23)│
└─────────────┘                            └──────────────┘                         └─────────────┘
      ▲                                            │                                      │
      │                                            ▼                                      ▼
      │                              ┌─────────────────────────┐              ┌──────────────────┐
      │                              │  Наш API                │              │  Наш API         │
      │                              │  - Валидация ответа     │              │  - Сохраняем     │
      │                              │  - Извлекаем StudentId  │              │    куки в БД     │
      │                              │  - Получаем профиль     │              │  - Создаем JWT   │
      │                              │  - Синхронизируем данные│              │    для клиента   │
      │                              └─────────────────────────┘              └──────────────────┘
      │                                                                           ▲
      └───────────────────────────────────────────────────────────────────────────┘
                                         Access Token (JWT)
```

### Эндпоинты нашего API
| Эндпоинт | Назначение |
|----------|------------|
| `POST /api/auth/diary-login` | Принимает `login` + `password_hash`, логинится в дневник, возвращает наш JWT + сохраняет куки дневника |
| `POST /api/auth/diary-relogin` | Автоматический релогин по сохраненному хешу (вызывается при 401 от дневника) |
| `GET /api/auth/me` | Возвращает профиль пользователя + StudentProfile |
| `POST /api/auth/logout` | Удаляет куки дневника из БД, инвалидирует JWT |

---

## 3. Клиентская часть (TypeScript)

### Хеширование пароля на клиенте
```typescript
// utils/diary-crypto.ts
async function hashDiaryPassword(login: string, password: string): Promise<string> {
  // TODO: Реализовать после определения алгоритма
  // Пример для SHA-256:
  const encoder = new TextEncoder();
  const data = encoder.encode(login + password); // или другой формат
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}
```

### Авторизационный контекст
- При загрузке приложения: проверка JWT в localStorage
- Автоматический релогин через `/api/auth/diary-relogin` при 401
- Перехватчик axios: при 401 от дневника → вызов relogin → повтор запроса

---

## 4. Серверная часть (C#)

### DiaryApiClient — полная переработка
```csharp
// Infrastructure/ExternalApis/Diary/DiaryApiClient.cs
public class DiaryApiClient : IDiaryApiClient
{
    // 1. LoginWithHash(login, passwordHash) -> возвращает куки + StudentId
    // 2. Relogin(userId) -> берет хеш из БД, логинится, обновляет куки
    // 3. Все методы GetSchedule/GetGrades используют сохраненные куки
    // 4. При 401 -> автоматический Relogin + retry
}
```

### Хранение в БД
```csharp
// Domain/Entities/StudentProfile.cs - добавить поля
public class StudentProfile
{
    // ... existing fields
    public string DiaryCookieData { get; set; } // JSON с куками (зашифрованный)
    public string DiaryPasswordHash { get; set; } // Зашифрованный хеш пароля для релогина
    public DateTime? DiaryCookiesExpiresAt { get; set; }
    public DateTime? DiaryLastSyncedAt { get; set; }
}
```

### Шифрование чувствительных данных
- Использовать `IDataProtectionProvider` (ASP.NET Core Data Protection)
- `DiaryPasswordHash` и `DiaryCookieData` шифруются перед записью в БД

### AuthService — новые методы
```csharp
public interface IAuthService
{
    Task<LoginResponseDto?> DiaryLoginAsync(string login, string passwordHash);
    Task<LoginResponseDto?> DiaryReloginAsync(Guid userId);
    Task<bool> UpdateDiaryCookiesAsync(Guid userId, string cookieData, DateTime? expiresAt);
    Task<bool> UpdateDiaryPasswordHashAsync(Guid userId, string passwordHash);
}
```

---

## 5. Синхронизация данных при логине

При успешном входе в дневник автоматически подтягиваем:
1. **Профиль** → `/services/security/account-settings` → обновляем StudentProfile
2. **Расписание на 2 недели** → `/services/students/{id}/lessons/{start}/{end}`
3. **Оценки (dashboard)** → `/services/students/{id}/dashboard`
4. **Детальная успеваемость** → `/services/reports/current/performance/{id}`

Данные кэшируются в нашей БД с TTL (например, расписание — 1 час, оценки — 6 часов).

---

## 4. Фронтенд изменения

### Страница входа (`/login`)
- Поля: Логин (номер студенческого), Пароль
- Клиентское хеширование пароля перед отправкой
- Никакой регистрации, никаких ролей

### Автоматический релогин
- Axios interceptor: при 401 от `/api/schedule/*`, `/api/grades/*` → вызов `/api/auth/diary-relogin` → retry

### Удаление старого кода
- Удалить `RegisterRequestDto`, `RegisterAsync`
- Удалить выбор роли
- Удалить старый `AuthController` login/register

---

## 5. Администратор

### Настройка через переменные окружения
```bash
# .env.production
ADMIN_EMAIL=admin@college.local
ADMIN_PASSWORD_HASH=<bcrypt-хеш>
ADMIN_DISPLAY_NAME=Administrator
```

- Админ создается через сидинг в `Program.cs` при первом запуске
- Пароль админа хранится как bcrypt-хеш (не дневник-хеш!)
- Админ входит через отдельный эндпоинт или тот же, но с флагом `is_admin: true`

---

## 6. Безопасность

| Аспект | Решение |
|--------|---------|
| Пароль дневника | Хранится только в виде хеша (клиентское хеширование), в БД — зашифрован через Data Protection |
| Куки дневника | Шифруются перед записью в БД, расшифровываются только в памяти при запросах |
| JWT токен | Короткий TTL (15-30 мин), refresh через relogin |
| HTTPS | Обязательно в production |
| Rate limiting | На `/api/auth/diary-login` — 5 req/min на IP |

---

## 7. План реализации (поэтапно)

### Этап 1: Определение алгоритма хеша (1-2 часа)
- [ ] Написать скрипт подбора алгоритма
- [ ] Найти работающий алгоритм для "60300078" → известный хеш
- [ ] Документировать алгоритм

### Этап 2: Серверная инфраструктура (3-4 часа)
- [ ] Добавить поля в `StudentProfile` (миграция)
- [ ] Настроить Data Protection для шифрования
- [ ] Переписать `DiaryApiClient` с поддержкой релогина
- [ ] Реализовать `AuthService.DiaryLoginAsync` / `DiaryReloginAsync`
- [ ] Создать `AuthController` с новыми эндпоинтами

### Этап 3: Синхронизация данных (2-3 часа)
- [ ] Реализовать авто-подтягивание профиля/расписания/оценок при логине
- [ ] Кэширование в БД с TTL

### Этап 4: Фронтенд (2-3 часа)
- [ ] Клиентское хеширование (Web Crypto API)
- [ ] Новая страница входа (только логин/пароль)
- [ ] Axios interceptor для авто-релогина
- [ ] Обновление `AuthContext` под новый флоу

### Этап 5: Админ и безопасность (1-2 часа)
- [ ] Сидинг админа из env
- [ ] Настройка Data Protection keys persistence
- [ ] Rate limiting на auth эндпоинтах

### Этап 6: Тестирование (2-3 часа)
- [ ] Ручной тест входа с реальными данными
- [ ] Тест авто-релогина после истечения куков
- [ ] Тест CRUD операций (расписание, оценки, новости, задания)
- [ ] Тест подкачки данных из дневника
- [ ] Проверка изоляции данных между пользователями

---

## 8. Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Не удастся определить алгоритм хеша | Средняя | Высокое | Fallback: проксировать пароль как есть (если дневник принимает plain) или попросить пользователя вводить уже захешированный пароль |
| Дневник сменит API/куки | Низкая | Среднее | Мониторинг ошибок, graceful degradation, алерты |
| Утечка хешей паролей | Низкая | Критическое | Шифрование Data Protection, HTTPS only, короткий TTL JWT |
| Дневник заблокирует IP за частые логины | Низкая | Среднее | Кэширование куков, релогин только при 401, экспоненциальный бэкофф |

---

## 9. Следующие шаги

1. **Сразу**: Написать скрипт подбора алгоритма хеша (Python/C#)
2. **После определения алгоритма**: Начать Этап 2 (серверная инфраструктура)
3. **Параллельно**: Подготовить фронтенд под новый API

---

**Готов приступить к реализации после подтверждения плана и определения алгоритма хеша.**