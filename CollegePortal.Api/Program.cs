using System.Threading.RateLimiting;
using CollegePortal.Api.Middleware;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure;
using CollegePortal.Infrastructure.Extensions;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;

namespace CollegePortal.Api;

public class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddControllers();
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen();
        builder.Services.AddMemoryCache();

        // CORS: only explicitly allowed frontend origins may call the API.
        // Credentials are enabled because the access token travels in an HttpOnly cookie.
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? new[] { "http://localhost:5173", "https://localhost:5173" };

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("Client", policy =>
                policy.WithOrigins(allowedOrigins)
                      .AllowAnyMethod()
                      .AllowAnyHeader()
                      .AllowCredentials());
        });

        // Rate limiting for authentication endpoints (per client IP).
        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy("auth", httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));
        });

        builder.Services.AddInfrastructure(builder.Configuration);

        var app = builder.Build();

        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }

        app.UseHttpsRedirection();

        if (!app.Environment.IsDevelopment())
        {
            app.UseHsts();
        }

        app.UseMiddleware<SecurityHeadersMiddleware>();

        app.UseCors("Client");

        app.UseRateLimiter();

        app.UseAuthentication();
        app.UseMiddleware<BannedUsersMiddleware>();
        app.UseAuthorization();

        app.MapControllers();

        // Seed roles and the bootstrap admin user.
        using (var scope = app.Services.CreateScope())
        {
            var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

            foreach (var roleName in new[] { "Student", "Admin" })
            {
                if (!await roleManager.RoleExistsAsync(roleName))
                {
                    await roleManager.CreateAsync(new IdentityRole<Guid>(roleName));
                }
            }

            var adminEmail = builder.Configuration["Admin:Email"];
            if (!string.IsNullOrWhiteSpace(adminEmail))
            {
                var adminUser = await userManager.FindByEmailAsync(adminEmail);
                if (adminUser == null)
                {
                    var adminPassword = builder.Configuration["Admin:Password"];
                    if (string.IsNullOrWhiteSpace(adminPassword))
                    {
                        throw new InvalidOperationException(
                            "Admin:Password is not configured but the bootstrap admin user does not exist. " +
                            "Set it via user secrets or environment variables, e.g. " +
                            "dotnet user-secrets set \"Admin:Password\" \"<strong-password>\".");
                    }

                    adminUser = new ApplicationUser
                    {
                        UserName = adminEmail,
                        Email = adminEmail,
                        DisplayName = builder.Configuration["Admin:DisplayName"] ?? "Administrator",
                        Role = "Admin",
                        IsActive = true,
                        EmailConfirmed = true
                    };

                    var result = await userManager.CreateAsync(adminUser, adminPassword);
                    if (!result.Succeeded)
                    {
                        throw new InvalidOperationException(
                            "Failed to create bootstrap admin: " +
                            string.Join("; ", result.Errors.Select(e => e.Description)));
                    }

                    await userManager.AddToRoleAsync(adminUser, "Admin");
                }
                else if (!await userManager.IsInRoleAsync(adminUser, "Admin"))
                {
                    await userManager.AddToRoleAsync(adminUser, "Admin");
                }
            }

            // Optional: promote configured accounts to protected admins. No defaults
            // are baked into the code; these lists must be provided explicitly via
            // configuration (PrimaryAdmin:Logins / PrimaryAdmin:UserIds).
            var primaryLogins = (builder.Configuration["PrimaryAdmin:Logins"] ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var primaryIds = (builder.Configuration["PrimaryAdmin:UserIds"] ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            foreach (var login in primaryLogins)
            {
                var primaryUser = await userManager.FindByNameAsync(login);
                if (primaryUser != null)
                    await ApplyPrimaryAdminAsync(userManager, primaryUser);
            }

            foreach (var id in primaryIds)
            {
                var primaryUser = await userManager.FindByIdAsync(id);
                if (primaryUser != null)
                    await ApplyPrimaryAdminAsync(userManager, primaryUser);
            }
        }

        await app.RunAsync();
    }

    private static async Task ApplyPrimaryAdminAsync(UserManager<ApplicationUser> userManager, ApplicationUser user)
    {
        var changed = false;
        if (user.Role != "Admin")
        {
            user.Role = "Admin";
            changed = true;
        }
        if (!user.IsProtected)
        {
            user.IsProtected = true;
            changed = true;
        }
        if (!await userManager.IsInRoleAsync(user, "Admin"))
        {
            var roleResult = await userManager.AddToRoleAsync(user, "Admin");
            changed |= roleResult.Succeeded;
        }

        if (changed)
            await userManager.UpdateAsync(user);
    }
}
