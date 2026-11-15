using System.Security.Cryptography;
using CollegePortal.Infrastructure.ExternalApis.Notifications;
using FluentAssertions;

namespace CollegePortal.Tests;

public class PushServiceClientOptionsTests
{
    [Fact]
    public void IsConfigured_AcceptsKeysInTheCorrectOrder()
    {
        var (publicKey, privateKey) = NewKeyPair();

        var options = new PushServiceClientOptions
        {
            PublicKey = publicKey,
            PrivateKey = privateKey
        };

        options.IsConfigured.Should().BeTrue();
        options.EffectivePublicKey.Should().Be(publicKey);
        options.EffectivePrivateKey.Should().Be(privateKey);
    }

    [Fact]
    public void IsConfigured_NormalizesSwappedVapidKeys()
    {
        var (publicKey, privateKey) = NewKeyPair();

        // Public and private keys pasted into the wrong variables: the byte
        // lengths make the roles unambiguous.
        var options = new PushServiceClientOptions
        {
            PublicKey = privateKey,
            PrivateKey = publicKey
        };

        options.IsConfigured.Should().BeTrue();
        options.EffectivePublicKey.Should().Be(publicKey);
        options.EffectivePrivateKey.Should().Be(privateKey);
    }

    [Fact]
    public void IsConfigured_StaysDisabledForMalformedKeys()
    {
        var options = new PushServiceClientOptions
        {
            PublicKey = "not-a-key",
            PrivateKey = "also-not-a-key"
        };

        options.IsConfigured.Should().BeFalse();
    }

    private static (string PublicKey, string PrivateKey) NewKeyPair() =>
        (Base64Url(RandomNumberGenerator.GetBytes(65)), Base64Url(RandomNumberGenerator.GetBytes(32)));

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
