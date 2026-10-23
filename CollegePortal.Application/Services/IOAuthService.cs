using CollegePortal.Application.DTOs;
using CollegePortal.Domain.Enums;

namespace CollegePortal.Application.Services;

public record OAuthAuthorizationRequest(
    string AuthorizationUrl,
    string State,
    string CodeVerifier
);

public interface IOAuthService
{
    AuthProviderOptionDto[] GetProviders();
    bool IsEnabled(AuthMethod provider);
    OAuthAuthorizationRequest CreateAuthorizationRequest(AuthMethod provider, string redirectUri);
    Task<ExternalIdentity?> ExchangeCodeAsync(
        AuthMethod provider,
        string code,
        string codeVerifier,
        string redirectUri,
        CancellationToken ct = default);
}
