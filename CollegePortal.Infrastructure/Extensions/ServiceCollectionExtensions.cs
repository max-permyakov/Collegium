using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Net;
using System.Text;
using CollegePortal.Domain.Entities;
using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.ExternalApis.Diary;
using CollegePortal.Infrastructure.ExternalApis.Gosuslugi;
using CollegePortal.Infrastructure.ExternalApis.Schedule;
using CollegePortal.Infrastructure.Services;

namespace CollegePortal.Infrastructure.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Database=CollegePortal;Username=postgres;Password=postgres";

        services.AddDbContext<CollegePortalDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddIdentity<ApplicationUser, IdentityRole<Guid>>(options =>
        {
            options.Password.RequireDigit = true;
            options.Password.RequireLowercase = true;
            options.Password.RequireUppercase = true;
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequiredLength = 8;
            options.User.RequireUniqueEmail = true;
            options.User.AllowedUserNameCharacters =
                "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._@+" +
                "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя";
            options.SignIn.RequireConfirmedEmail = false;

            // Brute-force protection: lock the account after repeated failed logins.
            options.Lockout.AllowedForNewUsers = true;
            options.Lockout.MaxFailedAccessAttempts = 5;
            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        })
        .AddEntityFrameworkStores<CollegePortalDbContext>()
        .AddDefaultTokenProviders();

        var jwtKey = configuration["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
        {
            throw new InvalidOperationException(
                "Jwt:Key is not configured or is too short (min 32 bytes). " +
                "Set it via user secrets or environment variables, e.g. " +
                "dotnet user-secrets set \"Jwt:Key\" \"<random-64-char-string>\".");
        }

        var jwtIssuer = configuration["Jwt:Issuer"] ?? "CollegePortal";
        var jwtAudience = configuration["Jwt:Audience"] ?? "CollegePortalClient";
        var authCookieName = configuration["Auth:CookieName"] ?? "cp_access";

        services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        })
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = jwtIssuer,
                ValidAudience = jwtAudience,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
                ClockSkew = TimeSpan.Zero
            };

            // The access token is delivered as an HttpOnly cookie, so it can never
            // be read by client-side JavaScript (mitigates token theft via XSS).
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    if (context.Request.Cookies.TryGetValue(authCookieName, out var cookieToken) &&
                        !string.IsNullOrEmpty(cookieToken))
                    {
                        context.Token = cookieToken;
                    }

                    return Task.CompletedTask;
                }
            };
        });

        services.AddAuthorization(options =>
        {
            options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
            options.AddPolicy("StudentOnly", policy => policy.RequireRole("Student"));
        });

        // Persist Data Protection keys so that encrypted diary secrets (password
        // hash / session cookies) survive application restarts and container
        // recycles. On Windows the key ring is additionally protected with DPAPI.
        var dataProtectionBuilder = services.AddDataProtection()
            .SetApplicationName("CollegePortal");
        var keysPath = configuration["DataProtection:KeysPath"];
        if (!string.IsNullOrWhiteSpace(keysPath))
        {
            var keysDirectory = new DirectoryInfo(keysPath);
            keysDirectory.Create();
            dataProtectionBuilder.PersistKeysToFileSystem(keysDirectory);
            if (OperatingSystem.IsWindows())
                dataProtectionBuilder.ProtectKeysWithDpapi();
        }

        services.Configure<DiaryApiOptions>(configuration.GetSection("ExternalApis:Diary"));
        services.Configure<ScheduleApiOptions>(configuration.GetSection("ExternalApis:Schedule"));
        services.Configure<GosuslugiOptions>(configuration.GetSection("ExternalApis:Gosuslugi"));

        services.AddMemoryCache();

        services.AddHttpContextAccessor();

        services.AddHttpClient<IDiaryApiClient, DiaryApiClient>((sp, client) =>
        {
            var options = sp.GetRequiredService<IOptions<DiaryApiOptions>>().Value;
            client.BaseAddress = new Uri(options.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/json, text/plain, */*");
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            // Cookies are managed per user by DiaryApiClient (via Cookie/Set-Cookie headers
            // persisted in StudentProfile.DiaryCookieData), so disable the shared container.
            UseCookies = false,
            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
        });

        services.AddHttpClient<ScheduleApiClient>((sp, client) =>
        {
            var options = sp.GetRequiredService<IOptions<ScheduleApiOptions>>().Value;
            client.BaseAddress = new Uri(options.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        });

        services.AddHttpClient<GosuslugiStaffClient>((sp, client) =>
        {
            var options = sp.GetRequiredService<IOptions<GosuslugiOptions>>().Value;
            client.BaseAddress = new Uri(options.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            client.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        });

        services.AddScoped<IScheduleProvider>(sp => sp.GetRequiredService<IDiaryApiClient>());
        services.AddScoped<IGradesProvider>(sp => sp.GetRequiredService<IDiaryApiClient>());

        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IScheduleService, ScheduleService>();
        services.AddScoped<IGradesService, GradesService>();
        services.AddScoped<IAnnouncementService, AnnouncementService>();
        services.AddScoped<IAssignmentService, AssignmentService>();
        services.AddScoped<IProfileService, ProfileService>();
        services.AddScoped<IAdminService, AdminService>();
        services.AddScoped<IClubService, ClubService>();
        services.AddScoped<ICollegeInfoService, CollegeInfoService>();
        services.AddScoped<ICollegeMapService, CollegeMapService>();

        services.AddHostedService<KkepikScheduleSyncService>();

        return services;
    }
}