using Microsoft.EntityFrameworkCore;
using CollegePortal.Infrastructure.Data;

namespace CollegePortal.Api.Middleware;

// Rejects requests whose token belongs to a banned (IsActive == false) user, or
// whose security stamp no longer matches the user record. The latter provides
// immediate server-side revocation on logout, ban and role changes.
public class BannedUsersMiddleware
{
    private const string SecurityStampClaim = "sstamp";

    private readonly RequestDelegate _next;

    public BannedUsersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, IServiceScopeFactory scopeFactory)
    {
        var userIdClaim = context.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var userId))
        {
            using var scope = scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();
            var state = await dbContext.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => new { u.IsActive, u.SecurityStamp })
                .FirstOrDefaultAsync();

            if (state != null)
            {
                if (!state.IsActive)
                {
                    await WriteErrorAsync(context, StatusCodes.Status403Forbidden, "Пользователь заблокирован");
                    return;
                }

                var tokenStamp = context.User?.FindFirst(SecurityStampClaim)?.Value;
                if (!string.IsNullOrEmpty(tokenStamp) &&
                    !string.Equals(tokenStamp, state.SecurityStamp, StringComparison.Ordinal))
                {
                    await WriteErrorAsync(context, StatusCodes.Status401Unauthorized, "Сессия недействительна, войдите заново");
                    return;
                }
            }
        }

        await _next(context);
    }

    private static async Task WriteErrorAsync(HttpContext context, int statusCode, string message)
    {
        context.Response.StatusCode = statusCode;
        await context.Response.WriteAsJsonAsync(new { message });
    }
}
