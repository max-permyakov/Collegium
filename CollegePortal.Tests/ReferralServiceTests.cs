using CollegePortal.Application.Referrals;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.Notifications;
using CollegePortal.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace CollegePortal.Tests;

public class ReferralServiceTests : IDisposable
{
    private readonly CollegePortalDbContext _db;
    private readonly ReferralService _service;

    public ReferralServiceTests()
    {
        var options = new DbContextOptionsBuilder<CollegePortalDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new CollegePortalDbContext(options);

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Referrals:ClaimWindowHours"] = "24",
                ["Referrals:RewardsRoot"] = Path.Combine(Path.GetTempPath(), "collegium-tests-rewards"),
                ["Referrals:ReportFormatterFileName"] = "R2F_Report_Formatter.exe"
            })
            .Build();

        var notificationService = new NotificationService(
            _db,
            new NotificationQueue(),
            NullLogger<NotificationService>.Instance);

        _service = new ReferralService(
            _db,
            configuration,
            new TestHostEnvironment(),
            notificationService,
            NullLogger<ReferralService>.Instance);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task ClaimAsync_CreditsInviterAndGiftsReportFormatter()
    {
        var inviter = NewUser("inviter");
        inviter.ReferralCode = "invite123";
        var invitee = NewUser("newbie");
        _db.Users.AddRange(inviter, invitee);
        await _db.SaveChangesAsync();

        var result = await _service.ClaimAsync(invitee.Id, "INVITE123");

        result.Success.Should().BeTrue();
        result.CoinsAwarded.Should().Be(1);

        var storedInviter = await _db.Users.AsNoTracking().SingleAsync(u => u.Id == inviter.Id);
        storedInviter.KepkaCoins.Should().Be(1);

        (await _db.Referrals.CountAsync()).Should().Be(1);
        var referral = await _db.Referrals.AsNoTracking().SingleAsync();
        referral.InviterUserId.Should().Be(inviter.Id);
        referral.InviteeUserId.Should().Be(invitee.Id);

        var storedInvitee = await _db.Users.AsNoTracking().SingleAsync(u => u.Id == invitee.Id);
        storedInvitee.ReferredByUserId.Should().Be(inviter.Id);
        storedInvitee.ReferredAt.Should().NotBeNull();

        var gift = await _db.UserPurchases.AsNoTracking().SingleAsync();
        gift.UserId.Should().Be(invitee.Id);
        gift.ItemCode.Should().Be(ReferralShopCatalog.ReportFormatter);
        gift.PricePaid.Should().Be(0);

        var notification = await _db.Notifications.AsNoTracking().SingleAsync();
        notification.UserId.Should().Be(inviter.Id);
        notification.Type.Should().Be(NotificationType.Referral);
        notification.Url.Should().Be("/profile?tab=referrals");
    }

    [Fact]
    public async Task ClaimAsync_IsIdempotentAndOnlyAwardsOnce()
    {
        var inviter = NewUser("inviter");
        inviter.ReferralCode = "invite123";
        var invitee = NewUser("newbie");
        _db.Users.AddRange(inviter, invitee);
        await _db.SaveChangesAsync();

        (await _service.ClaimAsync(invitee.Id, "invite123")).Success.Should().BeTrue();
        var second = await _service.ClaimAsync(invitee.Id, "invite123");

        second.Success.Should().BeFalse();
        second.AlreadyClaimed.Should().BeTrue();
        (await _db.Referrals.CountAsync()).Should().Be(1);
        (await _db.Users.AsNoTracking().SingleAsync(u => u.Id == inviter.Id)).KepkaCoins.Should().Be(1);
        (await _db.Notifications.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task ClaimAsync_RejectsAccountsOlderThanTheClaimWindow()
    {
        var inviter = NewUser("inviter");
        inviter.ReferralCode = "invite123";
        var invitee = NewUser("newbie");
        invitee.CreatedAt = DateTime.UtcNow.AddDays(-2);
        _db.Users.AddRange(inviter, invitee);
        await _db.SaveChangesAsync();

        var result = await _service.ClaimAsync(invitee.Id, "invite123");

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("24");
        (await _db.Referrals.CountAsync()).Should().Be(0);
        (await _db.Users.AsNoTracking().SingleAsync(u => u.Id == inviter.Id)).KepkaCoins.Should().Be(0);
    }

    [Fact]
    public async Task ClaimAsync_RejectsOwnReferralCode()
    {
        var user = NewUser("self");
        user.ReferralCode = "selfcode1";
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var result = await _service.ClaimAsync(user.Id, "selfcode1");

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("собственную");
    }

    [Fact]
    public async Task PurchaseAsync_DeductsCoinsAndPreventsDuplicatePurchase()
    {
        var user = NewUser("buyer");
        user.KepkaCoins = 5;
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var first = await _service.PurchaseAsync(user.Id, ReferralShopCatalog.AmbassadorBadge);

        first.Success.Should().BeTrue();
        first.KepkaCoins.Should().Be(3);
        var purchase = await _db.UserPurchases.AsNoTracking().SingleAsync();
        purchase.ItemCode.Should().Be(ReferralShopCatalog.AmbassadorBadge);
        purchase.PricePaid.Should().Be(2);
        var transaction = await _db.CoinTransactions.AsNoTracking().SingleAsync();
        transaction.Amount.Should().Be(-2);

        var second = await _service.PurchaseAsync(user.Id, ReferralShopCatalog.AmbassadorBadge);

        second.Success.Should().BeFalse();
        (await _db.UserPurchases.CountAsync()).Should().Be(1);
        (await _db.Users.AsNoTracking().SingleAsync(u => u.Id == user.Id)).KepkaCoins.Should().Be(3);
    }

    [Fact]
    public async Task PurchaseAsync_RejectsInsufficientBalance()
    {
        var user = NewUser("poor");
        user.KepkaCoins = 1;
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var result = await _service.PurchaseAsync(user.Id, ReferralShopCatalog.GoldBadge);

        result.Success.Should().BeFalse();
        result.Error.Should().Contain("Не хватает");
        (await _db.UserPurchases.CountAsync()).Should().Be(0);
        (await _db.Users.AsNoTracking().SingleAsync(u => u.Id == user.Id)).KepkaCoins.Should().Be(1);
    }

    [Fact]
    public async Task SetNicknameColorAsync_RequiresThePalettePurchase()
    {
        var user = NewUser("stylist");
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var denied = await _service.SetNicknameColorAsync(user.Id, "amber");
        denied.Success.Should().BeFalse();

        _db.UserPurchases.Add(new UserPurchase
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            ItemCode = ReferralShopCatalog.NicknameColor,
            PricePaid = 2
        });
        await _db.SaveChangesAsync();

        var allowed = await _service.SetNicknameColorAsync(user.Id, "AMBER");
        allowed.Success.Should().BeTrue();
        allowed.NicknameColor.Should().Be("amber");
        (await _db.Users.AsNoTracking().SingleAsync(u => u.Id == user.Id)).NicknameColor.Should().Be("amber");

        var reset = await _service.SetNicknameColorAsync(user.Id, null);
        reset.Success.Should().BeTrue();
        reset.NicknameColor.Should().BeNull();
    }

    [Fact]
    public async Task GetRewardFileAsync_ServesTheExeOnlyToItsOwner()
    {
        var owner = NewUser("owner");
        var stranger = NewUser("stranger");
        _db.Users.AddRange(owner, stranger);
        _db.UserPurchases.Add(new UserPurchase
        {
            Id = Guid.NewGuid(),
            UserId = owner.Id,
            ItemCode = ReferralShopCatalog.ReportFormatter,
            PricePaid = 1
        });
        await _db.SaveChangesAsync();

        var file = await _service.GetRewardFileAsync(owner.Id, ReferralShopCatalog.ReportFormatter);
        var denied = await _service.GetRewardFileAsync(stranger.Id, ReferralShopCatalog.ReportFormatter);

        file.Should().NotBeNull();
        file!.FileName.Should().Be("R2F_Report_Formatter.exe");
        file.ContentType.Should().Be("application/octet-stream");
        file.StoragePath.Should().EndWith("R2F_Report_Formatter.exe");
        denied.Should().BeNull();
    }

    [Fact]
    public async Task GetSummaryAsync_GeneratesAStableCode()
    {
        var user = NewUser("sharer");
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var first = await _service.GetSummaryAsync(user.Id);
        var second = await _service.GetSummaryAsync(user.Id);

        first.Should().NotBeNull();
        first!.ReferralCode.Should().HaveLength(9);
        second!.ReferralCode.Should().Be(first.ReferralCode);
    }

    [Fact]
    public async Task ValidateCodeAsync_OnlyAcceptsActiveInviters()
    {
        var inviter = NewUser("inviter");
        inviter.ReferralCode = "valid1234";
        var inactive = NewUser("inactive");
        inactive.ReferralCode = "inactive1";
        inactive.IsActive = false;
        _db.Users.AddRange(inviter, inactive);
        await _db.SaveChangesAsync();

        var valid = await _service.ValidateCodeAsync("VALID1234");
        var blocked = await _service.ValidateCodeAsync("inactive1");

        valid.Valid.Should().BeTrue();
        valid.InviterDisplayName.Should().Be(inviter.DisplayName);
        blocked.Valid.Should().BeFalse();
    }

    [Fact]
    public async Task GrantCoinsAsync_CreditsBalanceAndWritesLedgerAuditAndNotification()
    {
        var admin = NewUser("admin");
        var target = NewUser("lucky");
        _db.Users.AddRange(admin, target);
        await _db.SaveChangesAsync();

        var result = await _service.GrantCoinsAsync(admin.Id, target.Id, 5, "Победитель конкурса");

        result.Success.Should().BeTrue();
        result.KepkaCoins.Should().Be(5);

        var stored = await _db.Users.AsNoTracking().SingleAsync(u => u.Id == target.Id);
        stored.KepkaCoins.Should().Be(5);

        var transaction = await _db.CoinTransactions.AsNoTracking().SingleAsync();
        transaction.UserId.Should().Be(target.Id);
        transaction.Amount.Should().Be(5);
        transaction.Reason.Should().Contain("Победитель конкурса");

        var audit = await _db.AdminAuditLogs.AsNoTracking().SingleAsync();
        audit.AdminUserId.Should().Be(admin.Id);
        audit.TargetUserId.Should().Be(target.Id);
        audit.Action.Should().Be("GrantKepkaCoins");
        audit.Details.Should().Contain("+5");

        var notification = await _db.Notifications.AsNoTracking().SingleAsync();
        notification.UserId.Should().Be(target.Id);
        notification.Type.Should().Be(NotificationType.System);
        notification.Url.Should().Be("/profile?tab=referrals");
    }

    [Fact]
    public async Task GrantCoinsAsync_RejectsInvalidAmountsAndSelfGrant()
    {
        var admin = NewUser("admin");
        var target = NewUser("lucky");
        _db.Users.AddRange(admin, target);
        await _db.SaveChangesAsync();

        (await _service.GrantCoinsAsync(admin.Id, target.Id, 0, null)).Success.Should().BeFalse();
        (await _service.GrantCoinsAsync(admin.Id, target.Id, 1001, null)).Success.Should().BeFalse();
        (await _service.GrantCoinsAsync(admin.Id, admin.Id, 3, null)).Success.Should().BeFalse();
        (await _service.GrantCoinsAsync(admin.Id, Guid.NewGuid(), 3, null)).Success.Should().BeFalse();

        (await _db.CoinTransactions.CountAsync()).Should().Be(0);
        (await _db.Users.AsNoTracking().SingleAsync(u => u.Id == target.Id)).KepkaCoins.Should().Be(0);
    }

    [Fact]
    public async Task GetAdminDashboardAsync_AggregatesInvitesPurchasesAndCoins()
    {
        var inviter = NewUser("inviter");
        var invitee = NewUser("invitee");
        var buyer = NewUser("buyer");
        inviter.KepkaCoins = 7;
        buyer.KepkaCoins = 2;
        _db.Users.AddRange(inviter, invitee, buyer);

        _db.Referrals.Add(new Referral
        {
            Id = Guid.NewGuid(),
            InviterUserId = inviter.Id,
            InviteeUserId = invitee.Id,
            CoinsAwarded = 1,
            CreatedAt = DateTime.UtcNow.AddHours(-2)
        });
        _db.UserPurchases.AddRange(
            new UserPurchase
            {
                Id = Guid.NewGuid(),
                UserId = invitee.Id,
                ItemCode = ReferralShopCatalog.ReportFormatter,
                PricePaid = 0,
                PurchasedAt = DateTime.UtcNow.AddHours(-1)
            },
            new UserPurchase
            {
                Id = Guid.NewGuid(),
                UserId = buyer.Id,
                ItemCode = ReferralShopCatalog.AmbassadorBadge,
                PricePaid = 2,
                PurchasedAt = DateTime.UtcNow
            });
        _db.CoinTransactions.AddRange(
            new CoinTransaction
            {
                Id = Guid.NewGuid(),
                UserId = inviter.Id,
                Amount = 1,
                Reason = "Реферал: invitee",
                CounterpartyUserId = invitee.Id,
                CreatedAt = DateTime.UtcNow.AddHours(-2)
            },
            new CoinTransaction
            {
                Id = Guid.NewGuid(),
                UserId = buyer.Id,
                Amount = -2,
                Reason = "Покупка награды",
                CreatedAt = DateTime.UtcNow
            });
        await _db.SaveChangesAsync();

        var dashboard = await _service.GetAdminDashboardAsync();

        dashboard.TotalInvites.Should().Be(1);
        dashboard.TotalCoinsEarned.Should().Be(1);
        dashboard.TotalCoinsSpent.Should().Be(2);
        dashboard.TotalGrantedCoins.Should().Be(0);
        dashboard.CoinsInCirculation.Should().Be(9);
        dashboard.ActiveInviters.Should().Be(1);
        dashboard.RewardOwners.Should().Be(2);

        dashboard.TopInviters.Should().ContainSingle();
        dashboard.TopInviters[0].UserId.Should().Be(inviter.Id);
        dashboard.TopInviters[0].InvitedCount.Should().Be(1);

        var ambassador = dashboard.ShopStats.Single(s => s.Code == ReferralShopCatalog.AmbassadorBadge);
        ambassador.PurchasedCount.Should().Be(1);
        ambassador.CoinsSpent.Should().Be(2);

        dashboard.InvitesPerDay.Should().HaveCount(30);
        dashboard.InvitesPerDay[^1].Count.Should().Be(1);

        dashboard.RecentInvites.Should().ContainSingle();
        dashboard.RecentInvites[0].InviteeName.Should().Be(invitee.DisplayName);
        dashboard.RecentPurchases.Should().HaveCount(2);
        dashboard.RecentTransactions.Should().HaveCount(2);
    }

    private static ApplicationUser NewUser(string name)
    {
        var id = Guid.NewGuid();
        return new ApplicationUser
        {
            Id = id,
            UserName = $"{name}@example.test",
            Email = $"{name}@example.test",
            DisplayName = $"{name} display",
            Role = "Student",
            IsActive = true,
            EmailConfirmed = true,
            CreatedAt = DateTime.UtcNow
        };
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "CollegePortal.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
