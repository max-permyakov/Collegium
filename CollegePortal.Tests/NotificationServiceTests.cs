using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.Notifications;
using CollegePortal.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace CollegePortal.Tests;

// Unit tests for NotificationService against the in-memory provider. Push
// transport itself is covered by the API/worker integration, not mocked here.
public class NotificationServiceTests : IDisposable
{
    private readonly CollegePortalDbContext _db;
    private readonly NotificationQueue _queue;
    private readonly NotificationService _service;

    public NotificationServiceTests()
    {
        var options = new DbContextOptionsBuilder<CollegePortalDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _db = new CollegePortalDbContext(options);
        _queue = new NotificationQueue();
        _service = new NotificationService(_db, _queue, NullLogger<NotificationService>.Instance);
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task NotifyUsersAsync_CreatesOneRowPerUserAndEnqueuesPush()
    {
        var first = NewUser();
        var second = NewUser();
        _db.Users.AddRange(first, second);
        await _db.SaveChangesAsync();

        await _service.NotifyUsersAsync(
            new[] { first.Id, second.Id, first.Id, Guid.Empty },
            new NotificationMessage(NotificationType.News, "Новая новость", "Текст", "/news"));

        var rows = await _db.Notifications.AsNoTracking().ToListAsync();
        rows.Should().HaveCount(2);
        rows.Select(row => row.UserId).Should().BeEquivalentTo(new[] { first.Id, second.Id });
        rows.Should().OnlyContain(row =>
            row.Type == NotificationType.News &&
            row.Title == "Новая новость" &&
            row.Body == "Текст" &&
            row.Url == "/news" &&
            !row.IsRead &&
            row.PushSentAt == null &&
            row.PushAttempts == 0);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var queued = new List<Guid>();
        await foreach (var id in _queue.ReadAllAsync(cts.Token))
        {
            queued.Add(id);
            if (queued.Count == 2) break;
        }

        queued.Should().BeEquivalentTo(rows.Select(row => row.Id));
    }

    [Theory]
    [InlineData("https://evil.example/news")]
    [InlineData("//evil.example/news")]
    [InlineData("/\\evil.example/news")]
    [InlineData("javascript:alert(1)")]
    [InlineData("   ")]
    public async Task NotifyUsersAsync_RejectsUnsafeUrls(string url)
    {
        var user = NewUser();
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        await _service.NotifyUsersAsync(
            new[] { user.Id },
            new NotificationMessage(NotificationType.System, "Заголовок", "Текст", url));

        var row = await _db.Notifications.SingleAsync();
        row.Url.Should().BeNull();
    }

    [Fact]
    public async Task NotifyUsersAsync_TruncatesOverlongText()
    {
        var user = NewUser();
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        await _service.NotifyUsersAsync(
            new[] { user.Id },
            new NotificationMessage(
                NotificationType.System,
                new string('t', 500),
                new string('b', 2000)));

        var row = await _db.Notifications.SingleAsync();
        row.Title.Should().HaveLength(200);
        row.Body.Should().HaveLength(1000);
    }

    [Fact]
    public async Task NotifyStudyGroupAsync_SkipsInactiveOtherGroupsAndAuthor()
    {
        var groupId = Guid.NewGuid();
        var otherGroupId = Guid.NewGuid();

        var author = NewUser();
        var member = NewUser();
        var inactiveMember = NewUser(isActive: false);
        var otherGroupMember = NewUser();

        _db.Users.AddRange(author, member, inactiveMember, otherGroupMember);
        _db.StudentProfiles.AddRange(
            NewProfile(author, groupId),
            NewProfile(member, groupId),
            NewProfile(inactiveMember, groupId),
            NewProfile(otherGroupMember, otherGroupId));
        await _db.SaveChangesAsync();

        await _service.NotifyStudyGroupAsync(
            groupId,
            new NotificationMessage(NotificationType.Assignment, "Новое задание", "Описание", "/assignments"),
            excludeUserId: author.Id);

        var recipientIds = await _db.Notifications
            .AsNoTracking()
            .Select(row => row.UserId)
            .ToListAsync();

        recipientIds.Should().Equal(member.Id);
    }

    [Fact]
    public async Task GetAsync_ReturnsOnlyOwnNotificationsNewestFirst()
    {
        var owner = NewUser();
        var stranger = NewUser();
        _db.Users.AddRange(owner, stranger);

        var older = NewNotification(owner.Id, "Старое", DateTime.UtcNow.AddMinutes(-10));
        var newer = NewNotification(owner.Id, "Новое", DateTime.UtcNow);
        _db.Notifications.AddRange(older, newer, NewNotification(stranger.Id, "Чужое", DateTime.UtcNow));
        await _db.SaveChangesAsync();

        var result = await _service.GetAsync(owner.Id, limit: 10);

        result.Select(item => item.Title).Should().Equal("Новое", "Старое");
        result.Should().OnlyContain(item => item.IsRead == false);
    }

    [Fact]
    public async Task GetAsync_ClampsLimitAndSupportsBeforeCursor()
    {
        var owner = NewUser();
        _db.Users.Add(owner);
        var cutoff = DateTime.UtcNow.AddMinutes(-5);
        for (var index = 0; index < 5; index++)
        {
            _db.Notifications.Add(NewNotification(
                owner.Id,
                $"n{index}",
                cutoff.AddMinutes(index)));
        }
        await _db.SaveChangesAsync();

        var page = await _service.GetAsync(owner.Id, limit: 3, before: cutoff.AddMinutes(3));

        page.Should().HaveCount(3);
        page.Select(item => item.Title).Should().Equal("n2", "n1", "n0");
    }

    [Fact]
    public async Task MarkReadAsync_IsScopedToTheOwner()
    {
        var owner = NewUser();
        var stranger = NewUser();
        _db.Users.AddRange(owner, stranger);
        var notification = NewNotification(owner.Id, "Новое", DateTime.UtcNow);
        _db.Notifications.Add(notification);
        await _db.SaveChangesAsync();

        (await _service.MarkReadAsync(stranger.Id, notification.Id)).Should().BeFalse();
        (await _db.Notifications.SingleAsync()).IsRead.Should().BeFalse();

        (await _service.MarkReadAsync(owner.Id, notification.Id)).Should().BeTrue();
        (await _db.Notifications.SingleAsync()).IsRead.Should().BeTrue();
    }

    [Fact]
    public async Task DeleteAsync_IsScopedToTheOwner()
    {
        var owner = NewUser();
        var stranger = NewUser();
        _db.Users.AddRange(owner, stranger);
        var notification = NewNotification(owner.Id, "Новое", DateTime.UtcNow);
        _db.Notifications.Add(notification);
        await _db.SaveChangesAsync();

        (await _service.DeleteAsync(stranger.Id, notification.Id)).Should().BeFalse();
        (await _db.Notifications.CountAsync()).Should().Be(1);

        (await _service.DeleteAsync(owner.Id, notification.Id)).Should().BeTrue();
        (await _db.Notifications.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task MarkAllReadAsync_UpdatesOnlyUnreadRowsOfTheUser()
    {
        var owner = NewUser();
        var stranger = NewUser();
        _db.Users.AddRange(owner, stranger);

        var read = NewNotification(owner.Id, "Прочитанное", DateTime.UtcNow.AddHours(-2));
        read.IsRead = true;

        _db.Notifications.AddRange(
            read,
            NewNotification(owner.Id, "Первое", DateTime.UtcNow.AddHours(-1)),
            NewNotification(owner.Id, "Второе", DateTime.UtcNow),
            NewNotification(stranger.Id, "Чужое", DateTime.UtcNow));
        await _db.SaveChangesAsync();

        (await _service.GetUnreadCountAsync(owner.Id)).Should().Be(2);
        (await _service.MarkAllReadAsync(owner.Id)).Should().Be(2);
        (await _service.GetUnreadCountAsync(owner.Id)).Should().Be(0);
        (await _service.GetUnreadCountAsync(stranger.Id)).Should().Be(1);
    }

    private static ApplicationUser NewUser(bool isActive = true) => new()
    {
        Id = Guid.NewGuid(),
        UserName = $"user-{Guid.NewGuid():N}",
        DisplayName = "Тестовый пользователь",
        IsActive = isActive,
        CreatedAt = DateTime.UtcNow
    };

    private static StudentProfile NewProfile(ApplicationUser user, Guid groupId) => new()
    {
        Id = Guid.NewGuid(),
        UserId = user.Id,
        User = user,
        StudyGroupId = groupId
    };

    private static Notification NewNotification(Guid userId, string title, DateTime createdAt) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Type = NotificationType.News,
        Title = title,
        Body = "Текст",
        CreatedAt = createdAt
    };
}
