namespace CollegePortal.Application.Services;

public interface IEmailSender
{
    bool IsConfigured { get; }
    Task SendLoginCodeAsync(string email, string code, TimeSpan lifetime, CancellationToken ct = default);
}
