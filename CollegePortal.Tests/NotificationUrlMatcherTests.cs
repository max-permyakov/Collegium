using CollegePortal.Infrastructure.Notifications;
using FluentAssertions;

namespace CollegePortal.Tests;

// Section matching decides which unread rows a direct visit retires. These
// cases double as the contract the client mirror
// (college-portal-client/src/utils/notificationSections.ts) has to keep.
public class NotificationUrlMatcherTests
{
    [Theory]
    [InlineData("/news", "/news")]
    [InlineData("/news/", "/news")]
    [InlineData("/news", "/news?page=2")]
    [InlineData("/NEWS", "/news")]
    [InlineData("/chats/abc", "/chats/abc")]
    [InlineData("/clubs/abc", "/chats/club/abc")]
    [InlineData("/chats/club/abc", "/clubs/abc")]
    [InlineData("/profile?tab=referrals", "/profile?tab=referrals&ref=1")]
    [InlineData("/profile?tab=referrals&x=1", "/profile?tab=referrals")]
    [InlineData("/news#top", "/news")]
    public void MatchesSection_AcceptsSameSection(string notificationUrl, string openedUrl)
    {
        NotificationUrlMatcher.MatchesSection(notificationUrl, openedUrl).Should().BeTrue();
    }

    [Theory]
    [InlineData("/news", "/assignments")]
    [InlineData("/chats/abc", "/chats/def")]
    [InlineData("/clubs/abc", "/clubs/def")]
    [InlineData("/profile?tab=referrals", "/profile")]
    [InlineData("/profile?tab=referrals", "/profile?tab=profile")]
    [InlineData("/news", null)]
    [InlineData(null, "/news")]
    [InlineData("https://evil.example/news", "/news")]
    [InlineData("//evil.example/news", "/news")]
    [InlineData("/\\evil.example/news", "/news")]
    [InlineData("javascript:alert(1)", "/news")]
    public void MatchesSection_RejectsOtherSectionsAndUnsafeUrls(string? notificationUrl, string? openedUrl)
    {
        NotificationUrlMatcher.MatchesSection(notificationUrl, openedUrl).Should().BeFalse();
    }

    [Fact]
    public void MatchesSection_PageWideNotificationMatchesAnyTab()
    {
        NotificationUrlMatcher.MatchesSection("/profile", "/profile?tab=referrals").Should().BeTrue();
    }

    [Fact]
    public void Parse_NormalizesClubAliasAndTab()
    {
        var parsed = NotificationUrlMatcher.Parse("/clubs/abc/");

        parsed.Should().NotBeNull();
        parsed!.Value.Path.Should().Be("/chats/club/abc");
        parsed.Value.Tab.Should().BeNull();

        NotificationUrlMatcher.Parse("/profile?tab=Referrals")!.Value.Tab.Should().Be("referrals");
    }

    [Fact]
    public void Parse_KeepsRootPath()
    {
        NotificationUrlMatcher.Parse("/")!.Value.Path.Should().Be("/");
    }
}
