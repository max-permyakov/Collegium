using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using System.Net;
using CollegePortal.Domain.Entities;
using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.ExternalApis.Diary;
using CollegePortal.Infrastructure.ExternalApis.Schedule;

namespace CollegePortal.Infrastructure.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? "Server=(localdb)\\mssqllocaldb;Database=CollegePortal;Trusted_Connection=True;MultipleActiveResultSets=true";

        services.AddDbContext<CollegePortalDbContext>(options =>
            options.UseSqlServer(connectionString));

        services.AddIdentity<ApplicationUser, IdentityRole<Guid>>(options =>
        {
            options.Password.RequireDigit = true;
            options.Password.RequireLowercase = true;
            options.Password.RequireUppercase = true;
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequiredLength = 8;
            options.User.RequireUniqueEmail = true;
            options.SignIn.RequireConfirmedEmail = false;
        })
        .AddEntityFrameworkStores<CollegePortalDbContext>()
        .AddDefaultTokenProviders();

        services.Configure<DiaryApiOptions>(configuration.GetSection("ExternalApis:Diary"));
        services.Configure<ScheduleApiOptions>(configuration.GetSection("ExternalApis:Schedule"));

        services.AddHttpClient<IDiaryApiClient, DiaryApiClient>((sp, client) =>
        {
            var options = sp.GetRequiredService<IOptions<DiaryApiOptions>>().Value;
            client.BaseAddress = new Uri(options.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/json, text/plain, */*");
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            CookieContainer = new CookieContainer(),
            UseCookies = true,
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

        services.AddScoped<IScheduleProvider>(sp => sp.GetRequiredService<IDiaryApiClient>());
        services.AddScoped<IGradesProvider>(sp => sp.GetRequiredService<IDiaryApiClient>());

        return services;
    }
}