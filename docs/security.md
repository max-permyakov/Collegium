# Безопасность — решения и реализация

## Аутентификация и авторизация

### Выбор стратегии
**Официальный SSO/OAuth/OIDC недоступен** у электронного дневника (spo.rso23.ru).
- ЕСИА (Госуслуги) используется только для входа в сам дневник
- Нет публичных endpoints: `/.well-known/openid-configuration`, `/oauth/`, `/openid/`
- **Решение**: собственная авторизация через ASP.NET Core Identity + имитация логина в дневник от имени пользователя

### Собственная авторизация (ASP.NET Core Identity)
- Хранение пользователей в PostgreSQL через EF Core
- Пароли хэшируются через PBKDF2 (Identity по умолчанию)
- Роли: `Student`, `Admin`
- Токены: JWT (планируется) или Cookie-based аутентификация

### Привязка к внешнему профилю (StudentProfile)
- Поле `ExternalStudentId` хранит подтверждённый ID из дневника
- При входе в портал пользователь вводит свои учётные данные портала
- Администратор или сам студент привязывает профиль к учётной записи дневника через верификацию
- **Не храним пароль от дневника** в открытом виде
- Пароль от дневника используется только для разовой авторизации при синхронизации и не сохраняется

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
- Собственное API: добавить `AspNetCoreRateLimit` или middleware (планируется)

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
- Пароли, токены, cookies
- Персональные данные (ФИО, email, телефон — только при необходимости для аудита)
- Тела запросов к внешним API (содержат cookies)

## Сессии и выход

### Завершение сессии
- `SignOutAsync()` очищает куки аутентификации
- При выходе пользователя — удаление кэшированных cookies дневника (если хранились)
- Короткое время жизни JWT (если используется): 15-30 минут access + refresh token

## План реализации (по этапам)

### Этап 2 (текущий)
- [ ] Identity с cookie-аутентификацией
- [ ] Login/Logout/Me endpoints
- [ ] Роли Student/Admin
- [ ] User Secrets для connection string

### Этап 3-4
- [ ] Безопасное хранение ExternalStudentId
- [ ] Валидация привязки профиля к дневнику
- [ ] Изоляция данных: каждый пользователь видит только свои оценки/расписание

### Этап 5
- [ ] Административные endpoints защищены `[Authorize(Roles = "Admin")]`
- [ ] Студенты видят только задания своей группы

### Этап 6-7
- [ ] Frontend: защита маршрутов, редирект на логин при 401
- [ ] HTTPS в production
- [ ] Security headers
- [ ] Rate limiting на API
- [ ] Пентест / код-ревью безопасности