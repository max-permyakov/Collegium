namespace CollegePortal.Infrastructure.ExternalApis.Notifications;

public class PushServiceClientOptions
{
    public string Subject { get; set; } = "mailto:admin@example.com";
    public string PublicKey { get; set; } = string.Empty;
    public string PrivateKey { get; set; } = string.Empty;

    // Push is only attempted when both VAPID keys are configured AND well
    // formed. A malformed key is worse than no key: the browser would fail
    // inside PushManager.subscribe with InvalidAccessError without any hint,
    // so an unparsable pair keeps push disabled instead.
    public bool IsConfigured =>
        IsValidVapidKey(PublicKey, expectedBytes: 65) &&
        IsValidVapidKey(PrivateKey, expectedBytes: 32);

    /// <summary>
    /// web-push VAPID keys are unpadded base64url: the public key is a 65-byte
    /// uncompressed P-256 point, the private key is 32 bytes. Whitespace and
    /// stray quotes (a common copy/paste slip) are tolerated by trimming.
    /// </summary>
    private static bool IsValidVapidKey(string? key, int expectedBytes)
    {
        if (string.IsNullOrWhiteSpace(key))
            return false;

        var value = key.Trim().Trim('"');
        if (value.Length is > 0 && value.Contains(' ', StringComparison.Ordinal))
            return false;

        try
        {
            var padding = (4 - value.Length % 4) % 4;
            var base64 = value.Replace('-', '+').Replace('_', '/') + new string('=', padding);
            return Convert.FromBase64String(base64).Length == expectedBytes;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
