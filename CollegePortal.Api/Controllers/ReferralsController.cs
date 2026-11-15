using System.Security.Claims;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/referrals")]
[Authorize]
public class ReferralsController : ControllerBase
{
    private readonly IReferralService _referralService;
    private readonly ILogger<ReferralsController> _logger;

    public ReferralsController(
        IReferralService referralService,
        ILogger<ReferralsController> logger)
    {
        _referralService = referralService;
        _logger = logger;
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var summary = await _referralService.GetSummaryAsync(userId.Value, ct);
        return summary is null ? NotFound() : Ok(summary);
    }

    [HttpGet("shop")]
    public async Task<IActionResult> GetShop(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var shop = await _referralService.GetShopAsync(userId.Value, ct);
        return shop is null ? NotFound() : Ok(shop);
    }

    [HttpPost("shop/{code}/purchase")]
    public async Task<IActionResult> Purchase(string code, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _referralService.PurchaseAsync(userId.Value, code, ct);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("claim")]
    public async Task<IActionResult> Claim(
        [FromBody] ClaimReferralRequestDto request,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _referralService.ClaimAsync(userId.Value, request.Code, ct);
        return Ok(result);
    }

    [AllowAnonymous]
    [HttpGet("validate/{code}")]
    public async Task<IActionResult> Validate(string code, CancellationToken ct)
    {
        var result = await _referralService.ValidateCodeAsync(code, ct);
        return Ok(result);
    }

    [HttpPut("me/nickname-color")]
    public async Task<IActionResult> SetNicknameColor(
        [FromBody] SetNicknameColorRequestDto request,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _referralService.SetNicknameColorAsync(userId.Value, request.Color, ct);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("rewards/{code}/download")]
    public async Task<IActionResult> DownloadReward(string code, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var file = await _referralService.GetRewardFileAsync(userId.Value, code, ct);
        if (file is null)
            return NotFound(new { message = "Награда не найдена или ещё не получена" });

        if (!System.IO.File.Exists(file.StoragePath))
        {
            _logger.LogWarning(
                "Reward file for {Code} is missing on disk: {Path}",
                code,
                file.StoragePath);
            return NotFound(new
            {
                message = "Файл награды ещё не загружен на сервер. Обратитесь к администратору."
            });
        }

        Response.Headers.CacheControl = "private, no-store";
        return new PhysicalFileResult(file.StoragePath, file.ContentType)
        {
            FileDownloadName = file.FileName
        };
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier);
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : null;
    }
}
