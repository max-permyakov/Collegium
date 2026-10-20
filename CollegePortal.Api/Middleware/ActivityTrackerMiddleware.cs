using System.Security.Claims;
using CollegePortal.Application;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CollegePortal.Api.Middleware;

// Tracks user activity: updates LastActivityAt on every authenticated request.
// Writes are debounced per user — at most once per ActivityTracking.ActivityWriteInterval —
// via IMemoryCache, so regular browsing does not hit the database on every
// request. The cache marker is set before the write to prevent a stampede of
// concurrent requests on the same user; a lost write is harmless
// (LastActivityAt is refreshed on the next request within the interval).
public class ActivityTrackerMiddleware
{
    private readonly RequestDelegate _next;

    public ActivityTrackerMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, IMemoryCache cache, IServiceScopeFactory scopeFactory)
    {
        var userIdClaim = context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var userId))
        {
            var now = DateTime.UtcNow;
            if (!cache.TryGetValue(ActivityKey(userId), out DateTime lastWrite)
                || now - lastWrite >= ActivityTracking.ActivityWriteInterval)
            {
                cache.Set(ActivityKey(userId), now, DateTimeOffset.UtcNow.Add(ActivityTracking.ActivityWriteInterval));

                using var scope = scopeFactory.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();
                await dbContext.Users
                    .Where(u => u.Id == userId)
                    .ExecuteUpdateAsync(
                        s => s.SetProperty(u => u.LastActivityAt, now),
                        context.RequestAborted);
            }
        }

        await _next(context);
    }

    private static string ActivityKey(Guid userId) => $"activity-tracker:{userId}";
}
