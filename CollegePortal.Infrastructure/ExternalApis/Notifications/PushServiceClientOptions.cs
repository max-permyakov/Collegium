namespace CollegePortal.Infrastructure.ExternalApis.Notifications;

public class PushServiceClientOptions
{
    public string Subject { get; set; } = "mailto:admin@example.com";
    public string PublicKey { get; set; } = string.Empty;
    public string PrivateKey { get; set; } = string.Empty;

    // Push is only attempted when both VAPID keys are configured. This keeps
    // local/test environments working without generating keys.
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(PublicKey) && !string.IsNullOrWhiteSpace(PrivateKey);
}