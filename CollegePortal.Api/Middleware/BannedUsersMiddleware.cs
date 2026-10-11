using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using CollegePortal.Infrastructure.Data;

namespace CollegePortal.Api.Middleware;

// Rejects requests authenticated with the token of a banned (IsActive == false) user.
// The active-state lookup is cached for a short period to avoid a DB hit per request.
public class BannedUsersMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IMemoryCache _cache;
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(1);

    public BannedUsersMiddleware(RequestDelegate next, IMemoryCache cache)
    {
        _next = next;
        _cache = cache;
    }

    public async Task InvokeAsync(HttpContext context, IServiceScopeFactory scopeFactory)
    {
        var userIdClaim = context.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var userId))
        {
            var isActive = await _cache.GetOrCreateAsync(
                $"user-active-{userId}",
                async entry =>
                {
                    entry.AbsoluteExpirationRelativeToNow = CacheLifetime;
                    using var scope = scopeFactory.CreateScope();
                    var dbContext = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();
                    return await dbContext.Users
                        .Where(u => u.Id == userId)
                        .Select(u => (bool?)u.IsActive)
                        .FirstOrDefaultAsync();
                });

            if (isActive == false)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new { message = "Пользователь заблокирован" });
                return;
            }
        }

        await _next(context);
    }
}