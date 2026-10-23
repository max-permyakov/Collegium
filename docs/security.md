# Безопасность — решения и реализация

## Аутентификация и авторизация

### Выбор стратегии
**Официальный SSO/OAuth/OIDC недоступен** у электронного дневника (spo.rso23.ru).
- ЕСИА (Госуслуги) используется только для входа в сам дневник
- Нет публичных endpoints: `/.well-known/openid-configuration`, `/oauth/`, `/openid/`
- **Решение**: собственная авторизация через ASP.NET Core Identity, вход по логину дневника, одноразовым кодам на email или внешним OAuth-провайдерам

### Собственная авторизация (ASP.NET Core Identity)
- Хранение пользователей в PostgreSQL через EF Core
- Локальные пароли хэшируются через PBKDF2 (Identity по умолчанию); пользователи альтернативного входа получают случайный пароль
- Роли: `Student`, `Admin`
- Токены: JWT access/refresh в HttpOnly cookies
- Способы входа хранятся в `UserAuthProviders`; `RegistrationSource`/`LastAuthMethod` фиксируют происхождение аккаунта

### Альтернативный вход
- Email-код: 6 цифр, TTL 10 минут, 5 попыток, cooldown 60 секунд и не более 5 запросов за 15 минут; хранится только HMAC-SHA256 от `Auth:OtpPepper` (fallback — `Jwt:Key`)
- OAuth: Authorization Code + PKCE S256, обязательная проверка `state`; state и pending identity передаются только через HttpOnly cookies
- OAuth-провайдеры: Google, GitHub, Yandex, VK. GitHub email берётся только из verified primary; при отсутствии email требуется подтверждение кодом
- Автоматическая привязка к существующему аккаунту по подтверждённому email; конфликт `(Provider, ProviderUserId)` возвращает `409`, без авто-merge

### Привязка к внешнему профилю (StudentProfile)
- Поле `ExternalStudentId` (`int?`) хранит подтверждённый ID из дневника; `null` означает аккаунт без дневника
- Привязка выполняется входом в дневник из профиля или автоматически при входе через дневник с совпадающим логином
- **Пароль дневника не хранится в открытом виде**: сохраняется только предварительно хэшированный клиентом пароль, зашифрованный через ASP.NET Core Data Protection
- Без дневника оценки, средний балл, рейтинг и расписание студента недоступны (`403 diary_required`)
- Смена учебной группы ограничена одним разом в 3 дня (`Profile:GroupChangeCooldownDays`)

## Работа с внешним API (Дневник)

### HttpClient с CookieContainer
```csharp
var handler = new HttpClientHandler
{
    CookieContainer = new CookieContainer(),
    UseCookies = true,
    ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
};
```
- Cookies (`.AspNetCore.Cookies`, `.AspNetCore.Session`, `UID`) сохраняются в памяти на время сессии
- При 401 — перелогин с сохранёнными учётными данными

### Тайм-ауты
- Дневник: 30 секунд
- API расписания: 10 секунд
- Настройка через `appsettings.json` → `ExternalApis:Diary:TimeoutSeconds`

### Валидация ответов
- Проверка `IsSuccessStatusCode` перед парсингом
- Graceful handling отсутствующих полей (try/catch + nullable)
- Логирование ошибок без чувствительных данных

## Изоляция данных

### Принцип: ID владельца определяется на сервере
```csharp
// ПЛОХО — доверяем frontend
var studentId = request.StudentId;

// ХОРОШО — определяем из авторизованного пользователя
var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
var studentProfile = await _db.StudentProfiles.FirstOrDefaultAsync(sp => sp.UserId == userId);
var externalStudentId = studentProfile.ExternalStudentId;
```

### Проверка прав доступа
- `[Authorize(Roles = "Admin")]` на административных endpoints
- `[Authorize]` на пользовательских endpoints
- Policy-based authorization для сложных правил (планируется)

## Конфигурация и секреты

### Что НЕ в репозитории
- Пароли, connection strings с паролями
- JWT signing keys
- API keys внешних сервисов
- Файлы `.env`, `appsettings.Production.json`

### Где храним
- **Development**: User Secrets (`dotnet user-secrets`)
- **Production**: Environment variables / Azure Key Vault / Docker secrets

### Пример User Secrets
```bash
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Server=...;Password=..."
dotnet user-secrets set "ExternalApis:Diary:BaseUrl" "https://spo.rso23.ru"
```

## HTTPS и TLS

### Development
- `dotnet dev-certs https --trust` для локального HTTPS
- `launchSettings.json` с `applicationUrl: https://localhost:7xxx`

### Production
- Обязательный HTTPS (HSTS)
- Валидные TLS сертификаты (Let's Encrypt или корпоративные)
- `ServerCertificateCustomValidationCallback = null` в production (строгая валидация)
- Только в development: `DangerousAcceptAnyServerCertificateValidator` для самоподписанных сертификатов дневника

## Защита от атак

### Rate Limiting
- Внешние API: соблюдаем их лимиты (10 req/s для kkepik.rub1kub.ru)
- Собственное API: встроенный ASP.NET Core rate limiter для auth-endpoints
- Email-коды дополнительно ограничены на уровне БД: cooldown 60 секунд, 5 запросов за 15 минут, 5 попыток ввода

### Input Validation
- FluentValidation или DataAnnotations на DTO
- Максимальные длины строк в EF Core конфигурации
- Sanitization пользовательского ввода (планируется)

### Security Headers
- HSTS, CSP, X-Frame-Options, X-Content-Type-Options (через middleware, планируется)

## Логирование

### Что логируем
- Ошибки и исключения (без stack trace в production)
- Аудит: вход/выход, изменение ролей, создание контента админами
- Производительность внешних запросов

### чего НЕ логируем
- Пароли, токены, cookies, OTP-коды и registration/pending-OAuth токены
- Персональные данные (ФИО, email, телефон — только при необходимости для аудита)
- Тела запросов к внешним API (содержат cookies)

## Сессии и выход

### Завершение сессии
- `SignOutAsync()` очищает куки аутентификации
- При выходе пользователя — удаление кэшированных cookies дневника (если хранились)
- Короткое время жизни JWT (если используется): 15-30 минут access + refresh token
