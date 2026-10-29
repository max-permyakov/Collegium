using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

/// <summary>
/// Shared admin inbox for support requests. Every user owns exactly one Support
/// thread; this endpoint lists them with the owner card, the last message and
/// the number of unanswered owner messages. Reading and replying happen through
/// the regular chat endpoints, which grant admins access to Support threads.
/// </summary>
[ApiController]
[Route("api/admin/support")]
[Authorize(Roles = "Admin")]
public class AdminSupportController : ControllerBase
{
    private readonly IChatService _chatService;

    public AdminSupportController(IChatService chatService)
    {
        _chatService = chatService;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        return Ok(await _chatService.GetSupportInboxAsync(ct));
    }
}
