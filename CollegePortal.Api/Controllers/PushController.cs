using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.ExternalApis.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/push")]
[Authorize]
[EnableRateLimiting("push")]
public class PushController : ControllerBase
{
    private const int MaxSubscriptionsPerUser = 10;

    private readonly CollegePortalDbContext _db;
    private readonly PushServiceClientOptions _options;

    public PushController(
        CollegePortalDbContext db,
        IOptions<PushServiceClientOptions> options)
    {
        _db = db;
        _options = options.Value;
    }

    [HttpGet("public-key")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult GetPublicKey() =>
        Ok(new
        {
            enabled = _options.IsConfigured,
            // The public key is not a secret; the private key never leaves the server.
            publicKey = _options.IsConfigured ? _options.PublicKey : null
        });

    public sealed class SubscribeRequest
    {
        [Required, MaxLength(2048)]
        public string Endpoint { get; set; } = string.Empty;

        [Required]
        public KeysDto Keys { get; set; } = new();
    }

    public sealed class KeysDto
    {
        [Required, MaxLength(512)]
        public string P256dh { get; set; } = string.Empty;

        [Required, MaxLength(128)]
        public string Auth { get; set; } = string.Empty;
    }

    [HttpPost("subscribe")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Subscribe(
        [FromBody] SubscribeRequest request,
        CancellationToken ct)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!TryValidateSubscription(request, out var validationError))
            return BadRequest(new { message = validationError });

        var endpoint = request.Endpoint.Trim();
        var userAgent = Truncate(Request.Headers.UserAgent.ToString(), 300);

        var existing = await _db.PushSubscriptions
            .FirstOrDefaultAsync(s => s.Endpoint == endpoint, ct);

        if (existing is not null)
        {
            // The same browser can be re-bound to another account (shared
            // computer): the endpoint is unique, so update the owner.
            existing.UserId = userId;
            existing.P256DH = request.Keys.P256dh;
            existing.Auth = request.Keys.Auth;
            existing.UserAgent = userAgent;
            existing.FailureCount = 0;
        }
        else
        {
            var userSubscriptions = await _db.PushSubscriptions
                .Where(s => s.UserId == userId)
                .OrderBy(s => s.CreatedAt)
                .ToListAsync(ct);

            // Keep at most MaxSubscriptionsPerUser devices; drop the oldest.
            if (userSubscriptions.Count >= MaxSubscriptionsPerUser)
            {
                var toRemove = userSubscriptions
                    .Take(userSubscriptions.Count - MaxSubscriptionsPerUser + 1)
                    .ToArray();
                _db.PushSubscriptions.RemoveRange(toRemove);
            }

            _db.PushSubscriptions.Add(new PushSubscription
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Endpoint = endpoint,
                P256DH = request.Keys.P256dh,
                Auth = request.Keys.Auth,
                UserAgent = userAgent,
                CreatedAt = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync(ct);

        return Ok(new { subscribed = true });
    }

    [HttpDelete("unsubscribe")]
    [HttpDelete("subscribe")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Unsubscribe(
        [FromQuery] string endpoint,
        CancellationToken ct)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (string.IsNullOrWhiteSpace(endpoint))
            return BadRequest(new { message = "endpoint is required" });

        // Scope the delete to the current user: an endpoint is otherwise a
        // bearer-like identifier and must not let users unsubscribe others.
        var subscription = await _db.PushSubscriptions
            .FirstOrDefaultAsync(
                s => s.Endpoint == endpoint.Trim() && s.UserId == userId,
                ct);

        if (subscription is not null)
        {
            _db.PushSubscriptions.Remove(subscription);
            await _db.SaveChangesAsync(ct);
        }

        return Ok(new { subscribed = false });
    }

    [HttpDelete("subscriptions")]
    public async Task<IActionResult> UnsubscribeAll(CancellationToken ct)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var subscriptions = await _db.PushSubscriptions
            .Where(s => s.UserId == userId)
            .ToListAsync(ct);

        if (subscriptions.Count > 0)
        {
            _db.PushSubscriptions.RemoveRange(subscriptions);
            await _db.SaveChangesAsync(ct);
        }

        return Ok(new { removed = subscriptions.Count });
    }

    private bool TryGetUserId(out Guid userId)
    {
        userId = Guid.Empty;
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out userId);
    }

    private static bool TryValidateSubscription(SubscribeRequest request, out string error)
    {
        error = string.Empty;

        if (string.IsNullOrWhiteSpace(request.Endpoint) ||
            request.Endpoint.Length > 2048 ||
            !Uri.TryCreate(request.Endpoint, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps)
        {
            error = "endpoint must be an absolute https URL";
            return false;
        }

        if (string.IsNullOrWhiteSpace(request.Keys.P256dh) ||
            request.Keys.P256dh.Length is < 20 or > 512)
        {
            error = "keys.p256dh is invalid";
            return false;
        }

        if (string.IsNullOrWhiteSpace(request.Keys.Auth) ||
            request.Keys.Auth.Length is < 8 or > 128)
        {
            error = "keys.auth is invalid";
            return false;
        }

        return true;
    }

    private static string? Truncate(string? value, int maxLength) =>
        string.IsNullOrWhiteSpace(value) || value.Length <= maxLength
            ? value
            : value[..maxLength];
}
