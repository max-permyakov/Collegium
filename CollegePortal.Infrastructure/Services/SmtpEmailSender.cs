using System.Net;
using System.Net.Mail;
using CollegePortal.Application.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class SmtpEmailSender : IEmailSender
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IConfiguration configuration, ILogger<SmtpEmailSender> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_configuration["Smtp:Host"]) &&
        !string.IsNullOrWhiteSpace(FromAddress);

    private string? FromAddress => _configuration["Smtp:From"];

    public async Task SendLoginCodeAsync(string email, string code, TimeSpan lifetime, CancellationToken ct = default)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("SMTP is not configured.");

        var minutes = Math.Max(1, (int)Math.Ceiling(lifetime.TotalMinutes));
        using var message = new MailMessage
        {
            From = new MailAddress(FromAddress!),
            Subject = "Код входа в KKEP.ka",
            Body =
                $"Ваш код входа: {code}\n\n" +
                $"Код действует {minutes} мин. и может быть использован только один раз.\n" +
                "Если вы не запрашивали вход, просто проигнорируйте это письмо.",
            IsBodyHtml = false
        };
        message.To.Add(email);

        using var client = new SmtpClient(_configuration["Smtp:Host"])
        {
            Port = _configuration.GetValue("Smtp:Port", 587),
            EnableSsl = _configuration.GetValue("Smtp:EnableSsl", true),
            UseDefaultCredentials = false,
            DeliveryMethod = SmtpDeliveryMethod.Network,
            Timeout = 15_000
        };

        var user = _configuration["Smtp:User"];
        if (!string.IsNullOrWhiteSpace(user))
        {
            client.Credentials = new NetworkCredential(
                user,
                _configuration["Smtp:Password"] ?? string.Empty);
        }

        await client.SendMailAsync(message, ct);
        _logger.LogInformation("Login code email queued for delivery.");
    }
}
