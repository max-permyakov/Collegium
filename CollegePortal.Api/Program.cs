using CollegePortal.Api.Middleware;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure;
using CollegePortal.Infrastructure.Extensions;
using Microsoft.AspNetCore.Identity;

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

        // Allow the frontend (Vite dev server / any local origin) to call the API.
        // Authenticated via Bearer tokens, so credentials/cookies are not required.
        builder.Services.AddCors(options =>
        {
            options.AddPolicy("Client", policy =>
                policy.AllowAnyOrigin()
                      .AllowAnyMethod()
                      .AllowAnyHeader());
        });

        builder.Services.AddInfrastructure(builder.Configuration);

        var app = builder.Build();

        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }

        app.UseHttpsRedirection();

        app.UseCors("Client");

        app.UseAuthentication();
        app.UseMiddleware<BannedUsersMiddleware>();
        app.UseAuthorization();

        app.MapControllers();

        // Seed admin user
        using (var scope = app.Services.CreateScope())
        {
            var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

            // Ensure roles exist
            foreach (var roleName in new[] { "Student", "Admin" })
            {
                if (!await roleManager.RoleExistsAsync(roleName))
                {
                    await roleManager.CreateAsync(new IdentityRole<Guid>(roleName));
                }
            }

            // Seed admin user
            var adminEmail = builder.Configuration["Admin:Email"] ?? "admin@college.local";
            var adminPassword = builder.Configuration["Admin:Password"] ?? "Admin123456!";
            var adminName = builder.Configuration["Admin:DisplayName"] ?? "Administrator";

            var adminUser = await userManager.FindByEmailAsync(adminEmail);
            if (adminUser == null)
            {
                adminUser = new ApplicationUser
                {
                    UserName = adminEmail,
                    Email = adminEmail,
                    DisplayName = adminName,
                    Role = "Admin",
                    IsActive = true,
                    EmailConfirmed = true
                };

                var result = await userManager.CreateAsync(adminUser, adminPassword);
                if (result.Succeeded)
                {
                    await userManager.AddToRoleAsync(adminUser, "Admin");
                }
            }
            else if (!await userManager.IsInRoleAsync(adminUser, "Admin"))
            {
                await userManager.AddToRoleAsync(adminUser, "Admin");
            }

            // Seed / protect the primary admin (perмяков158) by login and by user id.
            // This is idempotent and re-run on every startup, so the user is always admin.
            var primaryLogins = (builder.Configuration["PrimaryAdmin:Logins"] ?? "пермяков158")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var primaryIds = (builder.Configuration["PrimaryAdmin:UserIds"] ?? "5ca44056-2418-43d8-39b4-08df27791252")
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