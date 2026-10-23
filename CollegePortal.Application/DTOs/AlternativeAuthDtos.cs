using System.Text.Json.Serialization;
using CollegePortal.Domain.Enums;

namespace CollegePortal.Application.DTOs;

public record AuthProviderOptionDto(
    AuthMethod Provider,
    string Name,
    bool Enabled
);

public record AuthProvidersDto(
    bool EmailEnabled,
    AuthProviderOptionDto[] Providers
);

public record RequestEmailCodeRequestDto(
    string Email,
    string? PendingOAuthToken = null
);

public record RequestEmailCodeResultDto(
    bool Sent,
    string Message
);

public record VerifyEmailCodeRequestDto(
    string Email,
    string Code
);

public record EmailVerifyResultDto(
    bool Success,
    bool RequiresRegistration,
    string? RegistrationToken,
    string? Error,
    UserDto? User,
    [property: JsonIgnore] LoginResponseDto? Session,
    bool Conflict = false
);

public record CompleteEmailRegistrationRequestDto(
    string RegistrationToken,
    string LastName,
    string FirstName,
    string? MiddleName,
    string GroupName
);

public record CompleteProfileRequestDto(
    string LastName,
    string FirstName,
    string? MiddleName,
    string GroupName
);

public record RegistrationOutcome(
    string? Error,
    bool Conflict,
    [property: JsonIgnore] LoginResponseDto? Session
);

public record LinkDiaryRequestDto(
    string Login,
    string PasswordHash
);

public record LinkDiaryResult(
    string? Error,
    bool Conflict,
    [property: JsonIgnore] LoginResponseDto? Session
);

public record ExternalIdentity(
    AuthMethod Provider,
    string ProviderUserId,
    string? Email,
    bool EmailVerified,
    string DisplayName
);

public record ExternalLoginResult(
    bool RequiresEmail,
    string? PendingOAuthToken,
    string DisplayName,
    [property: JsonIgnore] LoginResponseDto? Session
);

public record ChangeGroupRequestDto(
    string GroupName
);

public record GroupOptionsDto(
    string[] Groups
);
