using System.Security.Claims;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

/// <summary>
/// Referral program reporting and manual KepkaCoin accruals. Guarded by the
/// same permission as the rest of user management, so statisticians with
/// "Пользователи и статистика" can audit the program without full Admin rights.
/// </summary>
[ApiController]
[Route("api/admin/referrals")]
[Authorize(Policy = "Permission.UsersManage")]
public class AdminReferralsController : ControllerBase
{
    private readonly IReferralService _referralService;

    public AdminReferralsController(IReferralService referralService)
    {
        _referralService = referralService;
    }

    [HttpGet]
    public async Task<IActionResult> GetDashboard(
        [FromQuery] int days = 30,
        CancellationToken ct = default)
    {
        var dashboard = await _referralService.GetAdminDashboardAsync(days, ct);
        return Ok(dashboard);
    }

    [HttpPost("grant")]
    public async Task<IActionResult> GrantCoins(
        [FromBody] AdminGrantCoinsRequestDto request,
        CancellationToken ct)
    {
        var adminId = GetCurrentUserId();
        if (!adminId.HasValue)
            return Unauthorized();

        var result = await _referralService.GrantCoinsAsync(
            adminId.Value,
            request.UserId,
            request.Amount,
            request.Reason,
            ct);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier);
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : null;
    }
}
