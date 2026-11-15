using System.Security.Cryptography;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Referrals;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class ReferralService : IReferralService
{
    /// <summary>Unambiguous, URL-safe alphabet (no 0/o, 1/i/l).</summary>
    private const string CodeAlphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    private const int CodeLength = 9;
    private const int ReferralReward = 1;
    private const int MaxCodeAttempts = 12;
    private const int MaxCodeLength = 16;
    private const int MaxAdminGrant = 1000;
    private const int MaxGrantReasonLength = 200;

    private readonly CollegePortalDbContext _dbContext;
    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _environment;
    private readonly INotificationService _notificationService;
    private readonly ILogger<ReferralService> _logger;

    public ReferralService(
        CollegePortalDbContext dbContext,
        IConfiguration configuration,
        IHostEnvironment environment,
        INotificationService notificationService,
        ILogger<ReferralService> logger)
    {
        _dbContext = dbContext;
        _configuration = configuration;
        _environment = environment;
        _notificationService = notificationService;
        _logger = logger;
    }

    public async Task<ReferralSummaryDto?> GetSummaryAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
            return null;

        var code = await EnsureReferralCodeAsync(user, ct);

        var invites = await _dbContext.Referrals
            .AsNoTracking()
            .Where(r => r.InviterUserId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new ReferralInviteDto(
                r.Invitee.DisplayName,
                r.Invitee.StudentProfile == null ? null : r.Invitee.StudentProfile.AvatarDataUrl,
                r.CreatedAt,
                r.CoinsAwarded))
            .ToArrayAsync(ct);

        var rewardCodes = await _dbContext.UserPurchases
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .Select(p => p.ItemCode)
            .ToArrayAsync(ct);

        return new ReferralSummaryDto(
            code,
            user.KepkaCoins,
            invites.Length,
            invites,
            rewardCodes,
            user.NicknameColor);
    }

    public async Task<ShopResponseDto?> GetShopAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.KepkaCoins })
            .FirstOrDefaultAsync(ct);
        if (user is null)
            return null;

        var owned = await _dbContext.UserPurchases
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .Select(p => p.ItemCode)
            .ToHashSetAsync(ct);

        var items = ReferralShopCatalog.Items
            .Select(item => new ShopItemDto(
                item.Code,
                item.Title,
                item.Description,
                item.Icon,
                item.Price,
                owned.Contains(item.Code)))
            .ToArray();

        return new ShopResponseDto(user.KepkaCoins, items);
    }

    public async Task<PurchaseResultDto> PurchaseAsync(
        Guid userId,
        string itemCode,
        CancellationToken ct = default)
    {
        var definition = ReferralShopCatalog.Find(itemCode);
        if (definition is null)
            return new PurchaseResultDto(false, "Такой награды нет в магазине", 0);

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
            return new PurchaseResultDto(false, "Пользователь не найден", 0);

        var alreadyOwned = await _dbContext.UserPurchases
            .AsNoTracking()
            .AnyAsync(p => p.UserId == userId && p.ItemCode == definition.Code, ct);
        if (alreadyOwned)
            return new PurchaseResultDto(false, "Эта награда уже получена", user.KepkaCoins, definition.Code);

        if (user.KepkaCoins < definition.Price)
        {
            var missing = definition.Price - user.KepkaCoins;
            return new PurchaseResultDto(
                false,
                $"Не хватает {missing} KepkaCoin. Пригласите ещё друзей по реферальной ссылке.",
                user.KepkaCoins,
                definition.Code);
        }

        user.KepkaCoins -= definition.Price;
        _dbContext.UserPurchases.Add(new UserPurchase
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ItemCode = definition.Code,
            PricePaid = definition.Price,
            PurchasedAt = DateTime.UtcNow
        });
        _dbContext.CoinTransactions.Add(new CoinTransaction
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Amount = -definition.Price,
            Reason = $"Покупка награды «{definition.Title}»",
            CreatedAt = DateTime.UtcNow
        });

        try
        {
            await _dbContext.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
        {
            // A concurrent request bought the same one-time item first.
            _logger.LogWarning(
                ex,
                "Concurrent purchase of {ItemCode} by user {UserId}",
                definition.Code,
                userId);
            return new PurchaseResultDto(false, "Эта награда уже получена", user.KepkaCoins, definition.Code);
        }

        return new PurchaseResultDto(true, null, user.KepkaCoins, definition.Code);
    }

    public async Task<ClaimReferralResultDto> ClaimAsync(
        Guid userId,
        string code,
        CancellationToken ct = default)
    {
        var normalized = NormalizeCode(code);
        if (normalized.Length == 0)
            return new ClaimReferralResultDto(false, "Реферальный код не указан");

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
            return new ClaimReferralResultDto(false, "Пользователь не найден");

        var alreadyClaimed = user.ReferredByUserId is not null ||
            await _dbContext.Referrals.AsNoTracking().AnyAsync(r => r.InviteeUserId == userId, ct);
        if (alreadyClaimed)
            return new ClaimReferralResultDto(false, "Реферальный код уже применён", AlreadyClaimed: true);

        var inviter = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.ReferralCode == normalized && u.IsActive, ct);
        if (inviter is null)
            return new ClaimReferralResultDto(false, "Реферальная ссылка недействительна");

        if (inviter.Id == userId)
            return new ClaimReferralResultDto(false, "Нельзя использовать собственную ссылку");

        var claimWindowHours = Math.Clamp(
            _configuration.GetValue("Referrals:ClaimWindowHours", 24),
            1,
            720);
        if (user.CreatedAt < DateTime.UtcNow.AddHours(-claimWindowHours))
        {
            return new ClaimReferralResultDto(
                false,
                $"Реферальный код можно применить только в первые {claimWindowHours} ч после регистрации");
        }

        var now = DateTime.UtcNow;
        user.ReferredByUserId = inviter.Id;
        user.ReferredAt = now;
        inviter.KepkaCoins += ReferralReward;

        _dbContext.Referrals.Add(new Referral
        {
            Id = Guid.NewGuid(),
            InviterUserId = inviter.Id,
            InviteeUserId = user.Id,
            CoinsAwarded = ReferralReward,
            CreatedAt = now
        });
        _dbContext.CoinTransactions.Add(new CoinTransaction
        {
            Id = Guid.NewGuid(),
            UserId = inviter.Id,
            Amount = ReferralReward,
            Reason = $"Реферал: {user.DisplayName}",
            CounterpartyUserId = user.Id,
            CreatedAt = now
        });

        // New users invited through a link receive the report formatter for
        // free; it is recorded as a normal (zero-price) purchase so the shop
        // and profile stay consistent.
        var hasGift = await _dbContext.UserPurchases
            .AsNoTracking()
            .AnyAsync(p => p.UserId == userId && p.ItemCode == ReferralShopCatalog.ReportFormatter, ct);
        if (!hasGift)
        {
            _dbContext.UserPurchases.Add(new UserPurchase
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ItemCode = ReferralShopCatalog.ReportFormatter,
                PricePaid = 0,
                PurchasedAt = now
            });
        }

        try
        {
            await _dbContext.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogWarning(ex, "Referral claim race for user {UserId}", userId);
            return new ClaimReferralResultDto(false, "Реферальный код уже применён", AlreadyClaimed: true);
        }

        // The award is final at this point; a notification failure must not
        // roll it back.
        try
        {
            await _notificationService.NotifyUsersAsync(
                [inviter.Id],
                new NotificationMessage(
                    NotificationType.Referral,
                    "Новый реферал",
                    $"{user.DisplayName} присоединился по вашей ссылке. +{ReferralReward} KepkaCoin начислен.",
                    "/profile?tab=referrals"),
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Referral notification failed for inviter {InviterId}", inviter.Id);
        }

        return new ClaimReferralResultDto(true, null, ReferralReward);
    }

    public async Task<ReferralCodeValidationDto> ValidateCodeAsync(
        string code,
        CancellationToken ct = default)
    {
        var normalized = NormalizeCode(code);
        if (normalized.Length == 0)
            return new ReferralCodeValidationDto(false);

        var inviterName = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.ReferralCode == normalized && u.IsActive)
            .Select(u => u.DisplayName)
            .FirstOrDefaultAsync(ct);

        return new ReferralCodeValidationDto(inviterName is not null, inviterName);
    }

    public async Task<NicknameColorResultDto> SetNicknameColorAsync(
        Guid userId,
        string? color,
        CancellationToken ct = default)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
            return new NicknameColorResultDto(false, "Пользователь не найден");

        if (string.IsNullOrWhiteSpace(color))
        {
            user.NicknameColor = null;
            await _dbContext.SaveChangesAsync(ct);
            return new NicknameColorResultDto(true, null, null);
        }

        var option = ReferralShopCatalog.FindColor(color);
        if (option is null)
            return new NicknameColorResultDto(false, "Такого цвета нет в палитре");

        var ownsPalette = await _dbContext.UserPurchases
            .AsNoTracking()
            .AnyAsync(
                p => p.UserId == userId && p.ItemCode == ReferralShopCatalog.NicknameColor,
                ct);
        if (!ownsPalette)
            return new NicknameColorResultDto(false, "Сначала купите «Цвет никнейма» в магазине");

        user.NicknameColor = option.Code;
        await _dbContext.SaveChangesAsync(ct);
        return new NicknameColorResultDto(true, null, option.Code);
    }

    public async Task<RewardFileResult?> GetRewardFileAsync(
        Guid userId,
        string itemCode,
        CancellationToken ct = default)
    {
        if (!string.Equals(itemCode, ReferralShopCatalog.ReportFormatter, StringComparison.OrdinalIgnoreCase))
            return null;

        var owned = await _dbContext.UserPurchases
            .AsNoTracking()
            .AnyAsync(
                p => p.UserId == userId && p.ItemCode == ReferralShopCatalog.ReportFormatter,
                ct);
        if (!owned)
            return null;

        var root = _configuration["Referrals:RewardsRoot"];
        if (string.IsNullOrWhiteSpace(root))
            root = "Storage/rewards";

        var fileName = _configuration["Referrals:ReportFormatterFileName"];
        if (string.IsNullOrWhiteSpace(fileName))
            fileName = "R2F_Report_Formatter.exe";

        // Config values are trusted, but resolve and verify the path so a
        // misconfiguration can never escape the rewards directory. Relative
        // roots resolve against the content root, like chat storage does.
        var rootFullPath = Path.GetFullPath(
            Path.IsPathRooted(root)
                ? root
                : Path.Combine(_environment.ContentRootPath, root));
        var fileFullPath = ResolveRewardPath(rootFullPath, fileName);
        if (fileFullPath is null)
        {
            _logger.LogError(
                "Rejected reward file path outside the rewards root: {FileName}",
                fileName);
            return null;
        }

        // Docker mounts /data/rewards as an (initially empty) volume. If the
        // configured root has no file yet, fall back to the copy bundled with
        // the application so the reward keeps working without manual copying.
        if (!File.Exists(fileFullPath))
        {
            var bundledRoot = Path.GetFullPath(
                Path.Combine(_environment.ContentRootPath, "Storage", "rewards"));
            var bundledPath = ResolveRewardPath(bundledRoot, fileName);
            if (bundledPath is not null && File.Exists(bundledPath))
                fileFullPath = bundledPath;
        }

        var contentType = Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".zip" => "application/zip",
            ".pdf" => "application/pdf",
            _ => "application/octet-stream"
        };

        return new RewardFileResult(fileFullPath, Path.GetFileName(fileName), contentType);
    }

    public async Task<AdminReferralDashboardDto> GetAdminDashboardAsync(
        int days = 30,
        CancellationToken ct = default)
    {
        days = Math.Clamp(days, 1, 365);
        var from = DateTime.UtcNow.Date.AddDays(-(days - 1));

        var totalInvites = await _dbContext.Referrals.CountAsync(ct);
        var totalCoinsEarned = await _dbContext.Referrals.SumAsync(r => r.CoinsAwarded, ct);
        var totalCoinsSpent = await _dbContext.UserPurchases.SumAsync(p => p.PricePaid, ct);

        // Referral accruals always carry a counterparty (the invitee), so a
        // positive transaction without one can only come from an admin grant.
        var totalGrantedCoins = await _dbContext.CoinTransactions
            .Where(t => t.Amount > 0 && t.CounterpartyUserId == null)
            .SumAsync(t => t.Amount, ct);
        var coinsInCirculation = await _dbContext.Users.SumAsync(u => u.KepkaCoins, ct);
        var activeInviters = await _dbContext.Referrals
            .Select(r => r.InviterUserId)
            .Distinct()
            .CountAsync(ct);
        var rewardOwners = await _dbContext.UserPurchases
            .Select(p => p.UserId)
            .Distinct()
            .CountAsync(ct);

        var inviteDates = await _dbContext.Referrals
            .AsNoTracking()
            .Where(r => r.CreatedAt >= from)
            .Select(r => r.CreatedAt.Date)
            .ToArrayAsync(ct);
        var invitesByDay = inviteDates
            .GroupBy(d => d)
            .ToDictionary(g => g.Key, g => g.Count());
        var invitesPerDay = Enumerable.Range(0, days)
            .Select(offset => from.AddDays(offset))
            .Select(day => new AdminReferralDailyPointDto(
                day.ToString("yyyy-MM-dd"),
                invitesByDay.TryGetValue(day, out var count) ? count : 0))
            .ToArray();

        var topRows = await _dbContext.Referrals
            .AsNoTracking()
            .GroupBy(r => r.InviterUserId)
            .Select(g => new
            {
                UserId = g.Key,
                Count = g.Count(),
                Coins = g.Sum(r => r.CoinsAwarded),
                Last = g.Max(r => r.CreatedAt)
            })
            .OrderByDescending(x => x.Count)
            .ThenByDescending(x => x.Last)
            .Take(10)
            .ToArrayAsync(ct);

        var topIds = topRows.Select(t => t.UserId).ToArray();
        var topUsers = await _dbContext.Users
            .AsNoTracking()
            .Where(u => topIds.Contains(u.Id))
            .Select(u => new
            {
                u.Id,
                u.DisplayName,
                u.ReferralCode,
                GroupName = u.StudentProfile == null ? null : u.StudentProfile.StudyGroup.Name
            })
            .ToDictionaryAsync(u => u.Id, ct);

        var topInviters = topRows
            .Select(row =>
            {
                topUsers.TryGetValue(row.UserId, out var user);
                return new AdminTopInviterDto(
                    row.UserId,
                    user?.DisplayName ?? "Пользователь удалён",
                    user?.GroupName,
                    user?.ReferralCode,
                    row.Count,
                    row.Coins,
                    row.Last);
            })
            .ToArray();

        var purchaseRows = await _dbContext.UserPurchases
            .AsNoTracking()
            .GroupBy(p => p.ItemCode)
            .Select(g => new
            {
                Code = g.Key,
                Count = g.Count(),
                Spent = g.Sum(p => p.PricePaid)
            })
            .ToArrayAsync(ct);
        var purchaseStats = purchaseRows.ToDictionary(
            p => p.Code,
            p => p,
            StringComparer.OrdinalIgnoreCase);
        var shopStats = ReferralShopCatalog.Items
            .Select(item =>
            {
                purchaseStats.TryGetValue(item.Code, out var row);
                return new AdminShopStatDto(
                    item.Code,
                    item.Title,
                    item.Price,
                    row?.Count ?? 0,
                    row?.Spent ?? 0);
            })
            .ToArray();

        var recentInvites = await _dbContext.Referrals
            .AsNoTracking()
            .OrderByDescending(r => r.CreatedAt)
            .Take(15)
            .Select(r => new AdminRecentInviteDto(
                r.InviterUserId,
                r.Inviter.DisplayName,
                r.InviteeUserId,
                r.Invitee.DisplayName,
                r.Invitee.StudentProfile == null
                    ? null
                    : r.Invitee.StudentProfile.StudyGroup.Name,
                r.CoinsAwarded,
                r.CreatedAt))
            .ToArrayAsync(ct);

        var purchaseHistory = await _dbContext.UserPurchases
            .AsNoTracking()
            .OrderByDescending(p => p.PurchasedAt)
            .Take(15)
            .Select(p => new
            {
                p.UserId,
                UserName = p.User.DisplayName,
                p.ItemCode,
                p.PricePaid,
                p.PurchasedAt
            })
            .ToArrayAsync(ct);
        var recentPurchases = purchaseHistory
            .Select(p => new AdminRecentPurchaseDto(
                p.UserId,
                p.UserName,
                p.ItemCode,
                ReferralShopCatalog.Find(p.ItemCode)?.Title ?? p.ItemCode,
                p.PricePaid,
                p.PurchasedAt))
            .ToArray();

        var recentTransactions = await _dbContext.CoinTransactions
            .AsNoTracking()
            .OrderByDescending(t => t.CreatedAt)
            .Take(20)
            .Select(t => new AdminCoinTransactionDto(
                t.Id,
                t.UserId,
                t.User.DisplayName,
                t.Amount,
                t.Reason,
                t.CreatedAt))
            .ToArrayAsync(ct);

        return new AdminReferralDashboardDto(
            totalInvites,
            totalCoinsEarned,
            totalCoinsSpent,
            totalGrantedCoins,
            coinsInCirculation,
            activeInviters,
            rewardOwners,
            invitesPerDay,
            topInviters,
            shopStats,
            recentInvites,
            recentPurchases,
            recentTransactions);
    }

    public async Task<AdminGrantCoinsResultDto> GrantCoinsAsync(
        Guid adminUserId,
        Guid userId,
        int amount,
        string? reason,
        CancellationToken ct = default)
    {
        if (amount is < 1 or > MaxAdminGrant)
            return new AdminGrantCoinsResultDto(
                false,
                $"Сумма должна быть от 1 до {MaxAdminGrant} KepkaCoin");

        if (adminUserId == userId)
            return new AdminGrantCoinsResultDto(false, "Нельзя начислить коины самому себе");

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
            return new AdminGrantCoinsResultDto(false, "Пользователь не найден");

        var note = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        if (note is { Length: > MaxGrantReasonLength })
            note = note[..MaxGrantReasonLength];

        var now = DateTime.UtcNow;
        user.KepkaCoins += amount;

        _dbContext.CoinTransactions.Add(new CoinTransaction
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Amount = amount,
            Reason = note is null
                ? "Начисление администратором"
                : $"Начисление администратором: {note}",
            CreatedAt = now
        });
        _dbContext.AdminAuditLogs.Add(new AdminAuditLog
        {
            Id = Guid.NewGuid(),
            AdminUserId = adminUserId,
            TargetUserId = userId,
            Action = "GrantKepkaCoins",
            Details = $"+{amount} KepkaCoin: {note ?? "без причины"}",
            CreatedAt = now
        });

        await _dbContext.SaveChangesAsync(ct);

        // The credit is final; a notification failure must not undo it.
        try
        {
            await _notificationService.NotifyUsersAsync(
                [userId],
                new NotificationMessage(
                    NotificationType.System,
                    "Начислены KepkaCoin",
                    note is null
                        ? $"Администратор начислил вам {amount} KepkaCoin."
                        : $"Администратор начислил вам {amount} KepkaCoin. Причина: {note}.",
                    "/profile?tab=referrals"),
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Coin grant notification failed for user {UserId}", userId);
        }

        return new AdminGrantCoinsResultDto(true, null, user.KepkaCoins);
    }

    private static string? ResolveRewardPath(string rootFullPath, string fileName)
    {
        var fileFullPath = Path.GetFullPath(Path.Combine(rootFullPath, fileName));
        var rootWithSeparator = rootFullPath.TrimEnd(
            Path.DirectorySeparatorChar,
            Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return fileFullPath.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase)
            ? fileFullPath
            : null;
    }

    private async Task<string> EnsureReferralCodeAsync(ApplicationUser user, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(user.ReferralCode))
            return user.ReferralCode;

        for (var attempt = 0; attempt < MaxCodeAttempts; attempt++)
        {
            var candidate = GenerateCode();
            var taken = await _dbContext.Users
                .AsNoTracking()
                .AnyAsync(u => u.ReferralCode == candidate, ct);
            if (taken)
                continue;

            user.ReferralCode = candidate;
            await _dbContext.SaveChangesAsync(ct);
            return candidate;
        }

        throw new InvalidOperationException("Не удалось создать уникальный реферальный код");
    }

    private static string GenerateCode()
    {
        var chars = new char[CodeLength];
        for (var index = 0; index < chars.Length; index++)
            chars[index] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];
        return new string(chars);
    }

    private static string NormalizeCode(string? code)
    {
        var value = (code ?? string.Empty).Trim().ToLowerInvariant();
        if (value.Length is 0 or > MaxCodeLength)
            return string.Empty;
        return value.All(char.IsLetterOrDigit) ? value : string.Empty;
    }
}
